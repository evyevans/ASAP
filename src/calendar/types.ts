/* Calendar row types, transcribed 1:1 from 19_calendar.sql.
 * Same convention as matching/types.ts — hand-written to mirror the SQL, with
 * the migration named. When these and the migration disagree, the migration
 * wins. */

export type CalendarKind = 'work' | 'personal' | 'asap' | 'showings';

export interface CalendarRow {
  id: string;
  org_id: string;
  name: string;
  colour: string;
  kind: CalendarKind;
  visible: boolean;
  is_default: boolean;
}

/** Who created an event. THE ownership boundary — a BEFORE UPDATE/DELETE
 *  trigger in migration 19 refuses any agent write to a row that is not
 *  'asap'. */
export type EventSource = 'user' | 'asap' | 'msp' | 'wsp' | 'google_import';

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';

export interface CalendarEvent {
  id: string;
  org_id: string;
  calendar_id: string;

  title: string;
  description: string | null;
  location: string | null;

  /** Timed events. Null on an all-day row — enforced by asap_cal_shape. */
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;

  all_day: boolean;
  start_date: string | null;
  end_date: string | null;

  /** RFC 5545. Expanded for the visible window only — see recurrence.ts. */
  rrule: string | null;
  recurrence_id: string | null;
  exdates: string[];

  busy: boolean;
  status: EventStatus;

  source: EventSource;
  external_id: string | null;
  asap_signature: string | null;

  client_id: string | null;
  listing_id: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One concrete occurrence on the grid.
 *
 * Distinct from CalendarEvent on purpose: a weekly series is ONE row and many
 * occurrences, and conflating them is how calendars end up deleting a whole
 * series when the user meant to delete one Tuesday.
 */
export interface Occurrence {
  /** Stable per occurrence: `${event.id}:${startMs}`. Keys React lists and
   *  identifies which instance an override or exdate refers to. */
  key: string;
  event: CalendarEvent;
  start: Date;
  end: Date;
  allDay: boolean;
  /** True when this came out of an RRULE rather than being a standalone row. */
  isRecurring: boolean;
}

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

/** A half-open window [from, to). Used for expansion and for fetching. */
export interface DateRange {
  from: Date;
  to: Date;
}
