/* ═══════════════════════════════════════════════════════════════════════════
   MarkerClusterLayer — pins on the map, added incrementally.

   PORTED FROM REMI (frontend/src/components/map/MarkerClusterLayer.tsx), and
   the thing worth porting is not the rendering — it is the LIFECYCLE.

   The obvious implementation rebuilds the cluster group whenever the pin list
   changes. That is what the previous version of this file did, and it is the
   classic Leaflet performance cliff: at a few hundred markers every filter
   toggle tears down and re-adds the whole layer, the cluster tree recomputes
   from scratch, and every entrance animation replays. REMI solved it with an
   add/remove diff keyed on id, plus a SEPARATE effect that calls `setIcon` for
   selection changes so re-selecting never removes a marker.

   Four things here are load-bearing and easy to lose:

   1. `import('leaflet.markercluster')` behind a `ready` gate. The plugin
      monkey-patches the `L` global; nothing may call `L.markerClusterGroup`
      before that promise resolves. Paired with `optimizeDeps.exclude` in
      vite.config.ts, without which Vite's dep optimizer breaks the patching.

   2. `_band` smuggled onto `L.MarkerOptions`. `iconCreateFunction` receives
      Leaflet markers, not React data, so this is the only bridge from a match
      band to the cluster bubble's colour.

   3. `onMarkerClick` held in a ref, so the click closure never goes stale and
      the diffing effect does not need the callback in its deps (which would
      make it re-run on every parent render).

   4. Full teardown on unmount. Under StrictMode the mount effect runs twice;
      without the cleanup you end up with two overlapping cluster groups.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Listing, MatchBand } from '../matching/types';
import { listingPinHtml, clusterHtml, bestBandOf, plottable, tooltipHtml } from './markers';

export interface MapPin {
  listing: Listing;
  band: MatchBand | null;
  shortlisted: boolean;
}

/** A Leaflet marker carrying the one piece of app data the cluster icon needs. */
type BandedMarker = L.Marker & { _band?: MatchBand | null };

interface MarkerClusterGroupLike extends L.Layer {
  addLayer(layer: L.Layer): this;
  removeLayer(layer: L.Layer): this;
  clearLayers(): this;
}

export function MarkerClusterLayer({
  pins, selectedId, useDom, marketAvgDom, onSelect,
}: {
  pins: MapPin[];
  selectedId: string | null;
  useDom: boolean;
  marketAvgDom: number;
  onSelect: (listingId: string) => void;
}) {
  const map = useMap();
  const groupRef = useRef<MarkerClusterGroupLike | null>(null);
  const markersRef = useRef<Map<string, BandedMarker>>(new Map());
  const addedRef = useRef<Set<string>>(new Set());
  const pinsRef = useRef<MapPin[]>([]);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // The plugin patches the L global as a side effect. Gate on it.
  useEffect(() => {
    let alive = true;
    import('leaflet.markercluster').then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  /* ── the group ── */
  useEffect(() => {
    if (!ready) return;

    const factory = (L as unknown as {
      markerClusterGroup: (o: Record<string, unknown>) => MarkerClusterGroupLike;
    }).markerClusterGroup;

    const group = factory({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,   // kills the default blue convex hull
      zoomToBoundsOnClick: true,
      animate: true,
      animateAddingMarkers: true,
      iconCreateFunction: (cluster: { getChildCount(): number; getAllChildMarkers(): BandedMarker[] }) => {
        const children = cluster.getAllChildMarkers();
        const best = bestBandOf(children.map((m) => m._band ?? null));
        // Live zoom, read at icon-build time. Leaflet re-invokes this whenever
        // clusters recompute on zoom, so the frosted/solid switch needs no
        // extra wiring.
        const zoomedOut = map.getZoom() <= 10;
        return L.divIcon({
          html: clusterHtml(cluster.getChildCount(), best, zoomedOut),
          className: 'asap-cluster-wrap',
          iconSize: L.point(40, 40),
          iconAnchor: L.point(20, 20),
        });
      },
    });

    map.addLayer(group);
    groupRef.current = group;

    // Captured here rather than read as `.current` inside the cleanup. React's
    // lint rule is right to flag the latter: cleanup runs after the next render
    // has possibly reassigned the ref, so `.current` at teardown time may not be
    // the object this effect created. These are plain Maps/Sets rather than DOM
    // nodes, so capturing the reference is exactly the fix.
    const markers = markersRef.current;
    const added = addedRef.current;

    return () => {
      map.removeLayer(group);
      group.clearLayers();
      groupRef.current = null;
      markers.clear();
      added.clear();
      pinsRef.current = [];
    };
  }, [ready, map]);

  /* ── add / remove diff ──
     Only what actually changed touches the map. */
  useEffect(() => {
    const group = groupRef.current;
    if (!ready || !group) return;

    const { plotted } = plottable(
      pins.map((p) => ({ ...p, lat: p.listing.lat, lng: p.listing.lng }))
    );
    const currentIds = new Set(plotted.map((p) => p.listing.id));

    // Gone.
    for (const id of [...addedRef.current]) {
      if (!currentIds.has(id)) {
        const m = markersRef.current.get(id);
        if (m) group.removeLayer(m);
        markersRef.current.delete(id);
        addedRef.current.delete(id);
      }
    }

    pinsRef.current = plotted;

    // New. Staggered entrance, capped so a 500-pin load does not animate for
    // 25 seconds.
    const fresh = plotted.filter((p) => !addedRef.current.has(p.listing.id));
    const STAGGER_CAP = 20;

    fresh.forEach((p, i) => {
      const marker = L.marker(
        [p.listing.lat as number, p.listing.lng as number],
        {
          icon: L.divIcon({
            html: listingPinHtml(p.listing, {
              band: p.band,
              selected: p.listing.id === selectedId,
              shortlisted: p.shortlisted,
              useDom,
              marketAvgDom,
              animDelay: Math.min(i, STAGGER_CAP) * 40,
            }),
            className: 'asap-pin-wrap',
            iconSize: L.point(48, 24),
            iconAnchor: L.point(24, 12),
          }),
          // Leaflet's default alt is empty for a divIcon, so a screen reader
          // announces nothing. Give it the address and the fit.
          alt: `${p.listing.address_raw}${p.band ? `, ${p.band} fit` : ''}`,
          keyboard: true,
        }
      ) as BandedMarker;

      marker._band = p.band;
      marker.bindTooltip(tooltipHtml(p.listing, p.band, p.shortlisted), {
        direction: 'top',
        offset: L.point(0, -14),
        className: 'asap-map-tooltip',
      });
      marker.on('click', () => onSelectRef.current(p.listing.id));

      group.addLayer(marker);
      markersRef.current.set(p.listing.id, marker);
      addedRef.current.add(p.listing.id);
    });
  }, [pins, ready, selectedId, useDom, marketAvgDom]);

  /* ── icon updates ──
     Selection, shortlist and colour-mode changes go through setIcon on the
     EXISTING marker. No removal, no cluster reflow, and — because animDelay is
     omitted — no replayed entrance animation. */
  useEffect(() => {
    if (!ready || !groupRef.current) return;
    for (const p of pinsRef.current) {
      const marker = markersRef.current.get(p.listing.id);
      if (!marker) continue;
      marker._band = p.band;
      marker.setIcon(L.divIcon({
        html: listingPinHtml(p.listing, {
          band: p.band,
          selected: p.listing.id === selectedId,
          shortlisted: p.shortlisted,
          useDom,
          marketAvgDom,
        }),
        className: 'asap-pin-wrap',
        iconSize: L.point(48, 24),
        iconAnchor: L.point(24, 12),
      }));
    }
  }, [selectedId, useDom, marketAvgDom, ready, pins]);

  return null;
}
