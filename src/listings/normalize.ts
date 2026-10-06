/* ═══════════════════════════════════════════════════════════════════════════
   normalize — raw provider output → an asap_listings row.

   TWO JOBS, AND THE SECOND ONE IS THE HARD ONE.

   1. COERCE. Upstream sources send "3", 3, "3 beds", "$1,250,000", "1,400 sq
      ft" and null for the same field. Every coercion here fails to `null`
      rather than to a guess: a wrong bedroom count silently mis-matches a
      buyer, where a missing one is handled honestly by the engine's UNKNOWN
      rule (see matchEngine.satisfies).

   2. IDENTIFY. The same home appears in three research passes with the address
      written three ways. `address_norm` + `unit_norm` is the dedupe key behind
      the unique index in migration 16, so normalisation is what makes ingest
      idempotent. Get it wrong in the loose direction and two homes merge; get
      it wrong in the tight direction and the buyer sees the same house four
      times. Both are visible failures, which is why this is tested hard.

   Ontario-specific and unapologetic about it: the province is fixed, so the
   normaliser can know that "ON", "Ont", and "Ontario" are the same thing and
   that a postal code looks like M4M 1A1.

   Pure — no clock of its own, no network, no Supabase.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Listing, PropertyType, ListingStatus, Tenure } from '../matching/types.ts';
import type { RawListing, SourceRights } from './provider.ts';
import type { SourceId } from '../matching/types.ts';

/* ── Coercion ─────────────────────────────────────────────────────────────*/

/** A number, or null. Never NaN, never a guess.
 *  Strips currency symbols, thousands separators, and trailing units, because
 *  every real feed sends at least one of them. */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;

  const cleaned = v.replace(/[$,\s]/g, '').replace(/(sqft|sq\.?ft\.?|ft2|beds?|baths?)$/i, '');
  if (cleaned === '') return null;

  // "3+1" is Ontario MLS shorthand for 3 bedrooms plus 1 in the basement. The
  // sum is what a buyer counts, so sum it rather than dropping the suffix.
  const plus = /^(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)$/.exec(cleaned);
  if (plus) return Number(plus[1]) + Number(plus[2]);

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** An ISO date (YYYY-MM-DD), or null. */
export function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

const PROPERTY_TYPES: Record<string, PropertyType> = {
  detached: 'detached', 'single family': 'detached', house: 'detached', bungalow: 'detached',
  semi: 'semi', 'semi-detached': 'semi', 'semi detached': 'semi',
  townhouse: 'townhouse', town: 'townhouse', 'row house': 'townhouse', freehold: 'townhouse',
  condo: 'condo_apt', 'condo apt': 'condo_apt', apartment: 'condo_apt', 'condo apartment': 'condo_apt',
  'condo townhouse': 'condo_town', 'stacked townhouse': 'condo_town',
  duplex: 'multiplex', triplex: 'multiplex', fourplex: 'multiplex', multiplex: 'multiplex',
};

export function propertyType(v: unknown): PropertyType | null {
  if (typeof v !== 'string') return null;
  const key = v.trim().toLowerCase();
  if (key === '') return null;
  if (PROPERTY_TYPES[key]) return PROPERTY_TYPES[key];
  // Substring pass, longest key first so "condo townhouse" cannot be swallowed
  // by "condo".
  const hit = Object.keys(PROPERTY_TYPES)
    .sort((a, b) => b.length - a.length)
    .find((k) => key.includes(k));
  return hit ? PROPERTY_TYPES[hit] : 'other';
}

const STATUSES: Record<string, ListingStatus> = {
  active: 'active', 'for sale': 'active', 'for rent': 'active', new: 'active', available: 'active',
  pending: 'pending', 'sale pending': 'pending', conditional: 'pending', 'under contract': 'pending',
  sold: 'sold', closed: 'sold',
  leased: 'leased', rented: 'leased',
  expired: 'expired', terminated: 'terminated', withdrawn: 'withdrawn', suspended: 'withdrawn',
};

export function listingStatus(v: unknown, tenure: Tenure): ListingStatus {
  if (typeof v === 'string') {
    const key = v.trim().toLowerCase();
    if (STATUSES[key]) return STATUSES[key];
  }
  // Unknown status: infer from tenure rather than defaulting to 'active'.
  // Guessing 'active' on a sold row would put a sold home into the match pool,
  // which the availability gate exists to prevent.
  return tenure === 'sold' ? 'sold' : 'active';
}

/* ── Address normalisation ────────────────────────────────────────────────*/

/** Street-type abbreviations, expanded to a single canonical form so
 *  "12 Test Street" and "12 Test St." collapse to one key. */
const STREET_TYPES: Record<string, string> = {
  st: 'street', str: 'street', street: 'street',
  ave: 'avenue', av: 'avenue', avenue: 'avenue',
  rd: 'road', road: 'road',
  dr: 'drive', drive: 'drive',
  blvd: 'boulevard', boulevard: 'boulevard',
  cres: 'crescent', crescent: 'crescent',
  ct: 'court', crt: 'court', court: 'court',
  pl: 'place', place: 'place',
  ln: 'lane', lane: 'lane',
  ter: 'terrace', terrace: 'terrace',
  pkwy: 'parkway', parkway: 'parkway',
  cir: 'circle', circle: 'circle',
  sq: 'square', square: 'square',
  gdns: 'gardens', gardens: 'gardens',
  hwy: 'highway', highway: 'highway',
  trl: 'trail', trail: 'trail',
  way: 'way', walk: 'walk', mews: 'mews', gate: 'gate', grove: 'grove', path: 'path',
};

const DIRECTIONS: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  north: 'north', south: 'south', east: 'east', west: 'west',
  northeast: 'northeast', northwest: 'northwest', southeast: 'southeast', southwest: 'southwest',
};

const CA_POSTAL = /\b[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d\b/g;

/**
 * Canonical form of a street address, for deduping.
 *
 * Deliberately conservative: it expands abbreviations and strips noise, but it
 * does NOT try to correct spelling or reorder tokens. An over-eager normaliser
 * merges two different homes on the same street, and a merged listing is a far
 * worse bug than a duplicated one — you can see a duplicate.
 */
export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return '';

  let s = raw.toLowerCase();

  // Drop anything after a comma: city, province and postal code are held in
  // their own columns, and leaving them in makes the key sensitive to how much
  // of the address a given source happened to include.
  s = s.split(',')[0];

  s = s.replace(CA_POSTAL, ' ');
  s = s.replace(/\b(ontario|ont|on|canada)\b/g, ' ');
  s = s.replace(/[#.]/g, ' ').replace(/[^a-z0-9\s-]/g, ' ');

  const tokens = s.split(/\s+/).filter(Boolean).map((t) => {
    if (STREET_TYPES[t]) return STREET_TYPES[t];
    if (DIRECTIONS[t]) return DIRECTIONS[t];
    return t;
  });

  return tokens.join(' ').trim();
}

/** Canonical unit designator. '' when there is none — NOT null, because the
 *  unique index in migration 16 includes this column and NULLs do not compare
 *  equal in Postgres, so a null would silently disable deduping. */
export function normalizeUnit(raw: string | null | undefined, address?: string | null): string {
  const direct = (raw ?? '').toString().toLowerCase()
    .replace(/^(unit|suite|apt|apartment|ste|#)\s*/i, '')
    .replace(/[^a-z0-9]/g, '');
  if (direct) return direct;

  // Ontario listings routinely carry the unit inside the address string:
  // "Unit 1203 - 55 Bloor St E" or "55 Bloor St E #1203".
  if (address) {
    const m = /(?:^|\s)(?:unit|suite|apt|apartment|ste|#)\s*([a-z0-9]+)/i.exec(address)
      ?? /^([a-z0-9]+)\s*-\s*\d/i.exec(address.trim());
    if (m) return m[1].toLowerCase();
  }
  return '';
}

/** The dedupe key, matching the unique index on asap_listings exactly. */
export function dedupeKey(l: Pick<Listing, 'market_slug' | 'address_norm' | 'unit_norm' | 'tenure'>): string {
  return [l.market_slug, l.address_norm, l.unit_norm, l.tenure].join('|');
}

/* ── The normaliser ───────────────────────────────────────────────────────*/

export interface NormalizeParams {
  raw: RawListing;
  orgId: string;
  marketSlug: string;
  tenure: Tenure;
  sourceId: SourceId;
  rights: SourceRights;
  /** Injected, so this stays pure and a batch shares one timestamp. */
  fetchedAt: string;
}

/** A row that could not be normalised, and why. Surfaced rather than dropped:
 *  "we found 40 listings and could not read 6" is information; silently
 *  importing 34 is not. */
export interface RejectedListing {
  reason: string;
  raw: RawListing;
}

export type NormalizeOutcome =
  | { ok: true; listing: Omit<Listing, 'id'> }
  | { ok: false; rejected: RejectedListing };

export function normalizeListing(params: NormalizeParams): NormalizeOutcome {
  const { raw, orgId, marketSlug, tenure, sourceId, rights, fetchedAt } = params;

  const addressRaw = (raw.address ?? '').toString().trim();
  const addressNorm = normalizeAddress(addressRaw);

  // No address means no identity, which means no dedupe key, which means this
  // row would duplicate on every single sweep. Reject rather than import.
  if (addressNorm === '') {
    return { ok: false, rejected: { reason: 'No usable street address.', raw } };
  }

  if (!rights.canStore) {
    return { ok: false, rejected: { reason: `${sourceId} data may not be stored under its licence.`, raw } };
  }

  const soldPrice = num(raw.soldPrice);
  if (tenure === 'sold' && soldPrice === null) {
    // Enforced by a CHECK in migration 16 too; caught here so the failure is a
    // readable rejection instead of a constraint violation on insert.
    return { ok: false, rejected: { reason: 'Sold listing with no sold price.', raw } };
  }

  const listedAt = isoDate(raw.listedAt);
  let dom = num(raw.daysOnMarket);
  if (dom === null && listedAt) {
    // Derive rather than leave blank — but only from a real listed date, never
    // from the fetch time, which would reset to 0 on every sweep.
    const days = (Date.parse(fetchedAt) - Date.parse(listedAt)) / 86_400_000;
    if (Number.isFinite(days) && days >= 0) dom = Math.floor(days);
  }

  return {
    ok: true,
    listing: {
      org_id: orgId,
      market_slug: marketSlug,
      province: 'ON',

      address_raw: addressRaw,
      address_norm: addressNorm,
      unit_norm: normalizeUnit(raw.unit, addressRaw),
      neighbourhood: (raw.neighbourhood ?? null) || null,
      lat: num(raw.lat),
      lng: num(raw.lng),

      bedrooms: num(raw.bedrooms),
      bathrooms: num(raw.bathrooms),
      sqft: num(raw.sqft),
      property_type: propertyType(raw.propertyType),
      parking_spaces: num(raw.parkingSpaces),
      tenure,
      status: listingStatus(raw.status, tenure),
      list_price: num(raw.price),
      currency: 'CAD',
      maintenance_fee: num(raw.maintenanceFee),
      listed_at: listedAt,
      days_on_market: dom,
      sold_price: soldPrice,
      sold_at: isoDate(raw.soldAt),
      listing_url: (raw.url ?? null) || null,
      image_url: (raw.imageUrl ?? null) || null,
      description: (raw.description ?? null) || null,

      source_id: sourceId,
      source_listing_id: (raw.sourceListingId ?? null) || null,
      source_fetched_at: fetchedAt,
      source_confidence: rights.confidence,

      can_display: rights.canDisplay,
      // Sold data is board-restricted in Ontario regardless of how permissive
      // the source's own licence is. Belt and braces: the provider says no by
      // default, and this says no again for the one tenure where getting it
      // wrong is a regulatory problem rather than an inconvenience.
      can_share_with_client: rights.canShareWithClient && tenure !== 'sold',

      raw_payload: (raw.raw ?? null) as Listing['raw_payload'],
    } as Omit<Listing, 'id'>,
  };
}

/** Normalise a batch, keeping the rejects. Last write wins on a duplicate key —
 *  a later row in the same fetch is the fresher read of the same home. */
export function normalizeBatch(
  raws: RawListing[],
  params: Omit<NormalizeParams, 'raw'>
): { listings: Omit<Listing, 'id'>[]; rejected: RejectedListing[]; duplicates: number } {
  const byKey = new Map<string, Omit<Listing, 'id'>>();
  const rejected: RejectedListing[] = [];
  let duplicates = 0;

  for (const raw of raws) {
    const outcome = normalizeListing({ ...params, raw });
    if (!outcome.ok) {
      rejected.push(outcome.rejected);
      continue;
    }
    const key = dedupeKey(outcome.listing);
    if (byKey.has(key)) duplicates++;
    byKey.set(key, outcome.listing);
  }

  return { listings: [...byKey.values()], rejected, duplicates };
}
