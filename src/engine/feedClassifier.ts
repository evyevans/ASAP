/* Pure decision logic for the backlog/live split in useLiveWorldFeed, extracted so the
 * live/backlog race (a realtime row landing mid-fetch getting mistaken for "the backlog",
 * causing the real backlog to be misclassified and dropped) can be regression-tested
 * without jsdom/RTL. No React, no store, no Supabase — types only. */
import type { AgentEventRow } from '../analytics/agentEventTypes';

export interface ClassifiedBatch {
  backlog: AgentEventRow[];
  live: AgentEventRow[];
  nextMountSeq: number | null;
}

/** Mirrors the decision logic inline in useLiveWorldFeed's events effect:
 *  - while the initial fetch is loading, do nothing — hold rows for next resolve, don't
 *    guess at what's backlog vs. live yet.
 *  - the first resolved batch (mountSeq === null) IS the backlog, oldest→newest; an empty
 *    table yields nextMountSeq = 0 so the very first live event afterward still animates.
 *  - every later batch is live rows only — anything newer than the backlog's high-water mark. */
export function classifyBatch(
  events: AgentEventRow[],
  loading: boolean,
  mountSeq: number | null
): ClassifiedBatch {
  if (loading) return { backlog: [], live: [], nextMountSeq: mountSeq };

  if (mountSeq === null) {
    const nextMountSeq = events.length ? Math.max(...events.map((e) => e.sequence)) : 0;
    return { backlog: [...events].reverse(), live: [], nextMountSeq };
  }

  const live = events.filter((e) => e.sequence > mountSeq);
  return { backlog: [], live, nextMountSeq: mountSeq };
}
