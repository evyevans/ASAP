/* ═══════════════════════════════════════════════════════════════════════════
   ListingProvider — one seam, four sources, no rewrites.

   THE SITUATION THIS IS BUILT FOR
   ASAP has no MLS feed. asap-buyer-match.md:18 states it plainly, and REMI —
   which looks like it solved this — did not: every one of its working adapters
   is US-only (RentCast, Zillow, ATTOM, RapidAPI Realtor), and its RESO adapter
   is a stub whose fetch() returns "not yet implemented". Ontario inventory has
   to come from somewhere else, and the honest answer today is public research
   plus what the realtor types in.

   That is a real constraint, not a permanent one. So the shape of this file is
   the actual deliverable: everything downstream — matching, the map, the grid,
   Hermes — depends on `Listing` and on this interface, never on where a row
   came from. When a TRREB/PropTx licence or an aggregator subscription lands,
   it is one new file implementing one interface, and no UI changes at all.

   RIGHTS TRAVEL WITH THE DATA
   Every provider declares what its output may be used for. The idea is lifted
   from REMI's rights_engine.py — comfortably the best thing in that codebase —
   and it is not bureaucracy: Ontario sold data is board-restricted, and
   `can_share_with_client` is what stops it being re-published to a buyer
   through ASAP. Defaults are the restrictive ones. A source has to earn
   sharing.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Listing, SourceId, Tenure } from '../matching/types.ts';

/** What a source's data may be used for. Applied at ingest, stored per row, so
 *  a later change of licence does not retroactively re-permit old rows. */
export interface SourceRights {
  /** May we persist it at all? */
  canStore: boolean;
  /** May the realtor see it in ASAP? */
  canDisplay: boolean;
  /** May it be forwarded to a buyer? Defaults false everywhere. */
  canShareWithClient: boolean;
  /** How much weight a figure from this source carries. */
  confidence: Listing['source_confidence'];
  /** Plain-language licence note, surfaced in the UI beside the data. */
  note: string;
}

export interface FetchParams {
  marketSlug: string;
  tenure: Tenure;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  neighbourhoods?: string[];
  limit?: number;
}

/** Never throws. A provider that is down returns `ok: false` with a reason the
 *  UI can show, because "0 listings" and "the feed is broken" look identical to
 *  a realtor and must not. */
export interface FetchResult {
  ok: boolean;
  listings: RawListing[];
  /** Why it failed, or why it returned less than asked for. */
  reason?: string;
  /** True when the result is real but incomplete (quota, partial page). */
  partial?: boolean;
  sourceId: SourceId;
  fetchedAt: string;
}

/** What a provider hands back, before normalisation. Loose on purpose — every
 *  upstream shape is different, and tightening it here would just move the
 *  mapping code into each provider. */
export interface RawListing {
  address?: string | null;
  unit?: string | null;
  neighbourhood?: string | null;
  lat?: number | null;
  lng?: number | null;
  bedrooms?: number | string | null;
  bathrooms?: number | string | null;
  sqft?: number | string | null;
  propertyType?: string | null;
  parkingSpaces?: number | string | null;
  price?: number | string | null;
  soldPrice?: number | string | null;
  soldAt?: string | null;
  maintenanceFee?: number | string | null;
  listedAt?: string | null;
  daysOnMarket?: number | string | null;
  status?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  sourceListingId?: string | null;
  raw?: unknown;
}

export interface ListingProvider {
  id: SourceId;
  label: string;
  rights: SourceRights;
  /** False when credentials are missing — checked before use so the UI can say
   *  "not configured" rather than showing an empty result set. */
  isConfigured(): boolean;
  fetch(params: FetchParams): Promise<FetchResult>;
}

/* ── Rights presets ───────────────────────────────────────────────────────
   Written once, here, so a new provider cannot quietly grant itself sharing
   rights by filling in its own object. */

/** Read from a public listing page. Real, useful, and NOT authoritative — it
 *  can be hours stale and the price may already have moved. Never shareable:
 *  forwarding a scraped page to a buyer as if it were MLS truth is how a
 *  realtor ends up quoting a price that no longer exists. */
export const PUBLIC_RESEARCH_RIGHTS: SourceRights = {
  canStore: true,
  canDisplay: true,
  canShareWithClient: false,
  confidence: 'public_snapshot',
  note: 'Public listing snapshot — confirm on MLS before acting on it.',
};

/** Typed in by the realtor. They are the licensed professional; if they entered
 *  it, they may send it. */
export const MANUAL_RIGHTS: SourceRights = {
  canStore: true,
  canDisplay: true,
  canShareWithClient: true,
  confidence: 'user_entered',
  note: 'Entered by you.',
};

/** A board feed under the realtor's own membership. Authoritative — and the
 *  one place sharing has real conditions attached, which is why this is still
 *  false: board display rules vary by field and by board, and the licence has
 *  to be read before it is flipped, not after. */
export const LICENSED_FEED_RIGHTS: SourceRights = {
  canStore: true,
  canDisplay: true,
  canShareWithClient: false,
  confidence: 'confirmed',
  note: 'Board feed — display and sharing follow your board data licence.',
};

/* ── Registry ─────────────────────────────────────────────────────────────*/

const registry = new Map<SourceId, ListingProvider>();

export function registerProvider(p: ListingProvider): void {
  registry.set(p.id, p);
}

export function getProvider(id: SourceId): ListingProvider | undefined {
  return registry.get(id);
}

/** Providers that could actually run right now. The UI lists these; it does not
 *  offer a source whose credentials are missing and then fail. */
export function configuredProviders(): ListingProvider[] {
  return [...registry.values()].filter((p) => p.isConfigured());
}

export function allProviders(): ListingProvider[] {
  return [...registry.values()];
}

/** Reset — tests only. */
export function __clearProviders(): void {
  registry.clear();
}
