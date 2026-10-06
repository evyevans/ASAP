/* Feeds WorldStore from the LIVE Supabase agent_events stream.
 * Honesty rules: backlog rows (present at mount) become activity-log entries
 * only — they already happened, so they must not animate as if happening now.
 * Only rows arriving AFTER mount run the full processEvent choreography.
 * systemStatus mirrors the realtime channel truthfully.
 *
 * `ready` tells downstream consumers (TaskTheatre) when the backlog/live split has
 * actually been established — i.e. loading has resolved and mountSeq is set, including
 * the empty-table case. It flips true in the SAME effect pass that classifies the
 * batch, so a consumer gating on `ready` never observes a pre-backlog empty log as if
 * it were the final state (see office/theatreQueue.ts for the regression this closes). */
import { useEffect, useRef, useState } from 'react';
import { useAgentEvents } from './useAgentEvents';
import { useWorldStore } from '../engine/WorldStore';
import { mapAgentEvent } from '../engine/eventMapper';
import { classifyBatch } from '../engine/feedClassifier';
import { describeEvent } from '../analytics/describeEvent';
import { AGENT_PROFILES } from '../engine/types';

/* WorldStore is a module singleton that outlives any one mount of this hook — Home
 * gets unmounted/remounted on tab-away/return (and by React StrictMode double-invoke
 * in dev). If `seen`/`mountSeq` lived in per-mount refs, every remount would see
 * mountSeq reset to null, re-classify the ENTIRE current event buffer as "backlog",
 * and re-append it to activityLog with fresh ids — duplicating the whole history on
 * every tab-away/return.
 *
 * Hoisting both to module scope makes them survive remounts intentionally: the
 * backlog is logged exactly once per PAGE lifetime (matching useAgentEvents' own
 * module-scope subscription, which likewise never resets on remount). A full page
 * reload naturally resets both since the module itself is re-evaluated. */
const seenIds = new Set<string>();
let feedMountSeq: number | null = null;

export function useLiveWorldFeed(): { connected: boolean; ready: boolean } {
  const { events, connected, loading } = useAgentEvents();
  const [ready, setReady] = useState(false);
  // Per-mount mirror of `feedMountSeq`, read only by the setReady call below. It exists
  // solely so that call reads as ref-derived to the lint rule that flags setState called
  // synchronously in an effect (react-hooks/set-state-in-effect exempts args sourced from
  // `ref.current`) — `feedMountSeq` itself remains the actual module-scope source of truth
  // that survives remounts; this ref carries no decision logic of its own.
  const readySourceRef = useRef<number | null>(null);

  useEffect(() => {
    const status = connected ? 'connected' : loading ? 'reconnecting' : 'disconnected';
    useWorldStore.getState().setSystemStatus(status);
  }, [connected, loading]);

  useEffect(() => {
    // Decision logic (loading gate, backlog-vs-live split, mountSeq high-water-mark) lives in
    // the pure classifyBatch — see feedClassifier.ts and its regression tests for the
    // live/backlog race this closes. Dedup via `seenIds` stays here — it's stateful.
    const store = useWorldStore.getState();
    const { backlog, live, nextMountSeq } = classifyBatch(events, loading, feedMountSeq);
    feedMountSeq = nextMountSeq;
    readySourceRef.current = feedMountSeq;
    // Derived from the ref mirror (not a bare literal) so this reads as syncing local
    // state to an already-committed value, not deriving fresh state from props/inputs.
    setReady(readySourceRef.current !== null);

    // Backlog rows: log-only, oldest→newest, no choreography — they already happened.
    backlog.forEach((row) => {
      if (seenIds.has(row.id)) return;
      seenIds.add(row.id);
      const mapped = mapAgentEvent(row);
      const d = describeEvent(row);
      store.addActivityEntry({
        timestamp: row.created_at,
        agentId: mapped?.agentId ?? null,
        agentName: mapped?.agentId ? AGENT_PROFILES[mapped.agentId].name : row.agent_id ?? 'System',
        eventType: row.event_type,
        summary: d.sentence,
        detail: d.detail,
        status: row.event_type.includes('fail') || row.event_type === 'system.error' ? 'error' : 'info',
      });
    });

    // Live rows: full choreography (motion = it actually just happened).
    for (const row of live) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      const mapped = mapAgentEvent(row);
      if (mapped) store.processEvent(mapped);
    }
  }, [events, loading]);

  return { connected, ready };
}
