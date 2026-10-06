/* ═══════════════════════════════════════════════════════════════════════════
   markers — what a pin says, and what it must never say.

   THE MECHANISM is ported from REMI (frontend/src/components/map/
   mapMarkerUtils.ts): a Leaflet divIcon rendering an inline-styled price pill,
   with a cluster bubble summarising a group. Sizes, ring, saved dot, pulse and
   the pop-in animation are REMI's, kept because they work.

   THE MEANING is replaced entirely. REMI coloured every pin by deal score —
   green above 8, amber above 5, red below — which is a visual claim about
   whether a home is a good buy. SOUL.md Rule 5 and success-criteria/
   01-regulatory-ontario.md SC-01.5 forbid this agent from forming that view.

   So pins are coloured by MATCH BAND: how well the home fits the selected
   client's own stated criteria. Green means "this is what they asked for",
   never "this is underpriced". On a map, colour is the loudest thing on the
   screen — it is worth being exact about what it is asserting.

   Inline styles rather than classes, deliberately: Leaflet builds these icons
   by injecting an HTML string, and a class would need the stylesheet to have
   loaded and matched. The two `animation:` references (`ping`, `markerAppear`)
   do resolve against global @keyframes in index.css — that part works fine.

   Pure string-building. No Leaflet import, no React, so it unit-tests in the
   node environment the rest of this repo uses.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { MatchBand, Listing } from '../matching/types';

/** Band colours, matching MatchBand.tsx so a pin and its card agree. */
export const BAND_PIN: Record<MatchBand, { bg: string; fg: string; border: string }> = {
  strong: { bg: '#3D8B5D', fg: '#FFFFFF', border: '#2F6E49' },   // --color-success
  possible: { bg: '#496F95', fg: '#FFFFFF', border: '#3A5876' }, // --color-info
  stretch: { bg: '#8C867C', fg: '#FFFFFF', border: '#6E6961' },  // quiet, unresolved
};

/** A listing with no client context — browsing the market, not matching. */
export const NEUTRAL_PIN = { bg: '#2C2A28', fg: '#FFFFFF', border: '#171615' };

/** Sold comps. Grey AND a different shape AND a leading glyph — see soldPinHtml. */
export const SOLD_PIN = { bg: '#8C867C', fg: '#FFFFFF', border: '#6E6961' };

/** Days-on-market colouring, for the `daysOnMarket` layer.
 *
 *  This is a scheduling signal — how easy it will be to book a showing — and
 *  the copy everywhere says so. REMI used the same thresholds to infer a
 *  "motivated seller", which is an inference about the seller's position and
 *  exactly the claim Rule 5 rules out. Same maths, different sentence. */
export function domColor(days: number | null, marketAvgDom = 30): { bg: string; fg: string; border: string } {
  if (days === null || !Number.isFinite(days)) return NEUTRAL_PIN;
  const fresh = Math.max(7, Math.floor(marketAvgDom * 0.25));
  const average = Math.max(14, marketAvgDom);
  if (days <= fresh) return { bg: '#3D8B5D', fg: '#FFFFFF', border: '#2F6E49' };
  if (days <= average) return { bg: '#C19932', fg: '#FFFFFF', border: '#9A7A28' };
  return { bg: '#496F95', fg: '#FFFFFF', border: '#3A5876' };
}

/** Price, compact, for a pin. Canadian dollars, no cents — a pin has ~48px. */
export function pinPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    // 1.2M rather than 1.25M: on a pin the second decimal is unreadable.
    return `$${m.toFixed(m >= 10 ? 0 : 1).replace(/\.0$/, '')}M`;
  }
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface PinOptions {
  band?: MatchBand | null;
  selected?: boolean;
  shortlisted?: boolean;
  /** Colour and label by days-on-market instead of match band. */
  useDom?: boolean;
  marketAvgDom?: number;
  /** ms delay for the entrance animation. `undefined` = no animation, which is
   *  what an icon UPDATE passes so re-selecting does not replay the pop-in. */
  animDelay?: number;
}

/**
 * The HTML for one listing pin.
 *
 * The address is escaped because it reaches here from a scraped public page —
 * untrusted text going into innerHTML, and a listing description is exactly
 * where a stray `<script>` would arrive from.
 */
export function listingPinHtml(listing: Listing, opts: PinOptions = {}): string {
  const {
    band = null, selected = false, shortlisted = false,
    useDom = false, marketAvgDom = 30, animDelay,
  } = opts;

  if (listing.tenure === 'sold') return soldPinHtml(listing);

  const c = useDom
    ? domColor(listing.days_on_market, marketAvgDom)
    : (band ? BAND_PIN[band] : NEUTRAL_PIN);

  const label = useDom && listing.days_on_market !== null
    ? `${listing.days_on_market}d`
    : pinPrice(listing.list_price);

  const size = selected ? 52 : 44;
  const ring = selected ? `box-shadow:0 0 0 2px white,0 0 0 4px ${c.bg};` : '';
  const star = shortlisted
    ? '<span class="asap-pin__star" style="position:absolute;top:-3px;right:-3px;width:8px;height:8px;border-radius:50%;background:#C19932;border:1.5px solid white;"></span>'
    : '';
  const pulse = selected
    ? `<span style="position:absolute;inset:-6px;border-radius:999px;border:2px solid ${c.bg};opacity:.5;animation:ping 1s cubic-bezier(0,0,.2,1) infinite;"></span>`
    : '';
  const anim = animDelay !== undefined
    ? `animation:markerAppear 0.35s cubic-bezier(0.34,1.56,0.64,1) ${animDelay}ms both;`
    : '';

  const title = esc(`${listing.address_raw} — ${pinPrice(listing.list_price)}`);

  return `<div class="asap-pin${selected ? ' asap-pin--selected' : ''}" title="${title}" style="position:relative;background:${c.bg};color:${c.fg};border-radius:999px;padding:4px 8px;font-size:10px;font-weight:700;font-family:Inter,sans-serif;white-space:nowrap;border:2px solid white;${ring}cursor:pointer;${anim}min-width:${size}px;text-align:center;">${pulse}${star}${esc(label)}</div>`;
}

/**
 * A sold comp. Square, grey, and prefixed with a bullet.
 *
 * Three independent channels — hue, shape, glyph — because mistaking a sold
 * home for an available one is the single worst misread this map can produce,
 * and colour alone fails in greyscale and for anyone with a colour vision
 * deficiency.
 */
export function soldPinHtml(listing: Listing): string {
  const price = pinPrice(listing.sold_price ?? listing.list_price);
  const title = esc(`Sold — ${listing.address_raw} — ${price}`);
  return `<div class="asap-pin asap-pin--sold" title="${title}" style="position:relative;background:${SOLD_PIN.bg};color:${SOLD_PIN.fg};border-radius:4px;padding:3px 7px;font-size:10px;font-weight:600;font-family:Inter,sans-serif;white-space:nowrap;border:2px solid white;opacity:.9;cursor:pointer;">&#8226; ${esc(price)}</div>`;
}

/**
 * A cluster bubble.
 *
 * REMI showed the cluster's AVERAGE deal score. This shows the count and takes
 * its colour from the BEST band inside — because the question a realtor asks
 * of a cluster is "is there anything in there worth opening", and an average
 * would hide one strong fit among nine weak ones.
 */
export function clusterHtml(count: number, bestBand: MatchBand | null, zoomedOut = false): string {
  const c = bestBand ? BAND_PIN[bestBand] : NEUTRAL_PIN;
  const size = count > 50 ? 56 : count > 20 ? 48 : count < 10 ? 34 : 40;

  // Zoomed out, REMI switches to a frosted-glass bubble so a hundred clusters
  // do not read as a wall of colour. Kept — it is the difference between a map
  // you can scan and one you squint at.
  const style = zoomedOut
    ? `background:rgba(255,255,255,0.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:2px solid rgba(255,255,255,0.95);color:#1a1614;box-shadow:${
        bestBand === 'strong'
          ? '0 0 16px rgba(61,139,93,0.55), inset 0 0 8px rgba(255,255,255,0.8)'
          : '0 4px 12px rgba(0,0,0,0.10), inset 0 0 8px rgba(255,255,255,0.7)'};`
    : `background:linear-gradient(135deg, ${c.bg}dd, ${c.bg}99);border:3px solid white;box-shadow:0 2px 8px ${c.bg}40;color:${c.fg};`;

  const topDot = zoomedOut && bestBand === 'strong'
    ? '<span style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:#3D8B5D;border:2px solid white;animation:ping 1.5s cubic-bezier(0,0,.2,1) infinite;"></span><span style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:#3D8B5D;border:2px solid white;"></span>'
    : '';

  return `<div class="asap-cluster" style="position:relative;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;font-family:Inter,sans-serif;font-weight:800;font-size:13px;cursor:pointer;${style}">${topDot}<span>${count}</span></div>`;
}

/** Strongest band present. Used for the cluster colour. */
export function bestBandOf(bands: (MatchBand | null | undefined)[]): MatchBand | null {
  if (bands.includes('strong')) return 'strong';
  if (bands.includes('possible')) return 'possible';
  if (bands.includes('stretch')) return 'stretch';
  return null;
}

/** Listings that can actually be placed.
 *
 *  A listing with no coordinates is not a map error — public research often has
 *  no lat/lng — but it must be COUNTED and reported, never silently dropped, or
 *  the map quietly disagrees with the list about how many homes exist. */
export function plottable<T extends { lat: number | null; lng: number | null }>(
  items: T[]
): { plotted: T[]; missingCoords: number } {
  const plotted = items.filter(
    (i) => typeof i.lat === 'number' && Number.isFinite(i.lat)
      && typeof i.lng === 'number' && Number.isFinite(i.lng)
  );
  return { plotted, missingCoords: items.length - plotted.length };
}

/** Leaflet bounds tuple for a market, from asap_markets. The map is locked to
 *  this — the interaction-level half of the Ontario boundary. The other half is
 *  the `province = 'ON'` CHECK in migration 16. */
export function marketBounds(m: {
  min_lat: number; min_lng: number; max_lat: number; max_lng: number;
}): [[number, number], [number, number]] {
  return [[m.min_lat, m.min_lng], [m.max_lat, m.max_lng]];
}

/** Bounds covering every selected market — used when "all markets" is active.
 *  Returns null for an empty list so the caller can fall back to a default
 *  rather than rendering a map centred on the null island. */
export function combinedBounds(markets: {
  min_lat: number; min_lng: number; max_lat: number; max_lng: number;
}[]): [[number, number], [number, number]] | null {
  if (markets.length === 0) return null;
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const m of markets) {
    minLat = Math.min(minLat, m.min_lat);
    minLng = Math.min(minLng, m.min_lng);
    maxLat = Math.max(maxLat, m.max_lat);
    maxLng = Math.max(maxLng, m.max_lng);
  }
  return [[minLat, minLng], [maxLat, maxLng]];
}

/** Rich hover card. Same shape as REMI's, minus the deal-score circle. */
export function tooltipHtml(
  listing: Listing,
  band: MatchBand | null,
  shortlisted: boolean
): string {
  const c = band ? BAND_PIN[band] : NEUTRAL_PIN;
  const img = listing.image_url
    ? `<img src="${esc(listing.image_url)}" alt="" loading="lazy" onerror="this.style.display='none'" style="width:100%;height:84px;object-fit:cover;border-radius:6px;margin-bottom:6px;display:block;" />`
    : '';
  const bandChip = band
    ? `<span style="display:inline-block;padding:1px 6px;border-radius:999px;background:${c.bg}20;color:${c.bg};font-size:9px;font-weight:800;">${band.toUpperCase()}</span>`
    : '';

  return `<div style="font-family:Inter,sans-serif;min-width:180px;padding:2px 0;">
    ${img}
    <div style="margin-bottom:4px;">
      ${bandChip}
      <p style="font-size:11px;font-weight:600;color:#1a1614;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px;">${esc((listing.address_raw || '').split(',')[0])}</p>
      <p style="font-size:12px;font-weight:700;color:#1a1614;margin:0;">${esc(pinPrice(listing.list_price))}</p>
    </div>
    <div style="display:flex;gap:8px;font-size:10px;color:#6b5d52;border-top:1px solid #f0ebe6;padding-top:4px;">
      <span>${listing.bedrooms ?? '—'} bd</span>
      <span>${listing.bathrooms ?? '—'} ba</span>
      <span>${listing.sqft ? Number(listing.sqft).toLocaleString('en-CA') : '—'} sqft</span>
      ${listing.days_on_market !== null ? `<span style="margin-left:auto;">${listing.days_on_market}d</span>` : ''}
    </div>
    ${shortlisted ? '<div style="margin-top:4px;font-size:9px;color:#C19932;font-weight:600;">&#9733; Shortlisted</div>' : ''}
  </div>`;
}
