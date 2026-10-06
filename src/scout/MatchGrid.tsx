/* ═══════════════════════════════════════════════════════════════════════════
   MatchGrid — the list mode of Market Scout.

   THIS IS NOT A LISTING BROWSER, AND THAT IS STRUCTURAL.
   The plan's recommendation, restated because the code has to keep it: the
   failure mode to avoid ("it becomes a generic listing browser") comes from
   unbounded INPUT, not from tabular OUTPUT. A table is a layout; a search box
   over all inventory is a product.

   So the grid keeps the table and has no way in that is not already scoped to
   a client. It takes `matches`, not `listings` — there is no prop through which
   an unscoped set of homes could arrive. Column sorting and a name filter over
   the already-matched rows are fine; searching the market is not possible from
   here by construction.

   COLUMNS ARE CLIENT-RELATIVE.
   REMI's For Sale grid had 28 columns including Deal Score, Deal Category,
   Price Tier, % Above Market, Est. ROI and Investment Analysis. Every one of
   those is an opinion of a property's value, which SOUL.md Rule 5 and SC-01.5
   forbid. This has ten, and the only judgement among them is the match band —
   a fact about the buyer's stated criteria.

   MOBILE: desktop-primary. Below `md` it becomes the card stack, because a
   ten-column table on a phone is a worse tool than a list and building a
   responsive data-grid framework to avoid saying that would be its own bloat.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from 'react';
import { ArrowUpDown, Star, X, ExternalLink, MapPin } from 'lucide-react';
import { Button, Badge } from '../components/ui';
import { MatchBandBadge } from '../clients/MatchBand';
import { moneyShort, PROPERTY_TYPE_LABEL, matchOneLiner } from '../clients/clientCopy';
import type { MatchWithListing } from '../hooks/useMatches';

type SortKey = 'score' | 'price' | 'beds' | 'baths' | 'sqft' | 'dom' | 'address';

const NUMERIC: Record<SortKey, boolean> = {
  score: true, price: true, beds: true, baths: true, sqft: true, dom: true, address: false,
};

const COLUMNS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'address', label: 'Address' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'beds', label: 'Bed', align: 'right' },
  { key: 'baths', label: 'Bath', align: 'right' },
  { key: 'sqft', label: 'Sq ft', align: 'right' },
  { key: 'dom', label: 'DOM', align: 'right' },
  { key: 'score', label: 'Fit', align: 'right' },
];

const valueOf = (m: MatchWithListing, key: SortKey): number | string => {
  switch (key) {
    case 'score': return m.match.score;
    case 'price': return m.listing.list_price ?? -1;
    case 'beds': return m.listing.bedrooms ?? -1;
    case 'baths': return m.listing.bathrooms ?? -1;
    case 'sqft': return m.listing.sqft ?? -1;
    case 'dom': return m.listing.days_on_market ?? -1;
    case 'address': return m.listing.address_raw.toLowerCase();
  }
};

export interface MatchGridProps {
  matches: MatchWithListing[];
  selectedId: string | null;
  onSelect: (listingId: string) => void;
  onDecide: (matchId: string, state: 'shortlisted' | 'dismissed') => void;
  /** False when migration 18 has not been applied — actions disable, honestly. */
  canDecide: boolean;
  decideReason?: string | null;
}

export function MatchGrid({
  matches, selectedId, onSelect, onDecide, canDecide, decideReason,
}: MatchGridProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' });

  const sorted = useMemo(() => {
    const rows = [...matches];
    rows.sort((a, b) => {
      const av = valueOf(a, sort.key);
      const bv = valueOf(b, sort.key);
      const cmp = NUMERIC[sort.key]
        ? (av as number) - (bv as number)
        : String(av).localeCompare(String(bv));
      // Stable tiebreak on id — without it, two identical scores swap places
      // between renders and the grid looks like it is shuffling on its own.
      return (sort.dir === 'asc' ? cmp : -cmp) || a.listing.id.localeCompare(b.listing.id);
    });
    return rows;
  }, [matches, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      // Numbers default to biggest-first, text to A-Z. Anything else feels wrong.
      : { key, dir: NUMERIC[key] ? 'desc' : 'asc' }));

  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-bg-surface px-6 py-10 text-center">
        <MapPin size={22} className="text-text-tertiary mx-auto mb-2" />
        <p className="text-sm text-text-secondary">No matches for this client yet.</p>
        <p className="text-xs text-text-tertiary mt-1">
          Add listings to the market, or widen their brief.
        </p>
      </div>
    );
  }

  return (
    <>
      {!canDecide && decideReason && (
        <div className="mb-3 rounded-xl border border-warning/30 bg-warning/8 px-4 py-2.5 text-xs text-text-secondary">
          {decideReason}
        </div>
      )}

      {/* ── desktop: the table ── */}
      <div className="hidden md:block rounded-2xl border border-border bg-bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-tertiary
                      ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    <button
                      onClick={() => toggleSort(c.key)}
                      aria-label={`Sort by ${c.label}`}
                      className="inline-flex items-center gap-1 hover:text-text-primary transition-colors"
                    >
                      {c.label}
                      <ArrowUpDown size={11} className={sort.key === c.key ? 'text-accent' : 'opacity-40'} />
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-text-tertiary">
                  Why
                </th>
                <th scope="col" className="px-3 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ match, listing }) => {
                const selected = listing.id === selectedId;
                return (
                  <tr
                    key={match.id}
                    onClick={() => onSelect(listing.id)}
                    className={`border-b border-border last:border-0 cursor-pointer transition-colors
                      ${selected ? 'bg-accent/6' : 'hover:bg-bg-elevated'}`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-text-primary truncate max-w-[220px]">
                        {listing.address_raw}
                      </div>
                      <div className="text-[11px] text-text-tertiary truncate max-w-[220px]">
                        {[listing.neighbourhood, listing.property_type
                          ? PROPERTY_TYPE_LABEL[listing.property_type] : null]
                          .filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-primary">
                      {moneyShort(listing.list_price)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{listing.bedrooms ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{listing.bathrooms ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">
                      {listing.sqft ? listing.sqft.toLocaleString('en-CA') : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{listing.days_on_market ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <MatchBandBadge band={match.band} score={match.score} size="sm" />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] text-text-secondary line-clamp-2 max-w-[260px] block">
                        {matchOneLiner(match.reasons, match.failed_gates)}
                      </span>
                      {match.stale_inputs && (
                        <span className="text-[10px] text-warning">brief needs re-confirming</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <RowActions
                        match={match}
                        canDecide={canDecide}
                        onDecide={onDecide}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── mobile: the card stack ── */}
      <div className="md:hidden space-y-2">
        {sorted.map(({ match, listing }) => (
          <button
            key={match.id}
            onClick={() => onSelect(listing.id)}
            className={`w-full text-left rounded-xl border p-3 transition-all ${
              listing.id === selectedId ? 'border-accent bg-accent/5' : 'border-border bg-bg-surface'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-text-primary truncate">{listing.address_raw}</span>
              <MatchBandBadge band={match.band} size="sm" />
            </div>
            <div className="text-sm text-text-primary mt-1 tabular-nums">
              {moneyShort(listing.list_price)}
              <span className="text-text-tertiary text-xs ml-2">
                {listing.bedrooms ?? '—'} bed · {listing.bathrooms ?? '—'} bath
                {listing.sqft ? ` · ${listing.sqft.toLocaleString('en-CA')} sq ft` : ''}
              </span>
            </div>
            <p className="text-[11px] text-text-secondary mt-1">
              {matchOneLiner(match.reasons, match.failed_gates)}
            </p>
          </button>
        ))}
      </div>
    </>
  );
}

function RowActions({
  match, canDecide, onDecide,
}: {
  match: MatchWithListing['match'];
  canDecide: boolean;
  onDecide: (matchId: string, state: 'shortlisted' | 'dismissed') => void;
}) {
  const shortlisted = match.state === 'shortlisted';
  const dismissed = match.state === 'dismissed';

  // A match that failed a hard gate cannot be shortlisted — enforced by the
  // CHECK in migration 17 and refused by decide_client_match. Disabling the
  // button rather than letting it fail is the same rule, said earlier.
  const blocked = match.failed_gates.length > 0;

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => onDecide(match.id, 'shortlisted')}
        disabled={!canDecide || blocked || shortlisted}
        title={blocked ? 'This listing misses a hard requirement' : 'Shortlist'}
        aria-label="Shortlist"
        className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed
          ${shortlisted ? 'text-warning' : 'text-text-tertiary hover:text-warning'}`}
      >
        <Star size={15} fill={shortlisted ? 'currentColor' : 'none'} />
      </button>
      <button
        onClick={() => onDecide(match.id, 'dismissed')}
        disabled={!canDecide || dismissed}
        aria-label="Dismiss"
        title="Not for this client"
        className="p-1.5 rounded-lg text-text-tertiary hover:text-error transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <X size={15} />
      </button>
    </div>
  );
}

/** Shown above the grid — counts, and the honest note about what is held back. */
export function GridSummary({
  shown, held, capped,
}: { shown: number; held: number; capped: boolean }) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs text-text-tertiary mb-3">
      <span>{shown} match{shown === 1 ? '' : 'es'}</span>
      {held > 0 && (
        <>
          <span>·</span>
          {/* Never let a cap read as "that is everything". */}
          <span>
            {held} more below your threshold
            {capped ? ' or past today\'s limit' : ''} — still saved, not shown
          </span>
        </>
      )}
    </div>
  );
}

export function ExternalListingLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={ExternalLink}
      onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
    >
      View listing
    </Button>
  );
}

export function ListingStatusBadge({ status }: { status: string }) {
  const variant = status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'default';
  return <Badge label={status} variant={variant} />;
}
