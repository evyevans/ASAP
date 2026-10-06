/* ═══════════════════════════════════════════════════════════════════════════
   assembleClientContext — the ONLY way to build matching input.

   WHY THIS FILE EXISTS AT ALL
   It would be shorter to pass `{ client, criteria, geography }` around by hand.
   This exists because "cross-client data leakage" is on the brief's risk list,
   SOUL.md Rule 6 forbids it outright, and the failure mode is silent: nothing
   throws when Client A's must-haves are scored against a listing shortlisted
   for Client B. You find out when a buyer receives a home that matches
   somebody else's brief.

   A rule enforced by care alone fails the first time someone is in a hurry. So
   the defence is a chokepoint: every consumer of matching data goes through
   this function, it takes exactly one clientId, and it throws — loudly, with
   the offending id — if any row it was handed belongs to someone else. The
   validation is not decoration. It is the point.

   THE DEFENCE IN DEPTH BEHIND IT
     1. RLS scopes every row to the caller's org (migrations 16-18)
     2. This function scopes to one client inside that org
     3. asap_client_matches carries client_id on every row
     4. Every Hermes beat names the client it acted for

   Pure and dependency-free so both the browser and a Node-side Hermes tool can
   call it.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Client, Criterion, ClientGeography, ClientContext } from './types.ts';

export class ClientContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientContextError';
  }
}

/**
 * Build the matching context for exactly one client.
 *
 * Throws rather than filtering when handed a foreign row. Filtering would hide
 * the bug — the query that over-fetched would keep over-fetching, quietly, and
 * the next caller might not go through this function at all. A thrown error
 * with the offending id in it gets fixed.
 */
export function assembleClientContext(
  client: Client,
  criteria: Criterion[],
  geography: ClientGeography[]
): ClientContext {
  if (!client?.id) {
    throw new ClientContextError('assembleClientContext: a client with an id is required.');
  }

  const strayCriterion = criteria.find((c) => c.client_id !== client.id);
  if (strayCriterion) {
    throw new ClientContextError(
      `assembleClientContext: criterion ${strayCriterion.id} belongs to client ` +
      `${strayCriterion.client_id}, not ${client.id}. Refusing to build a mixed context.`
    );
  }

  const strayGeography = geography.find((g) => g.client_id !== client.id);
  if (strayGeography) {
    throw new ClientContextError(
      `assembleClientContext: geography ${strayGeography.id} belongs to client ` +
      `${strayGeography.client_id}, not ${client.id}. Refusing to build a mixed context.`
    );
  }

  return {
    client,
    // Copied, not aliased. A caller that mutates what it was handed must not
    // be able to reach back into a shared cache of another client's rows.
    criteria: [...criteria],
    geography: [...geography],
  };
}

/** Postgres byte order, which is what `order by <uuid>` gives you.
 *
 *  DEFENSIVE, NOT A BUG FIX — and the distinction was measured rather than
 *  assumed. The previous implementation used localeCompare, and ICU collation
 *  genuinely does disagree with byte order on punctuation and case:
 *
 *      ids   : a-b  a_b  aB  ab
 *      icu   : a_b  a-b  ab  aB
 *      bytes : a-b  aB   a_b ab
 *
 *  But `id` here is a uuid, and every uuid carries its hyphens at identical
 *  positions — so the two rules never actually compare a hyphen against a hex
 *  digit. Sorting 4,000 random uuids under both produced the same order at
 *  every index. localeCompare was therefore not producing wrong fingerprints
 *  in production.
 *
 *  Kept anyway: this is the comparator `order by k.id` actually uses, it is
 *  cheaper than ICU, and it removes a class of risk rather than a symptom. If
 *  `id` ever stops being a uuid, the alignment holds. */
const byIdBytes = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Serialise a value exactly as Postgres renders `jsonb::text`.
 *
 * MEASURED against the live database (2026-07-27), not inferred:
 *
 *   '[1,2,3]'::jsonb::text            -> '[1, 2, 3]'          space after comma
 *   '{"zz":1,"a":2,"mmm":3}'::jsonb   -> '{"a": 2, "zz": 1, "mmm": 3}'
 *                                        keys reordered by LENGTH then bytes,
 *                                        space after both ':' and ','
 *   '"condo"'::jsonb::text            -> '"condo"'            agrees with JSON
 *   '3'::jsonb::text                  -> '3'                  agrees with JSON
 *
 * JSON.stringify produces '[1,2,3]' and '{"a":2,...}' — no spaces, insertion
 * order. So for any non-scalar criterion value the two implementations
 * disagreed, and the live database already holds one:
 * ["condo_town", "condo_apt"] on a deal_breaker.
 *
 * RESIDUAL RISK, stated rather than hidden: jsonb preserves numeric scale
 * ('3.0'::jsonb::text is '3.0') while a JSON number round-tripped through
 * PostgREST reaches JS as 3 and renders '3'. And key ordering compares UTF-16
 * code units here vs UTF-8 bytes in Postgres, which differ above the BMP.
 * Neither shape occurs in this schema today; both would show up as a
 * permanently-changed fingerprint rather than a silently-wrong match.
 */
export function pgJsonbText(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(pgJsonbText).join(', ')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort(
      (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)
    );
    return `{${keys.map((k) => `${JSON.stringify(k)}: ${pgJsonbText(o[k])}`).join(', ')}}`;
  }
  return JSON.stringify(v);
}

/**
 * A client's criteria, reduced to the string the engine's inputs actually
 * depend on. Mirrors public.client_criteria_hash() — see 22_match_sweep.sql,
 * which rewrote migration 18's version to make that claim true.
 *
 * This is the cost control: a sweep compares this against
 * asap_client_matches.criteria_hash and skips every listing whose inputs have
 * not moved — which is nearly all of them, nearly always.
 *
 * Not a hash function: a stable serialisation. Migration 18 wrapped the SQL
 * side in md5() while this side returned the raw string, so the comparison
 * could never be equal and the cost control was inverted into a cost
 * amplifier — every sweep re-scored everything. Both sides now return the raw
 * string, which is also diffable when someone asks "why did everything
 * re-score?".
 */
export function criteriaFingerprint(ctx: ClientContext): string {
  const c = ctx.client;
  // Array.join renders null as '', matching coalesce(x::text, '') in the SQL
  // twin. Migration 18 used bare concatenation, and in Postgres NULL || 'x' is
  // NULL — so one null budget field collapsed the whole segment to
  // 'no-client', making two clients with different budgets hash identically.
  const budget = [c.budget_min, c.budget_max, c.budget_stretch_pct, c.status].join('|');

  const criteria = [...ctx.criteria]
    .sort(byIdBytes)
    .map((k) => [k.kind, k.field, k.op, pgJsonbText(k.value), k.weight].join(':'))
    .join(',');

  const geography = [...ctx.geography]
    .sort(byIdBytes)
    .map((g) => [g.kind, g.market_slug, g.neighbourhood ?? '', g.rank].join(':'))
    .join(',');

  return [
    budget || 'no-client',
    criteria || 'no-criteria',
    geography || 'no-geography',
  ].join('#');
}

/** True when a stored match was computed against different inputs than the
 *  client has now. */
export const needsRescore = (ctx: ClientContext, storedFingerprint: string): boolean =>
  criteriaFingerprint(ctx) !== storedFingerprint;

/**
 * Which client profiles are overdue a conversation.
 *
 * Powers the Command Center's "next actions" and the `client.criteria_stale`
 * beat. Returns a reason string rather than a boolean, because "your buyer's
 * pre-approval expired last week" and "you have not reviewed this brief since
 * March" call for different conversations.
 */
export function stalenessReason(
  ctx: ClientContext,
  staleDays: number,
  now: number
): string | null {
  const c = ctx.client;
  const DAY = 86_400_000;
  const age = (iso: string | null) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? (now - t) / DAY : null;
  };

  if (c.preapproved && c.preapproval_expires_at) {
    const t = Date.parse(c.preapproval_expires_at);
    if (Number.isFinite(t) && t < now) {
      return 'Their pre-approval has expired — the budget needs re-confirming.';
    }
  }

  // TRESA: representation is not a nicety. Working a buyer without a current
  // agreement is a compliance problem before it is a data-freshness one.
  if (c.representation === 'expired') {
    return 'Their buyer representation agreement has expired.';
  }

  const budgetAge = age(c.budget_confirmed_at);
  if (c.budget_max !== null && budgetAge === null) {
    return 'Their budget has never been confirmed.';
  }
  if (budgetAge !== null && budgetAge > staleDays) {
    return `Budget last confirmed ${Math.round(budgetAge)} days ago.`;
  }

  const criteriaAge = age(c.criteria_confirmed_at);
  if (ctx.criteria.length > 0 && criteriaAge === null) {
    return 'Their must-haves have never been confirmed.';
  }
  if (criteriaAge !== null && criteriaAge > staleDays) {
    return `Requirements last confirmed ${Math.round(criteriaAge)} days ago.`;
  }

  return null;
}
