/* ═══════════════════════════════════════════════════════════════════════════
   MapView — the Ontario market, drawn.

   Ported from REMI's MapView (frontend/src/pages/MapView.tsx), reduced to the
   parts a buyer's agent needs. A thin shell on purpose: it owns the Leaflet
   container and nothing else, so everything about how a pin looks lives in
   markers.ts where it can be unit-tested without a DOM.

   THE MAP RENDERS UNCONDITIONALLY. The previous version returned an "Add a
   client first" empty state before Leaflet ever mounted, which meant a realtor
   with no brief on file saw no map at all. Client selection is a FILTER now,
   not a gate.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';
import { MapContainer, TileLayer, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

import type { MarketRow, Listing } from '../matching/types';
import { tileUrl, ATTRIBUTION, type ViewMode } from './mapConfig';
import { marketBounds, combinedBounds, plottable } from './markers';
import { MarkerClusterLayer, type MapPin } from './MarkerClusterLayer';
import { MapAutoResize, MapBoundsSync, MapClickAway, FitBoundsControl } from './MapHelpers';
import { MapLayersPanel, MapOverlays } from './MapChrome';
import type { LayerId, ActiveLayers } from './mapConfig';

export type { MapPin } from './MarkerClusterLayer';

/** Enough of Ontario to frame the province when no single market is selected. */
const ONTARIO_BOUNDS: [[number, number], [number, number]] = [[41.6, -95.2], [56.9, -74.3]];

export interface MapViewProps {
  pins: MapPin[];
  markets: MarketRow[];
  /** null = every active market, framed together. */
  activeMarket: MarketRow | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  activeLayers: ActiveLayers;
  onToggleLayer: (id: LayerId) => void;
  onAddListing: () => void;
  dark?: boolean;
  loading?: boolean;
  marketAvgDom?: number;
  height?: number | string;
}

export function MapView({
  pins, markets, activeMarket, selectedId, onSelect,
  viewMode, onViewMode, activeLayers, onToggleLayer, onAddListing,
  dark = false, loading = false, marketAvgDom = 30, height = '100%',
}: MapViewProps) {
  const bounds = useMemo<[[number, number], [number, number]]>(() => {
    if (activeMarket) return marketBounds(activeMarket);
    return combinedBounds(markets) ?? ONTARIO_BOUNDS;
  }, [activeMarket, markets]);

  // A stable key so MapBoundsSync can tell "the market changed" (animate) from
  // "the parent re-rendered" (do nothing).
  const marketKey = activeMarket?.slug ?? 'all';

  const { missingCoords } = plottable(pins.map((p) => p.listing));
  const shortlisted = pins.filter((p) => p.shortlisted).length;
  const listings: Listing[] = pins.map((p) => p.listing);

  return (
    <div className="relative w-full h-full" style={{ height }}>
      <MapContainer
        bounds={bounds}
        minZoom={7}
        maxZoom={18}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
        style={{ background: 'var(--color-bg-surface)' }}
      >
        <TileLayer key={viewMode} url={tileUrl(viewMode, dark)} attribution={viewMode === 'satellite' ? 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics' : viewMode === 'terrain' ? `${ATTRIBUTION} · SRTM · © OpenTopoMap (CC-BY-SA)` : ATTRIBUTION} maxZoom={viewMode === 'terrain' ? 17 : 19} />

        <MapAutoResize />
        <ZoomControl position="bottomleft" />
        <MapBoundsSync bounds={bounds} marketKey={marketKey} listings={listings} />
        <MapClickAway onDeselect={() => onSelect(null)} />

        <MarkerClusterLayer
          pins={pins}
          selectedId={selectedId}
          useDom={activeLayers.daysOnMarket}
          marketAvgDom={marketAvgDom}
          onSelect={onSelect}
        />

        <FitBoundsControl listings={listings} />
      </MapContainer>

      <MapLayersPanel
        viewMode={viewMode}
        onViewMode={onViewMode}
        activeLayers={activeLayers}
        onToggleLayer={onToggleLayer}
      />

      <MapOverlays
        loading={loading}
        shown={pins.length}
        shortlisted={shortlisted}
        missingCoords={missingCoords}
        isEmpty={pins.length === 0}
        onAddListing={onAddListing}
      />
    </div>
  );
}
