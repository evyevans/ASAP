/* ═══════════════════════════════════════════════════════════════════════════
   ShortlistSidebar — the collapsible left rail.

   REMI's MapSavedSidebar was a watchlist of properties saved to localStorage.
   The equivalent here is real state: a match whose `state` is 'shortlisted',
   set through the decide_client_match RPC. Same rail, same 320px↔0 collapse,
   same three-step empty state — different backing.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Bookmark, PanelLeftClose, Compass, Star } from 'lucide-react';
import { moneyShort, PROPERTY_TYPE_LABEL } from '../clients/clientCopy';
import { MatchBandBadge } from '../clients/MatchBand';
import type { MatchWithListing } from '../hooks/useMatches';

function Step({ n, tone, children }: { n: number; tone: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="shrink-0 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
        style={{ background: tone }}
      >
        {n}
      </span>
      <span className="text-[11px] text-text-secondary leading-relaxed">{children}</span>
    </li>
  );
}

export function ShortlistSidebar({
  open, onClose, shortlisted, totalInView, selectedId, onSelect, clientName,
}: {
  open: boolean;
  onClose: () => void;
  shortlisted: MatchWithListing[];
  totalInView: number;
  selectedId: string | null;
  onSelect: (listingId: string) => void;
  clientName: string | null;
}) {
  return (
    <div
      className={`absolute inset-y-0 left-0 md:relative bg-bg-surface border-r border-border transition-all duration-300 ease-in-out
                  z-40 md:z-20 flex flex-col overflow-hidden h-full shrink-0 ${open ? 'w-[320px] max-w-full' : 'w-0'}`}
    >
      {/* header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Bookmark size={14} className="text-accent" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary leading-tight">Shortlist</p>
            <p className="text-[11px] text-text-tertiary truncate">
              {shortlisted.length} kept{clientName ? ` for ${clientName}` : ''}
            </p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Collapse shortlist"
          className="shrink-0 text-text-tertiary hover:text-text-primary p-1">
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* body */}
      {shortlisted.length === 0 ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/15 to-accent/5
                          flex items-center justify-center mb-3">
            <Compass size={24} className="text-accent" />
          </div>
          <p className="text-sm font-bold text-text-primary">Nothing shortlisted yet</p>
          <p className="text-[11px] text-text-secondary mt-1.5 leading-relaxed">
            Click a pin to open a listing, read why it fits, and keep the ones worth showing.
          </p>
          <ol className="mt-4 space-y-2.5">
            <Step n={1} tone="var(--color-success)">Click a pin to open it</Step>
            <Step n={2} tone="var(--color-warning)">Read what matches and what it misses</Step>
            <Step n={3} tone="var(--color-accent)">Shortlist the ones worth a showing</Step>
          </ol>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
          {shortlisted.map(({ match, listing }) => (
            <button
              key={match.id}
              onClick={() => onSelect(listing.id)}
              className={`w-full text-left rounded-xl border p-2.5 transition-all ${
                listing.id === selectedId
                  ? 'border-accent bg-accent/5'
                  : 'border-border bg-bg-elevated hover:border-accent/40'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-text-primary truncate">
                  {listing.address_raw}
                </span>
                <Star size={11} className="text-warning shrink-0 mt-0.5" fill="currentColor" />
              </div>
              <div className="text-sm font-bold text-text-primary tabular-nums mt-0.5">
                {moneyShort(listing.list_price)}
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <MatchBandBadge band={match.band} size="sm" />
                <span className="text-[10px] text-text-tertiary">
                  {listing.bedrooms ?? '—'} bd · {listing.bathrooms ?? '—'} ba
                  {listing.property_type ? ` · ${PROPERTY_TYPE_LABEL[listing.property_type]}` : ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* footer */}
      <div className="px-3 py-2 border-t border-border bg-bg-surface/50 shrink-0
                      flex items-center justify-between text-[11px] text-text-tertiary">
        <span>{shortlisted.length} shortlisted</span>
        <span>{totalInView} in view</span>
      </div>
    </div>
  );
}
