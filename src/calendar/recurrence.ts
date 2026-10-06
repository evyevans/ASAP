/* ═══════════════════════════════════════════════════════════════════════════
   recurrence — RRULE expansion, and the DST problem.

   WHY RFC 5545 AND NOT SOMETHING SIMPLER
   Every calendar that invented its own recurrence format eventually had to
   import from one that did not, and "every 2nd Tuesday except the ones in
   August" is not a field you can add later. RRULE is thirty years old, exactly
   specified, and interoperates with Google, Outlook and iCal — which matters
   here specifically, because MSP/WSP still write to Google during the
   migration.

   ─────────────────────────────────────────────────────────────────────────
   THE DST PROBLEM, AND HOW THIS SOLVES IT
   ─────────────────────────────────────────────────────────────────────────
   A 9am Tuesday showing must be 9am on both sides of a DST boundary. But UTC
   instants shift by an hour: 9am Toronto is 14:00Z in March and 13:00Z in
   November. Naive expansion — take the first UTC instant and add 7×24h
   repeatedly — silently moves every recurring appointment by an hour twice a
   year, which is the classic calendar bug and is very hard to notice until
   somebody misses a showing.

   The fix here is to expand in LOCAL WALL TIME and re-resolve each occurrence
   back to a UTC instant through the event's IANA timezone. `rrule`'s own tz
   support depends on the optional luxon peer, so this does the conversion
   directly with Intl.DateTimeFormat, which ships in every browser we target
   and needs no dependency.

   Both DST boundaries are asserted in calendar.test.ts. This is not a detail
   you fix once and trust — it is a detail you pin with tests.
   ═══════════════════════════════════════════════════════════════════════════ */

import { RRule, rrulestr } from 'rrule';
import type { CalendarEvent, Occurrence, DateRange } from './types';

/** Cap on occurrences from a single series in one window. A malformed RRULE
 *  (FREQ=SECONDLY, no UNTIL) would otherwise expand until the tab dies. */
const MAX_OCCURRENCES = 750;

/* ── Timezone arithmetic ──────────────────────────────────────────────────*/

/** UTC offset in minutes for `tz` at `date`. Positive means ahead of UTC.
 *  Toronto returns -300 (EST) or -240 (EDT) depending on the date — which is
 *  precisely the thing naive expansion gets wrong. */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  // What the wall clock reads in `tz`, expressed as if it were UTC.
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') === 24 ? 0 : get('hour'), get('minute'), get('second')
  );
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000;
}

/** Wall-clock components of `date` in `tz`. */
export function wallTimeIn(date: Date, tz: string): {
  year: number; month: number; day: number; hour: number; minute: number;
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p = dtf.formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? '0');
  const hour = get('hour');
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: hour === 24 ? 0 : hour, minute: get('minute'),
  };
}

/**
 * The UTC instant at which the wall clock in `tz` reads the given components.
 *
 * Two passes because the offset itself depends on the instant we are solving
 * for. The first guess uses the offset at the naive UTC interpretation; the
 * second corrects it. That converges everywhere except inside the one-hour
 * spring-forward gap, where the wall time does not exist at all — there, this
 * lands on the instant immediately after the jump, which is the same choice
 * Google Calendar makes.
 */
export function utcFromWallTime(
  y: number, mo: number, d: number, h: number, mi: number, tz: string
): Date {
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0);
  const guess = new Date(naive - tzOffsetMinutes(new Date(naive), tz) * 60_000);
  const corrected = new Date(naive - tzOffsetMinutes(guess, tz) * 60_000);
  return corrected;
}

/* ── Expansion ────────────────────────────────────────────────────────────*/

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** Occurrence key. Stable across renders and identifies which instance an
 *  override or an exdate refers to. */
export const occurrenceKey = (eventId: string, start: Date): string =>
  `${eventId}:${start.getTime()}`;

/**
 * Expand one event into its occurrences inside `range`.
 *
 * Non-recurring events yield 0 or 1. Recurring events expand through the RRULE
 * in local wall time, then re-resolve to UTC through the event's timezone.
 * Never throws: a malformed RRULE degrades to the single base occurrence, so a
 * bad rule loses a repeat rather than blanking the calendar.
 */
export function expandEvent(event: CalendarEvent, range: DateRange): Occurrence[] {
  if (event.status === 'cancelled') return [];

  /* ── all-day ── */
  if (event.all_day) {
    if (!event.start_date || !event.end_date) return [];
    const start = new Date(`${event.start_date}T00:00:00Z`);
    // end_date is INCLUSIVE in the schema (a one-day event has start == end),
    // so the exclusive end is the following midnight.
    const end = new Date(new Date(`${event.end_date}T00:00:00Z`).getTime() + 86_400_000);
    if (end <= range.from || start >= range.to) return [];
    return [{
      key: occurrenceKey(event.id, start),
      event, start, end, allDay: true, isRecurring: false,
    }];
  }

  if (!event.starts_at || !event.ends_at) return [];

  const baseStart = new Date(event.starts_at);
  const baseEnd = new Date(event.ends_at);
  if (Number.isNaN(baseStart.getTime()) || Number.isNaN(baseEnd.getTime())) return [];
  const durationMs = baseEnd.getTime() - baseStart.getTime();

  /* ── single ── */
  if (!event.rrule) {
    if (baseEnd <= range.from || baseStart >= range.to) return [];
    return [{
      key: occurrenceKey(event.id, baseStart),
      event, start: baseStart, end: baseEnd, allDay: false, isRecurring: false,
    }];
  }

  /* ── recurring ── */
  const tz = event.timezone || 'America/Toronto';
  const wall = wallTimeIn(baseStart, tz);

  let starts: Date[];
  try {
    // Expand against a UTC-labelled dtstart carrying the LOCAL wall time. The
    // rule then generates wall-clock instants — "every Tuesday at 09:00" — and
    // each is converted back through the zone below. This is what keeps 9am at
    // 9am across a DST change.
    const dtstart = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0));

    const rule = rrulestr(
      event.rrule.startsWith('RRULE:') || event.rrule.startsWith('DTSTART')
        ? event.rrule
        : `RRULE:${event.rrule}`,
      { dtstart }
    );

    // Widen the query by a day either side: an occurrence whose wall time sits
    // near a boundary can land inside the real window once converted.
    const qFrom = new Date(range.from.getTime() - 86_400_000);
    const qTo = new Date(range.to.getTime() + 86_400_000);

    const wallFrom = wallTimeIn(qFrom, tz);
    const wallTo = wallTimeIn(qTo, tz);

    starts = rule.between(
      new Date(Date.UTC(wallFrom.year, wallFrom.month - 1, wallFrom.day, 0, 0, 0)),
      new Date(Date.UTC(wallTo.year, wallTo.month - 1, wallTo.day, 23, 59, 59)),
      true
    ).slice(0, MAX_OCCURRENCES);
  } catch {
    // A malformed rule loses its repeats, not the whole event.
    if (baseEnd <= range.from || baseStart >= range.to) return [];
    return [{
      key: occurrenceKey(event.id, baseStart),
      event, start: baseStart, end: baseEnd, allDay: false, isRecurring: false,
    }];
  }

  const excluded = new Set(
    event.exdates.map((x) => {
      const t = Date.parse(x);
      return Number.isFinite(t) ? dayKey(new Date(t)) : x;
    })
  );

  const out: Occurrence[] = [];
  for (const wallInstant of starts) {
    // wallInstant carries wall-clock components in its UTC fields. Resolve
    // them back to a real instant through the event's zone.
    const start = utcFromWallTime(
      wallInstant.getUTCFullYear(), wallInstant.getUTCMonth() + 1, wallInstant.getUTCDate(),
      wallInstant.getUTCHours(), wallInstant.getUTCMinutes(), tz
    );
    if (excluded.has(dayKey(start))) continue;
    const end = new Date(start.getTime() + durationMs);
    if (end <= range.from || start >= range.to) continue;

    out.push({
      key: occurrenceKey(event.id, start),
      event, start, end, allDay: false, isRecurring: true,
    });
  }
  return out;
}

/**
 * Expand many events, applying single-instance overrides.
 *
 * An override is a child row carrying `recurrence_id`. It replaces the parent's
 * occurrence on the same day — which is why "move just this Tuesday" does not
 * disturb the rest of the series.
 */
export function expandAll(events: CalendarEvent[], range: DateRange): Occurrence[] {
  const overrides = events.filter((e) => e.recurrence_id !== null);
  const series = events.filter((e) => e.recurrence_id === null);

  const overriddenDays = new Set(
    overrides
      .filter((o) => o.starts_at)
      .map((o) => `${o.recurrence_id}:${dayKey(new Date(o.starts_at!))}`)
  );

  const out: Occurrence[] = [];

  for (const e of series) {
    for (const occ of expandEvent(e, range)) {
      if (overriddenDays.has(`${e.id}:${dayKey(occ.start)}`)) continue;
      out.push(occ);
    }
  }
  for (const o of overrides) {
    out.push(...expandEvent(o, range));
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}

/* ── Human-readable rules ─────────────────────────────────────────────────*/

/** Presets covering what a realtor actually schedules. Anything more exotic is
 *  typed as raw RRULE — a UI for BYSETPOS would cost more than it earns. */
export const RECURRENCE_PRESETS: { key: string; label: string; rrule: string | null }[] = [
  { key: 'none', label: 'Does not repeat', rrule: null },
  { key: 'daily', label: 'Every day', rrule: 'FREQ=DAILY' },
  { key: 'weekdays', label: 'Every weekday', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { key: 'weekly', label: 'Every week', rrule: 'FREQ=WEEKLY' },
  { key: 'biweekly', label: 'Every 2 weeks', rrule: 'FREQ=WEEKLY;INTERVAL=2' },
  { key: 'monthly', label: 'Every month', rrule: 'FREQ=MONTHLY' },
];

/** "Every week" / "Every 2 weeks on Tuesday". Falls back to the raw rule
 *  rather than throwing — an unreadable label beats a crashed editor. */
export function describeRrule(rrule: string | null): string {
  if (!rrule) return 'Does not repeat';
  const preset = RECURRENCE_PRESETS.find((p) => p.rrule === rrule);
  if (preset) return preset.label;
  try {
    return RRule.fromString(rrule.startsWith('RRULE:') ? rrule : `RRULE:${rrule}`).toText();
  } catch {
    return rrule;
  }
}
