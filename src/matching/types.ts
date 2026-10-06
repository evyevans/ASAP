/* ═══════════════════════════════════════════════════════════════════════════
   Matching — row types, transcribed 1:1 from migrations 16 and 17.

   Same convention as analytics/executionTypes.ts and agentEventTypes.ts: hand-
   written to mirror the SQL, with the migration named, rather than generated.
   When these and the migration disagree, the migration wins.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── asap_markets (16_markets_and_listings.sql) ───────────────────────────── */

export interface MarketRow {
  slug: string;
  name: string;
  region: string;
  /** Always 'ON'. CHECK-constrained in the database; typed as a literal here so
   *  a component cannot even construct an out-of-province market. */
  province: 'ON';
  centre_lat: number;
  centre_lng: number;
  min_lat: number;
  min_lng: number;
  max_lat: number;
  max_lng: number;
  active: boolean;
}

/* ── asap_listings (16_markets_and_listings.sql) ──────────────────────────── */

export type Tenure = 'for_sale' | 'for_rent' | 'sold';

export type ListingStatus =
  | 'active' | 'pending' | 'sold' | 'leased' | 'expired' | 'terminated' | 'withdrawn';

export type PropertyType =
  | 'detached' | 'semi' | 'townhouse' | 'condo_apt' | 'condo_town' | 'multiplex' | 'other';

/** Where a fact came from, and how much weight it carries.
 *  'confirmed'      — verified against MLS by the realtor
 *  'public_snapshot'— scraped/read from a public listing page; may be stale
 *  'user_entered'   — typed in by the realtor from their own knowledge */
export type SourceConfidence = 'confirmed' | 'public_snapshot' | 'user_entered';

export type SourceId = 'web_research' | 'manual' | 'reso' | 'aggregator';

export interface Listing {
  id: string;
  org_id: string;
  market_slug: string;
  province: 'ON';

  address_raw: string;
  address_norm: string;
  unit_norm: string;
  neighbourhood: string | null;
  lat: number | null;
  lng: number | null;

  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  property_type: PropertyType | null;
  parking_spaces: number | null;
  tenure: Tenure;
  status: ListingStatus;
  list_price: number | null;
  currency: string;
  maintenance_fee: number | null;
  listed_at: string | null;
  days_on_market: number | null;
  sold_price: number | null;
  sold_at: string | null;
  listing_url: string | null;
  image_url: string | null;
  description: string | null;

  source_id: SourceId;
  source_listing_id: string | null;
  source_fetched_at: string;
  source_confidence: SourceConfidence;

  can_display: boolean;
  /** False by default. The gate that stops board-restricted data — sold prices
   *  above all — being re-published to a buyer through ASAP. */
  can_share_with_client: boolean;

  /** The untouched upstream record. Kept so a normalisation bug can be
   *  diagnosed and re-run without re-fetching, which matters when the source is
   *  a public page that may have changed since. */
  raw_payload: unknown;
}

/* ── asap_clients (17_clients_and_criteria.sql) ───────────────────────────── */

export type ClientStatus = 'active' | 'nurturing' | 'paused' | 'closed_won' | 'closed_lost';
export type ClientTimeline = '0-30d' | '1-3m' | '3-6m' | '6m-plus' | 'exploring';
export type Representation = 'buyer_rep_signed' | 'unsigned' | 'expired';

export interface Client {
  id: string;
  org_id: string;
  display_name: string;
  fub_person_id: string | null;
  status: ClientStatus;
  timeline: ClientTimeline | null;
  representation: Representation;
  representation_expires_at: string | null;

  budget_min: number | null;
  budget_max: number | null;
  /** How far above budget_max a listing may sit and still be shown, as a
   *  percentage. Not a suggestion to overspend — realtors look slightly above
   *  budget on purpose, and pretending otherwise just means they do it in
   *  another tab. */
  budget_stretch_pct: number;
  preapproved: boolean;
  preapproval_amount: number | null;
  preapproval_expires_at: string | null;
  down_payment: number | null;
  financing_notes: string | null;

  client_voice: string | null;
  process_notes: string | null;

  criteria_confirmed_at: string | null;
  budget_confirmed_at: string | null;
  last_reviewed_at: string | null;
}

/* ── asap_client_criteria ─────────────────────────────────────────────────── */

export type CriterionKind = 'must' | 'nice' | 'deal_breaker';

export type CriterionField =
  | 'bedrooms' | 'bathrooms' | 'sqft' | 'parking_spaces' | 'property_type'
  | 'maintenance_fee' | 'days_on_market' | 'outdoor_space' | 'basement'
  | 'garage' | 'accessibility' | 'pets' | 'custom';

export type CriterionOp =
  | 'gte' | 'lte' | 'eq' | 'in' | 'not_in' | 'is_true' | 'is_false' | 'contains';

export interface Criterion {
  id: string;
  client_id: string;
  kind: CriterionKind;
  field: CriterionField;
  op: CriterionOp;
  value: unknown;
  weight: number;
  /** NOT NULL in the schema. Every gate must be readable back to the client in
   *  their agent's own words — an unexplainable rejection erodes trust the
   *  first time it is questioned. */
  label: string;
  confirmed_at: string | null;
}

/* ── asap_client_geography ────────────────────────────────────────────────── */

export interface ClientGeography {
  id: string;
  client_id: string;
  market_slug: string;
  neighbourhood: string | null;
  kind: 'target' | 'exclude';
  rank: number;
  note: string | null;
  confirmed_at: string | null;
}

/* ── asap_client_matches ──────────────────────────────────────────────────── */

export type MatchBand = 'strong' | 'possible' | 'stretch';
export type MatchState = 'new' | 'surfaced' | 'shortlisted' | 'dismissed' | 'sent';

/** One line of the explanation. `met: false` on a nice-to-have is not a
 *  rejection — it is the honest "what you would be giving up". */
export interface MatchReason {
  label: string;
  met: boolean;
  detail: string;
  kind: CriterionKind | 'budget' | 'geography' | 'freshness';
}

/** A hard gate that excluded this listing. Carries the label so the UI can say
 *  exactly which requirement was missed. */
export interface FailedGate {
  label: string;
  detail: string;
  kind: CriterionKind | 'budget' | 'geography' | 'availability';
}

export interface MatchRow {
  id: string;
  org_id: string;
  client_id: string;
  listing_id: string;
  score: number;
  band: MatchBand;
  reasons: MatchReason[];
  failed_gates: FailedGate[];
  stale_inputs: boolean;
  llm_note: string | null;
  llm_demoted: boolean;
  llm_judged_at: string | null;
  state: MatchState;
  decided_at: string | null;
  decided_by: string | null;
  criteria_hash: string;
  computed_at: string;
}

/** What evaluateMatch returns. Not yet a row — it has no id and no org. */
export interface MatchResult {
  passed: boolean;
  score: number;
  band: MatchBand;
  reasons: MatchReason[];
  failedGates: FailedGate[];
  staleInputs: boolean;
}

/** Everything one client's evaluation needs, and nothing belonging to another.
 *  Built only by assembleClientContext() — see context.ts for why that matters. */
export interface ClientContext {
  client: Client;
  criteria: Criterion[];
  geography: ClientGeography[];
}

/** Tuning the realtor controls, from asap_agent_mandate (migration 17). */
export interface MatchSettings {
  /** Matches below this band are computed but not surfaced. */
  minBand: MatchBand;
  /** Hard ceiling on proposals per client per day. Review-fatigue control. */
  dailyCap: number;
  /** Criteria older than this are treated as unconfirmed. */
  staleDays: number;
}

export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  minBand: 'possible',
  dailyCap: 5,
  staleDays: 90,
};

/** Ordered weakest → strongest, so a threshold comparison is an index compare. */
export const BAND_ORDER: readonly MatchBand[] = ['stretch', 'possible', 'strong'];

export const meetsBand = (band: MatchBand, min: MatchBand): boolean =>
  BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(min);
