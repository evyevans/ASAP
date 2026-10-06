/* ═══════════════════════════════════════════════════════════════════════════
   Hotspots — how you actually operate the scene.

   ACCESSIBILITY IS THE REASON FOR THE ARCHITECTURE
   The obvious way to make 3D objects clickable is raycasting against the mesh.
   It is also invisible to a screen reader, impossible to reach with Tab, and
   has no focus ring. So instead the hotspots are REAL DOM <button> elements in
   an overlay. They tab, they announce, they focus-ring — and they happen to sit
   on top of whatever is behind them.

   THIS FILE MUST NOT IMPORT THREE.JS. Keep it that way.
   `HotspotProjector` — the part that needs a camera — lives in its own file for
   a measured reason: Home's hero is a video now, so `CharacterPlate` imports
   `HotspotLayer` and drags this module into the EAGER bundle. While three was in
   here, Rollup hoisted it out of the lazy Chat chunk into the shared one and the
   main bundle went 842 kB -> 1,665 kB. Splitting on the real dependency
   boundary put it back.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Bell, Brain, Activity, FileText, Loader2, MessageCircle } from 'lucide-react';
import type { Hotspot, Readouts } from './sceneDirector';
import type { ApprovalsData } from './useApprovals';
import type { AlertsData } from '../hooks/useAlerts';
import type { DraftContext } from '../chat/draftPrompt';

export type HotspotId = Hotspot['id'];

export type AnchorRefs = Partial<Record<HotspotId, HTMLElement | null>>;

/* ── Overlay: ordinary DOM, no camera, no three ───────────────────────────*/

const ICON: Record<HotspotId, typeof Bell> = {
  tray: FileText,
  phone: Bell,
  board: Activity,
  monitor: Activity,
  cabinet: Brain,
};

/** Compact labels for `layout="row"`, where there is no 3D prop underneath the
 *  chip to say what it refers to. The full `hotspot.label` stays as the
 *  aria-label, so screen readers keep the richer wording either way. */
const ROW_LABEL: Record<HotspotId, string> = {
  tray: 'Drafts',
  phone: 'Alerts',
  board: 'This week',
  monitor: 'Activity',
  cabinet: 'Memory',
};

interface LayerProps {
  hotspots: Hotspot[];
  readouts: Readouts;
  approvals: ApprovalsData;
  alerts: AlertsData;
  anchors: React.MutableRefObject<AnchorRefs>;
  /**
   * How the chips are positioned.
   *
   * `projected` (default) — HotspotProjector writes a per-frame transform onto
   * each button so it tracks its prop in the 3D scene.
   *
   * `row` — a static flex row. Home now shows a rendered VIDEO of the character
   * rather than a live 3D scene, and a video has no camera to project through.
   * Everything that made these hotspots worth having still works: they are the
   * same real <button> elements, they open the same approval and alert cards,
   * they commit the same writes. Only the positioning changes.
   */
  layout?: 'projected' | 'row';
}

export function HotspotLayer({ hotspots, approvals, alerts, anchors, layout = 'projected' }: LayerProps) {
  const row = layout === 'row';
  const navigate = useNavigate();
  const [open, setOpen] = useState<HotspotId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Escape closes the card — table stakes for anything modal-ish.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Move focus into the card when it opens, so keyboard users land inside it.
  useEffect(() => {
    if (open && cardRef.current) {
      cardRef.current.querySelector<HTMLElement>('button, [tabindex]')?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const scrollTo = (selector: string) => {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const activate = (id: HotspotId) => {
    switch (id) {
      case 'tray': setOpen(open === 'tray' ? null : 'tray'); break;
      case 'phone': setOpen(open === 'phone' ? null : 'phone'); break;
      case 'board': scrollTo('#asap-needs-you'); break;
      case 'monitor': scrollTo('#asap-activity'); break;
      case 'cabinet': navigate('/memory'); break;
    }
  };

  const onDecide = async (rowId: number, approved: boolean) => {
    const res = await approvals.decide(rowId, approved);
    setToast(res.ok
      ? (approved ? 'Approved in this demo — nothing sent.' : 'Held for revision in this demo.')
      : (res.error ?? 'That didn\'t go through.'));
  };

  /* Approve/Reject only covers a plain yes/no. Some drafts need something more
   * specific than that — "post this to Instagram", "send it to the other
   * agent" — so this shortcuts straight into Chat with the draft's own context
   * already typed (draftPrompt.ts), rather than adding a button per possible
   * action per category. */
  const giveDirection = (row: { id: number; title: string; summary: string; category: string | null }) => {
    const draft: DraftContext = { id: row.id, title: row.title, category: row.category, summary: row.summary };
    navigate('/chat', { state: { draft } });
  };

  const onAlert = async (alertId: number, status: 'acknowledged' | 'snoozed') => {
    try {
      await alerts.setAlertStatus(alertId, status);
      setToast(status === 'acknowledged' ? 'Alert acknowledged.' : 'Snoozed.');
    } catch {
      setToast('Could not update that alert.');
    }
  };

  const activeAlerts = alerts.alerts.filter((a) => a.status === 'active').slice(0, 3);

  return (
    <>
      {/* ── the chips ── */}
      <div
        className={row
          ? 'absolute bottom-3 right-3 z-10 flex flex-wrap justify-end gap-1.5 pointer-events-none'
          : 'absolute inset-0 pointer-events-none'}
      >
        {hotspots.map((h) => {
          const Icon = ICON[h.id];
          const hot = (h.count ?? 0) > 0;
          return (
            <button
              key={h.id}
              // In row layout nothing writes to this ref, but keeping it
              // assigned costs nothing and means the two modes differ only in
              // CSS — there is no second code path to keep in sync.
              ref={(el) => { anchors.current[h.id] = el; }}
              type="button"
              onClick={() => activate(h.id)}
              aria-label={h.label}
              aria-expanded={h.id === 'tray' || h.id === 'phone' ? open === h.id : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-2 py-1
                backdrop-blur-sm transition-colors focus:outline-none focus-visible:ring-2
                focus-visible:ring-offset-1 focus-visible:ring-accent
                ${row ? 'relative' : 'absolute top-0 left-0'}
                ${hot
                  ? 'border-accent/40 bg-bg-surface/95 text-text-primary shadow-md'
                  : 'border-border bg-bg-surface/70 text-text-tertiary hover:text-text-primary'}`}
              style={{ pointerEvents: 'auto' }}
            >
              <Icon size={12} className={hot ? 'text-accent' : ''} />
              {row && (
                <span className="text-[10px] font-semibold leading-none whitespace-nowrap">
                  {ROW_LABEL[h.id]}
                </span>
              )}
              {hot && (
                <span className="text-[10px] font-bold tabular-nums leading-none">{h.count}</span>
              )}
              {/* A soft pulse only when something genuinely wants you. */}
              {hot && h.actionable && (
                <span className="absolute -inset-0.5 rounded-full border border-accent/40 animate-ping"
                  style={{ animationDuration: '2.4s' }} aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* ── approval card ── */}
      {open === 'tray' && (
        <div
          ref={cardRef}
          role="dialog"
          aria-label="Drafts awaiting your approval"
          className="absolute bottom-3 right-3 w-[min(22rem,calc(100%-1.5rem))] max-h-[78%] overflow-auto
            rounded-2xl border border-border bg-bg-elevated/95 backdrop-blur-md shadow-lg p-3 z-20"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Needs your OK
            </span>
            <button type="button" onClick={() => setOpen(null)} aria-label="Close"
              className="text-text-tertiary hover:text-text-primary">
              <X size={14} />
            </button>
          </div>

          {approvals.writeState === 'unavailable' && (
            <p className="mb-2 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-2 text-[11px] text-text-secondary">
              Deciding from here needs migration <code className="font-mono">15_execution_approval.sql</code> applied
              in Supabase. Until then, approve from “Needs you” below.
            </p>
          )}

          {approvals.pending.length === 0 ? (
            <p className="text-xs text-text-secondary py-3 text-center">Nothing waiting on you.</p>
          ) : approvals.pending.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-bg-surface p-2.5 mb-2 last:mb-0">
              <div className="text-xs font-semibold text-text-primary">{row.title}</div>
              <p className="text-[11px] text-text-secondary mt-1 line-clamp-3 leading-snug">{row.summary}</p>
              <div className="flex gap-1.5 mt-2">
                <button
                  type="button"
                  disabled={approvals.deciding === row.id || approvals.writeState === 'unavailable'}
                  onClick={() => onDecide(row.id, true)}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-accent px-2 py-1.5
                    text-[11px] font-semibold text-text-on-accent disabled:opacity-40"
                >
                  {approvals.deciding === row.id
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Check size={12} />}
                  Approve
                </button>
                <button
                  type="button"
                  disabled={approvals.deciding === row.id || approvals.writeState === 'unavailable'}
                  onClick={() => onDecide(row.id, false)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-border
                    px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary disabled:opacity-40"
                >
                  <X size={12} /> Reject
                </button>
              </div>
              <button
                type="button"
                onClick={() => giveDirection(row)}
                className="w-full mt-1.5 inline-flex items-center justify-center gap-1.5 rounded-lg
                  border border-border px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary
                  hover:text-text-primary hover:border-border-hover transition-colors"
              >
                <MessageCircle size={12} /> Give ASAP direction instead
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── alerts card ── */}
      {open === 'phone' && (
        <div
          ref={cardRef}
          role="dialog"
          aria-label="Active alerts"
          className="absolute bottom-3 right-3 w-[min(22rem,calc(100%-1.5rem))] max-h-[78%] overflow-auto
            rounded-2xl border border-border bg-bg-elevated/95 backdrop-blur-md shadow-lg p-3 z-20"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Alerts</span>
            <button type="button" onClick={() => setOpen(null)} aria-label="Close"
              className="text-text-tertiary hover:text-text-primary">
              <X size={14} />
            </button>
          </div>

          {activeAlerts.length === 0 ? (
            <p className="text-xs text-text-secondary py-3 text-center">No active alerts.</p>
          ) : activeAlerts.map((a) => (
            <div key={a.id} className="rounded-xl border border-border bg-bg-surface p-2.5 mb-2 last:mb-0">
              <div className="text-xs font-semibold text-text-primary">{a.title}</div>
              {a.body && <p className="text-[11px] text-text-secondary mt-1 line-clamp-3">{a.body}</p>}
              <div className="flex gap-1.5 mt-2">
                <button type="button" onClick={() => onAlert(a.id, 'acknowledged')}
                  className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-[11px] font-semibold text-text-on-accent">
                  Got it
                </button>
                <button type="button" onClick={() => onAlert(a.id, 'snoozed')}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary">
                  Snooze
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => navigate('/alerts')}
            className="w-full mt-1 text-[11px] font-medium text-accent hover:opacity-80">
            See all alerts →
          </button>
        </div>
      )}

      {/* ── toast (polite: it reports the result of YOUR action) ── */}
      {toast && (
        <div role="status" aria-live="polite"
          className="absolute bottom-3 left-3 rounded-full border border-border bg-bg-elevated/95
            backdrop-blur px-3 py-1.5 text-[11px] font-medium text-text-primary shadow-md z-30">
          {toast}
        </div>
      )}
    </>
  );
}
