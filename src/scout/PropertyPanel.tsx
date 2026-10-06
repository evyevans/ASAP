/* ═══════════════════════════════════════════════════════════════════════════
   PropertyPanel — one home, why it fits, and what sold nearby.

   THREE THINGS THIS PANEL ALWAYS SHOWS, AND WHY

   1. PROVENANCE. Every figure carries where it came from and when.
      success-criteria/10-explicit-non-goals.md SC-10.3 — "never invent property
      facts". A price with no source is indistinguishable from a hallucinated
      one, and asap-buyer-match.md:24 already requires public figures to be
      labelled "confirm live on MLS". The line at the bottom is that label.

   2. THE EXPLANATION. What matched and what did not, in the realtor's own
      words. A shortlist they cannot justify out loud is a shortlist they will
      not send.

   3. RECENT SALES, CLEARLY SEPARATED. Sold homes are context: labelled, read-
      only, never actionable, never counted in a match total, and never
      shareable with a client (board-restricted in Ontario). The panel states
      published sale prices; it never concludes anything about this home's
      value — see soldComps.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from 'react';
import {
  X, Star, Home, CalendarClock, ShieldQuestion, History, ExternalLink,
} from 'lucide-react';
import { Button, Badge } from '../components/ui';
import { MatchBandBadge, MatchWhy } from '../clients/MatchBand';
import { money, moneyShort, PROPERTY_TYPE_LABEL, confirmedAge } from '../clients/clientCopy';
import { summariseComps } from './soldComps';
import type { Listing, MatchRow } from '../matching/types';

const SOURCE_LABEL: Record<Listing['source_id'], string> = {
  web_research: 'Public listing research',
  manual: 'Entered by you',
  reso: 'MLS board feed',
  aggregator: 'Listing aggregator',
};

const CONFIDENCE_NOTE: Record<Listing['source_confidence'], string> = {
  confirmed: 'Confirmed against MLS.',
  public_snapshot: 'Public snapshot — confirm on MLS before acting on it.',
  user_entered: 'Entered by you.',
};

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className="text-sm font-semibold text-text-primary tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

export interface PropertyPanelProps {
  listing: Listing;
  match: MatchRow | null;
  /** Every listing in scope — the sold ones become comps. */
  allListings: Listing[];
  canDecide: boolean;
  onDecide: (matchId: string, state: 'shortlisted' | 'dismissed') => void;
  onClose: () => void;
  onBookShowing?: (listing: Listing) => void;
  now?: number;
}

export function PropertyPanel({
  listing, match, allListings, canDecide, onDecide, onClose, onBookShowing, now: nowProp,
}: PropertyPanelProps) {
  /* Read the clock ONCE per mount, not as a default parameter.
   *
   * `now = Date.now()` in the signature re-reads on every render, so the comp
   * window would silently shift under the user mid-session and useMemo below
   * would recompute on every keystroke elsewhere on the page. A comp set is a
   * snapshot; it should not move while you are reading it. */
  const [mountedAt] = useState(() => Date.now());
  const now = nowProp ?? mountedAt;

  const comps = useMemo(
    () => summariseComps(listing, allListings, now),
    [listing, allListings, now]
  );

  const isSold = listing.tenure === 'sold';
  const price = isSold ? listing.sold_price : listing.list_price;
  const blocked = (match?.failed_gates.length ?? 0) > 0;

  return (
    <aside
      className="rounded-2xl border border-border bg-bg-surface overflow-hidden"
      aria-label={`Details for ${listing.address_raw}`}
    >
      {/* ── header ── */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-text-primary leading-tight">{listing.address_raw}</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {[listing.neighbourhood, listing.market_slug.replace(/-on$/, '').replace(/-/g, ' ')]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close details"
            className="shrink-0 p-1 text-text-tertiary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-2xl font-black text-text-primary tabular-nums">{money(price)}</span>
          {isSold ? (
            // A sold home must never read as available, anywhere.
            <Badge label="Sold — reference only" variant="default" />
          ) : (
            <>
              {match && <MatchBandBadge band={match.band} score={match.score} />}
              {listing.status !== 'active' && <Badge label={listing.status} variant="warning" />}
            </>
          )}
        </div>
      </div>

      {/* ── specs ── */}
      <div className="p-4 grid grid-cols-3 gap-4 border-b border-border">
        <Spec label="Bed" value={listing.bedrooms?.toString() ?? '—'} />
        <Spec label="Bath" value={listing.bathrooms?.toString() ?? '—'} />
        <Spec label="Sq ft" value={listing.sqft ? listing.sqft.toLocaleString('en-CA') : '—'} />
        <Spec label="Type" value={listing.property_type ? PROPERTY_TYPE_LABEL[listing.property_type] : '—'} />
        <Spec label="Parking" value={listing.parking_spaces?.toString() ?? '—'} />
        <Spec label={isSold ? 'Sold' : 'Days on market'}
          value={isSold ? (listing.sold_at ?? '—') : (listing.days_on_market?.toString() ?? '—')} />
        {listing.maintenance_fee !== null && (
          <Spec label="Condo fee" value={`${money(listing.maintenance_fee)}/mo`} />
        )}
      </div>

      {/* ── why it matches ── */}
      {match && !isSold && (
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldQuestion size={14} className="text-accent" />
            <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
              {blocked ? 'Why it does not fit' : 'Why it fits'}
            </h4>
          </div>
          <MatchWhy reasons={match.reasons} failedGates={match.failed_gates} />

          {match.llm_note && (
            <p className="mt-2.5 text-xs text-warning border-l-2 border-warning/40 pl-2.5 leading-relaxed">
              {match.llm_note}
            </p>
          )}
        </div>
      )}

      {/* ── recent sales nearby ──
          Deliberately its own labelled block, visually distinct, with no
          actions on it. Context, not candidates. */}
      {comps.count > 0 && (
        <div className="p-4 border-b border-border bg-bg-elevated/50">
          <div className="flex items-center gap-1.5 mb-1.5">
            <History size={14} className="text-text-tertiary" />
            <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Recent sales nearby
            </h4>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">{comps.sentence}</p>

          <ul className="mt-2.5 space-y-1">
            {comps.comps.map((c) => (
              <li key={c.listing.id} className="flex items-center justify-between gap-2 text-[11px] text-text-tertiary">
                <span className="truncate">{c.listing.address_raw}</span>
                <span className="tabular-nums shrink-0">
                  {moneyShort(c.listing.sold_price)} · {c.distanceKm.toFixed(1)}km · {c.daysAgo}d ago
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-2.5 text-[10px] text-text-tertiary italic">
            For your reference only — sold data is board-restricted and is not shared with clients.
          </p>
        </div>
      )}

      {/* ── actions ── */}
      {!isSold && (
        <div className="p-4 flex flex-wrap gap-2">
          {match && (
            <>
              <Button
                size="sm"
                icon={Star}
                disabled={!canDecide || blocked || match.state === 'shortlisted'}
                onClick={() => onDecide(match.id, 'shortlisted')}
                title={blocked ? 'This listing misses a hard requirement' : undefined}
              >
                {match.state === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={X}
                disabled={!canDecide || match.state === 'dismissed'}
                onClick={() => onDecide(match.id, 'dismissed')}
              >
                Not for them
              </Button>
            </>
          )}
          {onBookShowing && (
            <Button variant="secondary" size="sm" icon={CalendarClock} onClick={() => onBookShowing(listing)}>
              Book a showing
            </Button>
          )}
          {listing.listing_url && (
            <Button
              variant="ghost"
              size="sm"
              icon={ExternalLink}
              onClick={() => window.open(listing.listing_url!, '_blank', 'noopener,noreferrer')}
            >
              Original listing
            </Button>
          )}
        </div>
      )}

      {/* ── provenance ──
          Always last, always present. This is what makes every number above a
          sourced claim rather than an assertion. */}
      <div className="px-4 py-3 border-t border-border bg-bg-elevated/40">
        <div className="flex items-start gap-1.5">
          <Home size={12} className="text-text-tertiary mt-0.5 shrink-0" />
          <p className="text-[10px] text-text-tertiary leading-relaxed">
            <span className="font-medium">{SOURCE_LABEL[listing.source_id]}</span>
            {listing.source_listing_id ? ` · ${listing.source_listing_id}` : ''}
            {' · '}
            {confirmedAge(listing.source_fetched_at, now).replace('confirmed', 'read')}
            <br />
            {CONFIDENCE_NOTE[listing.source_confidence]}
            {!listing.can_share_with_client && ' Not for forwarding to a client.'}
          </p>
        </div>
      </div>
    </aside>
  );
}
