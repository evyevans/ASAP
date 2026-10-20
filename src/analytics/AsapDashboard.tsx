import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Target, FileText, ShieldCheck, Bell, Activity, Zap, HeartHandshake,
  DollarSign, Radio, CircleCheck, MessageCircle,
} from 'lucide-react';
import { MetricTile, CopyButton } from '../components/ui';
import type { ExecutionData } from '../hooks/useExecutionData';
import { useAgentEvents } from '../hooks/useAgentEvents';
import {
  autonomyRate, draftStats, funnel,
  painPointAttack, isExecuted, isPending, formatCurrency,
} from './metricsMap';
import { fubCounters, dealPipeline, leadPulse, dailyTrend } from './eventMetrics';
import { CATEGORY_META, type ExecutionLogRow } from './executionTypes';
import type { DraftContext } from '../chat/draftPrompt';
import { PlanContext } from './sections/PlanContext';
import { ActivityStream } from './sections/ActivityStream';
import { LeadPulseBoard } from './sections/LeadPulseBoard';
import { MomentumChart } from './sections/MomentumChart';

const catMeta = (c: string | null | undefined) => CATEGORY_META[c ?? 'unresolved'] ?? CATEGORY_META.unresolved;

/* The exact sentence the realtor sends ASAP to fill in their success plan. ASCII-only —
 * it gets pasted into Telegram, where smart quotes corrupt. Deliberately asks for the
 * money figures alongside the bottleneck: they all land in one msp_success_plans row,
 * so one message lights up "Your money goal", "We heard you", and the Profile tab. */
const BOTTLENECK_PROMPT =
  "My biggest bottleneck right now is ___. My monthly income goal is $___ and my average commission per deal is $___.";

function SectionTitle({ icon: Icon, title, hint, id }: { icon: typeof Target; title: string; hint?: string; id?: string }) {
  return (
    // Stable targets serve Home links and the optional presence surface.
    <div id={id} className="flex flex-wrap items-baseline gap-2 mb-4 mt-6 scroll-mt-16">
      <Icon size={16} className="text-accent self-center" />
      <h2 className="text-lg font-bold text-text-primary tracking-tight">{title}</h2>
      {hint && <span className="text-xs text-text-tertiary">{hint}</span>}
    </div>
  );
}

function FunnelStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${accent ? 'text-accent' : 'text-text-primary'}`}>{value}</div>
    </div>
  );
}

/* Not every pending draft is a yes/no decision. A content draft might need to
 * be posted to Instagram, saved to Drive, or held; a deal document might need
 * to go to another agent instead of just being "approved". Rather than build
 * one button per possible action per category — a combinatorial mess that is
 * always one action behind what a realtor actually wants — this card shortcuts
 * straight into Chat, prefilled with the draft's own context (draftPrompt.ts),
 * so the direction can be anything: "post this", "save to Drive", "hold it". */
function PendingRow({ row }: { row: ExecutionLogRow }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const full = row.artifact_text || row.output_summary || '';
  const long = (row.artifact_text ?? '').length > (row.output_summary ?? '').length;

  const giveDirection = () => {
    const draft: DraftContext = {
      id: row.id,
      title: (row.block_title ?? 'Draft').replace(/^\[[^\]]*\]\s*/, ''),
      category: row.block_category,
      summary: full,
    };
    navigate('/chat', { state: { draft } });
  };

  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ color: catMeta(row.block_category).accent, background: 'color-mix(in srgb, currentColor 12%, transparent)' }}>
          {catMeta(row.block_category).label}
        </span>
      </div>
      <div className="text-sm font-semibold text-text-primary">{(row.block_title ?? 'Draft').replace(/^\[[^\]]*\]\s*/, '')}</div>
      <p className={`text-xs text-text-secondary mt-1 leading-snug ${open ? '' : 'line-clamp-2'}`}>{full}</p>
      <div className="flex items-center gap-3 mt-2">
        {long && (
          <button onClick={() => setOpen((o) => !o)} className="text-[11px] font-medium text-accent hover:opacity-80">
            {open ? 'Show less' : 'Read the full draft'}
          </button>
        )}
        <button
          onClick={giveDirection}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-primary
            rounded-full border border-border bg-bg-elevated px-2.5 py-1 hover:border-border-hover
            transition-colors ml-auto"
        >
          <MessageCircle size={12} />
          Give ASAP direction
        </button>
      </div>
    </div>
  );
}

/* ── MAIN ──────────────────────────────────────────────────────── */
export function AsapDashboard({ execution }: { execution: ExecutionData }) {
  const { logs, weekly, planner, loading } = execution;
  const { events } = useAgentEvents();

  const fub = fubCounters(events);
  const pipeline = dealPipeline(events);
  const pulse = leadPulse(events);
  const trend = dailyTrend(events);

  const monday = new Date();
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const currentWeek = monday.toISOString().slice(0, 10);
  const weekLogs = logs.filter((row) => row.week_start === currentWeek);
  const executed = weekLogs.filter(isExecuted).length;
  const autonomy = autonomyRate(weekLogs);
  const drafts = draftStats(weekLogs);
  const f = funnel(planner);
  const pp = painPointAttack(weekLogs, planner?.bottleneck ?? null);
  const pendingDrafts = logs.filter(isPending);
  const w = weekly[0];
  const planExec = weekLogs.length ? Math.round((executed / weekLogs.length) * 100) : null;

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 pt-6 pb-28">
      {/* Needs you */}
      <SectionTitle id="asap-needs-you" icon={Bell} title="Needs you" hint={loading ? 'Loading drafts…' : `${pendingDrafts.length} waiting for your direction`} />
      {loading ? (
        <p className="min-h-24 text-sm text-text-tertiary" role="status">Checking your draft queue…</p>
      ) : pendingDrafts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg-surface px-6 py-8 text-center text-sm text-text-secondary">
          <CircleCheck size={22} className="text-success mx-auto mb-2" /> You're all caught up — nothing needs your approval.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-2">
          {pendingDrafts.map((r) => <PendingRow key={r.id} row={r} />)}
        </div>
      )}

      <details id="asap-activity" className="mt-8 scroll-mt-16 rounded-xl border border-border bg-bg-surface px-4">
        <summary className="home-control cursor-pointer rounded-md py-4 text-sm font-semibold text-text-primary">Work log <span className="font-normal text-text-tertiary">· Recent activity</span></summary>
        <div className="pb-4"><ActivityStream events={events} /></div>
      </details>

      <details className="mt-4 rounded-xl border border-border px-4 md:px-6">
        <summary className="home-control cursor-pointer rounded-md py-4 text-sm font-semibold text-text-primary">Weekly insights <span className="font-normal text-text-tertiary">· Goals, pipeline, and performance</span></summary>
        <div className="pb-6">
          {/* Context and evidence. Greeting, pending drafts, and hours live in CommandHeader. */}
          <PlanContext planner={planner} />

          {w?.summary && (
            <div className="mt-4 rounded-2xl border border-border bg-bg-surface px-5 py-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Your week, in a nutshell</span>
              <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{w.summary}</p>
            </div>
          )}

          {/* Lead Pulse (hidden until lead.engaged events exist) */}
          {pulse.length > 0 && (
            <>
              <SectionTitle icon={Radio} title="Your pipeline, warming" hint="illustrative relationship signals" />
              <LeadPulseBoard leads={pulse} />
            </>
          )}

          {/* This week's pulse */}
          <SectionTitle icon={Zap} title="This week's pulse" hint="current week · recorded blocks" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricTile icon={ShieldCheck} label="Autonomy" value={autonomy !== null ? `${autonomy}%` : '—'} sublabel={autonomy !== null ? 'handled without you' : 'no data yet'} trend={autonomy !== null ? 'neutral' : undefined} />
            <MetricTile icon={FileText} label="Drafts produced" value={drafts.produced} sublabel={`${drafts.approved} approved`} trend="neutral" />
            <MetricTile icon={Target} label="Logged blocks completed" value={planExec !== null ? `${planExec}%` : '—'} sublabel={weekLogs.length ? `${executed}/${weekLogs.length} recorded blocks` : 'no data yet'} trend={planExec !== null ? 'up' : undefined} />
          </div>

          {/* The money */}
          <SectionTitle icon={DollarSign} title="Your money goal" hint="every action ladders to this number" />
          <div className="relative rounded-2xl border border-border p-1.5">
            <div className="relative rounded-xl bg-bg-surface p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
              <FunnelStat label="Monthly target" value={formatCurrency(f.goalIncome)} />
              <FunnelStat label="Per deal" value={formatCurrency(f.avgCommission)} />
              <FunnelStat label="Deals needed" value={f.dealsNeeded !== null ? String(f.dealsNeeded) : '—'} />
              {pipeline.pipelineValue > 0
                ? <FunnelStat label="Commission at stake" value={formatCurrency(pipeline.commissionAtStake)} accent />
                : <FunnelStat label="Projected" value={f.dealsNeeded && f.avgCommission ? formatCurrency(f.dealsNeeded * f.avgCommission) : '—'} accent />}
            </div>
          </div>

          {/* What it handled (FUB counters) — hidden until FUB events flow */}
          {fub.total > 0 && (
            <>
              <SectionTitle icon={CircleCheck} title="What it handled for you" hint="CRM busywork, done" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Notes logged', v: fub.notes },
                  { label: 'Tasks completed', v: fub.tasksCompleted },
                  { label: 'Appointments booked', v: fub.appointments },
                  { label: 'Leads advanced', v: fub.stageAdvances },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-border bg-bg-surface p-4">
                    <div className="text-2xl font-bold text-text-primary tabular-nums">{s.v}</div>
                    <div className="text-xs text-text-secondary mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* We heard you — the realtor's own stated bottleneck, and what ASAP did about it.
            * This section is ALWAYS total: previously the outer gate was (w || bottleneck)
            * while the inner content required bottleneck, so a week with execution data and
            * no bottleneck on file rendered an empty glowing card. Now the no-bottleneck
            * branch is a real card that teaches, because bottleneck lives in the same
            * msp_success_plans row as the money goal — filling it lights up three sections. */}
          <SectionTitle icon={HeartHandshake} title="We heard you" />
          <div className="relative rounded-2xl border border-border p-1.5">
            <div className="relative rounded-xl bg-bg-surface p-6">
              {planner?.bottleneck ? (
                <>
                  <p className="text-sm text-text-secondary">
                    You told us your biggest challenge is <span className="font-semibold text-text-primary">"{planner.bottleneck}"</span>.
                  </p>
                  <p className="text-base text-text-primary mt-2 font-medium">
                    {/* Never dress a zero as a win — if nothing hit it, say so plainly. */}
                    {pp.category && pp.attacked > 0
                      ? <>This week ASAP ran <span className="font-black text-accent tabular-nums">{pp.attacked}</span> {catMeta(pp.category).label.toLowerCase()} block{pp.attacked === 1 ? '' : 's'} aimed squarely at it.</>
                      : pp.category
                        ? <>No {catMeta(pp.category).label.toLowerCase()} blocks have run against it yet this week.</>
                        : <>ASAP is prioritising work that attacks it directly.</>}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-text-primary">
                    Tell ASAP what's actually in your way.
                  </p>
                  <p className="text-sm text-text-secondary mt-1.5 leading-relaxed max-w-xl">
                    Name your bottleneck once and ASAP starts weighting your week against it — and
                    the same answer fills in your money goal above. Send it on Telegram:
                  </p>
                  <div className="mt-3 flex items-start gap-2 flex-wrap">
                    <code className="text-xs text-text-primary bg-bg-elevated border border-border rounded-lg px-3 py-2 leading-relaxed">
                      {BOTTLENECK_PROMPT}
                    </code>
                    <CopyButton text={BOTTLENECK_PROMPT} label="Copy" className="mt-1" />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Momentum (hidden until there's activity) */}
          {trend.some((d) => d.executed + d.drafts + d.fub + d.leads > 0) && (
            <>
              <SectionTitle icon={Activity} title="Momentum" hint="a daily view across work, CRM, and leads" />
              <MomentumChart data={trend} />
            </>
          )}

        </div>
      </details>
    </div>
  );
}
