import { Target } from 'lucide-react';
import type { PlannerContext } from '../executionTypes';
import { formatCurrency } from '../metricsMap';

const shortMarket = (m?: string | null) =>
  m ? m.split(/[–—-]/)[0].split(',')[0].trim() : null;

/** A warm, personal line reminding the realtor what ASAP is working toward —
 *  straight from their monthly plan (msp_success_plans). Hidden if no plan. */
export function PlanContext({ planner }: { planner: PlannerContext | null }) {
  if (!planner || (!planner.goalIncome && !planner.primaryMarket && !planner.mainFocus)) return null;
  const market = shortMarket(planner.primaryMarket);
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-border bg-bg-surface px-4 py-3">
      <Target size={15} className="text-accent mt-0.5 shrink-0" />
      <p className="text-sm text-text-secondary leading-snug">
        Working toward your{' '}
        {planner.goalIncome ? <b className="text-text-primary">{formatCurrency(planner.goalIncome)}</b> : 'income'} month
        {market && <> in <b className="text-text-primary">{market}</b></>}
        {planner.mainFocus && <> · focused on <b className="text-text-primary">{planner.mainFocus.toLowerCase()}</b></>}
        {planner.bottleneck && <> · attacking <b className="text-text-primary">{planner.bottleneck.toLowerCase()}</b></>}.
      </p>
    </div>
  );
}
