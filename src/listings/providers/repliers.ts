/* ═══════════════════════════════════════════════════════════════════════════
   repliers — the Repliers aggregator adapter. Request side complete,
   response mapping deliberately not written yet.

   WHY THIS IS NOT THE SAME SHAPE AS reso.ts
   reso.ts could map every field with confidence because the RESO Data
   Dictionary is a public, versioned standard — anyone can read the spec with
   no account. Repliers' request parameters (auth header, endpoint, query
   filters) are documented publicly and are built here with the same
   confidence. Its RESPONSE schema — the exact field names nested under a
   listing's `details` object (bedrooms, bathrooms, sqft, property type) — is
   only fully described in Repliers' OpenAPI spec, which sits behind a
   Developer Portal login you get when the account is provisioned.

   Guessing those nested field names would be worse than leaving them
   unwritten: a wrong field name doesn't error, it silently returns undefined
   for every bedroom count, which is exactly the kind of invented-looking gap
   this schema's provenance rules (migration 16, SC-10.3) exist to prevent.
   So `fetch()` reports `ok:false` even once an API key is present, the same
   way reso.ts does before its own credentials exist — the honest state is
   "not wired up yet," not a best-guess parse.

   WHEN A REPLIERS ACCOUNT EXISTS
   Pull a sample listing JSON (or the OpenAPI spec) from the Developer Portal,
   write REPLIERS_FIELD_MAP next to RESO_FIELD_MAP's pattern, and fill in
   normalizeRepliersListing(). Nothing downstream changes — Market Scout, the
   match engine and the grid depend on `Listing` and `ListingProvider`, never
   on this file.

   THE BLOCKER IS STILL PARTLY PAPERWORK
   Repliers is infrastructure, not a substitute for board membership: TRREB's
   DLA/IDX/VOW data agreements still need to be signed by the Broker of
   Record before Repliers can serve that board's data through this key. See
   LICENSED_FEED_RIGHTS in provider.ts — canShareWithClient stays false until
   that agreement is read.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { ListingProvider, FetchParams, FetchResult } from '../provider';
import { LICENSED_FEED_RIGHTS } from '../provider';

interface RepliersConfig {
  apiKey?: string;
  /** Only required once the account has access to more than one board. */
  boardId?: string;
}

/** Read from Vite env. Absent by design today. */
function repliersConfig(): RepliersConfig {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return {
    apiKey: env.VITE_REPLIERS_API_KEY,
    boardId: env.VITE_REPLIERS_BOARD_ID,
  };
}

/** The query Repliers' POST /listings would receive. Built from parameters
 *  documented at docs.repliers.io/reference — confident because these are
 *  publicly readable, unlike the response schema.
 *
 *  Only maps what FetchParams actually carries; does not invent filters
 *  (e.g. minSqft, minBaths) this provider has never been asked for. */
export function buildRepliersQuery(params: FetchParams): Record<string, string | number> {
  const query: Record<string, string | number> = {
    type: params.tenure === 'for_rent' ? 'lease' : 'sale',
  };

  // Sold inventory is still type: 'sale', filtered to closed — mirrors the
  // reso.ts convention of tenure and status being independent axes.
  query.standardStatus = params.tenure === 'sold' ? 'Closed' : 'Active';

  if (params.minPrice !== undefined) query.minPrice = params.minPrice;
  if (params.maxPrice !== undefined) query.maxPrice = params.maxPrice;
  if (params.minBedrooms !== undefined) query.minBedrooms = params.minBedrooms;
  if (params.limit !== undefined) query.resultsPerPage = params.limit;

  // Repliers' docs do not confirm whether repeated/CSV neighborhood values
  // OR together the way the RESO filter's explicit `or` clause does — sent
  // best-effort as CSV; verify against the OpenAPI spec before relying on it
  // for a multi-neighbourhood search.
  if (params.neighbourhoods?.length) {
    query.neighborhood = params.neighbourhoods.join(',');
  }

  return query;
}

export const repliersProvider: ListingProvider = {
  id: 'aggregator',
  label: 'Listing aggregator (Repliers)',
  rights: LICENSED_FEED_RIGHTS,

  isConfigured(): boolean {
    return Boolean(repliersConfig().apiKey);
  },

  async fetch(params: FetchParams): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        ok: false,
        listings: [],
        reason:
          'No Repliers key connected. This needs a Repliers developer account ' +
          '(repliers.com) and, for TRREB/PropTx coverage, a DLA/IDX/VOW data ' +
          'agreement signed by your Broker of Record. Then set VITE_REPLIERS_API_KEY.',
        sourceId: 'aggregator',
        fetchedAt,
      };
    }

    // Intentionally not implemented. The query is built anyway so the request
    // shape is exercised and inspectable in a log — but the response-side
    // field mapping needs a real account's OpenAPI spec first (see header).
    const query = buildRepliersQuery(params);

    return {
      ok: false,
      listings: [],
      reason:
        'Repliers API key is present but the response field mapping is not yet ' +
        `verified against the Repliers OpenAPI spec. Query would be: ${JSON.stringify(query)}`,
      sourceId: 'aggregator',
      fetchedAt,
    };
  },
};
