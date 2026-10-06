import type { LivePresence } from '../eventMetrics';

const clean = (t?: string) => (t ?? '').replace(/^\[[^\]]*\]\s*/, '').trim();

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

/** The breathing status line — the heartbeat that makes the dashboard feel alive. */
export function LivePresenceBar({ presence, connected }: { presence: LivePresence; connected: boolean }) {
  if (presence.working) {
    return (
      <div className="flex items-center gap-2.5 text-sm">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: 'var(--brand-400)' }} />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: 'var(--brand-400)' }} />
        </span>
        <span className="text-text-primary font-medium">
          Sample activity: <span className="text-brand">{clean(presence.title) || 'your plan'}</span>…
        </span>
      </div>
    );
  }
  const last = presence.checkedInAt;
  return (
    <div className="flex items-center gap-2.5 text-sm text-text-secondary">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: connected ? 'var(--color-success)' : 'var(--color-text-tertiary)' }} />
      <span>Sample workspace ready{last ? ` · last sample event ${timeAgo(last)}` : ''}</span>
    </div>
  );
}
