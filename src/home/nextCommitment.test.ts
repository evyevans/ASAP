import { describe, expect, it } from 'vitest';
import { nextCommitment } from './selectNextCommitment';
import type { Occurrence } from '../calendar/types';

const now = Date.parse('2026-10-20T16:00:00Z');
function occurrence(key: string, start: string, allDay = false): Occurrence {
  return { key, start: new Date(start), end: new Date(Date.parse(start) + 3_600_000), allDay,
    isRecurring: false, event: { status: 'confirmed' } as Occurrence['event'] };
}

describe('nextCommitment', () => {
  it('selects the earliest upcoming timed commitment, regardless of input order', () => {
    const later = occurrence('later', '2026-10-21T16:00:00Z');
    const next = occurrence('next', '2026-10-20T18:30:00Z');
    expect(nextCommitment([later, next], now)).toBe(next);
  });

  it('excludes past, all-day, cancelled, and invalid occurrences', () => {
    const cancelled = occurrence('cancelled', '2026-10-20T17:00:00Z');
    cancelled.event.status = 'cancelled';
    expect(nextCommitment([
      occurrence('past', '2026-10-20T15:00:00Z'),
      occurrence('all-day', '2026-10-21T00:00:00Z', true),
      occurrence('invalid', 'invalid'), cancelled,
    ], now)).toBeNull();
  });

  it('includes a commitment starting now and does not mutate the calendar order', () => {
    const later = occurrence('later', '2026-10-21T16:00:00Z');
    const starting = occurrence('starting', '2026-10-20T16:00:00Z');
    const events = [later, starting];
    expect(nextCommitment(events, now)).toBe(starting);
    expect(events).toEqual([later, starting]);
  });

  it('returns no commitment for an empty calendar', () => {
    expect(nextCommitment([], now)).toBeNull();
  });
});
