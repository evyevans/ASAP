/* Scout basemaps. The original CARTO endpoints now serve API-key-required
 * placeholder images even with HTTP 200. The demo uses OSM's standard HTTPS
 * tiles for default/street views, retaining normal browser cache and attribution.
 * Satellite and terrain keep their original providers and mode-specific credits.
 */

import { Map as MapIcon, Satellite, Mountain, MapPinned } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ViewMode = 'default' | 'satellite' | 'terrain' | 'street';

export const TILE_URLS: Record<ViewMode, string> = {
  default: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  street: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};

/** Keep the geographic base readable in both UI themes. */
export const TILE_URL_DARK = TILE_URLS.default;

export const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function tileUrl(mode: ViewMode, dark: boolean): string {
  if (mode === 'default' && dark) return TILE_URL_DARK;
  return TILE_URLS[mode] ?? TILE_URLS.default;
}

export const VIEW_MODES: { key: ViewMode; label: string; icon: LucideIcon }[] = [
  { key: 'default', label: 'Default', icon: MapIcon },
  { key: 'satellite', label: 'Satellite', icon: Satellite },
  { key: 'terrain', label: 'Terrain', icon: Mountain },
  { key: 'street', label: 'Street', icon: MapPinned },
];

/* ── Layers ───────────────────────────────────────────────────────────────
   REMI's layer set was built for investors: price drops, growth zones, flood
   risk. These are the ones a buyer's agent actually toggles, and every one is
   implemented — nothing here renders a "Soon" chip for a feature that does not
   exist, which REMI did for two of its seven. */

export type LayerId = 'shortlisted' | 'soldComps' | 'newListings' | 'daysOnMarket' | 'unmatched';

export const MAP_LAYERS: { id: LayerId; label: string; desc: string }[] = [
  { id: 'shortlisted', label: 'Shortlisted only', desc: 'Just the homes you kept' },
  { id: 'newListings', label: 'New this week', desc: 'On the market 7 days or less' },
  { id: 'daysOnMarket', label: 'Colour by days on market', desc: 'Instead of match fit' },
  { id: 'soldComps', label: 'Recent sales', desc: 'Sold nearby, for context only' },
  { id: 'unmatched', label: 'Everything in the market', desc: 'Including homes that miss their brief' },
];

export type ActiveLayers = Record<LayerId, boolean>;

export const DEFAULT_LAYERS: ActiveLayers = {
  shortlisted: false,
  soldComps: true,
  newListings: false,
  daysOnMarket: false,
  unmatched: false,
};
