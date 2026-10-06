/* ═══════════════════════════════════════════════════════════════════════════
   Scout — the map, and the list, over your Ontario market.

   WHAT CHANGED
   The previous version returned "Add a client first" before Leaflet ever
   mounted: no brief on file meant no map at all. That was backwards. Looking at
   your own market geographically is not a listing-search product, and gating it
   made the tab useless on day one.

   So the map renders unconditionally and the client picker is a FILTER. With
   nobody selected you see the market in neutral pins. Pick a buyer and the same
   pins recolour by how well each home fits THEIR brief.

   The one thing still client-scoped is the LIST. Comparison is where a browser
   would emerge — a sortable table of everything on the market is a different
   product — so the list only appears once there is a brief to rank against.

   Layout is REMI's: 320px collapsible rail, flexible map, 380px detail rail.
   ═══════════════════════════════════════════════════════════════════════════ */

import { lazy, Suspense, useMemo, useState } from 'react';
import {
  Map as MapIcon, Rows3, Plus, AlertTriangle, PanelLeftOpen, Info,
} from 'lucide-react';
import { Button, Card, Skeleton, Chip } from '../components/ui';
import { useClients, useMarkets } from '../hooks/useClients';
import { useMatches, useListings } from '../hooks/useMatches';
import { useMandate } from '../hooks/useMandate';
import { useTheme } from '../contexts/ThemeContext';
import { MatchGrid, GridSummary } from '../scout/MatchGrid';
import { PropertyPanel } from '../scout/PropertyPanel';
import { AddListingDialog } from '../scout/AddListingDialog';
import { ShortlistSidebar } from '../scout/ShortlistSidebar';
import { MapLegend } from '../scout/MapChrome';
import { DEFAULT_LAYERS, type ViewMode, type LayerId, type ActiveLayers } from '../scout/mapConfig';
import type { MapPin } from '../scout/MapView';
import type { MatchBand, Listing } from '../matching/types';

/* Leaflet, markercluster and their CSS are a ~190kB chunk. Clients, Profile and
 * Calendar never need it. Same posture as AsapPresence on Home. */
const MapView = lazy(() => import('../scout/MapView').then((m) => ({ default: m.MapView })));

const BANDS: MatchBand[] = ['strong', 'possible', 'stretch'];

export default function Scout() {
  const { clients } = useClients();
  const { mandate } = useMandate();
  const { markets, active: activeMarkets } = useMarkets(mandate?.active_markets ?? []);
  const { theme } = useTheme();

  /* Client is a FILTER, and "nobody" is a legitimate value. Derived rather than
   * stored-and-synced so deleting a client can never leave a dangling selection. */
  const [requestedClientId, setRequestedClientId] = useState<string | null>('client-1');
  const clientId = (requestedClientId && clients.some((c) => c.id === requestedClientId))
    ? requestedClientId
    : null;

  const [marketSlug, setMarketSlug] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [bandFilter, setBandFilter] = useState<MatchBand | null>(null);
  const [adding, setAdding] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [viewMode, setViewMode] = useState<ViewMode>('default');
  const [layers, setLayers] = useState<ActiveLayers>(DEFAULT_LAYERS);

  const client = clients.find((c) => c.id === clientId) ?? null;

  const { matches, loading: matchesLoading, writeState, writeReason, decide, refresh } =
    useMatches({ clientId, states: ['new', 'surfaced', 'shortlisted'] });

  // Every listing in the market. This is what the map draws when no client is
  // selected — and where sold comps come from, since a sold home can never be a
  // match and so could never arrive through the matches query.
  const { listings: allListings, loading: listingsLoading, refresh: refreshListings } =
    useListings({ marketSlug, includeSold: true });

  const loading = matchesLoading || listingsLoading;
  const matchByListing = useMemo(
    () => new Map(matches.map((m) => [m.listing.id, m])),
    [matches]
  );

  /* ── what goes on the map ──
     With a client: their matches, plus (optionally) the rest of the market.
     Without: every active listing, neutral. Sold comps only when asked for —
     they are context, and unrequested grey pins are just noise. */
  const pins: MapPin[] = useMemo(() => {
    const out: MapPin[] = [];
    const seen = new Set<string>();

    if (clientId) {
      for (const m of matches) {
        if (bandFilter && m.match.band !== bandFilter) continue;
        if (layers.shortlisted && m.match.state !== 'shortlisted') continue;
        if (marketSlug && m.listing.market_slug !== marketSlug) continue;
        out.push({
          listing: m.listing,
          band: m.match.band,
          shortlisted: m.match.state === 'shortlisted',
        });
        seen.add(m.listing.id);
      }
    }

    const wantUnmatched = !clientId || layers.unmatched;
    if (wantUnmatched && !layers.shortlisted) {
      for (const l of allListings) {
        if (seen.has(l.id)) continue;
        if (l.tenure === 'sold') continue;
        if (l.status !== 'active') continue;
        if (layers.newListings && (l.days_on_market ?? 999) > 7) continue;
        out.push({ listing: l, band: null, shortlisted: false });
        seen.add(l.id);
      }
    }

    if (layers.soldComps) {
      for (const l of allListings) {
        if (l.tenure === 'sold' && (!marketSlug || l.market_slug === marketSlug) && !seen.has(l.id)) {
          out.push({ listing: l, band: null, shortlisted: false });
        }
      }
    }

    return out;
  }, [clientId, matches, allListings, bandFilter, layers, marketSlug]);

  const visibleMatches = useMemo(
    () => matches.filter((m) => {
      if (bandFilter && m.match.band !== bandFilter) return false;
      if (marketSlug && m.listing.market_slug !== marketSlug) return false;
      return true;
    }),
    [matches, bandFilter, marketSlug]
  );

  const shortlisted = useMemo(
    () => matches.filter((m) => m.match.state === 'shortlisted'),
    [matches]
  );

  /* ── the selected thing ── */
  const selectedListing: Listing | null = useMemo(() => {
    if (!selectedListingId) return null;
    return allListings.find((l) => l.id === selectedListingId)
      ?? matchByListing.get(selectedListingId)?.listing
      ?? null;
  }, [selectedListingId, allListings, matchByListing]);

  const selectedMatch = selectedListingId
    ? matchByListing.get(selectedListingId)?.match ?? null
    : null;

  const activeMarket = marketSlug ? (markets.find((m) => m.slug === marketSlug) ?? null) : null;
  const activeHomeCount = pins.filter((pin) => pin.listing.tenure !== 'sold').length;
  const soldCount = pins.length - activeHomeCount;

  /** Median days-on-market, for the DOM colouring layer. Median not mean — one
   *  stale listing sitting for 400 days should not redefine "normal". */
  const marketAvgDom = useMemo(() => {
    const doms = allListings
      .filter((l) => l.tenure !== 'sold' && typeof l.days_on_market === 'number')
      .map((l) => l.days_on_market as number)
      .sort((a, b) => a - b);
    if (doms.length === 0) return 30;
    return doms[Math.floor(doms.length / 2)];
  }, [allListings]);

  const toggleLayer = (id: LayerId) => setLayers((l) => ({ ...l, [id]: !l[id] }));
  const handleDecide = async (matchId: string, state: 'shortlisted' | 'dismissed') => {
    await decide(matchId, state);
  };

  return (
    <div className="flex flex-col h-full bg-bg-surface overflow-hidden">
      {/* ── toolbar ── */}
      <div className="shrink-0 px-5 md:px-6 py-3 border-b border-border bg-bg-primary/60 backdrop-blur-xl">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-base font-black text-text-primary tracking-tight mr-1">Market Scout</h1>

          <select
            value={clientId ?? ''}
            onChange={(e) => {
              setRequestedClientId(e.target.value || null);
              setSelectedListingId(null);
              setBandFilter(null);
            }}
            aria-label="Filter by client"
            className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-xs font-medium
                       text-text-primary outline-none focus:border-accent"
          >
            {/* "Everything" is a first-class option, not a fallback. */}
            <option value="">Everything on the market</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>Matched to {c.display_name}</option>
            ))}
          </select>

          <select
            value={marketSlug ?? ''}
            onChange={(e) => setMarketSlug(e.target.value || null)}
            aria-label="Market"
            className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-xs
                       text-text-primary outline-none focus:border-accent"
          >
            <option value="">All my markets</option>
            {activeMarkets.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </select>

          {clientId && (
            <div className="flex gap-1.5">
              <Chip label="All fits" selected={bandFilter === null} onClick={() => setBandFilter(null)} />
              {BANDS.map((b) => (
                <Chip
                  key={b}
                  label={b === 'strong' ? 'Strong' : b === 'possible' ? 'Possible' : 'Stretch'}
                  selected={bandFilter === b}
                  onClick={() => setBandFilter(bandFilter === b ? null : b)}
                  count={matches.filter((m) => m.match.band === b).length}
                />
              ))}
            </div>
          )}

          <MapLegend hasClient={Boolean(clientId)} />

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAdding(true)}>
              Add a listing
            </Button>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setView('map')}
                aria-pressed={view === 'map'}
                className={`px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  view === 'map' ? 'bg-accent text-text-on-accent' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <MapIcon size={13} /> Map
              </button>
              <button
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
                title={clientId ? undefined : 'Pick a client to compare their matches'}
                className={`px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  view === 'list' ? 'bg-accent text-text-on-accent' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Rows3 size={13} /> List
              </button>
            </div>
          </div>
        </div>

        {client && client.status !== 'active' && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-text-secondary">
            <AlertTriangle size={12} className="text-warning shrink-0" />
            {client.display_name} is marked &ldquo;{client.status.replace('_', ' ')}&rdquo; — these matches are
            not being surfaced proactively.
          </div>
        )}
      </div>

      {/* ── three columns ── */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        <ShortlistSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          shortlisted={shortlisted}
          totalInView={pins.length}
          selectedId={selectedListingId}
          onSelect={setSelectedListingId}
          clientName={client?.display_name ?? null}
        />

        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open shortlist"
            className="absolute top-3 left-3 z-30 p-2 bg-bg-elevated border border-border rounded-lg
                       shadow-md text-text-primary hover:bg-bg-surface transition-all"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}

        {/* centre */}
        <div className="relative flex-1 min-w-0 h-full">
          {view === 'map' ? (
            <Suspense fallback={<div className="h-full w-full skeleton" />}>
              <MapView
                pins={pins}
                markets={activeMarkets}
                activeMarket={activeMarket}
                selectedId={selectedListingId}
                onSelect={setSelectedListingId}
                viewMode={viewMode}
                onViewMode={setViewMode}
                activeLayers={layers}
                onToggleLayer={toggleLayer}
                onAddListing={() => setAdding(true)}
                dark={theme === 'night'}
                loading={loading}
                marketAvgDom={marketAvgDom}
              />
            </Suspense>
          ) : (
            <div className="h-full overflow-y-auto p-5">
              {!clientId ? (
                /* The one place the client scope still bites. A sortable table
                   of the whole market IS the listing browser this product is
                   deliberately not — so the list needs a brief to rank against. */
                <Card padding="lg">
                  <div className="flex items-start gap-3">
                    <Info size={16} className="text-accent mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        Pick a client to compare listings side by side
                      </p>
                      <p className="text-xs text-text-secondary mt-1.5 leading-relaxed max-w-md">
                        The list ranks homes by how well they fit a specific buyer, so it needs a brief
                        to rank against. The map works without one — switch back to see the whole market.
                      </p>
                    </div>
                  </div>
                </Card>
              ) : loading ? (
                <Skeleton height="400px" rounded="lg" />
              ) : (
                <>
                  <GridSummary
                    shown={visibleMatches.length}
                    held={matches.length - visibleMatches.length}
                    capped={Boolean(mandate?.match_daily_cap)}
                  />
                  <MatchGrid
                    matches={visibleMatches}
                    selectedId={selectedListingId}
                    onSelect={setSelectedListingId}
                    onDecide={handleDecide}
                    canDecide={writeState === 'ready'}
                    decideReason={writeReason}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* right rail */}
        <div className={`h-full border-l border-border bg-bg-primary shrink-0 overflow-y-auto
                        ${selectedListing ? 'absolute inset-0 z-40 xl:static xl:z-10' : 'hidden xl:block'} w-full xl:w-[380px]`}>
          {selectedListing ? (
            <div className="p-4">
              <PropertyPanel
                listing={selectedListing}
                match={selectedMatch}
                allListings={allListings}
                canDecide={writeState === 'ready'}
                onDecide={handleDecide}
                onClose={() => setSelectedListingId(null)}
              />
            </div>
          ) : (
            <div className="p-5">
              <div className="mb-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">Property research</p>
                <h2 className="mt-2 text-base font-bold text-text-primary">Choose a home to inspect</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
                  {view === 'map' ? 'Select a pin' : 'Select a row'} to compare its details with the buyer brief, see trade-offs, and review nearby completed sales.
                </p>
              </div>
              {client ? (
                <div className="rounded-xl border border-border bg-bg-surface p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Ranking for</p>
                  <p className="mt-1 text-sm font-semibold text-text-primary">{client.display_name}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {client.budget_min && client.budget_max
                      ? `$${Math.round(client.budget_min / 1000)}k–$${Math.round(client.budget_max / 1000)}k budget`
                      : 'Budget not set'}
                    {client.timeline ? ` · ${client.timeline.replace('-', '–')} timeline` : ''}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
                    <span className="text-text-tertiary">Homes for sale</span>
                    <span className="font-semibold tabular-nums text-text-primary">{activeHomeCount}</span>
                  </div>
                  {soldCount > 0 && <p className="mt-2 text-[11px] text-text-tertiary">Plus {soldCount} nearby closed sales, shown separately.</p>}
                  <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary">Fit colours compare each sample home to this buyer’s confirmed must-haves and preferences.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-bg-surface p-4">
                  <p className="text-sm font-semibold text-text-primary">Choose a buyer brief</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">Select a client above to rank homes by budget, requirements, preferences, and market.</p>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
                    <span className="text-text-tertiary">Homes for sale</span>
                    <span className="font-semibold tabular-nums text-text-primary">{activeHomeCount}</span>
                  </div>
                  {soldCount > 0 && <p className="mt-2 text-[11px] text-text-tertiary">Plus {soldCount} nearby closed sales, shown separately.</p>}
                </div>
              )}
              <div className="mt-4 space-y-2 rounded-xl bg-bg-elevated/60 p-4">
                <p className="text-xs font-semibold text-text-primary">What happens when you select one</p>
                <p className="text-[11px] leading-relaxed text-text-secondary">ASAP shows the match reasoning, the details that need confirmation, and recent nearby sold comps when sample data is available.</p>
              </div>
              <p className="mt-4 text-[10px] leading-relaxed text-text-tertiary">Showcase data is fictional. Sample listings and sale prices are for product demonstration only.</p>
              {pins.length === 0 && !loading && (
                <p className="text-xs text-text-tertiary mt-3 leading-relaxed">
                  Nothing in this market yet. Add a listing you are tracking, or ask ASAP to research
                  the area.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {adding && (
        <AddListingDialog
          markets={activeMarkets}
          defaultMarket={marketSlug}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); refresh(); refreshListings(); }}
        />
      )}
    </div>
  );
}
