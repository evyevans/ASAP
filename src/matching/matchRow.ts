/* ═══════════════════════════════════════════════════════════════════════════
   matchRow — the ONE place a MatchResult becomes an asap_client_matches row.

   WHY THIS FILE EXISTS AT ALL
   evaluateMatch returns MatchResult, which uses camelCase: `failedGates`,
   `staleInputs`. The table columns are snake_case: `failed_gates`,
   `stale_inputs`. That mismatch is small enough to look like a non-problem and
   exactly the kind of thing that ends up solved three different ways — one
   caller spreads the object straight through and silently writes nothing to
   failed_gates, another maps it by hand, a third maps it wrong. A row whose
   failed_gates is empty when it should not be is not a cosmetic bug: it is the
   one value asap_client_matches_gated keys on, so getting it wrong lets a
   listing that failed a hard requirement reach a client.

   So the mapping happens here, once.

   `state` IS DELIBERATELY ABSENT FROM THE PAYLOAD.
   PostgREST's `resolution=merge-duplicates` writes only the columns you supply.
   Omitting `state` means an INSERT takes the column default ('new') and an
   UPDATE leaves whatever the realtor decided untouched. Supplying it — even as
   'new' — would reset a shortlist on every sweep. The whole state-preservation
   story is this omission, and it costs nothing.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { FailedGate, MatchBand, MatchReason, MatchResult } from './types.ts';

/** A row destined for asap_client_matches, minus everything the database
 *  supplies: id, state, decided_at, decided_by. */
export interface MatchUpsert {
  org_id: string;
  client_id: string;
  listing_id: string;
  score: number;
  band: MatchBand;
  reasons: MatchReason[];
  failed_gates: FailedGate[];
  stale_inputs: boolean;
  criteria_hash: string;
  computed_at: string;
}

/**
 * MatchResult -> row.
 *
 * `score` is rounded to two decimals because the column is `numeric` with no
 * scale and the engine produces floats: storing 72.30000000000001 makes two
 * identical sweeps look like they disagree when you diff them.
 */
export function toMatchRow(args: {
  orgId: string;
  clientId: string;
  listingId: string;
  result: MatchResult;
  criteriaHash: string;
  computedAt: string;
}): MatchUpsert {
  const { orgId, clientId, listingId, result, criteriaHash, computedAt } = args;
  return {
    org_id: orgId,
    client_id: clientId,
    listing_id: listingId,
    score: Math.round(result.score * 100) / 100,
    band: result.band,
    reasons: result.reasons,
    failed_gates: result.failedGates,   // camelCase -> snake_case, the point of this file
    stale_inputs: result.staleInputs,   // ditto
    criteria_hash: criteriaHash,
    computed_at: computedAt,
  };
}

/** The invariant `asap_client_matches_gated` enforces, expressed in code so a
 *  batch can be checked before it is sent rather than after Postgres rejects
 *  all of it. */
export const wouldViolateGate = (
  failedGates: unknown[],
  state: string | null | undefined
): boolean => failedGates.length > 0 && (state === 'shortlisted' || state === 'sent');
