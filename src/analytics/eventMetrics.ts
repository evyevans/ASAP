/* Pure aggregations over the live agent_events buffer — one per Hermes's
 * aggregation table. Everything the event STREAM uniquely gives us (the
 * current-state hero/pending/weekly/funnel come from useExecutionData). */

import type { AgentEventRow } from './agentEventTypes';

const TZ = 'America/Toronto';
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };

/* ── Live presence ───────────────────────────────────────────── */
export interface LivePresence {
  working: boolean;
  title?: string;
  category?: string;
  lastHeartbeat?: string;
  lastEventAt?: string;
  /** The more recent of lastHeartbeat/lastEventAt — what "checked in" should show. */
  checkedInAt?: string;
}

function mostRecent(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}
export function livePresence(events: AgentEventRow[]): LivePresence {
  const lastEventAt = events[0]?.created_at;
  const startedIdx = events.findIndex((e) => e.event_type === 'block.started');
  let working = false, title: string | undefined, category: string | undefined;
  if (startedIdx !== -1) {
    const started = events[startedIdx];
    const cid = started.payload?.calendar_event_id;
    // completion events are newer → appear BEFORE `started` in the newest-first buffer
    const done = events.slice(0, startedIdx).some(
      (e) =>
        ['block.executed', 'block.needs_approval', 'block.failed', 'block.skipped'].includes(e.event_type) &&
        e.payload?.calendar_event_id === cid
    );
    if (!done) { working = true; title = started.payload?.block_title; category = started.payload?.block_category; }
  }
  const lastHeartbeat = events.find((e) => e.event_type === 'system.heartbeat')?.created_at;
  return { working, title, category, lastHeartbeat, lastEventAt, checkedInAt: mostRecent(lastHeartbeat, lastEventAt) };
}

/* ── FUB work counters (last N days) ─────────────────────────── */
export interface FubCounters {
  notes: number; tasksCompleted: number; appointments: number; stageAdvances: number; dealsAdvanced: number; total: number;
}
export function fubCounters(events: AgentEventRow[], days = 7): FubCounters {
  const since = daysAgo(days);
  const recent = events.filter((e) => new Date(e.created_at) >= since);
  const c = (t: string) => recent.filter((e) => e.event_type === t).length;
  const notes = c('fub.note_created');
  const tasksCompleted = c('fub.task_completed');
  const appointments = c('fub.appointment_booked');
  const stageAdvances = c('fub.stage_advanced');
  const dealsAdvanced = c('fub.deal_updated');
  return { notes, tasksCompleted, appointments, stageAdvances, dealsAdvanced,
    total: notes + tasksCompleted + appointments + stageAdvances + dealsAdvanced };
}

/* ── Deal pipeline / money (from deal events) ────────────────── */
export interface DealPipeline {
  pipelineValue: number; commissionAtStake: number; newDealsThisMonth: number; newPipelineThisMonth: number;
}
export function dealPipeline(events: AgentEventRow[]): DealPipeline {
  // newest-first → first seen per deal is authoritative
  const byDeal = new Map<number, { price: number; commission: number }>();
  for (const e of events) {
    if (e.event_type !== 'fub.deal_created' && e.event_type !== 'fub.deal_updated') continue;
    const id = e.payload?.deal_id;
    if (id == null || byDeal.has(id)) continue;
    byDeal.set(id, { price: e.payload?.price ?? 0, commission: e.payload?.commission_value ?? 0 });
  }
  let pipelineValue = 0, commissionAtStake = 0;
  for (const d of byDeal.values()) { pipelineValue += d.price; commissionAtStake += d.commission; }
  const since = monthStart();
  const created = events.filter((e) => e.event_type === 'fub.deal_created' && new Date(e.created_at) >= since);
  return {
    pipelineValue,
    commissionAtStake,
    newDealsThisMonth: created.length,
    newPipelineThisMonth: created.reduce((s, e) => s + (e.payload?.price ?? 0), 0),
  };
}

/* ── Lead Pulse — the signature temperature board ────────────── */
export interface LeadPulseEntry {
  leadId: string; name: string; pulse: string; lastTouch: string; action?: string; stage?: string; days?: number;
}
const PULSE_ORDER: Record<string, number> = { hot: 0, warming: 1, cooling: 2, cold: 3 };
export function leadPulse(events: AgentEventRow[]): LeadPulseEntry[] {
  const byLead = new Map<string, LeadPulseEntry>();
  for (const e of events) {
    if (e.event_type !== 'lead.engaged') continue;
    const id = String(e.payload?.lead_id ?? '');
    if (!id || byLead.has(id)) continue; // newest-first → keep latest
    byLead.set(id, {
      leadId: id,
      name: e.payload?.lead_name ?? 'Lead',
      pulse: e.payload?.pulse ?? 'warming',
      lastTouch: e.payload?.last_touch ?? e.created_at,
      action: e.payload?.action,
      stage: e.payload?.stage,
      days: e.payload?.days_since_last_contact,
    });
  }
  return [...byLead.values()].sort((a, b) => (PULSE_ORDER[a.pulse] ?? 9) - (PULSE_ORDER[b.pulse] ?? 9));
}

/* ── Daily momentum trend (last N days) ──────────────────────── */
export interface TrendDay { day: string; label: string; executed: number; drafts: number; fub: number; leads: number; }
export function dailyTrend(events: AgentEventRow[], days = 14): TrendDay[] {
  const map = new Map<string, TrendDay>();
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(i);
    const k = dayKey(d);
    map.set(k, { day: k, label: d.toLocaleDateString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric' }), executed: 0, drafts: 0, fub: 0, leads: 0 });
  }
  for (const e of events) {
    const row = map.get(dayKey(new Date(e.created_at)));
    if (!row) continue;
    if (e.event_type === 'block.executed' || e.event_type === 'research.compiled') row.executed++;
    else if (e.event_type === 'block.needs_approval') row.drafts++;
    else if (e.event_type.startsWith('fub.')) row.fub++;
    else if (e.event_type.startsWith('lead.')) row.leads++;
  }
  return [...map.values()];
}

/** Whether the stream has any real ASAP activity yet. */
export function hasLiveEvents(events: AgentEventRow[]): boolean {
  return events.some((e) => !e.event_type.startsWith('system.'));
}
