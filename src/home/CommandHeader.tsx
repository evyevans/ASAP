/* CommandHeader — Home's first fold.

   Replaces the tuxedo video plate. The agent state still comes from
   sceneDirector; only the costume is gone. Greeting, the decision that
   needs a human, quiet metrics, and the last three events. Every control
   is a door into work. */

import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgentEvents } from '../hooks/useAgentEvents';
import { useAlerts } from '../hooks/useAlerts';
import { useVoiceSignal } from '../agent/useVoiceSignal';
import type { ExecutionData } from '../hooks/useExecutionData';
import { useUserProfile } from '../hooks/useUserProfile';
import { hoursGivenBack, aiWorkValue, formatCurrency, isExecuted, isPending } from '../analytics/metricsMap';
import { describeEvent } from '../analytics/describeEvent';
import { directScene } from '../presence/sceneDirector';
import type { AgentEventRow } from '../analytics/agentEventTypes';

const NextCommitment = lazy(() => import('./NextCommitment'));

const SEVERITY_ORDER = { critical: 3, warning: 2, info: 1 } as const;

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

function thisWeekStart(): string {
  const monday = new Date();
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return monday.toISOString().slice(0, 10);
}

/** Where a logged event should take you. Home hashes stay on this page. */
function eventHref(type: string): string {
  if (type.startsWith('cal.') || type === 'fub.appointment_booked' || type === 'ext.calendar_event_created') {
    return '/calendar';
  }
  if (type.startsWith('match.') || type === 'listing.ingested' || type === 'research.compiled') {
    return '/map';
  }
  if (type.startsWith('fub.') || type.startsWith('lead.') || type.startsWith('doc.') || type.startsWith('client.')) {
    return '/clients';
  }
  if (type === 'system.error' || type === 'block.failed') return '/alerts';
  if (type === 'block.needs_approval' || type.startsWith('draft.')) return '#asap-needs-you';
  return '#asap-activity';
}

function scrollToId(id: string) {
  const target = document.querySelector(id);
  if (target instanceof HTMLDetailsElement) target.open = true;
  target?.scrollIntoView({ block: 'start' });
}

export function CommandHeader({ execution }: { execution: ExecutionData }) {
  const navigate = useNavigate();
  const { events, connected, loading: activityLoading } = useAgentEvents();
  const alerts = useAlerts();
  const voice = useVoiceSignal();
  const { logs, planner, loading } = execution;
  const pendingDrafts = logs.filter(isPending);
  const { profile } = useUserProfile();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeAlerts = alerts.alerts.filter((a) => a.status === 'active');
  let alertSeverity: 'info' | 'warning' | 'critical' | null = null;
  for (const a of activeAlerts) {
    const s = a.severity as keyof typeof SEVERITY_ORDER | undefined;
    if (!s || !(s in SEVERITY_ORDER)) continue;
    if (!alertSeverity || SEVERITY_ORDER[s] > SEVERITY_ORDER[alertSeverity]) alertSeverity = s;
  }

  const scene = directScene({
    connected,
    events,
    pendingApprovals: pendingDrafts.length,
    activeAlerts: activeAlerts.length,
    alertSeverity,
    plannedEvents: planner?.events ?? [],
    executedTitles: logs.filter(isExecuted).map((l) => l.block_title ?? '').filter(Boolean),
    voice,
    now,
  });

  const weekLogs = logs.filter((row) => row.week_start === thisWeekStart());
  const hours = hoursGivenBack(weekLogs);
  const value = aiWorkValue(hours);
  const ticker = events.filter((e) => e.event_type !== 'system.heartbeat').slice(0, 3);
  const pending = pendingDrafts.length;
  const alertCount = activeAlerts.length;
  const name = profile?.first_name || 'Guest';

  const openWork = (href: string) => {
    if (href.startsWith('#')) scrollToId(href);
    else navigate(href);
  };

  const reviewDraft = () => {
    const draft = pendingDrafts[0];
    if (!draft) return;
    navigate('/chat', {
      state: { draft: {
        id: draft.id,
        title: (draft.block_title ?? 'Draft').replace(/^\[[^\]]*\]\s*/, ''), category: draft.block_category,
        summary: draft.artifact_text || draft.output_summary || '',
      } },
    });
  };

  const onEvent = (e: AgentEventRow) => openWork(eventHref(e.event_type));
  const headline = loading ? 'Checking what needs you…' : pending > 0
    ? `${pending} draft${pending === 1 ? ' needs' : 's need'} your direction.`
    : scene.beat.label;
  const caption = loading ? 'Bringing your workspace up to date.' : pending > 0
    ? 'Review the draft and give ASAP your direction.'
    : scene.beat.caption;

  return (
    <header className="home-surface pb-6 border-b border-border">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm text-text-secondary">{greeting()}, {name}</p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-text-primary max-w-2xl" aria-live="polite">
            {headline}
          </h1>
          <p className="mt-2 text-sm text-text-secondary max-w-xl">{caption}</p>
        </div>
        <div className="flex flex-col items-end gap-2 pt-1 text-[11px] text-text-tertiary">
          <span>Sample workspace</span>
          <span className="inline-flex items-center gap-1.5" role="status">
            <span className={"w-1.5 h-1.5 rounded-full " + (activityLoading ? 'bg-text-tertiary' : connected ? 'bg-success' : 'bg-warning')} aria-hidden="true" />
            {activityLoading ? 'Loading activity' : connected ? 'Local activity ready' : 'Activity feed unavailable'}
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {loading ? (
          <button type="button" disabled className="min-h-11 rounded-lg bg-bg-elevated px-4 py-2 text-sm text-text-tertiary">Loading drafts…</button>
        ) : pending > 0 ? (
          <button
            type="button"
            onClick={reviewDraft}
            className="home-control inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text-on-accent hover:opacity-95"
          >
            Review next draft
          </button>
        ) : (
          <button
            type="button"
            onClick={() => scrollToId('#asap-activity')}
            className="home-control inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text-on-accent hover:opacity-95"
          >
            See what ran
          </button>
        )}
        {alertCount > 0 && (
          <button
            type="button"
            onClick={() => navigate('/alerts')}
            className="home-control inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary hover:border-border-hover"
          >
            {alertCount} alert{alertCount === 1 ? '' : 's'}
          </button>
        )}
      </div>

      <Suspense fallback={<p className="mt-5 min-h-11 text-sm text-text-tertiary">Loading your calendar…</p>}>
        <NextCommitment now={now} />
      </Suspense>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">This week</dt>
          <dd className="mt-1 text-sm text-text-primary tabular-nums">
            {loading ? 'Loading weekly totals…' : <>{hours.toFixed(1)} hrs given back
            <span className="text-text-tertiary"> · {formatCurrency(value)} estimated time value</span></>}
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Latest activity</h2>
        {activityLoading ? (
          <p className="mt-2 text-sm text-text-tertiary">Loading recent work…</p>
        ) : ticker.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">
            Nothing yet — the moment a calendar block runs, it appears here.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {ticker.map((e) => {
              const d = describeEvent(e);
              const Icon = d.icon;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onEvent(e)}
                    className="home-control min-h-11 w-full flex items-start gap-2.5 py-2.5 text-left hover:bg-bg-surface -mx-1 px-1 rounded-md"
                  >
                    <span className="mt-0.5 shrink-0 text-text-tertiary">
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-text-primary leading-snug">
                      {e.payload?.block_title?.replace(/^\[[^\]]*\]\s*/, '') || d.sentence}
                    </span>
                    <time dateTime={e.created_at} className="shrink-0 text-xs tabular-nums text-text-tertiary">
                      {new Date(e.created_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
                    </time>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <a href="#asap-activity" onClick={() => scrollToId('#asap-activity')} className="home-control mt-2 inline-flex min-h-11 items-center rounded-md text-sm font-medium text-text-secondary">View work log →</a>
      </div>
    </header>
  );
}
