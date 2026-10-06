import { useMemo, useState, type ReactNode } from 'react';
import {
  Cpu, Coins, Timer, ListChecks, CheckCircle2, AlertTriangle, CircleDot, Bot,
} from 'lucide-react';
import { MetricTile, Chip, Badge, EmptyState, Skeleton } from '../components/ui';
import { useTaskLedger } from '../hooks/useTaskLedger';
import type { TaskLedgerRow } from '../analytics/tabTypes';
import { PageShell, fmtUSD, fmtTokens, fmtRuntime, fmtTime } from './_shared';

const STATUS_META: Record<string, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  ok: { icon: CheckCircle2, cls: 'text-success', label: 'ok' },
  error: { icon: AlertTriangle, cls: 'text-error', label: 'error' },
  partial: { icon: CircleDot, cls: 'text-warning', label: 'partial' },
};

const prettyType = (t: string) => t.replace(/[_-]/g, ' ');

/* One grid template shared by the header and every row, so the columns actually line up.
 * Previously each declared grid-cols-12 independently and drifted apart.
 * Task(5) Tokens(1) Cost(2) Runtime(1) When(2) Status(1) = 12. */
const GRID = 'md:grid md:grid-cols-12 md:items-center md:gap-3';

/** A right-aligned numeric cell. tabular-nums keeps digits from shifting between rows. */
function Num({ span, children, className = '' }: { span: string; children: ReactNode; className?: string }) {
  return <div className={`${span} md:text-right tabular-nums ${className}`}>{children}</div>;
}

function LedgerRow({ row }: { row: TaskLedgerRow }) {
  const s = STATUS_META[row.status] ?? STATUS_META.ok;
  const StatusIcon = s.icon;
  // Kept for support lookups, no longer competing with the action for the eye.
  const tid = row.task_id ? `#${row.task_id.slice(0, 8)}` : `#${row.id}`;

  return (
    <div
      title={`Task ${tid}`}
      className={`${GRID} px-4 py-3.5 border-b border-border/60 hover:bg-bg-elevated/50 transition-colors`}
    >
      {/* Task — the action the realtor actually reads, first and widest. */}
      <div className="md:col-span-5 min-w-0">
        <div className="text-sm text-text-primary md:truncate">{row.summary}</div>
        <div className="mt-1 flex items-center gap-2">
          <Badge label={prettyType(row.task_type)} variant="default" />
          <span className="text-[10px] font-mono text-text-tertiary">{tid}</span>
        </div>
      </div>

      {/* Metrics. On mobile these wrap into one labelled row beneath the task. */}
      <div className="mt-2 flex items-center justify-between gap-4 md:hidden text-xs">
        <span className="text-text-secondary tabular-nums">{fmtTokens(row.tokens)} tkns</span>
        <span className="text-text-secondary tabular-nums">{fmtUSD(row.cost_usd)}</span>
        <span className="text-text-tertiary tabular-nums">{fmtRuntime(row.runtime_ms)}</span>
        <span className="text-text-tertiary tabular-nums">{fmtTime(row.created_at)}</span>
        <span className={`flex items-center gap-1 ${s.cls}`}><StatusIcon size={13} />{s.label}</span>
      </div>

      <Num span="hidden md:col-span-1 md:block" className="text-sm text-text-primary">{fmtTokens(row.tokens)}</Num>
      <Num span="hidden md:col-span-2 md:block" className="text-sm font-semibold text-text-primary">{fmtUSD(row.cost_usd)}</Num>
      <Num span="hidden md:col-span-1 md:block" className="text-xs text-text-secondary">{fmtRuntime(row.runtime_ms)}</Num>
      <Num span="hidden md:col-span-2 md:block" className="text-xs text-text-tertiary">{fmtTime(row.created_at)}</Num>
      <div className="hidden md:col-span-1 md:flex items-center justify-end gap-1.5">
        <StatusIcon size={14} className={`${s.cls} shrink-0`} />
        <span className={`text-xs ${s.cls}`}>{s.label}</span>
      </div>
    </div>
  );
}

export default function Memory() {
  const { rows, loading } = useTaskLedger();
  const [type, setType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');

  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.task_type))).sort(), [rows]);

  const filtered = useMemo(
    () => rows.filter((r) => (type === 'all' || r.task_type === type) && (status === 'all' || r.status === status)),
    [rows, type, status]
  );

  const totals = useMemo(
    () =>
      filtered.reduce(
        (a, r) => ({
          tokens: a.tokens + (r.tokens ?? 0),
          cost: a.cost + (r.cost_usd ?? 0),
          runtime: a.runtime + (r.runtime_ms ?? 0),
        }),
        { tokens: 0, cost: 0, runtime: 0 }
      ),
    [filtered]
  );

  return (
    <PageShell
      badge={<span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-text-tertiary bg-bg-surface border border-border rounded-full px-2.5 py-0.5 mb-3">System Ledger</span>}
      title="Agent Memory"
      subtitle="Sample task history and your local review decisions. Token use, spend, and runtime are unavailable without a connected agent."
    >
      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricTile icon={ListChecks} label="Tasks" value={filtered.length} sublabel={type === 'all' ? 'all types' : prettyType(type)} />
        <MetricTile icon={Cpu} label="Tokens" value={filtered.some(r => r.tokens != null) ? fmtTokens(totals.tokens) : '—'} sublabel="not measured in demo" />
        <MetricTile icon={Coins} label="Spend" value={filtered.some(r => r.cost_usd != null) ? fmtUSD(totals.cost) : '—'} sublabel="not measured in demo" />
        <MetricTile icon={Timer} label="Runtime" value={filtered.some(r => r.runtime_ms != null) ? fmtRuntime(totals.runtime) : '—'} sublabel="not measured in demo" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-medium text-text-tertiary mr-1">Type</span>
        <Chip label="All" selected={type === 'all'} onClick={() => setType('all')} />
        {types.map((t) => <Chip key={t} label={prettyType(t)} selected={type === t} onClick={() => setType(t)} />)}
        <span className="w-px h-5 bg-border mx-2" />
        <span className="text-xs font-medium text-text-tertiary mr-1">Status</span>
        {['all', 'ok', 'partial', 'error'].map((s) => (
          <Chip key={s} label={s === 'all' ? 'All' : s} selected={status === s} onClick={() => setStatus(s)} />
        ))}
      </div>

      {/* Table */}
      <div className="relative rounded-2xl border border-border overflow-hidden bg-bg-surface">
        <div className={`hidden ${GRID} px-4 py-2.5 bg-bg-elevated border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-tertiary`}>
          <div className="md:col-span-5">Task</div>
          <div className="md:col-span-1 text-right">Tokens</div>
          <div className="md:col-span-2 text-right">Cost</div>
          <div className="md:col-span-1 text-right">Runtime</div>
          <div className="md:col-span-2 text-right">When</div>
          <div className="md:col-span-1 text-right">Status</div>
        </div>

        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height="20px" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No tasks logged yet"
            message="The moment ASAP runs a task, its real tokens, cost, and runtime land here — honest to the cent."
          />
        ) : (
          filtered.map((r) => <LedgerRow key={r.id} row={r} />)
        )}
      </div>
    </PageShell>
  );
}
