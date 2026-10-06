/* ═══════════════════════════════════════════════════════════════════════════
   reso — the RESO Web API adapter. Interface-complete, credential-blocked.

   WHY IT SHIPS UNIMPLEMENTED, AND WHY THAT IS NOT THE SAME AS REMI'S STUB
   REMI has this exact file (remi/adapters/reso_mls_adapter.py). Its fetch()
   logs "not yet implemented" and returns an empty batch — and because the rest
   of REMI was built against US scrapers, nothing ever depended on it being
   real. It was a placeholder for a thing nobody was waiting on.

   This one is a socket with a plug shape. Everything downstream of it —
   normalizeListing, the match engine, Market Scout, the grid, Hermes — is
   already written against `Listing` and `ListingProvider`, and none of it knows
   or cares where a row came from. When a TRREB / PropTx data licence lands, the
   work is: fill in the OData query below, set three environment variables, and
   nothing else in the product changes.

   THE BLOCKER IS PAPERWORK, NOT CODE
   Ontario MLS access needs a board data agreement under the realtor's own
   membership. It is not a key you can buy. Until it exists this provider
   reports itself unconfigured — so the UI says "not connected" rather than
   showing an empty result set and letting the realtor conclude there is no
   inventory in Oakville.

   WHEN IT IS TURNED ON, READ THE LICENCE FIRST
   LICENSED_FEED_RIGHTS.canShareWithClient is false, deliberately. Board display
   rules are field-by-field and board-by-board — some fields may be shown to a
   consumer, some only to a registrant, and sold data is the most restricted of
   all. That flag is a decision to be made against a signed agreement, not a
   default to inherit.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { ListingProvider, FetchParams, FetchResult } from '../provider';
import { LICENSED_FEED_RIGHTS } from '../provider';

interface ResoConfig {
  baseUrl?: string;
  clientId?: string;
  clientSecret?: string;
}

/** Read from Vite env. Absent by design today. */
function resoConfig(): ResoConfig {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return {
    baseUrl: env.VITE_RESO_API_URL,
    clientId: env.VITE_RESO_CLIENT_ID,
    clientSecret: env.VITE_RESO_CLIENT_SECRET,
  };
}

/** RESO Data Dictionary field names → our RawListing shape.
 *
 *  Written now, while the mapping is fresh from the spec, so the day the
 *  credentials arrive this file is a query away from working rather than a
 *  research project. Field names are RESO DD 1.7 standard resource `Property`. */
export const RESO_FIELD_MAP = {
  address: 'UnparsedAddress',
  unit: 'UnitNumber',
  neighbourhood: 'SubdivisionName',
  lat: 'Latitude',
  lng: 'Longitude',
  bedrooms: 'BedroomsTotal',
  bathrooms: 'BathroomsTotalInteger',
  sqft: 'LivingArea',
  propertyType: 'PropertySubType',
  parkingSpaces: 'ParkingTotal',
  price: 'ListPrice',
  soldPrice: 'ClosePrice',
  soldAt: 'CloseDate',
  maintenanceFee: 'AssociationFee',
  listedAt: 'OnMarketDate',
  daysOnMarket: 'DaysOnMarket',
  status: 'StandardStatus',
  url: 'ListingURL',
  sourceListingId: 'ListingKey',
  description: 'PublicRemarks',
} as const;

/** The OData filter a fetch would send. Extracted so it is reviewable — and
 *  testable — before the endpoint exists.
 *
 *  Note `StateOrProvince eq 'ON'`: the Ontario boundary is asserted at the
 *  query, not just at the CHECK constraint in migration 16. Two independent
 *  places, because a feed that quietly returned a Buffalo listing would be
 *  rejected at insert with a constraint error rather than an explanation. */
export function buildResoFilter(params: FetchParams): string {
  const clauses: string[] = ["StateOrProvince eq 'ON'"];

  clauses.push(
    params.tenure === 'sold'
      ? "StandardStatus eq 'Closed'"
      : "StandardStatus eq 'Active'"
  );
  if (params.tenure === 'for_rent') clauses.push("PropertyType eq 'Residential Lease'");
  if (params.minPrice !== undefined) clauses.push(`ListPrice ge ${params.minPrice}`);
  if (params.maxPrice !== undefined) clauses.push(`ListPrice le ${params.maxPrice}`);
  if (params.minBedrooms !== undefined) clauses.push(`BedroomsTotal ge ${params.minBedrooms}`);

  if (params.neighbourhoods?.length) {
    const escaped = params.neighbourhoods.map((n) => `SubdivisionName eq '${n.replace(/'/g, "''")}'`);
    clauses.push(`(${escaped.join(' or ')})`);
  }

  return clauses.join(' and ');
}

export const resoProvider: ListingProvider = {
  id: 'reso',
  label: 'MLS board feed (RESO)',
  rights: LICENSED_FEED_RIGHTS,

  isConfigured(): boolean {
    const c = resoConfig();
    return Boolean(c.baseUrl && c.clientId && c.clientSecret);
  },

  async fetch(params: FetchParams): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        ok: false,
        listings: [],
        reason:
          'No MLS feed connected. This needs a board data agreement (TRREB or PropTx) ' +
          'under your own membership, then VITE_RESO_API_URL, VITE_RESO_CLIENT_ID and ' +
          'VITE_RESO_CLIENT_SECRET.',
        sourceId: 'reso',
        fetchedAt,
      };
    }

    // Intentionally not implemented. The filter is built anyway so the code
    // path is exercised and the query is inspectable in a log the day someone
    // is debugging their first real connection.
    const filter = buildResoFilter(params);

    return {
      ok: false,
      listings: [],
      reason:
        `MLS credentials are present but the RESO client is not wired up yet. ` +
        `Query would be: $filter=${filter}`,
      sourceId: 'reso',
      fetchedAt,
    };
  },
};
