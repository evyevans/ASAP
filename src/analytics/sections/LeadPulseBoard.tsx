import type { LeadPulseEntry } from '../eventMetrics';

const PULSE: Record<string, { label: string; color: string }> = {
  hot:     { label: 'Hot',     color: 'var(--color-error)' },
  warming: { label: 'Warming', color: 'var(--color-deal-hot)' },
  cooling: { label: 'Cooling', color: 'var(--color-info)' },
  cold:    { label: 'Cold',    color: 'var(--color-text-tertiary)' },
};
const titleCase = (s?: string) => (s ?? '').replace(/_/g, ' ');

/** Hermes's 10× idea: a live lead-temperature board. Hidden until lead.engaged
 *  events exist, so it never shows an empty shell. */
export function LeadPulseBoard({ leads }: { leads: LeadPulseEntry[] }) {
  if (leads.length === 0) return null;
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {leads.slice(0, 9).map((l) => {
        const pk = PULSE[l.pulse] ?? PULSE.warming;
        return (
          <div key={l.leadId} className="rounded-xl border border-border bg-bg-surface p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-text-primary truncate">{l.name}</span>
              <span className="flex items-center gap-1 text-[11px] font-semibold shrink-0" style={{ color: pk.color }}>
                <span className="h-2 w-2 rounded-full" style={{ background: pk.color }} />{pk.label}
              </span>
            </div>
            <div className="text-[11px] text-text-tertiary mt-1 truncate">
              {l.stage ? `${l.stage} · ` : ''}{l.action ? titleCase(l.action) : 'touched by ASAP'}
              {l.days != null ? ` · ${l.days}d since contact` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}
