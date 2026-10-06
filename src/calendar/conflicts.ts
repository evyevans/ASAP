/* ═══════════════════════════════════════════════════════════════════════════
   conflicts — the half of double-booking prevention Postgres cannot do.

   WHAT THE DATABASE ALREADY GUARANTEES
   Migration 19's `EXCLUDE USING gist` makes two overlapping busy events on one
   calendar physically impossible — for every writer, including Hermes. That is
   the real defence, and nothing here weakens it.

   WHAT IT CANNOT DO, AND WHY THIS FILE EXISTS
   A GiST index cannot expand an RRULE, so the constraint carries
   `where (... and rrule is null ...)`. Recurring series are therefore
   unprotected at the database level. Rather than hide that, the constraint is
   scoped honestly and the gap is filled here, at expansion time, where the
   occurrences actually exist.

   The consequence, stated plainly so nobody is surprised by it: a conflict
   between two RECURRING series, or between a recurring series and a one-off,
   surfaces as a WARNING in the UI rather than a rejected write. Conflicts
   between two one-off events are impossible, not warned about.

   Pure — no clock of its own, no Supabase.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Occurrence, CalendarEvent } from './types';

export interface Conflict {
  a: Occurrence;
  b: Occurrence;
  /** Overlap in minutes. A 5-minute overlap and a 3-hour one are different
   *  problems, and the realtor should be able to tell them apart. */
  minutes: number;
  /** True when the database could not have caught this — i.e. a recurring
   *  series is involved. Everything else is belt-and-braces. */
  dbCouldNotCatch: boolean;
}

const overlapMinutes = (a: Occurrence, b: Occurrence): number => {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  return end > start ? Math.round((end - start) / 60_000) : 0;
};

/** Does this occurrence actually hold time? A tentative hold, a cancelled
 *  event, or an all-day note does not, and must not raise a conflict. */
export const holdsTime = (o: Occurrence): boolean =>
  o.event.busy && o.event.status === 'confirmed' && !o.allDay;

/**
 * Every overlapping pair among the given occurrences.
 *
 * Sweeps a sorted list rather than comparing all pairs: a busy month is a few
 * hundred occurrences, and O(n²) on every render of the month grid is exactly
 * the kind of thing that makes a calendar feel heavy.
 */
export function findConflicts(occurrences: Occurrence[]): Conflict[] {
  const timed = occurrences.filter(holdsTime).sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Conflict[] = [];

  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      // Sorted by start, so once b starts after a ends nothing later can
      // overlap a either.
      if (timed[j].start.getTime() >= timed[i].end.getTime()) break;

      // Different calendars are allowed to overlap: a personal dentist
      // appointment and a work block are not a double-booking, and the DB
      // constraint scopes to calendar_id for the same reason.
      if (timed[i].event.calendar_id !== timed[j].event.calendar_id) continue;

      const minutes = overlapMinutes(timed[i], timed[j]);
      if (minutes <= 0) continue;

      out.push({
        a: timed[i],
        b: timed[j],
        minutes,
        dbCouldNotCatch: timed[i].isRecurring || timed[j].isRecurring,
      });
    }
  }
  return out;
}

/** Occurrence keys involved in any conflict — for badging the grid. */
export function conflictedKeys(conflicts: Conflict[]): Set<string> {
  const keys = new Set<string>();
  for (const c of conflicts) { keys.add(c.a.key); keys.add(c.b.key); }
  return keys;
}

/**
 * Would a proposed event collide with anything already there?
 *
 * Used to warn BEFORE saving, so the realtor sees the clash while they can
 * still move it rather than getting a constraint violation from Postgres after
 * they hit save. The constraint remains the actual guarantee — this is the
 * courtesy.
 */
export function wouldConflict(
  proposed: { start: Date; end: Date; calendarId: string; ignoreEventId?: string },
  existing: Occurrence[]
): Occurrence[] {
  return existing.filter((o) => {
    if (!holdsTime(o)) return false;
    if (o.event.calendar_id !== proposed.calendarId) return false;
    if (proposed.ignoreEventId && o.event.id === proposed.ignoreEventId) return false;
    // Half-open, matching the '[)' bound in the exclusion constraint — so
    // back-to-back showings are legal here too. If these two disagreed, the UI
    // would warn about something the database happily accepts.
    return o.start.getTime() < proposed.end.getTime()
      && o.end.getTime() > proposed.start.getTime();
  });
}

/** Free gaps of at least `minMinutes` inside a window. Powers "when could I
 *  show them this?" — and is what Hermes should propose from rather than
 *  picking a time and hoping. */
export function freeSlots(
  occurrences: Occurrence[],
  windowStart: Date,
  windowEnd: Date,
  minMinutes = 30,
  calendarId?: string
): { start: Date; end: Date }[] {
  const busy = occurrences
    .filter(holdsTime)
    .filter((o) => !calendarId || o.event.calendar_id === calendarId)
    .filter((o) => o.end > windowStart && o.start < windowEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: { start: Date; end: Date }[] = [];
  let cursor = windowStart.getTime();

  for (const o of busy) {
    const s = Math.max(o.start.getTime(), windowStart.getTime());
    if (s - cursor >= minMinutes * 60_000) {
      slots.push({ start: new Date(cursor), end: new Date(s) });
    }
    cursor = Math.max(cursor, o.end.getTime());
  }

  if (windowEnd.getTime() - cursor >= minMinutes * 60_000) {
    slots.push({ start: new Date(cursor), end: windowEnd });
  }
  return slots;
}

/** Can the agent modify this event? Mirrors the BEFORE UPDATE/DELETE trigger in
 *  migration 19 exactly, so the UI can grey out what the database would refuse
 *  rather than letting the realtor discover it via an error. */
export const agentMayModify = (event: CalendarEvent): boolean => event.source === 'asap';
