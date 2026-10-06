/* eslint-disable @typescript-eslint/no-explicit-any -- This small transport accepts
 * the same heterogeneous table records as Supabase. Domain logic retains its types. */
import { createSeed, clone, STORE_KEY, DEMO_ORG, DEMO_USER } from './seed';
import { evaluateMatch } from '../matching/matchEngine';
import { assembleClientContext, criteriaFingerprint } from '../matching/context';
import { DEFAULT_MATCH_SETTINGS } from '../matching/types';
import type { Client, Criterion, ClientGeography, Listing } from '../matching/types';

export type Row = Record<string, any>;
type Tables = Record<string, Row[]>;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
type Result = { data: any; error: { code: string; message: string } | null };
type Listener = { table: string; event: string; callback: (payload: Row) => void };
const success = (data: any): Result => ({ data: clone(data), error: null });
const failure = (message: string, code = 'DEMO'): Result => ({ data: null, error: { code, message } });

/** Split an OR expression without splitting commas inside and(...). */
function splitTerms(expression: string): string[] {
  let depth = 0, start = 0;
  const terms: string[] = [];
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === '(') depth++;
    if (expression[i] === ')') depth--;
    if (expression[i] === ',' && depth === 0) { terms.push(expression.slice(start, i)); start = i + 1; }
  }
  return [...terms, expression.slice(start)];
}
function predicate(expression: string): (row: Row) => boolean {
  if (expression.startsWith('and(')) {
    const checks = splitTerms(expression.slice(4, -1)).map(predicate);
    return row => checks.every(check => check(row));
  }
  const [key, operation, ...rest] = expression.split('.');
  const value = rest.join('.');
  if (operation === 'not' && value === 'is.null') return row => row[key] != null;
  return row => {
    const actual = row[key];
    if (actual == null) return false;
    switch (operation) {
      case 'lt': return actual < value;
      case 'gt': return actual > value;
      case 'gte': return actual >= value;
      case 'lte': return actual <= value;
      case 'eq': return String(actual) === value;
      default: throw new Error(`Unsupported demo filter: ${operation}`);
    }
  };
}

export function createDemoStore(storage?: Storage, now = new Date()) {
  const listeners = new Set<Listener>();
  const changes = new Set<() => void>();
  let revision = 0;
  let tables = createSeed(now) as Tables;
  let persistenceWarning = typeof window !== 'undefined' && !storage;
  try {
    const saved = storage?.getItem(STORE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.version === 1 && Object.keys(tables).every(k => Array.isArray(parsed.tables?.[k]))) {
        const calendarSeed = tables;
        tables = parsed.tables;
        if (parsed.calendarRevision !== 2) {
          tables.asap_calendars = calendarSeed.asap_calendars;
          tables.asap_calendar_events = calendarSeed.asap_calendar_events;
        }
      }
    }
  } catch { /* Corrupt/blocked storage starts a clean, in-memory scenario. */ }

  function persist() {
    try { storage?.setItem(STORE_KEY, JSON.stringify({ version: 1, calendarRevision: 2, tables })); }
    catch { persistenceWarning = true; }
    revision++;
    changes.forEach(cb => cb());
  }
  function emit(table: string, event: string, row: Row) {
    const payload = { new: clone(row), old: {}, eventType: event };
    queueMicrotask(() => listeners.forEach(l => {
      if (l.table === table && (l.event === '*' || l.event === event)) l.callback(payload);
    }));
  }
  function beat(event_type: string, payload: Row) {
    const row = { id: crypto.randomUUID(), org_id: DEMO_ORG, agent_id: 'asap', sequence: Math.max(0, ...tables.agent_events.map(r => r.sequence)) + 1, event_type, payload, created_at: new Date().toISOString() };
    tables.agent_events.push(row);
    emit('agent_events', 'INSERT', row);
  }
  function rescore() {
    const previous = tables.asap_client_matches;
    const next: Row[] = [];
    const mandate = tables.asap_agent_mandate[0];
    const settings = { ...DEFAULT_MATCH_SETTINGS, staleDays: mandate?.match_stale_days ?? 90 };
    for (const client of tables.asap_clients) {
      const criteria = tables.asap_client_criteria.filter(r => r.client_id === client.id);
      const geography = tables.asap_client_geography.filter(r => r.client_id === client.id);
      const context = assembleClientContext(client as Client, criteria as Criterion[], geography as ClientGeography[]);
      for (const listing of tables.asap_listings) {
        // Sold homes are read-only context for Scout's comp panel, never rows in
        // the actionable buyer-match queue (even when evaluateMatch returns a
        // failed-gate explanation for them).
        if ((listing as Listing).tenure === 'sold') continue;
        const result = evaluateMatch(listing as Listing, context, Date.now(), settings);
        const old = previous.find(m => m.client_id === client.id && m.listing_id === listing.id);
        next.push({ id: old?.id ?? `match:${client.id}:${listing.id}`, org_id: DEMO_ORG, client_id: client.id, listing_id: listing.id,
          score: result.score, band: result.band, reasons: result.reasons, failed_gates: result.failedGates, stale_inputs: result.staleInputs,
          llm_note: null, llm_demoted: false, llm_judged_at: null,
          state: old?.state === 'shortlisted' && !result.passed ? 'surfaced' : old?.state ?? 'new',
          decided_at: old?.decided_at ?? null, decided_by: old?.decided_by ?? null,
          criteria_hash: criteriaFingerprint(context), computed_at: new Date().toISOString(),
        });
      }
    }
    tables.asap_client_matches = next;
    emit('asap_client_matches', 'UPDATE', {});
  }
  if (!tables.asap_client_matches.length) rescore();

  function defaults(table: string, row: Row) {
    const stamp = new Date().toISOString();
    const common = { id: crypto.randomUUID(), org_id: DEMO_ORG, created_at: stamp, updated_at: stamp };
    if (table === 'asap_clients') return { ...common, fub_person_id: null, status: 'active', timeline: null, representation: 'unsigned', representation_expires_at: null, budget_min: null, budget_max: null, budget_stretch_pct: 0, preapproved: false, preapproval_amount: null, preapproval_expires_at: null, down_payment: null, financing_notes: null, client_voice: null, process_notes: null, criteria_confirmed_at: null, budget_confirmed_at: null, last_reviewed_at: null, ...row };
    if (table === 'asap_calendars') return { ...common, visible: true, is_default: false, ...row };
    if (table === 'asap_calendar_events') return { ...common, description: null, location: null, all_day: false, start_date: null, end_date: null, starts_at: null, ends_at: null, rrule: null, recurrence_id: null, exdates: [], busy: true, status: 'confirmed', source: 'user', external_id: null, asap_signature: null, client_id: null, listing_id: null, timezone: 'America/Toronto', created_by: 'user', ...row };
    return { ...common, ...row };
  }
  function validate(table: string, candidates: Row[], changing: Set<string>): Result | null {
    if (table === 'asap_calendar_events') {
      const others = tables[table].filter(r => !changing.has(r.id));
      for (const row of candidates) {
        if (!row.title?.trim()) return failure('Give the event a title.');
        const start = row.all_day ? row.start_date : row.starts_at;
        const end = row.all_day ? row.end_date : row.ends_at;
        if (!start || !end || !Number.isFinite(+new Date(start)) || !Number.isFinite(+new Date(end)) || (row.all_day ? new Date(start) > new Date(end) : new Date(start) >= new Date(end))) return failure('The event must end after it starts.');
        if (!row.all_day && row.busy && row.status !== 'cancelled' && !row.rrule && others.some(other => !other.all_day && other.calendar_id === row.calendar_id && other.busy && other.status !== 'cancelled' && !other.rrule && new Date(other.starts_at) < new Date(end) && new Date(other.ends_at) > new Date(start))) {
          return failure('That time is already booked on this calendar.', '23P01');
        }
        others.push(row);
      }
    }
    return null;
  }

  class Query implements PromiseLike<Result> {
    table: string;
    filters: ((r: Row) => boolean)[] = [];
    orders: { key: string; ascending: boolean }[] = [];
    take = Infinity;
    mode: 'read' | 'insert' | 'upsert' | 'update' | 'delete' = 'read';
    values: Row[] = [];
    conflict = 'id';
    one = false;
    projection = '*';
    result?: Promise<Result>;
    constructor(table: string) { this.table = table; }
    select(columns = '*') { this.projection = columns; return this; }
    eq(key: string, value: unknown) { this.filters.push(r => r[key] === value); return this; }
    neq(key: string, value: unknown) { this.filters.push(r => r[key] !== value); return this; }
    is(key: string, value: unknown) { this.filters.push(r => value === null ? r[key] == null : r[key] === value); return this; }
    in(key: string, values: unknown[]) { this.filters.push(r => values.includes(r[key])); return this; }
    gte(key: string, value: string) { this.filters.push(r => r[key] >= value); return this; }
    lte(key: string, value: string) { this.filters.push(r => r[key] <= value); return this; }
    or(expression: string) { const checks = splitTerms(expression).map(predicate); this.filters.push(r => checks.some(check => check(r))); return this; }
    order(key: string, options: { ascending?: boolean } = {}) { this.orders.push({ key, ascending: options.ascending !== false }); return this; }
    limit(count: number) { this.take = count; return this; }
    maybeSingle() { this.one = true; return this; }
    single() { this.one = true; return this; }
    insert(values: Row | Row[]) { this.mode = 'insert'; this.values = Array.isArray(values) ? values : [values]; return this; }
    upsert(values: Row | Row[], options: { onConflict?: string } = {}) { this.mode = 'upsert'; this.values = Array.isArray(values) ? values : [values]; this.conflict = options.onConflict ?? 'id'; return this; }
    update(values: Row) { this.mode = 'update'; this.values = [values]; return this; }
    delete() { this.mode = 'delete'; return this; }
    then<TResult1 = Result, TResult2 = never>(onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
      this.result ??= Promise.resolve().then(() => this.execute()).catch(e => failure(e instanceof Error ? e.message : 'The sample action could not finish.'));
      return this.result.then(onfulfilled, onrejected);
    }
    execute(): Result {
      const rows = tables[this.table];
      if (!rows) return failure(`The demo has no adapter for ${this.table}.`);
      let selected = rows.filter(row => this.filters.every(filter => filter(row)));
      if (this.mode !== 'read') {
        const old = this.mode === 'update' || this.mode === 'delete' ? selected : this.mode === 'upsert' ? rows.filter(r => this.values.some(v => this.conflict.split(',').every(k => v[k] !== undefined && r[k] === v[k]))) : [];
        const replacing = new Set(old.map(r => r.id));
        const candidate = this.mode === 'delete' ? [] : this.mode === 'update' ? selected.map(r => ({ ...r, ...this.values[0] })) : this.values.map(v => defaults(this.table, { ...old.find(r => this.conflict.split(',').every(k => r[k] === v[k])), ...v }));
        const error = validate(this.table, candidate, replacing);
        if (error) return error;
        tables[this.table] = [...rows.filter(r => !replacing.has(r.id)), ...candidate];
        selected = this.mode === 'delete' ? old : candidate;
        if (this.mode === 'delete' && this.table === 'asap_clients') {
          tables.asap_client_criteria = tables.asap_client_criteria.filter(r => !replacing.has(r.client_id));
          tables.asap_client_geography = tables.asap_client_geography.filter(r => !replacing.has(r.client_id));
        }
        if (['asap_clients', 'asap_client_criteria', 'asap_client_geography', 'asap_listings', 'asap_agent_mandate'].includes(this.table)) rescore();
        if (this.table === 'asap_calendar_events') {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          tables.asap_plans[0].events_created = tables.asap_calendar_events.filter(e => e.status !== 'cancelled' && e.starts_at >= today.toISOString()).map(e => ({ eventName: e.title, description: e.description, start: e.starts_at, colorId: e.calendar_id === 'asap' ? '7' : '1' }));
          beat(this.mode === 'insert' ? 'cal.event_created' : 'cal.event_updated', { title: selected[0]?.title, message: 'Sample calendar updated locally.' });
        }
        selected.forEach(row => emit(this.table, this.mode === 'delete' ? 'DELETE' : this.mode === 'insert' ? 'INSERT' : 'UPDATE', row));
        persist();
      }
      selected = [...selected].sort((a, b) => {
        for (const { key, ascending } of this.orders) {
          if (a[key] === b[key]) continue;
          return (a[key] > b[key] ? 1 : -1) * (ascending ? 1 : -1);
        }
        return 0;
      }).slice(0, this.take);
      if (this.projection.includes('listing:asap_listings')) selected = selected.map(r => ({ ...r, listing: tables.asap_listings.find(l => l.id === r.listing_id) ?? null }));
      return success(this.one ? selected[0] ?? null : selected);
    }
  }
  const store = {
    from: (table: string) => new Query(table),
    async rpc(name: string, args: Row): Promise<Result> {
      if (name === 'decide_execution_approval') {
        const row = tables.asap_execution_log.find(r => r.id === args.p_log_id && r.approved == null && r.status === 'needs_approval');
        if (!row) return success(0);
        row.approved = args.p_approved === true;
        beat(row.approved ? 'draft.approved' : 'draft.rejected', { block_title: row.block_title, output_summary: row.approved ? 'Approved locally in the demo. No client message sent.' : 'Held for revision in the demo.' });
        tables.asap_alerts.filter(a => a.kind === 'approval_needed').forEach(a => { a.status = 'acknowledged'; emit('asap_alerts', 'UPDATE', a); });
        tables.agent_task_ledger.push({ id: Date.now(), org_id: DEMO_ORG, task_id: `decision-${row.id}`, task_type: 'review', summary: `${row.approved ? 'Approved' : 'Held'}: ${row.block_title} (local demo decision; no send)`, model: null, tokens_in: null, tokens_out: null, tokens: null, cost_usd: null, runtime_ms: null, status: 'ok', created_at: new Date().toISOString() });
        emit('asap_execution_log', 'UPDATE', row); persist(); return success(1);
      }
      if (name === 'acknowledge_alert') {
        if (!['active', 'acknowledged', 'snoozed'].includes(args.p_status)) return failure('Choose a valid alert status.');
        const row = tables.asap_alerts.find(r => r.id === args.p_alert_id);
        if (!row) return success(0);
        row.status = args.p_status; row.acknowledged_at = args.p_status === 'active' ? null : new Date().toISOString();
        emit('asap_alerts', 'UPDATE', row); persist(); return success(1);
      }
      if (name === 'decide_client_match') {
        const row = tables.asap_client_matches.find(r => r.id === args.p_match_id);
        if (!row) return success(0);
        if (!['shortlisted', 'dismissed', 'surfaced'].includes(args.p_state)) return failure('That action is unavailable in the demo.');
        if (args.p_state === 'shortlisted' && row.failed_gates.length) return failure('This home does not meet the buyer’s must-haves.');
        row.state = args.p_state; row.decided_at = new Date().toISOString(); row.decided_by = DEMO_USER;
        beat(args.p_state === 'shortlisted' ? 'match.shortlisted' : 'match.dismissed', { client_id: row.client_id, listing_id: row.listing_id, lead_name: tables.asap_clients.find(c => c.id === row.client_id)?.display_name, address: tables.asap_listings.find(l => l.id === row.listing_id)?.address_raw });
        emit('asap_client_matches', 'UPDATE', row); persist(); return success(1);
      }
      return failure('That operation is not connected in this frontend demo.');
    },
    channel(_name: string) {
      void _name;
      const owned: Listener[] = [];
      const channel = {
        on(_kind: string, filter: { table: string; event: string }, callback: Listener['callback']) { owned.push({ ...filter, callback }); return channel; },
        subscribe(callback?: (status: string) => void) { owned.forEach(l => listeners.add(l)); queueMicrotask(() => callback?.('SUBSCRIBED')); return channel; },
        unsubscribe() { owned.forEach(l => listeners.delete(l)); },
      };
      return channel;
    },
    removeChannel(channel: { unsubscribe: () => void }) { channel.unsubscribe(); },
    snapshot: () => revision,
    subscribe(callback: () => void) { changes.add(callback); return () => { changes.delete(callback); }; },
    getPersistenceWarning: () => persistenceWarning,
    reset() { tables = createSeed(new Date()) as Tables; rescore(); persist(); },
  };
  persist(); // Anchor the initial scenario to this tab, including across reloads.
  return store;
}

let sessionStorageAdapter: Storage | undefined;
try { if (typeof window !== 'undefined') sessionStorageAdapter = window.sessionStorage; } catch { /* memory fallback */ }
export const demoStore = createDemoStore(sessionStorageAdapter);
