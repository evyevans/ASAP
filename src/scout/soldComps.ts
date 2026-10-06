/* ═══════════════════════════════════════════════════════════════════════════
   soldComps — recent sales near a listing, as CONTEXT only.

   THE RULE THIS FILE EXISTS TO ENFORCE
   Sold listings live in the same table as live inventory, because they are
   genuinely useful: knowing three comparable homes sold nearby in the last
   quarter is exactly the context that makes a shortlist credible. But a sold
   home must never be shortlistable, and its price must never be turned into a
   verdict.

   Three separate guards, in three separate places:
     1. matchEngine's availability gate excludes tenure='sold' outright
     2. migration 17's CHECK refuses to store a shortlisted match with a
        failed gate
     3. this module, which returns a labelled, read-only summary and NOTHING a
        UI could mistake for a candidate

   WHAT IT WILL NOT COMPUTE
   No "this listing is X% above comparable sales". That is an opinion of value,
   forbidden by SOUL.md Rule 5 / SC-01.5. What it returns is the range of
   published sale prices and the count — facts the realtor forms their own view
   from. The difference is not pedantry: one is data, the other is an appraisal
   the agent is not licensed to make.

   ONTARIO NOTE
   Sold data is board-restricted. can_share_with_client is forced false on
   every sold row (migration 16 default + normalizeListing), so this informs
   the realtor and cannot be forwarded to a buyer through ASAP.

   Pure — `now` injected, no network.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Listing } from '../matching/types';

const DAY_MS = 86_400_000;
const EARTH_R_KM = 6371;

/** Great-circle distance in kilometres. Small enough at city scale that the
 *  haversine's precision is far beyond what the coordinates deserve, but it
 *  costs nothing and avoids a flat-earth error near the 49th parallel. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface CompOptions {
  /** How far out to look. */
  radiusKm?: number;
  /** How far back. A sale from two years ago is history, not a comp. */
  windowDays?: number;
  /** Match bedroom count within this tolerance. */
  bedroomTolerance?: number;
  /** Match floor area within this fraction, e.g. 0.25 = +/-25%. */
  sqftTolerance?: number;
  max?: number;
}

const DEFAULTS: Required<CompOptions> = {
  radiusKm: 1.5,
  windowDays: 180,
  bedroomTolerance: 1,
  sqftTolerance: 0.25,
  max: 6,
};

export interface Comp {
  listing: Listing;
  distanceKm: number;
  daysAgo: number;
}

export interface CompSummary {
  comps: Comp[];
  count: number;
  /** Published sale prices only. Never a derived "market value". */
  lowPrice: number | null;
  highPrice: number | null;
  medianPrice: number | null;
  /** The neutral sentence a realtor can read aloud. Facts, no verdict. */
  sentence: string | null;
}

/**
 * Comparable recent sales near a subject listing.
 *
 * Filters are the ones a realtor would actually apply — same area, similar
 * size, similar bedroom count, recent — rather than a similarity score, so the
 * set is explainable: "three 3-bed homes within 1.5km that sold in the last six
 * months."
 */
export function findComps(
  subject: Listing,
  candidates: Listing[],
  now: number,
  options: CompOptions = {}
): Comp[] {
  const o = { ...DEFAULTS, ...options };

  if (subject.lat === null || subject.lng === null) return [];
  const origin = { lat: subject.lat, lng: subject.lng };

  const comps: Comp[] = [];

  for (const c of candidates) {
    if (c.tenure !== 'sold') continue;      // the whole point
    if (c.id === subject.id) continue;
    if (c.sold_price === null) continue;
    if (c.lat === null || c.lng === null) continue;

    const soldAt = c.sold_at ? Date.parse(c.sold_at) : NaN;
    if (!Number.isFinite(soldAt)) continue;
    const daysAgo = (now - soldAt) / DAY_MS;
    if (daysAgo < 0 || daysAgo > o.windowDays) continue;

    const km = distanceKm(origin, { lat: c.lat, lng: c.lng });
    if (km > o.radiusKm) continue;

    // Size filters apply only when BOTH sides know the number. An unknown must
    // not silently narrow the set — see the same rule in matchEngine.satisfies.
    if (subject.bedrooms !== null && c.bedrooms !== null
      && Math.abs(subject.bedrooms - c.bedrooms) > o.bedroomTolerance) continue;

    if (subject.sqft !== null && c.sqft !== null && subject.sqft > 0) {
      const ratio = Math.abs(c.sqft - subject.sqft) / subject.sqft;
      if (ratio > o.sqftTolerance) continue;
    }

    comps.push({ listing: c, distanceKm: km, daysAgo: Math.round(daysAgo) });
  }

  // Nearest first, then most recent — the two things that make a comp credible.
  comps.sort((a, b) => a.distanceKm - b.distanceKm || a.daysAgo - b.daysAgo);
  return comps.slice(0, o.max);
}

const median = (ns: number[]): number | null => {
  if (ns.length === 0) return null;
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`;

/**
 * The comp set, summarised into something renderable.
 *
 * Note what `sentence` says and does not say. It reports how many homes sold,
 * how nearby, how recently, and for what range — all published facts. It never
 * says the subject is over- or under-priced relative to them, because that is
 * the conclusion the licensed human draws, not the software.
 */
export function summariseComps(
  subject: Listing,
  candidates: Listing[],
  now: number,
  options: CompOptions = {}
): CompSummary {
  const o = { ...DEFAULTS, ...options };
  const comps = findComps(subject, candidates, now, options);
  const prices = comps.map((c) => c.listing.sold_price!).filter((p) => Number.isFinite(p));

  if (comps.length === 0) {
    return { comps: [], count: 0, lowPrice: null, highPrice: null, medianPrice: null, sentence: null };
  }

  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const months = Math.round(o.windowDays / 30);

  const sentence =
    `${comps.length} comparable home${comps.length === 1 ? '' : 's'} sold within ` +
    `${o.radiusKm} km in the last ${months} months, between ${money(low)} and ${money(high)}.`;

  return {
    comps,
    count: comps.length,
    lowPrice: low,
    highPrice: high,
    medianPrice: median(prices),
    sentence,
  };
}

/** Guard used by every surface that renders a comp. Sold data is board-
 *  restricted; this is the last check before it could reach a client-facing
 *  artifact. */
export const compIsShareable = (c: Comp): boolean => c.listing.can_share_with_client;
