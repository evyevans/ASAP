import type { Occurrence } from '../calendar/types';

/** Uses expanded occurrences so recurring appointments retain their actual dates. */
export function nextCommitment(occurrences: Occurrence[], now: number): Occurrence | null {
  let next: Occurrence | null = null;
  for (const occurrence of occurrences) {
    const start = occurrence.start.getTime();
    if (occurrence.allDay || occurrence.event.status === 'cancelled' || !Number.isFinite(start) || start < now) continue;
    if (!next || start < next.start.getTime()) next = occurrence;
  }
  return next;
}
