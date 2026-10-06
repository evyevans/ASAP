/* Match band badge + the "why" list.
 *
 * Shared by the Clients page, Market Scout and the match grid, so the same
 * match is described identically wherever it appears. A band that reads
 * "Strong fit" on the map and "80" in the grid is two different products.
 *
 * NOTE ON WHAT THIS IS NOT: components/ui/index.tsx already exports
 * DealScoreBadge, cloned from REMI. It is not used here and should not be —
 * a deal score is a claim about what a property is worth, which SOUL.md Rule 5
 * and SC-01.5 forbid. This badge describes fit to a buyer's stated criteria,
 * which is a fact about the buyer.
 */

import { Check, X, Info, Clock } from 'lucide-react';
import type { MatchBand as Band, MatchReason, FailedGate } from '../matching/types';
import { BAND_LABEL } from './clientCopy';

const TONE: Record<Band, { bg: string; fg: string; ring: string }> = {
  strong: { bg: 'bg-success/12', fg: 'text-success', ring: 'border-success/25' },
  possible: { bg: 'bg-info/12', fg: 'text-info', ring: 'border-info/25' },
  stretch: { bg: 'bg-text-tertiary/12', fg: 'text-text-tertiary', ring: 'border-text-tertiary/25' },
};

export function MatchBandBadge({
  band, score, size = 'md',
}: { band: Band; score?: number; size?: 'sm' | 'md' }) {
  const t = TONE[band];
  const pad = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-[11px] px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${t.bg} ${t.fg} ${t.ring} ${pad}`}>
      {BAND_LABEL[band]}
      {score !== undefined && (
        // The number is secondary and deliberately unlabelled — it ranks, it
        // does not appraise. The words carry the meaning.
        <span className="opacity-60 tabular-nums font-normal">{Math.round(score)}</span>
      )}
    </span>
  );
}

/** The explanation. Rendered wherever a match is, because a match a realtor
 *  cannot justify out loud is a match they will not send. */
export function MatchWhy({
  reasons, failedGates, limit,
}: { reasons: MatchReason[]; failedGates?: FailedGate[]; limit?: number }) {
  const gates = failedGates ?? [];

  // Excluded: the misses are the whole story, so nothing else is shown.
  if (gates.length > 0) {
    return (
      <ul className="space-y-1">
        {gates.map((g, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-error">
            <X size={13} className="mt-0.5 shrink-0" />
            <span><span className="font-medium">{g.label}</span> — {g.detail}</span>
          </li>
        ))}
      </ul>
    );
  }

  // Met first, then what they would give up, then anything needing a check.
  // That order matters: it is how a realtor would say it.
  const met = reasons.filter((r) => r.met);
  const missed = reasons.filter((r) => !r.met && r.kind !== 'freshness');
  const notes = reasons.filter((r) => r.kind === 'freshness');
  const shown = limit ? [...met.slice(0, limit), ...missed.slice(0, limit)] : [...met, ...missed];

  return (
    <ul className="space-y-1">
      {shown.map((r, i) => (
        <li key={i} className={`flex items-start gap-1.5 text-xs ${r.met ? 'text-text-secondary' : 'text-text-tertiary'}`}>
          {r.met
            ? <Check size={13} className="mt-0.5 shrink-0 text-success" />
            : <Info size={13} className="mt-0.5 shrink-0" />}
          <span><span className="font-medium text-text-primary">{r.label}</span>{r.detail ? ` — ${r.detail}` : ''}</span>
        </li>
      ))}
      {notes.map((r, i) => (
        <li key={`n${i}`} className="flex items-start gap-1.5 text-xs text-warning">
          <Clock size={13} className="mt-0.5 shrink-0" />
          <span>{r.detail}</span>
        </li>
      ))}
    </ul>
  );
}
