/* ═══════════════════════════════════════════════════════════════════════════
   MapHelpers — the four null-rendering components that make Leaflet behave.

   All ported from REMI (frontend/src/components/map/MapLeafletHelpers.tsx).
   Each one exists because of a specific bug that is obvious in hindsight and
   invisible until it bites.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { Maximize2 } from 'lucide-react';
import type { Listing } from '../matching/types';

/**
 * Keep Leaflet's idea of its own size correct.
 *
 * Leaflet measures its container once at mount. The shortlist rail animates
 * between 320px and 0 over 300ms, so without this the map draws into stale
 * dimensions and half the tiles never load — the classic "grey stripe down the
 * side of the map".
 *
 * A ResizeObserver rather than a one-shot setTimeout, because the transition
 * fires many intermediate sizes. `animate: false` because animating a resize
 * on every one of those frames is what makes the whole page feel heavy.
 */
export function MapAutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/**
 * Fly to a point when asked — including to the SAME point twice.
 *
 * The `ts` counter is the trick. A plain `{lat, lng}` object is a new identity
 * on every render (so the effect fires constantly) or an equal value (so
 * re-selecting the same pin does nothing). A caller-incremented timestamp makes
 * "fly again to where we already are" expressible.
 */
export function MapFlyTo({ target }: { target: { lat: number; lng: number; ts: number } | null }) {
  const map = useMap();
  const prev = useRef(0);
  useEffect(() => {
    if (target && target.ts !== prev.current) {
      prev.current = target.ts;
      map.flyTo([target.lat, target.lng], 16, { duration: 0.6 });
    }
  }, [target, map]);
  return null;
}

/**
 * Frame the active market, and lock panning to it.
 *
 * The mount/change split matters: an empty-deps effect does an INSTANT fit on
 * first paint, and a second guarded effect does the ANIMATED fly only when the
 * market actually changes. Without the split the map performs a 1.5s flight
 * every time you open the tab, which reads as jank rather than polish.
 *
 * `maxBounds` + `maxBoundsViscosity: 1` is the interaction half of the Ontario
 * boundary — a wall, not a suggestion. The other half is the `province = 'ON'`
 * CHECK in migration 16.
 */
export function MapBoundsSync({
  bounds, marketKey, listings = [],
}: {
  bounds: [[number, number], [number, number]];
  marketKey: string;
  listings?: Listing[];
}) {
  const map = useMap();
  const prevKey = useRef<string | null>(null);
  const framedListings = useRef(false);

  useEffect(() => {
    const b = L.latLngBounds(bounds[0], bounds[1]);
    map.setMaxBounds(b);
    const located = listings.filter(l => Number.isFinite(l.lat) && Number.isFinite(l.lng));
    if (!framedListings.current && located.length) {
      // Fit the first real data once. Market metadata can arrive later; it
      // updates pan bounds without zooming back out and hiding the price pins.
      map.stop();
      map.fitBounds(L.latLngBounds(located.map(l => [l.lat as number, l.lng as number])), {
        padding: [65, 65], maxZoom: 14, animate: false,
      });
      framedListings.current = true;
    } else if (prevKey.current !== marketKey) {
      map.stop();
      map.fitBounds(b, { padding: [40, 40], animate: false });
    }
    prevKey.current = marketKey;
  }, [marketKey, bounds, listings, map]);

  return null;
}

/** Deselect on a click that misses every pin. */
export function MapClickAway({ onDeselect }: { onDeselect: () => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onDeselect();
    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [map, onDeselect]);
  return null;
}

/**
 * Zoom to fit everything currently shown.
 *
 * Returns null when there is nothing to fit, so there is never a dead button.
 * `maxZoom: 15` matters: fitting a single listing would otherwise zoom to
 * street level and lose all context.
 */
export function FitBoundsControl({ listings }: { listings: Listing[] }) {
  const map = useMap();

  const plottable = listings.filter(
    (l) => typeof l.lat === 'number' && typeof l.lng === 'number'
  );

  const fit = useCallback(() => {
    if (plottable.length === 0) return;
    map.fitBounds(
      L.latLngBounds(plottable.map((l) => [l.lat as number, l.lng as number])),
      { padding: [50, 50], maxZoom: 15 }
    );
  }, [plottable, map]);

  if (plottable.length === 0) return null;

  return (
    <button
      onClick={fit}
      title="Fit the map to everything shown"
      aria-label="Fit the map to everything shown"
      className="absolute h-8 w-8 rounded-lg border border-border bg-bg-elevated shadow-sm
                 flex items-center justify-center text-text-secondary
                 hover:text-text-primary hover:border-border-hover transition-colors"
      style={{ top: 12, right: 12, zIndex: 500 }}
    >
      <Maximize2 size={14} />
    </button>
  );
}
