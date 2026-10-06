import { useSyncExternalStore } from 'react';
import { asapSupabase } from '../config/supabaseClients';
import type { AgentEventRow } from '../analytics/agentEventTypes';

const BUFFER = 250;
// The old hitl_monitor rows (July 1) use the retired 'task.*' vocabulary — hide them.
const isCurrentVocabulary = (t: string) => !t.startsWith('task.');

export interface AgentEventsState {
  events: AgentEventRow[];
  connected: boolean;
  loading: boolean;
}

/* Module-scope shared subscription. useLiveWorldFeed (Home) and AsapDashboard both
 * want the identical 'agent-events-live' topic, so rather than each mounting its own
 * channel + initial fetch (two backlog fetches, two realtime subscriptions per Home
 * view), every hook instance reads from ONE cached snapshot fed by ONE channel.
 *
 * `snapshot` is replaced wholesale (never mutated) on every change so getSnapshot can
 * hand back a stable reference between renders — useSyncExternalStore requires that to
 * avoid an infinite render loop. `events` is set in the SAME publish() as `loading:
 * false` so consumers (useLiveWorldFeed's classifyBatch) never observe loading=false
 * paired with stale/empty events. */
let snapshot: AgentEventsState = { events: [], connected: false, loading: true };
const listeners = new Set<() => void>();
let started = false;

function publish(next: AgentEventsState) {
  snapshot = next;
  listeners.forEach((l) => l());
}

/* Starts the initial fetch + the one realtime channel, exactly once per page
 * lifetime. Deliberately never torn down when the last listener unsubscribes —
 * one subscription per page lifetime is simpler and avoids channel churn as
 * Home/AsapDashboard mount and unmount on tab nav; a full reload naturally
 * resets the module. */
function ensureStarted() {
  if (started) return;
  started = true;

  (async () => {
    const { data, error } = await asapSupabase
      .from('agent_events')
      .select('*')
      .order('sequence', { ascending: false })
      .limit(BUFFER);
    const events =
      !error && data ? (data as AgentEventRow[]).filter((e) => isCurrentVocabulary(e.event_type)) : snapshot.events;
    publish({ ...snapshot, events, loading: false });
  })();

  asapSupabase
    .channel('agent-events-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'agent_events' },
      (payload) => {
        const row = payload.new as AgentEventRow;
        if (!isCurrentVocabulary(row.event_type)) return;
        if (snapshot.events.some((e) => e.id === row.id)) return;
        publish({ ...snapshot, events: [row, ...snapshot.events].slice(0, BUFFER) });
      }
    )
    .subscribe((status) => {
      publish({ ...snapshot, connected: status === 'SUBSCRIBED' });
    });
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  ensureStarted();
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot() {
  return snapshot;
}

/** Live agent_events stream: initial fetch (newest-first by sequence) + a Supabase
 *  Realtime INSERT subscription that prepends new events as ASAP acts. RLS scopes
 *  everything to the signed-in realtor's org.
 *
 *  Backed by a single module-level subscription shared across every consumer (see
 *  above) — this hook is just a useSyncExternalStore view onto it, so mounting it
 *  from multiple components never opens a second channel or refetches the backlog. */
export function useAgentEvents(): AgentEventsState {
  // `subscribe` and `getSnapshot` are module-scope functions with stable
  // identity across renders — no useCallback needed to keep them referentially
  // stable for useSyncExternalStore.
  return useSyncExternalStore(subscribe, getSnapshot);
}
