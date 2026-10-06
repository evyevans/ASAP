import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TrendDay } from '../eventMetrics';

const SERIES = [
  { key: 'executed', label: 'Executed', color: 'var(--color-success)' },
  { key: 'drafts', label: 'Drafts', color: 'var(--color-warning)' },
  { key: 'fub', label: 'CRM work', color: 'var(--color-info)' },
  { key: 'leads', label: 'Leads', color: 'var(--brand-400)' },
] as const;

interface TooltipProps { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: string }

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const shown = payload.filter((p) => p.value > 0);
  if (shown.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-bg-elevated backdrop-blur-md px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-text-primary mb-1">{label}</div>
      {shown.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-text-secondary">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {SERIES.find((s) => s.key === p.dataKey)?.label}: {p.value}
        </div>
      ))}
    </div>
  );
}

/** Daily activity momentum (stacked bar). Hidden until there's any activity. */
export function MomentumChart({ data }: { data: TrendDay[] }) {
  const hasAny = data.some((d) => d.executed + d.drafts + d.fub + d.leads > 0);
  if (!hasAny) return null;
  const totals = data.reduce((sum, day) => ({
    executed: sum.executed + day.executed,
    drafts: sum.drafts + day.drafts,
    fub: sum.fub + day.fub,
    leads: sum.leads + day.leads,
  }), { executed: 0, drafts: 0, fub: 0, leads: 0 });
  const total = Object.values(totals).reduce((sum, count) => sum + count, 0);
  const activeDays = data.filter((d) => d.executed + d.drafts + d.fub + d.leads > 0).length;
  const peak = Math.max(...data.map((d) => d.executed + d.drafts + d.fub + d.leads));
  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4 px-1">
        <div>
          <p className="text-sm font-semibold text-text-primary">Work and client activity</p>
          <p className="text-xs text-text-tertiary mt-1">Daily events · trailing 14 days · Toronto time</p>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-text-primary">{total}</span>
          <span className="text-xs text-text-tertiary">events across {activeDays} active days</span>
        </div>
      </div>
      <div style={{ height: 210 }} role="img" aria-label={`Stacked daily activity chart: ${total} events across ${activeDays} active days in the last 14 days`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 5" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(data.length / 7))} />
            <YAxis allowDecimals={false} width={34} tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--color-border)' }} content={<ChartTooltip />} />
            {SERIES.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} radius={i === SERIES.length - 1 ? [3, 3, 0, 0] : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-2 rounded-lg bg-bg-elevated px-3 py-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-secondary">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="text-xs font-semibold tabular-nums text-text-primary">{totals[s.key]}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 px-1 text-[11px] text-text-tertiary">{peak} events on the busiest day · counts reflect recorded sample actions, not estimated productivity.</p>
    </div>
  );
}
