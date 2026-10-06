import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, Target, FileText, ShieldCheck, Bell, Activity, Zap, HeartHandshake,
  DollarSign, Radio, CircleCheck, CircleAlert, MessageCircle,
} from 'lucide-react';
import { MetricTile, CopyButton } from '../components/ui';
import { GlowingEffect } from '../components/ui/GlowingEffect';
import { useCountUp } from '../hooks/useCountUp';
import { useExecutionData } from '../hooks/useExecutionData';
import { useAgentEvents } from '../hooks/useAgentEvents';
import { useUserProfile } from '../hooks/useUserProfile';
import {
  hoursGivenBack, aiWorkValue, autonomyRate, draftStats, funnel,
  painPointAttack, isExecuted, isPending, formatCurrency,
} from './metricsMap';
import { livePresence, fubCounters, dealPipeline, leadPulse, dailyTrend } from './eventMetrics';
import { CATEGORY_META, type ExecutionLogRow } from './executionTypes';
import type { DraftContext } from '../chat/draftPrompt';
import { LivePresenceBar } from './sections/LivePresenceBar';
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
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

function SectionTitle({ icon: Icon, title, hint, id }: { icon: typeof Clock; title: string; hint?: string; id?: string }) {
  return (
    // `id` is the scroll target for the 3D scene's hotspots (Hotspots.tsx) —
    // clicking a prop in the office brings you to the section that handles it.
    <div id={id} className="flex items-baseline gap-2 mb-4 mt-12 scroll-mt-16">
      <Icon size={16} className="text-accent self-center" />
      <h2 className="text-lg font-bold text-text-primary tracking-tight">{title}</h2>
      {hint && <span className="text-xs text-text-tertiary">{hint}</span>}
    </div>
  );
}

/* ── HERO ─────────────────────────────────────────────────────── */
const freshLabel = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;

function Hero({ hours, value, executed, pipelineTouched, freshAt }: {
  hours: number; value: number; executed: number; pipelineTouched: number; freshAt?: string;
}) {
  const animHours = useCountUp(hours, 1200, 1);
  const animValue = useCountUp(value, 1400);
  const animDone = useCountUp(executed, 1000);
  const animPipe = useCountUp(pipelineTouched, 1400);
  return (
    <div className="relative rounded-3xl border border-border p-2">
      <GlowingEffect glow disabled={false} blur={0} borderWidth={2} spread={80} proximity={80} inactiveZone={0.01} />
      <div className="relative overflow-hidden rounded-2xl bg-bg-surface p-8 md:p-10">
        <div className="absolute top-0 right-0 h-40 w-40 opacity-40 pointer-events-none"
          style={{ background: 'radial-gradient(circle at top right, rgba(232,115,58,0.18), transparent 70%)' }} />
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Illustrative time saved</span>
        {executed === 0 && hours === 0 && pipelineTouched === 0 ? (
          <p className="mt-4 text-xl md:text-2xl font-bold text-text-primary max-w-xl leading-snug">
            ASAP is on the clock.
            <span className="text-text-secondary font-medium"> Your hours saved, drafts, and wins land here the moment your calendar blocks run.</span>
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-x-10 gap-y-6 mt-4">
            <div>
              <div className="text-5xl md:text-6xl font-black text-text-primary tabular-nums leading-none">
                {animHours}<span className="text-2xl md:text-3xl font-bold text-text-secondary ml-1">hrs</span>
              </div>
              <div className="text-sm text-text-secondary mt-2">
                ≈ <span className="font-bold text-text-primary">{formatCurrency(animValue)}</span> estimated time value
              </div>
            </div>
            <div className="h-14 w-px bg-border hidden md:block" />
            <div>
              <div className="text-3xl font-bold text-text-primary tabular-nums leading-none">{animDone}</div>
              <div className="text-sm text-text-secondary mt-2">sample completed tasks</div>
            </div>
            {pipelineTouched > 0 && (
              <>
                <div className="h-14 w-px bg-border hidden md:block" />
                <div>
                  <div className="text-3xl font-bold text-text-primary tabular-nums leading-none">{formatCurrency(animPipe)}</div>
                  <div className="text-sm text-text-secondary mt-2">in pipeline touched</div>
                </div>
              </>
            )}
          </div>
        )}
        {freshLabel(freshAt) && (
          <p className="text-[11px] text-text-tertiary mt-6">Sample workspace activity, as of {freshLabel(freshAt)}</p>
        )}
      </div>
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
export function AsapDashboard() {
  const { logs, weekly, planner } = useExecutionData();
  const { events, connected } = useAgentEvents();
  const { profile } = useUserProfile();

  const presence = livePresence(events);
  const fub = fubCounters(events);
  const pipeline = dealPipeline(events);
  const pulse = leadPulse(events);
  const trend = dailyTrend(events);

  const monday = new Date();
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const currentWeek = monday.toISOString().slice(0, 10);
  const weekLogs = logs.filter((row) => row.week_start === currentWeek);
  const hours = hoursGivenBack(weekLogs);
  const value = aiWorkValue(hours);
  const executed = weekLogs.filter(isExecuted).length;
  const autonomy = autonomyRate(weekLogs);
  const drafts = draftStats(weekLogs);
  const f = funnel(planner);
  const pp = painPointAttack(weekLogs, planner?.bottleneck ?? null);
  const pendingDrafts = weekLogs.filter(isPending);
  const w = weekly[0];
  const planExec = weekLogs.length ? Math.round((executed / weekLogs.length) * 100) : null;

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-8 pb-28">
      {/* Greeting + live presence */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">
            {greeting()}{profile?.first_name ? `, ${profile.first_name}` : ''}
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">Here's what ASAP has been doing for you.</p>
        </div>
        <div className="flex items-center gap-2.5 pt-1">
          {connected && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />Demo
            </span>
          )}
          <LivePresenceBar presence={presence} connected={connected} />
        </div>
      </div>
      <PlanContext planner={planner} />

      <div className="mt-6">
        <Hero hours={hours} value={value} executed={executed} pipelineTouched={pipeline.pipelineValue} freshAt={presence.checkedInAt ?? logs[0]?.executed_at} />
      </div>

      {w?.summary && (
        <div className="mt-4 rounded-2xl border border-border bg-bg-surface px-5 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Your week, in a nutshell</span>
          <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{w.summary}</p>
        </div>
      )}

      {/* Live activity stream — the centerpiece */}
      <SectionTitle id="asap-activity" icon={Activity} title="Watch it work" hint="sample work and your local decisions" />
      <ActivityStream events={events} />

      {/* Lead Pulse (hidden until lead.engaged events exist) */}
      {pulse.length > 0 && (
        <>
          <SectionTitle icon={Radio} title="Your pipeline, warming" hint="illustrative relationship signals" />
          <LeadPulseBoard leads={pulse} />
        </>
      )}

      {/* This week's pulse */}
      <SectionTitle icon={Zap} title="This week's pulse" hint="current week · recorded blocks" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricTile icon={Clock} label="Time given back" value={`${hours}h`} sublabel={formatCurrency(value)} trend="up" />
        <MetricTile icon={ShieldCheck} label="Autonomy" value={autonomy !== null ? `${autonomy}%` : '—'} sublabel={autonomy !== null ? 'handled without you' : 'no data yet'} trend={autonomy !== null ? 'neutral' : undefined} />
        <MetricTile icon={FileText} label="Drafts produced" value={drafts.produced} sublabel={`${drafts.approved} approved`} trend="neutral" />
        <MetricTile icon={Target} label="Logged blocks completed" value={planExec !== null ? `${planExec}%` : '—'} sublabel={weekLogs.length ? `${executed}/${weekLogs.length} recorded blocks` : 'no data yet'} trend={planExec !== null ? 'up' : undefined} />
      </div>

      {/* The money */}
      <SectionTitle icon={DollarSign} title="Your money goal" hint="every action ladders to this number" />
      <div className="relative rounded-2xl border border-border p-1.5">
        <GlowingEffect glow disabled={false} borderWidth={2} spread={60} proximity={64} inactiveZone={0.01} />
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

      {/* Needs you */}
      <SectionTitle id="asap-needs-you" icon={Bell} title="Needs you" hint={`${pendingDrafts.length} waiting · ~10 seconds each`} />
      {pendingDrafts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg-surface px-6 py-8 text-center text-sm text-text-secondary">
          <CircleCheck size={22} className="text-success mx-auto mb-2" /> You're all caught up — nothing needs your approval.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-2">
          {pendingDrafts.map((r) => <PendingRow key={r.id} row={r} />)}
        </div>
      )}

      {/* We heard you — the realtor's own stated bottleneck, and what ASAP did about it.
        * This section is ALWAYS total: previously the outer gate was (w || bottleneck)
        * while the inner content required bottleneck, so a week with execution data and
        * no bottleneck on file rendered an empty glowing card. Now the no-bottleneck
        * branch is a real card that teaches, because bottleneck lives in the same
        * msp_success_plans row as the money goal — filling it lights up three sections. */}
      <SectionTitle icon={HeartHandshake} title="We heard you" />
      <div className="relative rounded-2xl border border-border p-1.5">
        <GlowingEffect glow disabled={false} borderWidth={2} spread={60} proximity={64} inactiveZone={0.01} />
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

      {/* System health footer */}
      <div className="mt-10 flex items-center gap-2 text-xs text-text-tertiary">
        {presence.working
          ? <><CircleAlert size={13} className="text-brand" /> ASAP is working right now</>
          : <><span className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-warning'}`} /> {connected ? 'Demo — sample workspace ready' : 'Loading sample activity…'}</>}
        {presence.lastEventAt && <span>· last activity {new Date(presence.lastEventAt).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
      </div>
    </div>
  );
}
