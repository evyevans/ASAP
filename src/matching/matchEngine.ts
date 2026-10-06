/* ═══════════════════════════════════════════════════════════════════════════
   matchEngine — does this home fit this buyer, and exactly why.

   WHY THIS IS DETERMINISTIC AND NOT A PROMPT
   The obvious build is "hand the listing and the client to an LLM and ask." It
   is also the wrong one, for four reasons that all bite in production:

     1. EXPLAINABILITY. A realtor is going to defend this shortlist to a client
        who asks "why did you send me a place with one bathroom?" The answer has
        to be a criterion, not a vibe.
     2. REPRODUCIBILITY. The same listing and the same criteria must give the
        same verdict today and next Tuesday. Trust dies on the first time it
        doesn't.
     3. COST. Scoring the market against every client on every sweep, through a
        model, is the "token explosion from constant background scanning" the
        brief warns about. This runs in microseconds for nothing.
     4. TESTABILITY. Every rule below is asserted in matchEngine.test.ts. A
        prompt cannot be unit-tested; it can only be sampled.

   The LLM still has a job — see stage 3 in the header of applyLlmJudgement —
   but it is a demotion pass over ~10 already-qualified listings, never the
   filter.

   THE COMPLIANCE LINE THAT SHAPES EVERYTHING HERE
   SOUL.md Rule 5 and success-criteria/01-regulatory-ontario.md SC-01.5 forbid
   this agent from forming an opinion of a property's value. So:

       This engine NEVER scores a property. It scores a FIT.

   `score` answers "how much of what this buyer asked for does this home have",
   which is a fact about the buyer's stated criteria. It is not, and must never
   become, a claim that a home is a good buy, well-priced, or worth the ask.
   That is why REMI's deal_score, deal_category, price_tier, percent_above_market
   and estimated_roi are all absent — every one of them is the forbidden claim.

   Pure. No React, no network, no clock of its own — `now` is injected, exactly
   like sceneDirector. That is what lets both the browser and Hermes run it and
   get the same answer.
   ═══════════════════════════════════════════════════════════════════════════ */

import type {
  Listing, Criterion, ClientContext, MatchResult, MatchReason, FailedGate,
  MatchBand, MatchSettings, Tenure,
} from './types.ts';
import { DEFAULT_MATCH_SETTINGS } from './types.ts';

/* ── Band thresholds ──────────────────────────────────────────────────────
   Deliberately generous at the bottom. A listing that clears every hard gate
   has already satisfied everything the buyer called non-negotiable; the score
   only ranks how many of the nice-to-haves it also has. Calling such a home
   "stretch" is honest, but excluding it would be second-guessing the buyer. */
const STRONG_AT = 80;
const POSSIBLE_AT = 55;

const DAY_MS = 86_400_000;

/* ── Small helpers ────────────────────────────────────────────────────────*/

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const asNumber = (v: unknown): number | null => {
  if (isNum(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const asArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return [v];
  return [];
};

/** Days since an ISO timestamp, or null when it was never set. */
const ageDays = (iso: string | null | undefined, now: number): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (now - t) / DAY_MS;
};

/** Thousands separators without Intl.
 *
 *  This output is PERSISTED — it ends up inside asap_client_matches.reasons,
 *  which is the explanation the realtor reads back to their client. The same
 *  match is now computed in two runtimes: vitest under Node, and the sweep
 *  under Deno. toLocaleString routes through each runtime's ICU build, and a
 *  Deno deploy that ships a different ICU than the Node running the tests
 *  would store visibly different text for an identical match — every stored
 *  reason churning on a separator, with no code change to blame it on.
 *
 *  A regex is not the elegant answer; it is the deterministic one, which is
 *  what a persisted string needs. */
const money = (n: number): string =>
  `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/* ── Listing field access ─────────────────────────────────────────────────
   Criteria name a `field`; this is the single place a field name becomes a
   value. Fields with no column on asap_listings (outdoor_space, basement,
   garage, accessibility, pets, custom) resolve to undefined and are handled
   by the UNKNOWN rule below, which is the most important rule in this file. */
function listingValue(listing: Listing, field: Criterion['field']): unknown {
  switch (field) {
    case 'bedrooms': return listing.bedrooms;
    case 'bathrooms': return listing.bathrooms;
    case 'sqft': return listing.sqft;
    case 'parking_spaces': return listing.parking_spaces;
    case 'property_type': return listing.property_type;
    case 'maintenance_fee': return listing.maintenance_fee;
    case 'days_on_market': return listing.days_on_market;
    // Not columns. They live in prose, if anywhere.
    case 'outdoor_space':
    case 'basement':
    case 'garage':
    case 'accessibility':
    case 'pets':
    case 'custom':
    default: return undefined;
  }
}

/** Does the listing satisfy this criterion?
 *
 *  Returns `null` for UNKNOWN, which is distinct from false and is the crux of
 *  the whole engine. A public listing snapshot frequently has no parking count
 *  and no square footage. Treating "we don't know" as "it fails" silently
 *  deletes good homes from a buyer's search; treating it as "it passes" puts a
 *  one-bathroom house in front of someone who said two, minimum.
 *
 *  So unknown is neither. It propagates, and the caller decides:
 *    · a MUST that cannot be checked   -> surfaced as an open question, not a pass
 *    · a NICE that cannot be checked   -> scores nothing, costs nothing
 */
export function satisfies(listing: Listing, c: Criterion): boolean | null {
  const actual = listingValue(listing, c.field);
  if (actual === undefined || actual === null) return null;

  switch (c.op) {
    case 'gte': {
      const want = asNumber(c.value);
      const got = asNumber(actual);
      return want === null || got === null ? null : got >= want;
    }
    case 'lte': {
      const want = asNumber(c.value);
      const got = asNumber(actual);
      return want === null || got === null ? null : got <= want;
    }
    case 'eq':
      return String(actual).toLowerCase() === String(c.value).toLowerCase();
    case 'in': {
      const set = asArray(c.value).map((s) => s.toLowerCase());
      return set.length === 0 ? null : set.includes(String(actual).toLowerCase());
    }
    case 'not_in': {
      const set = asArray(c.value).map((s) => s.toLowerCase());
      return set.length === 0 ? null : !set.includes(String(actual).toLowerCase());
    }
    case 'is_true': return actual === true;
    case 'is_false': return actual === false;
    case 'contains':
      return String(actual).toLowerCase().includes(String(c.value).toLowerCase());
    default:
      return null;
  }
}

/* ── Stage 1: hard gates ──────────────────────────────────────────────────
   A failure here EXCLUDES. Every exclusion carries the criterion's own label,
   because migration 18's decide_client_match() refuses to shortlist anything
   with a failed gate — so the realtor's only route past one is to change the
   criterion, and they need to know which. */

/** Which tenures a client is shopping. A buyer looking to rent is a different
 *  search, not a different score. Derived from criteria rather than a column
 *  so a client can be doing both. */
const wantedTenures = (ctx: ClientContext): Tenure[] => {
  const t = ctx.criteria.find((c) => c.field === 'custom' && /tenure|rent|buy/i.test(c.label));
  if (t && /rent/i.test(String(t.value))) return ['for_rent'];
  return ['for_sale'];
};

function evaluateGates(
  listing: Listing,
  ctx: ClientContext,
  now: number
): { failed: FailedGate[]; reasons: MatchReason[]; open: MatchReason[] } {
  const failed: FailedGate[] = [];
  const reasons: MatchReason[] = [];
  const open: MatchReason[] = [];

  /* Availability. A sold or leased home is not a bad match — it is not a match
     at all, and pitching one to a buyer is a wrong action rather than a poor
     ranking. This gate is the reason sold comps can live safely in the same
     table as live inventory. */
  if (listing.tenure === 'sold' || !wantedTenures(ctx).includes(listing.tenure)) {
    failed.push({
      kind: 'availability',
      label: 'Available to buy',
      detail: listing.tenure === 'sold'
        ? 'This home has already sold — it is comparable data, not a candidate.'
        : `This is a ${listing.tenure.replace('_', ' ')} listing.`,
    });
  } else if (listing.status !== 'active') {
    failed.push({
      kind: 'availability',
      label: 'Available to buy',
      detail: `The listing status is "${listing.status}".`,
    });
  }

  /* Budget. The stretch percentage is applied to the ceiling only — a home
     below budget_min is never excluded, because "cheaper than expected" is not
     a defect and buyers routinely say a minimum they do not mean. */
  const price = listing.tenure === 'sold' ? listing.sold_price : listing.list_price;
  const ceiling = ctx.client.budget_max === null
    ? null
    : ctx.client.budget_max * (1 + (ctx.client.budget_stretch_pct || 0) / 100);

  if (ceiling !== null && isNum(price)) {
    if (price > ceiling) {
      failed.push({
        kind: 'budget',
        label: 'Within budget',
        detail: `${money(price)} is above ${money(ceiling)}${
          ctx.client.budget_stretch_pct ? ` (budget plus ${ctx.client.budget_stretch_pct}% stretch)` : ''}.`,
      });
    } else {
      reasons.push({
        kind: 'budget',
        label: 'Within budget',
        met: true,
        detail: `${money(price)} against a ceiling of ${money(ceiling)}.`,
      });
    }
  } else if (ceiling !== null && !isNum(price)) {
    open.push({
      kind: 'budget',
      label: 'Within budget',
      met: false,
      detail: 'This listing has no published price — confirm before showing it.',
    });
  }

  /* Geography. Excludes beat targets: a buyer who wants all of Toronto except
     one pocket is making a different statement from one who lists every
     neighbourhood they do want, and the exclusion is the stronger of the two. */
  const excludes = ctx.geography.filter((g) => g.kind === 'exclude');
  const targets = ctx.geography.filter((g) => g.kind === 'target');

  const hit = (g: { market_slug: string; neighbourhood: string | null }) =>
    g.market_slug === listing.market_slug &&
    (!g.neighbourhood ||
      (listing.neighbourhood ?? '').toLowerCase() === g.neighbourhood.toLowerCase());

  const excluded = excludes.find(hit);
  if (excluded) {
    failed.push({
      kind: 'geography',
      label: 'Area they will consider',
      detail: `${excluded.neighbourhood ?? excluded.market_slug} is on their exclude list.`,
    });
  } else if (targets.length > 0) {
    const matchedTarget = targets.find(hit);
    if (matchedTarget) {
      reasons.push({
        kind: 'geography',
        label: 'Area they want',
        met: true,
        detail: matchedTarget.neighbourhood
          ? `In ${matchedTarget.neighbourhood}.`
          : `In their ${listing.market_slug.replace(/-on$/, '').replace(/-/g, ' ')} search area.`,
      });
    } else {
      failed.push({
        kind: 'geography',
        label: 'Area they want',
        detail: 'Outside every area on their list.',
      });
    }
  }

  /* Must-haves and deal-breakers. */
  for (const c of ctx.criteria) {
    if (c.kind === 'nice') continue;
    const ok = satisfies(listing, c);

    if (ok === null) {
      // UNKNOWN on a must-have: do not exclude, do not pretend. Surface it as
      // something the realtor has to check, which is exactly what they would
      // do anyway before sending it on.
      open.push({
        kind: c.kind,
        label: c.label,
        met: false,
        detail: 'Not stated in the listing — confirm this one.',
      });
      continue;
    }

    // A deal-breaker is a requirement phrased negatively; satisfying it means
    // the bad thing is ABSENT. Both kinds fail the same way.
    if (!ok) {
      failed.push({
        kind: c.kind,
        label: c.label,
        detail: c.kind === 'deal_breaker' ? 'Their stated deal-breaker.' : 'A must-have this home misses.',
      });
    } else {
      reasons.push({ kind: c.kind, label: c.label, met: true, detail: 'Met.' });
    }
  }

  void now;
  return { failed, reasons, open };
}

/* ── Stage 2: the fit score ───────────────────────────────────────────────*/

function scoreNiceToHaves(
  listing: Listing,
  ctx: ClientContext
): { score: number; reasons: MatchReason[] } {
  const nice = ctx.criteria.filter((c) => c.kind === 'nice');
  const reasons: MatchReason[] = [];

  // No nice-to-haves recorded means everything they asked for is a must, and
  // this home has all of them. That is a full fit, not a zero.
  if (nice.length === 0) return { score: 100, reasons };

  let earned = 0;
  let possible = 0;

  for (const c of nice) {
    const ok = satisfies(listing, c);
    if (ok === null) {
      // Unknown scores nothing and costs nothing: it neither rewards a listing
      // for a feature we cannot see, nor punishes it for a thin description.
      // Excluding it from `possible` is what stops sparse listings from being
      // systematically outranked by verbose ones.
      reasons.push({ kind: 'nice', label: c.label, met: false, detail: 'Not stated in the listing.' });
      continue;
    }
    possible += c.weight;
    if (ok) {
      earned += c.weight;
      reasons.push({ kind: 'nice', label: c.label, met: true, detail: 'Yes.' });
    } else {
      reasons.push({ kind: 'nice', label: c.label, met: false, detail: 'No.' });
    }
  }

  // Everything measurable was unmeasurable. Neutral, not zero.
  if (possible === 0) return { score: 70, reasons };
  return { score: (earned / possible) * 100, reasons };
}

/** Small, bounded adjustments. Deliberately not price-based: any bonus keyed to
 *  "below market" would be an opinion of value, which Rule 5 forbids. */
function adjustments(listing: Listing, ctx: ClientContext): { delta: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  let delta = 0;

  // Preferred-area rank. Their first-choice neighbourhood should outrank their
  // fifth, and this is a fact about their stated preference order.
  const target = ctx.geography
    .filter((g) => g.kind === 'target' && g.market_slug === listing.market_slug)
    .sort((a, b) => a.rank - b.rank)[0];
  if (target && target.rank <= 2) delta += 4;

  // Long days-on-market is a scheduling fact (there is room to book a showing
  // this week), NOT a pricing signal. REMI treated DOM > 90 as a "motivated
  // seller" bonus inside its deal score; that inference is exactly what Rule 5
  // rules out, so it is not repeated here.
  if (isNum(listing.days_on_market) && listing.days_on_market > 45) {
    reasons.push({
      kind: 'nice',
      label: 'Easy to get into',
      met: true,
      detail: `On the market ${listing.days_on_market} days — showings should be easy to book.`,
    });
  }

  return { delta, reasons };
}

/* ── Freshness ────────────────────────────────────────────────────────────*/

/** Are the inputs behind this match old enough to distrust?
 *
 *  The brief's first named risk is "stale or incomplete client preference
 *  data". The defence is not a reminder email — it is that a match built on
 *  four-month-old criteria cannot be presented with the same confidence as one
 *  built on criteria confirmed last week, and the engine says so itself. */
export function inputsAreStale(ctx: ClientContext, settings: MatchSettings, now: number): boolean {
  const limit = settings.staleDays;

  const budgetAge = ageDays(ctx.client.budget_confirmed_at, now);
  const criteriaAge = ageDays(ctx.client.criteria_confirmed_at, now);

  // Never confirmed at all is the stalest state there is, not a free pass.
  if (budgetAge === null && ctx.client.budget_max !== null) return true;
  if (criteriaAge === null && ctx.criteria.length > 0) return true;

  if (budgetAge !== null && budgetAge > limit) return true;
  if (criteriaAge !== null && criteriaAge > limit) return true;

  // A pre-approval that has expired makes the whole budget a guess.
  if (ctx.client.preapproved && ctx.client.preapproval_expires_at) {
    const t = Date.parse(ctx.client.preapproval_expires_at);
    if (Number.isFinite(t) && t < now) return true;
  }

  return false;
}

/* ── The engine ───────────────────────────────────────────────────────────*/

export function bandFor(score: number): MatchBand {
  if (score >= STRONG_AT) return 'strong';
  if (score >= POSSIBLE_AT) return 'possible';
  return 'stretch';
}

/** Drop a band, without going below the floor. Used by the staleness rule and
 *  by the LLM demotion pass — both of which may lower confidence, never raise
 *  it. */
export function demote(band: MatchBand): MatchBand {
  return band === 'strong' ? 'possible' : 'stretch';
}

/**
 * Does this listing fit this client?
 *
 * @param listing  one row from asap_listings
 * @param ctx      exactly ONE client's context, built by assembleClientContext
 * @param now      injected clock (ms epoch) — keeps this pure
 */
export function evaluateMatch(
  listing: Listing,
  ctx: ClientContext,
  now: number,
  settings: MatchSettings = DEFAULT_MATCH_SETTINGS
): MatchResult {
  const stale = inputsAreStale(ctx, settings, now);
  const gates = evaluateGates(listing, ctx, now);

  // Excluded. Return the reasons anyway — a rejection the realtor cannot read
  // is a rejection they cannot correct.
  if (gates.failed.length > 0) {
    return {
      passed: false,
      score: 0,
      band: 'stretch',
      reasons: [...gates.reasons, ...gates.open],
      failedGates: gates.failed,
      staleInputs: stale,
    };
  }

  const nice = scoreNiceToHaves(listing, ctx);
  const adj = adjustments(listing, ctx);

  const score = Math.max(0, Math.min(100, Math.round(nice.score + adj.delta)));
  let band = bandFor(score);

  const reasons: MatchReason[] = [...gates.reasons, ...nice.reasons, ...adj.reasons, ...gates.open];

  // Stale inputs cost confidence, not candidacy. The home still qualifies; we
  // just decline to call it a strong fit against criteria nobody has confirmed
  // in months, and we say why in the same breath.
  if (stale) {
    band = demote(band);
    reasons.push({
      kind: 'freshness',
      label: 'Worth re-confirming',
      met: false,
      detail: `Scored against criteria last confirmed over ${settings.staleDays} days ago.`,
    });
  }

  return { passed: true, score, band, reasons, failedGates: [], staleInputs: stale };
}

/* ── Stage 3: the LLM pass ────────────────────────────────────────────────*/

export interface LlmJudgement {
  /** Free text the realtor sees verbatim. Never used as a filter. */
  note: string;
  /** True when the model spotted a real-world problem the criteria cannot
   *  express — backs onto a highway, third floor with no elevator for a buyer
   *  with mobility needs, unit above a late-night restaurant. */
  demote: boolean;
}

/**
 * Fold a model's judgement into a computed match.
 *
 * THIS IS THE ONLY PLACE AN LLM TOUCHES MATCHING, AND IT CAN ONLY LOSE POINTS.
 *
 * It exists for the brief's risk "properties that technically match filters but
 * are poor real-world fits" — a genuine gap, because no criteria schema can
 * encode "the photos show it backs onto the 401". A model reading the listing
 * description is good at exactly that.
 *
 * What it categorically cannot do is promote. A listing that failed a hard gate
 * is returned untouched, so no amount of model enthusiasm can put a home over
 * budget or in the wrong city in front of a buyer. That asymmetry is the whole
 * safety argument, and it is enforced here rather than in the prompt — prompts
 * are advisory, function signatures are not.
 */
export function applyLlmJudgement(result: MatchResult, judgement: LlmJudgement): MatchResult {
  if (!result.passed) return result;
  if (!judgement.demote) return result;

  return {
    ...result,
    band: demote(result.band),
    reasons: [
      ...result.reasons,
      { kind: 'freshness', label: 'Worth a closer look', met: false, detail: judgement.note },
    ],
  };
}

/* ── Batch ────────────────────────────────────────────────────────────────*/

export interface RankedMatch {
  listing: Listing;
  result: MatchResult;
}

/**
 * Score many listings for ONE client, ranked best first.
 *
 * `cap` is the review-fatigue control from the brief. It applies to what gets
 * SURFACED, not to what gets computed — the rest are stored and reachable in
 * the grid, so a cap never silently deletes a home the buyer might have wanted.
 * Callers that drop the tail must say so; see rankForClient's return shape.
 */
export function rankForClient(
  listings: Listing[],
  ctx: ClientContext,
  now: number,
  settings: MatchSettings = DEFAULT_MATCH_SETTINGS
): { surfaced: RankedMatch[]; held: RankedMatch[]; excluded: RankedMatch[] } {
  const scored = listings.map((listing) => ({
    listing,
    result: evaluateMatch(listing, ctx, now, settings),
  }));

  const excluded = scored.filter((m) => !m.result.passed);

  const qualified = scored
    .filter((m) => m.result.passed)
    .sort((a, b) =>
      b.result.score - a.result.score ||
      // Stable tiebreak so two identical scores never reorder between runs —
      // a shortlist that shuffles on refresh looks broken.
      a.listing.id.localeCompare(b.listing.id));

  const eligible = qualified.filter((m) =>
    BAND_INDEX[m.result.band] >= BAND_INDEX[settings.minBand]);

  return {
    surfaced: eligible.slice(0, Math.max(0, settings.dailyCap)),
    held: [...eligible.slice(Math.max(0, settings.dailyCap)),
           ...qualified.filter((m) => BAND_INDEX[m.result.band] < BAND_INDEX[settings.minBand])],
    excluded,
  };
}

const BAND_INDEX: Record<MatchBand, number> = { stretch: 0, possible: 1, strong: 2 };
