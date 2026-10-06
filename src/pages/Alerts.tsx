import { useMemo, useState } from 'react';
import {
  Zap, Clock, CalendarDays, Bell, BellRing, ShieldCheck, MessageSquare, Mail, Monitor, Moon,
  ExternalLink, CheckCheck, RotateCcw,
} from 'lucide-react';
import { MetricTile, Chip, Badge, Card, EmptyState, Skeleton, CopyButton } from '../components/ui';
import { useAlerts, type AlertStatus } from '../hooks/useAlerts';
import type { AlertRow, AlertPrefs } from '../analytics/tabTypes';
import { PageShell, SectionTitle, Toggle, relTime, fmtTime } from './_shared';

const SEV_VARIANT: Record<string, 'error' | 'warning' | 'info'> = {
  urgent: 'error',
  warning: 'warning',
  info: 'info',
};
const STATUS_VARIANT: Record<string, 'success' | 'default' | 'accent'> = {
  active: 'success',
  acknowledged: 'default',
  resolved: 'default',
  snoozed: 'accent',
};

const isToday = (iso: string) => {
  const d = new Date(iso);
  const n = new Date();
  return d.toDateString() === n.toDateString();
};
const withinDays = (iso: string, days: number) => Date.now() - new Date(iso).getTime() < days * 86_400_000;

/* The plain-text block the realtor pastes into Telegram and then types instructions
 * under. Deliberately ASCII-only for the same reason the Hermes skill files are:
 * smart quotes and em-dashes corrupt on paste into Telegram. Carries no row id,
 * table name, or severity enum — the realtor is forwarding a heads-up, not a log
 * line (SOUL.md rules 1 and 2). */
function telegramPayload(a: AlertRow): string {
  const when = fmtTime(a.last_triggered_at ?? a.created_at);
  const lines = [
    `ASAP flagged: ${a.title}`,
    a.body ? `` : null,
    a.body ?? null,
    ``,
    `Type: ${a.kind.replace(/_/g, ' ')}`,
    `Flagged: ${when}`,
    a.related_url ? `Link: ${a.related_url}` : null,
    ``,
    `What I want you to do:`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

function AlertCard({ a, onSetStatus }: { a: AlertRow; onSetStatus: (id: number, s: AlertStatus) => void }) {
  const Icon = a.severity === 'urgent' ? BellRing : Bell;
  const isActive = a.status === 'active';

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">{a.title}</span>
            <Badge label={a.status} variant={STATUS_VARIANT[a.status] ?? 'default'} />
            {a.severity !== 'info' && <Badge label={a.severity} variant={SEV_VARIANT[a.severity] ?? 'info'} />}
          </div>
          {a.body && <p className="text-xs text-text-secondary mt-1 leading-relaxed">{a.body}</p>}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-text-tertiary">
            <span className="capitalize">{a.kind.replace(/_/g, ' ')}</span>
            {a.channel && <span>· via {a.channel}</span>}
            <span>· {relTime(a.last_triggered_at ?? a.created_at)}</span>
          </div>

          {/* Actions. The card itself is deliberately NOT a click target — it holds
            * several controls, and a card-wide handler around inner buttons is an
            * accessibility trap. */}
          <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-border/60">
            <CopyButton text={telegramPayload(a)} label="Copy for Telegram" copiedLabel="Copied" />

            {/* Rendered only when a real link exists — never a dead button. */}
            {a.related_url && (
              <a
                href={a.related_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
              >
                <ExternalLink size={12} /> Open
              </a>
            )}

            {isActive ? (
              <>
                <button
                  type="button"
                  onClick={() => onSetStatus(a.id, 'acknowledged')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary cursor-pointer"
                >
                  <CheckCheck size={12} /> Acknowledge
                </button>
                <button
                  type="button"
                  onClick={() => onSetStatus(a.id, 'snoozed')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary cursor-pointer"
                >
                  <Clock size={12} /> Snooze
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onSetStatus(a.id, 'active')}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary cursor-pointer"
              >
                <RotateCcw size={12} /> Reopen
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ── Contact-preferences editor (asap_alert_prefs) ─────────────────── */
const CHANNELS = [
  { key: 'telegram', label: 'Telegram', icon: MessageSquare },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'in_app', label: 'In-app', icon: Monitor },
];

function PrefsEditor({ prefs, saving, onSave }: { prefs: AlertPrefs; saving: boolean; onSave: (p: Partial<AlertPrefs>) => void }) {
  const timeInput = 'bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent';
  return (
    <Card padding="lg">
      <div className="flex flex-col gap-6">
        <div>
          <div className="text-sm font-semibold text-text-primary mb-2">Preferred channel</div>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => (
              <Chip key={c.key} label={c.label} icon={c.icon} selected={prefs.channel === c.key} onClick={() => onSave({ channel: c.key })} />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-2">
            <Moon size={14} className="text-accent" /> Quiet hours
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="time" className={timeInput} value={(prefs.quiet_hours_start ?? '21:00:00').slice(0, 5)} onChange={(e) => onSave({ quiet_hours_start: `${e.target.value}:00` })} />
            <span className="text-sm text-text-tertiary">to</span>
            <input type="time" className={timeInput} value={(prefs.quiet_hours_end ?? '08:00:00').slice(0, 5)} onChange={(e) => onSave({ quiet_hours_end: `${e.target.value}:00` })} />
            <span className="text-xs text-text-tertiary ml-1">{prefs.timezone}</span>
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-text-primary mb-2">Digest frequency</div>
          <div className="flex flex-wrap gap-2">
            {['instant', 'daily', 'weekly', 'off'].map((f) => (
              <Chip key={f} label={f} selected={prefs.digest_frequency === f} onClick={() => onSave({ digest_frequency: f })} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-5">
          <Toggle on={prefs.urgent_override} onClick={() => onSave({ urgent_override: !prefs.urgent_override })}
            label="Urgent alerts bypass quiet hours" help="Time-critical items (deadlines, hot leads) still reach you at night." />
          <Toggle on={prefs.consent} onClick={() => onSave({ consent: !prefs.consent })}
            label="Consent to be contacted" help="CASL-style consent. Turn off and ASAP will never message you." />
        </div>

        <div className="text-[11px] text-text-tertiary">{saving ? 'Saving…' : 'Changes save automatically.'}</div>
      </div>
    </Card>
  );
}

export default function Alerts() {
  const { alerts, prefs, loading, saving, savePrefs, setAlertStatus } = useAlerts();
  const [filter, setFilter] = useState<'all' | 'active' | 'acknowledged'>('all');

  const stats = useMemo(
    () => ({
      active: alerts.filter((a) => a.status === 'active').length,
      today: alerts.filter((a) => isToday(a.created_at)).length,
      week: alerts.filter((a) => withinDays(a.created_at, 7)).length,
      total: alerts.length,
    }),
    [alerts]
  );

  const shown = alerts.filter((a) => filter === 'all' || a.status === filter);

  return (
    <PageShell
      title="Alerts"
      subtitle="ASAP watches your pipeline and calendar around the clock and reaches out the moment something needs you — on your terms."
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricTile icon={Zap} label="Active" value={stats.active} sublabel="need attention" />
        <MetricTile icon={Clock} label="Today" value={stats.today} sublabel="fired today" />
        <MetricTile icon={CalendarDays} label="This week" value={stats.week} sublabel="last 7 days" />
        <MetricTile icon={Bell} label="Total" value={stats.total} sublabel="all time" />
      </div>

      <SectionTitle icon={BellRing} title="Recent alerts" hint="everything ASAP flagged for you" />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['all', 'active', 'acknowledged'] as const).map((f) => (
          <Chip key={f} label={f === 'all' ? `All (${stats.total})` : f} selected={filter === f} onClick={() => setFilter(f)} />
        ))}
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} height="88px" rounded="lg" />)}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg-surface">
          <EmptyState icon={ShieldCheck} title="All quiet" message="Nothing needs you right now. ASAP will surface anything time-sensitive here and reach you through your chosen channel." />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">{shown.map((a) => <AlertCard key={a.id} a={a} onSetStatus={setAlertStatus} />)}</div>
      )}

      <SectionTitle icon={ShieldCheck} title="How ASAP reaches you" hint="the contract — when and how" />
      {prefs ? <PrefsEditor prefs={prefs} saving={saving} onSave={savePrefs} /> : <Skeleton height="320px" rounded="lg" />}
    </PageShell>
  );
}
