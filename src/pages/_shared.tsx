import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Wide page container + REMI-style header (title · subtitle · right-aligned actions). */
export function PageShell({
  title,
  subtitle,
  badge,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-8">
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          {badge}
          <h1 className="text-2xl md:text-3xl font-black text-text-primary tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-text-secondary mt-1.5 max-w-2xl leading-relaxed">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Section header — matches AsapDashboard's SectionTitle (icon · title · hint). */
export function SectionTitle({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-4 mt-10 first:mt-0">
      <Icon size={16} className="text-accent self-center" />
      <h2 className="text-lg font-bold text-text-primary tracking-tight">{title}</h2>
      {hint && <span className="text-xs text-text-tertiary">{hint}</span>}
    </div>
  );
}

/** iOS-style toggle row (label + help + switch). Shared by Alerts + Profile. */
export function Toggle({ on, onClick, label, help }: { on: boolean; onClick: () => void; label: string; help: string }) {
  return (
    <button onClick={onClick} className="flex items-start gap-3 text-left w-full group">
      <span className={`mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors relative ${on ? 'bg-accent' : 'bg-border'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${on ? 'left-4' : 'left-0.5'}`} />
      </span>
      <span>
        <span className="text-sm font-medium text-text-primary">{label}</span>
        <span className="block text-xs text-text-tertiary">{help}</span>
      </span>
    </button>
  );
}

/* ── formatters ─────────────────────────────────────────────────── */

/** Dollars — 4 decimals for sub-dollar micro-costs (e.g. $0.0072), 2 above. */
export function fmtUSD(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (v === 0) return '$0';
  if (Math.abs(v) < 1) return `$${v.toFixed(4)}`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Compact token counts: 1,240 · 12.4K · 3.1M. */
export function fmtTokens(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(1)}K`;
  return `${(v / 1_000_000).toFixed(2)}M`;
}

/** Runtime ms → human (820ms · 2.4s · 1m 05s). */
export function fmtRuntime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
}

/** Absolute timestamp in the realtor's timezone (Toronto). */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Relative time (just now · 5m ago · 3h ago · 2d ago). */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
