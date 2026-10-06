/* ═══════════════════════════════════════════════════════════════════════════
   sweep — decide what a match run should write, without writing anything.

   WHY THIS IS PURE
   The sweep runs in a Deno edge function on service_role, because the browser
   has no write policy on asap_client_matches and must never get one. But an
   edge function is the worst possible place to put decision logic: no test
   runner, no debugger, a wall clock, and a deploy cycle between every attempt.

   So the function does I/O and nothing else — fetch, call planSweep, write the
   plan, report. Every decision about WHAT to write lives here, where vitest
   can exercise it in node with no network, no clock and no database.

   THE ONE INVARIANT THAT SHAPES THIS WHOLE FILE
   asap_client_matches_gated forbids a non-empty failed_gates on a row in state
   'shortlisted' or 'sent'. A client edits their budget; a listing they
   shortlisted last week now fails a hard gate; the sweep computes an entirely
   correct row and Postgres rejects — not that row, the WHOLE BATCH.

   Hence three outputs rather than one:
     upserts       rows to write (state omitted, see matchRow.ts)
     demotions     shortlisted -> surfaced, applied FIRST in the same transaction
     sentConflicts already-sent matches that now fail — cannot be demoted
                   ('sent' is terminal) and cannot be upserted (CHECK), so they
                   are reported instead of silently dropped
   ═══════════════════════════════════════════════════════════════════════════ */

import { rankForClient } from './matchEngine.ts';
import { assembleClientContext, criteriaFingerprint } from './context.ts';
import { toMatchRow, type MatchUpsert } from './matchRow.ts';
import { DEFAULT_MATCH_SETTINGS } from './types.ts';
import type {
  Client, ClientGeography, Criterion, FailedGate, Listing, MatchRow,
  MatchSettings, MatchState,
} from './types.ts';

/** The subset of an existing match row the plan needs. Deliberately narrow:
 *  the sweep must not depend on score/reasons/band it is about to overwrite. */
export type ExistingMatch = Pick<
  MatchRow, 'client_id' | 'listing_id' | 'state' | 'criteria_hash'
>;

export interface SweepInput {
  clients: Client[];
  /** All criteria for all clients; partitioned here by client_id. */
  criteria: Criterion[];
  geography: ClientGeography[];
  listings: Listing[];
  existingMatches: ExistingMatch[];
  settings: MatchSettings;
  now: number;
}

export interface Demotion {
  client_id: string;
  listing_id: string;
  from: MatchState;
  to: 'surfaced';
  /** Shown to the realtor. Names the requirement, not the constraint. */
  reason: string;
}

export interface SentConflict {
  client_id: string;
  listing_id: string;
  gates: FailedGate[];
}

export interface SweepSkip {
  clientId: string;
  reason: string;
}

export interface SweepPlan {
  upserts: MatchUpsert[];
  demotions: Demotion[];
  sentConflicts: SentConflict[];
  skipped: SweepSkip[];
}

/** Terminal states the sweep must not overwrite. 'sent' means the client has
 *  already seen it; rewriting the explanation after the fact is exactly what
 *  migration 17 withheld the write policy to prevent. */
const TERMINAL: ReadonlySet<string> = new Set<MatchState>(['sent']);

export function planSweep(inp: SweepInput): SweepPlan {
  const settings = inp.settings ?? DEFAULT_MATCH_SETTINGS;
  const computedAt = new Date(inp.now).toISOString();

  const plan: SweepPlan = { upserts: [], demotions: [], sentConflicts: [], skipped: [] };

  for (const client of inp.clients) {
    /* ── context ──
       assembleClientContext THROWS on a row belonging to another client — the
       cross-client leakage chokepoint. Catching it per client means one bad
       record cannot take down the sweep for the other forty, and the reason
       reaches the run report rather than a stack trace. */
    let ctx;
    try {
      ctx = assembleClientContext(
        client,
        inp.criteria.filter((c) => c.client_id === client.id),
        inp.geography.filter((g) => g.client_id === client.id)
      );
    } catch (e) {
      plan.skipped.push({
        clientId: client.id,
        reason: e instanceof Error ? e.message : 'Could not assemble this client\'s brief.',
      });
      continue;
    }

    const fingerprint = criteriaFingerprint(ctx);

    const mine = inp.existingMatches.filter((m) => m.client_id === client.id);
    const byListing = new Map(mine.map((m) => [m.listing_id, m]));

    /* ── the cost control ──
       If nothing about the brief has moved, the stored scores are still
       correct — so only genuinely new listings need scoring. This is what
       needsRescore was written for, and what the md5-vs-raw bug (fixed in
       migration 22) had inverted into re-scoring everything, every run. */
    const unchanged = mine.length > 0 && mine.every((m) => m.criteria_hash === fingerprint);
    const candidates = unchanged
      ? inp.listings.filter((l) => !byListing.has(l.id))
      : inp.listings;

    if (candidates.length === 0) {
      plan.skipped.push({
        clientId: client.id,
        reason: unchanged
          ? 'Brief unchanged and no new listings since the last run.'
          : 'No listings in this market.',
      });
      continue;
    }

    const { surfaced, held, excluded } = rankForClient(candidates, ctx, inp.now, settings);

    /* Every ranked listing is written, not just the surfaced ones. `held` and
     * `excluded` matter: a listing that now FAILS is precisely the row that
     * tells us a previously-shortlisted match must be demoted. Writing only
     * winners would leave the stale shortlist in place forever. */
    for (const ranked of [...surfaced, ...held, ...excluded]) {
      const prior = byListing.get(ranked.listing.id);
      const failing = ranked.result.failedGates.length > 0;

      // 'sent' is terminal. Cannot demote it, cannot upsert a failing row onto
      // it without violating the CHECK. Report and move on.
      if (prior && TERMINAL.has(prior.state)) {
        if (failing) {
          plan.sentConflicts.push({
            client_id: client.id,
            listing_id: ranked.listing.id,
            gates: ranked.result.failedGates,
          });
        }
        continue;
      }

      if (failing && prior?.state === 'shortlisted') {
        plan.demotions.push({
          client_id: client.id,
          listing_id: ranked.listing.id,
          from: prior.state,
          to: 'surfaced',
          reason: ranked.result.failedGates.map((g) => g.label).join('; '),
        });
      }

      plan.upserts.push(toMatchRow({
        orgId: client.org_id,          // from the client row, never from input
        clientId: client.id,
        listingId: ranked.listing.id,
        result: ranked.result,
        criteriaHash: fingerprint,
        computedAt,
      }));
    }
  }

  return plan;
}
