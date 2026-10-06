/* ═══════════════════════════════════════════════════════════════════════════
   useCalendar — events for a window, expanded and conflict-checked.

   FETCHING STRATEGY
   Recurring series have no end date in the general case, so "give me events in
   August" cannot be a simple BETWEEN. The query pulls (a) everything whose
   timed window intersects the range and (b) every row carrying an rrule
   regardless of date, then expands locally. Series counts are small — a realtor
   has a handful of standing commitments, not thousands — so this is cheaper
   than any server-side expansion would be, and it keeps recurrence logic in one
   tested place rather than split between SQL and TypeScript.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { asapSupabase } from '../config/supabaseClients';
import { useOrgId } from '../hooks/useOrgId';
import { expandAll } from './recurrence';
import { findConflicts, conflictedKeys } from './conflicts';
import type { CalendarEvent, CalendarRow, Occurrence, DateRange } from './types';
import type { Conflict } from './conflicts';

export interface CalendarData {
  calendars: CalendarRow[];
  events: CalendarEvent[];
  occurrences: Occurrence[];
  conflicts: Conflict[];
  conflicted: Set<string>;
  loading: boolean;
  error: string | null;
  saving: boolean;
  createEvent: (draft: Partial<CalendarEvent>) => Promise<CalendarEvent | null>;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => Promise<boolean>;
  deleteEvent: (id: string) => Promise<boolean>;
  /** Remove ONE occurrence of a series without touching the rest. */
  deleteOccurrence: (event: CalendarEvent, start: Date) => Promise<boolean>;
  createCalendar: (name: string, kind: CalendarRow['kind'], colour: string) => Promise<void>;
  /** Provision the default calendar if the org somehow has none. */
  ensureDefaultCalendar: () => Promise<CalendarRow | null>;
  toggleCalendar: (id: string, visible: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Postgres error 23P01 — exclusion_violation. This is migration 19's
 *  no-overlap constraint firing, and it deserves a sentence a realtor
 *  understands rather than the raw constraint name. */
const DOUBLE_BOOKED = '23P01';

const friendlyError = (e: { code?: string; message: string }): string => {
  if (e.code === DOUBLE_BOOKED) {
    return 'That time is already booked on this calendar. Pick another slot, or move the other event first.';
  }
  if (e.code === '42501') {
    return 'That event was created by ASAP or imported — it is not yours to change here.';
  }
  return e.message;
};

export function useCalendar(range: DateRange): CalendarData {
  const { orgId } = useOrgId();
  const [calendars, setCalendars] = useState<CalendarRow[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  // Serialised so the effect does not re-run on every render just because the
  // caller built a fresh Date pair.
  const rangeKey = `${range.from.toISOString()}|${range.to.toISOString()}`;

  const refresh = useCallback(async () => {
    const [from, to] = rangeKey.split('|');

    const [cals, evs] = await Promise.all([
      asapSupabase.from('asap_calendars').select('*').order('is_default', { ascending: false }),
      asapSupabase
        .from('asap_calendar_events')
        .select('*')
        // Timed events intersecting the window, all-day events inside it, plus
        // every recurring series regardless of date — an open-ended weekly rule
        // has a starts_at in the past but occurrences in the future.
        .or(
          `and(starts_at.lt.${to},ends_at.gt.${from}),` +
          `and(start_date.lt.${to},end_date.gte.${from}),` +
          `rrule.not.is.null`
        )
        .neq('status', 'cancelled')
        .limit(2000),
    ]);

    if (!mounted.current) return;

    if (cals.error || evs.error) {
      setError((cals.error ?? evs.error)!.message);
      setCalendars([]);
      setEvents([]);
    } else {
      setError(null);
      setCalendars((cals.data ?? []) as CalendarRow[]);
      setEvents((evs.data ?? []) as CalendarEvent[]);
    }
    setLoading(false);
  }, [rangeKey]);

  useEffect(() => {
    mounted.current = true;
    refresh();

    const channel = asapSupabase
      .channel('asap-calendar')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'asap_calendar_events' },
        () => { refresh(); })
      .subscribe();

    return () => {
      mounted.current = false;
      asapSupabase.removeChannel(channel);
    };
  }, [refresh]);

  /* Only events on visible calendars reach the grid. Hiding a calendar must
   * also hide its conflicts, or the realtor sees a warning about an event
   * they cannot see. */
  const visibleIds = useMemo(
    () => new Set(calendars.filter((c) => c.visible).map((c) => c.id)),
    [calendars]
  );

  const occurrences = useMemo(
    () => expandAll(events.filter((e) => visibleIds.has(e.calendar_id)), range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, visibleIds, rangeKey]
  );

  const conflicts = useMemo(() => findConflicts(occurrences), [occurrences]);
  const conflicted = useMemo(() => conflictedKeys(conflicts), [conflicts]);

  /* ── writes ── */

  const run = useCallback(async <T,>(
    op: () => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>
  ): Promise<T | null> => {
    setSaving(true);
    setError(null);
    const { data, error: e } = await op();
    if (mounted.current) {
      if (e) setError(friendlyError(e));
      else await refresh();
      setSaving(false);
    }
    return e ? null : data;
  }, [refresh]);

  /** The calendar a new event lands on if nobody said otherwise.
   *
   *  Provisions one rather than refusing. Migration 20 seeds a default per org,
   *  so this is the belt to that braces — it only fires for an org created
   *  after the seed ran. Either way, "you must create a calendar before you can
   *  use the calendar" is not a thing the product should ever say. */
  const ensureDefaultCalendar = useCallback(async (): Promise<CalendarRow | null> => {
    const existing = calendars.find((c) => c.is_default) ?? calendars[0];
    if (existing) return existing;
    if (!orgId) return null;

    const q = await asapSupabase
      .from('asap_calendars')
      .insert({ org_id: orgId, name: 'My schedule', kind: 'work', colour: '#2C2A28', is_default: true })
      .select()
      .single();

    if (q.error) {
      // 23505 = another tab won the race. Read back what landed rather than
      // showing an error for something that succeeded.
      if (q.error.code === '23505') {
        const { data } = await asapSupabase
          .from('asap_calendars').select('*').eq('is_default', true).maybeSingle();
        await refresh();
        return (data as CalendarRow) ?? null;
      }
      setError(q.error.message);
      return null;
    }
    await refresh();
    return q.data as CalendarRow;
  }, [calendars, orgId, refresh]);

  const createEvent = useCallback(async (draft: Partial<CalendarEvent>) => {
    if (!orgId) { setError('No organisation on this session.'); return null; }
    const defaultCal = calendars.find((c) => c.is_default)
      ?? calendars[0]
      ?? await ensureDefaultCalendar();
    if (!defaultCal) { setError('Could not open a calendar to write to.'); return null; }

    return run<CalendarEvent>(() => asapSupabase
      .from('asap_calendar_events')
      .insert({
        org_id: orgId,
        calendar_id: draft.calendar_id ?? defaultCal.id,
        timezone: 'America/Toronto',
        // Anything created here is the realtor's. Only rows written through
        // asap_calendar_write_event carry source='asap', which is what the
        // ownership trigger keys on.
        source: 'user',
        created_by: 'user',
        ...draft,
      })
      .select()
      .single());
  }, [orgId, calendars, run, ensureDefaultCalendar]);

  const updateEvent = useCallback(async (id: string, patch: Partial<CalendarEvent>) => {
    const r = await run(() => asapSupabase
      .from('asap_calendar_events').update(patch).eq('id', id).select().single());
    return r !== null;
  }, [run]);

  const deleteEvent = useCallback(async (id: string) => {
    const r = await run(() => asapSupabase
      .from('asap_calendar_events').delete().eq('id', id).select().single());
    return r !== null;
  }, [run]);

  /** Delete ONE occurrence of a series by adding an EXDATE.
   *
   *  Not by deleting the row — that would remove every future Tuesday when the
   *  realtor meant to cancel one. This is the difference between a calendar
   *  people trust with a standing commitment and one they do not. */
  const deleteOccurrence = useCallback(async (ev: CalendarEvent, start: Date) => {
    if (!ev.rrule) return deleteEvent(ev.id);
    const next = [...ev.exdates, start.toISOString()];
    return updateEvent(ev.id, { exdates: next });
  }, [deleteEvent, updateEvent]);

  const createCalendar = useCallback(async (
    name: string, kind: CalendarRow['kind'], colour: string
  ) => {
    if (!orgId) return;
    await run(() => asapSupabase
      .from('asap_calendars')
      .insert({ org_id: orgId, name, kind, colour, is_default: calendars.length === 0 })
      .select().single());
  }, [orgId, calendars.length, run]);

  const toggleCalendar = useCallback(async (id: string, visible: boolean) => {
    await run(() => asapSupabase
      .from('asap_calendars').update({ visible }).eq('id', id).select().single());
  }, [run]);

  return {
    calendars, events, occurrences, conflicts, conflicted,
    loading, error, saving,
    createEvent, updateEvent, deleteEvent, deleteOccurrence,
    createCalendar, toggleCalendar, ensureDefaultCalendar, refresh,
  };
}

/* ── Window helpers ───────────────────────────────────────────────────────*/

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function viewRange(view: 'month' | 'week' | 'day' | 'agenda', anchor: Date): DateRange {
  const a = startOfDay(anchor);
  switch (view) {
    case 'day':
      return { from: a, to: new Date(a.getTime() + 86_400_000) };
    case 'week': {
      const from = new Date(a.getTime() - a.getDay() * 86_400_000);
      return { from, to: new Date(from.getTime() + 7 * 86_400_000) };
    }
    case 'agenda':
      return { from: a, to: new Date(a.getTime() + 30 * 86_400_000) };
    case 'month':
    default: {
      // Whole weeks, so the grid never has a ragged first or last row.
      const first = new Date(a.getFullYear(), a.getMonth(), 1);
      const from = new Date(first.getTime() - first.getDay() * 86_400_000);
      const last = new Date(a.getFullYear(), a.getMonth() + 1, 0);
      const to = new Date(last.getTime() + (7 - last.getDay()) * 86_400_000);
      return { from, to };
    }
  }
}
