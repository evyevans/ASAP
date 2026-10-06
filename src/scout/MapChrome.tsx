/* ═══════════════════════════════════════════════════════════════════════════
   MapChrome — the controls that float over the map.

   Layers panel, legend and overlays, ported from REMI's MapLayersPanel /
   MapLegend / MapOverlays. Kept in one file because they are three small pieces
   of the same surface and splitting them across three would be filing, not
   organisation.

   TWO DEPARTURES FROM REMI, BOTH DELIBERATE:

   1. REMI's layer list shipped two entries (`growthZones`, `floodRisk`) marked
      `available: false`, rendering a permanently-disabled row with a "Soon"
      chip. Every layer here is implemented. A control that has never worked is
      worse than no control — it teaches people the panel is decorative.

   2. REMI's legend explained deal scores: "8-10 (High ROI)", "<5 (Caution)".
      That is a claim about what a property is worth, which SOUL.md Rule 5 and
      SC-01.5 forbid. This legend explains MATCH BANDS — a fact about the
      buyer's own stated criteria.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { Layers, ScanEye, X, MapPin, Loader2 } from 'lucide-react';
import { VIEW_MODES, MAP_LAYERS, type ViewMode, type LayerId, type ActiveLayers } from './mapConfig';
import { BAND_PIN, SOLD_PIN, NEUTRAL_PIN } from './markers';

/* ── View modes + layers, top-right ───────────────────────────────────────*/

export function MapLayersPanel({
  viewMode, onViewMode, activeLayers, onToggleLayer,
}: {
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  activeLayers: ActiveLayers;
  onToggleLayer: (id: LayerId) => void;
}) {
  const [open, setOpen] = useState(false);
  const anyOn = Object.values(activeLayers).some(Boolean);

  return (
    <>
      <div
        className="absolute top-3 right-3 bg-bg-elevated rounded-xl border border-border shadow-sm flex overflow-hidden"
        style={{ zIndex: 1000 }}
      >
        {VIEW_MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => onViewMode(m.key)}
            title={m.label}
            aria-label={m.label}
            aria-pressed={viewMode === m.key}
            className={`flex items-center px-2.5 py-2 border-r border-border last:border-r-0 transition-all cursor-pointer ${
              viewMode === m.key
                ? 'bg-accent text-text-on-accent'
                : 'text-text-secondary hover:bg-bg-surface'
            }`}
          >
            <m.icon size={12} />
          </button>
        ))}
      </div>

      <div className="absolute top-14 right-3" style={{ zIndex: 1000 }}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`h-8 px-2.5 rounded-lg border shadow-sm flex items-center gap-1.5 text-[11px] font-medium transition-all cursor-pointer ${
            anyOn
              ? 'bg-accent text-text-on-accent border-accent'
              : 'bg-bg-elevated border-border text-text-secondary hover:border-border-hover'
          }`}
        >
          <Layers size={12} /> Layers
        </button>

        {open && (
          <div className="mt-1 bg-bg-primary/95 backdrop-blur-xl rounded-xl border border-border shadow-lg p-3 w-64">
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Layers
            </p>
            <div className="space-y-0.5">
              {MAP_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => onToggleLayer(layer.id)}
                  className="flex items-start gap-2.5 py-1.5 px-2 rounded-lg transition-all w-full text-left cursor-pointer hover:bg-bg-surface"
                >
                  <span
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                      activeLayers[layer.id]
                        ? 'bg-accent border-accent text-text-on-accent'
                        : 'border-border bg-bg-surface'
                    }`}
                  >
                    {activeLayers[layer.id] && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-xs truncate ${
                      activeLayers[layer.id] ? 'text-text-primary font-medium' : 'text-text-secondary'
                    }`}>
                      {layer.label}
                    </span>
                    <span className="block text-[10px] text-text-tertiary">{layer.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Legend ───────────────────────────────────────────────────────────────*/

const Swatch = ({ colour, round = true }: { colour: string; round?: boolean }) => (
  <span
    className="inline-block w-3 h-3 shrink-0 border-2 border-white shadow-sm"
    style={{ background: colour, borderRadius: round ? 999 : 3 }}
  />
);

export function MapLegend({ hasClient }: { hasClient: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`h-8 px-2.5 rounded-lg border shadow-sm flex items-center gap-1.5 text-[11px] font-medium transition-all cursor-pointer ${
          open ? 'bg-accent text-text-on-accent border-accent'
               : 'bg-bg-elevated border-border text-text-secondary hover:border-border-hover'
        }`}
      >
        <ScanEye size={12} /> Legend
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 w-[248px] bg-bg-primary/95 backdrop-blur-xl rounded-xl border border-border shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              What the pins mean
            </p>
            <button onClick={() => setOpen(false)} aria-label="Close legend"
              className="text-text-tertiary hover:text-text-primary">
              <X size={12} />
            </button>
          </div>

          {hasClient ? (
            <>
              <p className="text-[10px] text-text-tertiary mb-2 leading-relaxed">
                How well each home fits <em>this client's</em> stated requirements. Not a view on
                what it is worth.
              </p>
              <div className="space-y-1.5">
                {([
                  ['strong', 'Strong fit — has what they asked for'],
                  ['possible', 'Possible — some compromises'],
                  ['stretch', 'Stretch — meets the musts, little else'],
                ] as const).map(([band, label]) => (
                  <div key={band} className="flex items-center gap-2">
                    <Swatch colour={BAND_PIN[band].bg} />
                    <span className="text-[11px] text-text-secondary">{label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Swatch colour={NEUTRAL_PIN.bg} />
              <span className="text-[11px] text-text-secondary">
                A listing. Pick a client to colour by fit.
              </span>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            <div className="flex items-center gap-2">
              <Swatch colour={SOLD_PIN.bg} round={false} />
              <span className="text-[11px] text-text-secondary">
                Sold — reference only, never a match
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-warning border-2 border-white shrink-0" />
              <span className="text-[11px] text-text-secondary">Shortlisted</span>
            </div>
          </div>

          <p className="text-[10px] text-text-tertiary mt-3 pt-3 border-t border-border leading-relaxed">
            Round pins are available. Square grey pins have already sold and cannot be shortlisted.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Overlays ─────────────────────────────────────────────────────────────*/

export function MapOverlays({
  loading, shown, shortlisted, missingCoords, isEmpty, onAddListing,
}: {
  loading: boolean;
  shown: number;
  shortlisted: number;
  missingCoords: number;
  isEmpty: boolean;
  onAddListing: () => void;
}) {
  return (
    <>
      {/* Nothing to show. Honest about WHY, and offers the one action that
          fixes it — rather than an empty map with no explanation. */}
      {isEmpty && !loading && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 1000 }}
        >
          <div className="pointer-events-auto max-w-[260px] text-center bg-bg-primary/95 backdrop-blur-xl
                          border border-border rounded-2xl shadow-lg px-5 py-6">
            <MapPin size={20} className="text-text-tertiary mx-auto mb-2" />
            <p className="text-sm font-semibold text-text-primary">No listings in this market yet</p>
            <p className="text-[11px] text-text-secondary mt-1.5 leading-relaxed">
              Add one you are already tracking, or ask ASAP to research the area.
            </p>
            <button
              onClick={onAddListing}
              className="mt-3 text-xs font-medium text-accent hover:opacity-80"
            >
              Add a listing
            </button>
          </div>
        </div>
      )}

      {/* Count pill, bottom centre. Always present — it is how you tell a
          filtered map from a broken one. */}
      <div
        className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-bg-primary/95 backdrop-blur-xl
                   border border-border rounded-full px-3 py-1.5 shadow-md"
        style={{ zIndex: 1000 }}
      >
        <span className="text-xs text-text-secondary flex items-center gap-1.5">
          {loading ? (
            <><Loader2 size={11} className="animate-spin" /> Loading…</>
          ) : (
            <>
              <span className="text-text-primary font-semibold tabular-nums">{shown}</span>
              {shown === 1 ? 'listing' : 'listings'}
              {shortlisted > 0 && (
                <>· <span className="text-warning font-semibold tabular-nums">{shortlisted}</span> shortlisted</>
              )}
            </>
          )}
        </span>
      </div>

      {/* What is NOT on the map. Public research often has no coordinates, and
          a silent gap makes the map disagree with the list about how many homes
          exist. */}
      {missingCoords > 0 && !loading && (
        <div
          className="absolute bottom-3 left-3 rounded-lg border border-border bg-bg-elevated/90
                     backdrop-blur px-2.5 py-1.5 text-[11px] text-text-secondary max-w-[240px]"
          style={{ zIndex: 1000 }}
        >
          {missingCoords} not mapped — no coordinates yet. Still in the list.
        </div>
      )}
    </>
  );
}
