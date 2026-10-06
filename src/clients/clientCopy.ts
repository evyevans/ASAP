/* Shared labels, formatters and criterion presets for the Clients surface.
 *
 * Kept out of the components so the vocabulary is defined once. The criterion
 * presets in particular are the difference between a realtor writing a good
 * brief in two minutes and abandoning a form with an `op` dropdown on it. */

import type {
  Client, ClientStatus, ClientTimeline, Representation,
  Criterion, CriterionField, CriterionOp, MatchBand, PropertyType,
  MatchReason, FailedGate,
} from '../matching/types';

export const STATUS_LABEL: Record<ClientStatus, string> = {
  active: 'Actively looking',
  nurturing: 'Nurturing',
  paused: 'Paused',
  closed_won: 'Closed — bought',
  closed_lost: 'Closed — went elsewhere',
};

export const STATUS_TONE: Record<ClientStatus, 'success' | 'warning' | 'default' | 'error'> = {
  active: 'success',
  nurturing: 'default',
  paused: 'warning',
  closed_won: 'success',
  closed_lost: 'default',
};

export const TIMELINE_LABEL: Record<ClientTimeline, string> = {
  '0-30d': 'Buying in 30 days',
  '1-3m': '1–3 months',
  '3-6m': '3–6 months',
  '6m-plus': '6+ months',
  exploring: 'Just exploring',
};

export const REPRESENTATION_LABEL: Record<Representation, string> = {
  buyer_rep_signed: 'Representation signed',
  unsigned: 'No agreement yet',
  expired: 'Agreement expired',
};

export const BAND_LABEL: Record<MatchBand, string> = {
  strong: 'Strong fit',
  possible: 'Possible',
  stretch: 'Stretch',
};

export const BAND_COLOR: Record<MatchBand, string> = {
  strong: 'var(--color-success)',
  possible: 'var(--color-info)',
  stretch: 'var(--color-text-tertiary)',
};

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  detached: 'Detached',
  semi: 'Semi-detached',
  townhouse: 'Townhouse',
  condo_apt: 'Condo apartment',
  condo_town: 'Condo townhouse',
  multiplex: 'Multiplex',
  other: 'Other',
};

/** Money, Canadian, no cents. Prices are whole dollars in this product. */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString('en-CA')}`;
}

/** Compact money for dense surfaces: $1.25M, $875K. */
export function moneyShort(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

export function budgetRange(c: Pick<Client, 'budget_min' | 'budget_max'>): string {
  if (c.budget_min === null && c.budget_max === null) return 'No budget on file';
  if (c.budget_min === null) return `Up to ${moneyShort(c.budget_max)}`;
  if (c.budget_max === null) return `From ${moneyShort(c.budget_min)}`;
  return `${moneyShort(c.budget_min)} – ${moneyShort(c.budget_max)}`;
}

/** "3 days ago" / "4 months ago" / "never". Used on every freshness badge, so
 *  the age of a preference is always visible rather than inferred. */
export function confirmedAge(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never confirmed';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never confirmed';
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return 'confirmed today';
  if (days === 1) return 'confirmed yesterday';
  if (days < 30) return `confirmed ${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `confirmed ${months} month${months === 1 ? '' : 's'} ago`;
  return `confirmed ${Math.round(days / 365)} years ago`;
}

/** Is this old enough that the UI should say so loudly? */
export const isStale = (iso: string | null | undefined, staleDays: number, now = Date.now()): boolean => {
  if (!iso) return true;
  const t = Date.parse(iso);
  return !Number.isFinite(t) || (now - t) / 86_400_000 > staleDays;
};

/* ── Criterion presets ────────────────────────────────────────────────────
   A realtor should never see the words "op" or "gte". These presets turn the
   structured criteria model into a short list of things buyers actually say,
   and each one carries the phrasing that will be read back in a match
   explanation — which is why `label` is a template rather than a fixed string. */

export interface CriterionPreset {
  key: string;
  /** What the realtor picks from the list. */
  name: string;
  field: CriterionField;
  op: CriterionOp;
  /** How the value is captured. */
  input: 'number' | 'select' | 'multiselect' | 'none';
  /** Choices for select/multiselect. */
  choices?: { value: string; label: string }[];
  /** Suffix shown beside a number input. */
  unit?: string;
  defaultValue?: unknown;
  /** Renders the human sentence stored on the criterion. */
  label: (value: unknown) => string;
  /** Which kinds this preset makes sense as. */
  kinds: Criterion['kind'][];
}

const typeChoices = (Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[])
  .map((v) => ({ value: v, label: PROPERTY_TYPE_LABEL[v] }));

export const CRITERION_PRESETS: CriterionPreset[] = [
  {
    key: 'min_bedrooms',
    name: 'Minimum bedrooms',
    field: 'bedrooms', op: 'gte', input: 'number', unit: 'beds', defaultValue: 3,
    label: (v) => `At least ${v} bedroom${Number(v) === 1 ? '' : 's'}`,
    kinds: ['must', 'nice'],
  },
  {
    key: 'min_bathrooms',
    name: 'Minimum bathrooms',
    field: 'bathrooms', op: 'gte', input: 'number', unit: 'baths', defaultValue: 2,
    label: (v) => `At least ${v} bathroom${Number(v) === 1 ? '' : 's'}`,
    kinds: ['must', 'nice'],
  },
  {
    key: 'min_sqft',
    name: 'Minimum square footage',
    field: 'sqft', op: 'gte', input: 'number', unit: 'sq ft', defaultValue: 1200,
    label: (v) => `At least ${Number(v).toLocaleString('en-CA')} sq ft`,
    kinds: ['must', 'nice'],
  },
  {
    key: 'min_parking',
    name: 'Parking spaces',
    field: 'parking_spaces', op: 'gte', input: 'number', unit: 'spaces', defaultValue: 1,
    label: (v) => `${v} parking space${Number(v) === 1 ? '' : 's'}`,
    kinds: ['must', 'nice'],
  },
  {
    key: 'property_type_in',
    name: 'Property type — will consider',
    field: 'property_type', op: 'in', input: 'multiselect', choices: typeChoices, defaultValue: [],
    label: (v) => {
      const list = Array.isArray(v) ? v : [];
      const names = list.map((k) => PROPERTY_TYPE_LABEL[k as PropertyType] ?? k);
      return names.length ? `Must be ${names.join(' or ')}` : 'Property type';
    },
    kinds: ['must', 'nice'],
  },
  {
    key: 'property_type_not_in',
    name: 'Property type — will NOT consider',
    field: 'property_type', op: 'not_in', input: 'multiselect', choices: typeChoices, defaultValue: [],
    label: (v) => {
      const list = Array.isArray(v) ? v : [];
      const names = list.map((k) => PROPERTY_TYPE_LABEL[k as PropertyType] ?? k);
      return names.length ? `No ${names.join(' or ')}` : 'Excluded property type';
    },
    kinds: ['deal_breaker'],
  },
  {
    key: 'max_maintenance',
    name: 'Maximum condo fee',
    field: 'maintenance_fee', op: 'lte', input: 'number', unit: '$/month', defaultValue: 700,
    label: (v) => `Condo fee under ${money(Number(v))}/month`,
    kinds: ['must', 'nice', 'deal_breaker'],
  },
  {
    key: 'outdoor_space',
    name: 'Outdoor space',
    field: 'outdoor_space', op: 'is_true', input: 'none', defaultValue: true,
    label: () => 'Has outdoor space',
    kinds: ['must', 'nice'],
  },
  {
    key: 'garage',
    name: 'Garage',
    field: 'garage', op: 'is_true', input: 'none', defaultValue: true,
    label: () => 'Has a garage',
    kinds: ['must', 'nice'],
  },
  {
    key: 'basement',
    name: 'Finished basement',
    field: 'basement', op: 'is_true', input: 'none', defaultValue: true,
    label: () => 'Finished basement',
    kinds: ['must', 'nice'],
  },
  {
    key: 'accessibility',
    name: 'Step-free / accessible',
    field: 'accessibility', op: 'is_true', input: 'none', defaultValue: true,
    label: () => 'Step-free access',
    kinds: ['must', 'nice'],
  },
  {
    key: 'pets',
    name: 'Pet friendly',
    field: 'pets', op: 'is_true', input: 'none', defaultValue: true,
    label: () => 'Pet friendly',
    kinds: ['must', 'nice'],
  },
  {
    key: 'custom',
    name: 'Something else (describe it)',
    field: 'custom', op: 'contains', input: 'none', defaultValue: '',
    label: (v) => String(v || 'Custom requirement'),
    kinds: ['must', 'nice', 'deal_breaker'],
  },
];

export const presetByKey = (key: string): CriterionPreset | undefined =>
  CRITERION_PRESETS.find((p) => p.key === key);

/** Reverse-lookup a stored criterion back to the preset that made it, so the
 *  editor can render the right input when reopening an existing brief. */
export function presetForCriterion(c: Pick<Criterion, 'field' | 'op'>): CriterionPreset | undefined {
  return CRITERION_PRESETS.find((p) => p.field === c.field && p.op === c.op);
}

export const KIND_LABEL: Record<Criterion['kind'], string> = {
  must: 'Must have',
  nice: 'Nice to have',
  deal_breaker: 'Deal breaker',
};

export const KIND_HELP: Record<Criterion['kind'], string> = {
  must: 'A home without this is excluded from their matches entirely.',
  nice: 'Adds to the match score. Never excludes a home on its own.',
  deal_breaker: 'A home with this is excluded entirely.',
};

/* ── Match explanation ────────────────────────────────────────────────────*/

/** One-line summary for dense rows: the strongest hit and the sharpest miss. */
export function matchOneLiner(reasons: MatchReason[], failedGates: FailedGate[] = []): string {
  if (failedGates.length > 0) return `${failedGates[0].label} — ${failedGates[0].detail}`;
  const met = reasons.find((r) => r.met && r.kind === 'nice')
    ?? reasons.find((r) => r.met);
  const missed = reasons.find((r) => !r.met && r.kind === 'nice');
  if (met && missed) return `${met.label}; no ${missed.label.toLowerCase()}`;
  if (met) return met.label;
  if (missed) return `Missing ${missed.label.toLowerCase()}`;
  return 'Meets their requirements';
}

/* ── Follow Up Boss vocabulary ────────────────────────────────────────────*/

/* ── Stage colouring ──────────────────────────────────────────────────────
   FUB stage names are account-configurable, so this matches on intent rather
   than an exact list. An unrecognised stage renders neutral, never wrong. */
export function stageTone(stage: string | null): 'success' | 'warning' | 'info' | 'accent' | 'default' {
  if (!stage) return 'default';
  const s = stage.toLowerCase();
  if (s.includes('hot') || s.includes('active')) return 'accent';
  if (s.includes('past client') || s.includes('closed') || s.includes('won')) return 'success';
  if (s.includes('nurtur') || s.includes('warm')) return 'warning';
  if (s.includes('lead') || s.includes('new') || s.includes('prospect')) return 'info';
  return 'default';
}

/** "2 days ago" — FUB's own relative-time idiom. */
export function relTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} month${months === 1 ? '' : 's'} ago`;
  return `${Math.round(days / 365)} years ago`;
}

