import { Activity } from 'lucide-react';
import { describeEvent } from '../describeEvent';
import type { AgentEventRow } from '../agentEventTypes';

const timeShort = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });

/** The centerpiece — a live feed of everything ASAP does, in plain English.
 *  New events slide in at the top via Realtime. */
export function ActivityStream({ events }: { events: AgentEventRow[] }) {
  const shown = events.filter((e) => e.event_type !== 'system.heartbeat').slice(0, 14);

  if (shown.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-bg-surface px-6 py-12 text-center">
        <div className="w-11 h-11 rounded-full bg-accent/5 flex items-center justify-center mx-auto mb-3">
          <Activity size={20} className="text-text-tertiary" />
        </div>
        <h3 className="text-base font-semibold text-text-primary">Nothing yet — but ASAP is watching your calendar</h3>
        <p className="text-sm text-text-secondary mt-1 max-w-sm mx-auto leading-relaxed">
          The moment a block runs, everything ASAP does for you streams in here, live and in plain language.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {shown.map((e) => {
        const d = describeEvent(e);
        const Icon = d.icon;
        return (
          <div
            key={e.id}
            className="animate-fade-in flex items-start gap-3 rounded-xl border border-border bg-bg-surface px-4 py-3 hover:border-border-hover transition-colors"
          >
            <span className="mt-0.5 shrink-0" style={{ color: d.accent }}><Icon size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-primary leading-snug">{d.sentence}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-tertiary">
                <span className="font-mono">{timeShort(e.created_at)}</span>
                {d.detail && <><span>·</span><span className="truncate">{d.detail}</span></>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
