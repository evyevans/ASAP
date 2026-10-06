/* Pure row → metric mappers. No React, fully unit-testable.
 * Every derivation degrades gracefully to null/0 when data is missing, so the
 * dashboard renders neutral empty states rather than fabricated numbers. */

import {
  CATEGORY_MINUTES,
  HOURLY_VALUE,
  type ExecutionLogRow,
  type WeeklyExecutionRow,
  type PlannerContext,
} from './executionTypes';

export const isExecuted = (r: ExecutionLogRow) => r.status === 'executed';
export const isPending = (r: ExecutionLogRow) =>
  r.status === 'needs_approval' && (r.approved === null || r.approved === undefined);

/** Hours the AI worked for the agent = Σ executed blocks × category-minute baseline. */
export function hoursGivenBack(logs: ExecutionLogRow[]): number {
  const mins = logs
    .filter(isExecuted)
    .reduce((sum, r) => sum + (CATEGORY_MINUTES[r.block_category ?? 'unresolved'] ?? 15), 0);
  return Math.round((mins / 60) * 10) / 10;
}

/** Dollar value of that time. */
export function aiWorkValue(hours: number): number {
  return Math.round(hours * HOURLY_VALUE);
}

/** How much of the work the AI handled without needing a human. */
export function autonomyRate(logs: ExecutionLogRow[]): number | null {
  const executed = logs.filter(isExecuted).length;
  const pending = logs.filter((r) => r.status === 'needs_approval').length;
  const denom = executed + pending;
  return denom === 0 ? null : Math.round((executed / denom) * 100);
}

export interface DraftStats { produced: number; approved: number; rate: number | null; }

/** Draft quality / trust: how many artifacts were produced and approved. */
export function draftStats(logs: ExecutionLogRow[], weekly?: WeeklyExecutionRow | null): DraftStats {
  if (weekly && (weekly.drafts_produced ?? 0) > 0) {
    const produced = weekly.drafts_produced ?? 0;
    const approved = weekly.drafts_approved ?? 0;
    return { produced, approved, rate: produced ? Math.round((approved / produced) * 100) : null };
  }
  const withOutput = logs.filter((r) => (r.output_summary ?? '').trim().length > 0);
  const decided = logs.filter((r) => r.approved !== null && r.approved !== undefined);
  const approved = decided.filter((r) => r.approved === true).length;
  return {
    produced: withOutput.length,
    approved,
    rate: decided.length ? Math.round((approved / decided.length) * 100) : null,
  };
}

/** Count executed blocks per category. */
export function categoryCounts(logs: ExecutionLogRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of logs.filter(isExecuted)) {
    const c = r.block_category ?? 'unresolved';
    out[c] = (out[c] ?? 0) + 1;
  }
  return out;
}

export interface FunnelData {
  goalIncome: number | null;
  avgCommission: number | null;
  dealsNeeded: number | null;
}

/** Income funnel: deals needed = ceil(income / commission). */
export function funnel(planner: PlannerContext | null): FunnelData {
  const goalIncome = planner?.goalIncome ?? null;
  const avgCommission = planner?.avgCommission ?? null;
  const dealsNeeded =
    goalIncome && avgCommission && avgCommission > 0
      ? Math.ceil(goalIncome / avgCommission)
      : null;
  return { goalIncome, avgCommission, dealsNeeded };
}

/** Map a free-text bottleneck to the block-category that attacks it (heuristic). */
export function painPointCategory(bottleneck: string | null): string | null {
  if (!bottleneck) return null;
  const b = bottleneck.toLowerCase();
  if (b.includes('follow') || b.includes('nurtur') || b.includes('pipeline')) return 'outreach';
  if (b.includes('lead') || b.includes('prospect')) return 'outreach';
  if (b.includes('content') || b.includes('market') || b.includes('social')) return 'content';
  if (b.includes('admin') || b.includes('crm') || b.includes('organi')) return 'crm';
  if (b.includes('listing') || b.includes('present') || b.includes('cma')) return 'prep';
  if (b.includes('offer') || b.includes('deal') || b.includes('clos') || b.includes('negoti')) return 'deal';
  return null;
}

export interface PainPointResult { category: string | null; attacked: number; }

/** How many blocks this period targeted the realtor's stated pain point. */
export function painPointAttack(logs: ExecutionLogRow[], bottleneck: string | null): PainPointResult {
  const category = painPointCategory(bottleneck);
  if (!category) return { category: null, attacked: 0 };
  const attacked = logs.filter((r) => isExecuted(r) && r.block_category === category).length;
  return { category, attacked };
}

/** Format a number as compact currency ($725 / $18K / $1.2M). */
export function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
