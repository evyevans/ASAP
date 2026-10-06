/* ═══════════════════════════════════════════════════════════════════════════
   CharacterPlate — the rendered character, and the command frame around him.

   WHY THIS EXISTS INSTEAD OF AsapPresence
   The 3D stage is still in this directory and still passes its tests, but it
   never reached the fidelity of the supplied reference. A pre-rendered plate
   does, at a fraction of the cost: AsapPresence is a 1,035 kB async chunk that
   the landing route no longer downloads at all.

   WHAT IT KEEPS
   Everything around the character survives, because none of it was ever 3D:
   the live/offline badge, the status line, the screen-reader announcement and
   the hotspot chips all read from the SAME `directScene()` output the butler
   used. `sceneDirector` is a pure function over live Supabase state; swapping
   what draws the character does not touch what the character MEANS.

   THE FRAMING PROBLEM, AND WHAT IT TURNED INTO
   The plate is 784x1168 — portrait — and the hero band is 16:9, so the video
   covers about 25% of it at desktop widths. Blurring a copy of the frame behind
   it (the usual video-player trick) barely helped: the source is a dark night
   interior, so a blur of it is more darkness.

   Widening the video would crop his head. Shrinking the band would shrink the
   hero. So instead the dead space became the point: the two side columns carry
   LIVE DATA, and the whole thing reads as a command frame with the character at
   its centre. The empty space was the brief's answer to itself.

   Below `lg` the rails hide and it falls back to a centred plate — at those
   widths the video already covers ~38% and the rails would crowd it.

   THREE WAYS IT CAN FAIL, ALL HANDLED
   · autoplay refused        → `muted` + `playsInline`, and a play() retry on
                               the first user gesture
   · prefers-reduced-motion  → a still poster frame, never any motion
   · decode / network error  → poster, then a labelled fallback panel
   A hero that renders nothing has shipped from this file's predecessor once
   already; it must not be possible to reach a blank frame from here.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { useAgentEvents } from '../hooks/useAgentEvents';
import { useAlerts } from '../hooks/useAlerts';
import { useApprovals } from './useApprovals';
import { useVoiceSignal } from '../agent/useVoiceSignal';
import { useExecutionData } from '../hooks/useExecutionData';
import { hoursGivenBack, aiWorkValue, formatCurrency, isExecuted } from '../analytics/metricsMap';
import { describeEvent } from '../analytics/describeEvent';
import { directScene } from './sceneDirector';
import { HotspotLayer, type AnchorRefs } from './Hotspots';

export const PLATE_SRC = '/media/asap-character-office.mp4';
export const PLATE_POSTER = '/media/asap-character-office.jpg';

/** Ranks alert severity so the worst one wins. Mirrors AsapPresence. */
const SEVERITY_ORDER = { critical: 3, warning: 2, info: 1 } as const;

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** Reads the OS setting once and stays subscribed — users do change it. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function CharacterPlate() {
  const { events, connected } = useAgentEvents();
  const alerts = useAlerts();
  const approvals = useApprovals();
  const voice = useVoiceSignal();
  const { logs, planner } = useExecutionData();
  const reducedMotion = usePrefersReducedMotion();

  const videoRef = useRef<HTMLVideoElement>(null);
  const anchors = useRef<AnchorRefs>({});
  const [failed, setFailed] = useState(false);

  /* A 1s tick so acts decay to standby without needing a new event. Identical
   * in purpose to AsapPresence's — the status line is live either way. */
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
    pendingApprovals: approvals.pending.length,
    activeAlerts: activeAlerts.length,
    alertSeverity,
    plannedEvents: planner?.events ?? [],
    executedTitles: logs.filter(isExecuted).map((l) => l.block_title ?? '').filter(Boolean),
    voice,
    now,
  });

  const hours = hoursGivenBack(logs);
  const value = aiWorkValue(hours);
  /* The same filter ActivityStream applies — heartbeats are freshness only and
   * would otherwise be the only thing this ticker ever showed. */
  const ticker = events.filter((e) => e.event_type !== 'system.heartbeat').slice(0, 3);

  /* Browsers refuse programmatic playback in more situations than the spec
   * suggests (low-power mode, some privacy settings). `muted` covers the common
   * case; this covers the rest by retrying once the user has interacted at all,
   * which is the point every browser starts allowing it. */
  useEffect(() => {
    if (reducedMotion) return;
    const el = videoRef.current;
    if (!el) return;
    const tryPlay = () => { void el.play().catch(() => { /* poster remains */ }); };
    tryPlay();
    window.addEventListener('pointerdown', tryPlay, { once: true });
    window.addEventListener('keydown', tryPlay, { once: true });
    return () => {
      window.removeEventListener('pointerdown', tryPlay);
      window.removeEventListener('keydown', tryPlay);
    };
  }, [reducedMotion]);

  const dot = scene.live ? 'bg-success' : 'bg-text-tertiary';

  return (
    <div
      data-plate
      className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-[#050609] shadow-lg"
      style={{ aspectRatio: '16 / 9', maxHeight: 420 }}
    >
      {/* ── The fill ──
          The plate's own first frame, blown up, blurred and LIFTED. The lift is
          the part that matters: the source is a dark night interior, so a
          straight blur of it is just more black. Pushing brightness well above 1
          turns the window and the city behind him into a soft ambient wash that
          the rails can sit on. */}
      <img
        aria-hidden
        alt=""
        src={PLATE_POSTER}
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          filter: 'blur(46px) saturate(1.7) brightness(2.1) contrast(0.92)',
          transform: 'scale(1.5)',
        }}
      />
      {/* Dark at the edges, open in the middle — keeps the eye on the character
          and gives the orange EdgeGlow something to blend into at the frame
          edge. Tuned narrow (34%) so it does not dim the rails. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 34% 92% at 50% 50%, rgba(5,6,9,0.10) 0%, rgba(5,6,9,0.55) 62%, rgba(5,6,9,0.88) 100%)',
        }}
      />

      {failed ? (
        /* Last resort. Never a blank frame — it still says who it is and what
         * it is doing, which is the information the hero exists to convey. */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-6">
          <span className="text-sm font-bold text-white/90">{scene.beat.label}</span>
          <span className="text-xs text-white/50">{scene.beat.caption}</span>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          /* Feather the left and right edges so the sharp plate melts into the
             blurred fill instead of ending on two hard vertical seams. The
             figure is centred in frame, so a 13% fade never touches him. */
          style={{
            maskImage:
              'linear-gradient(to right, transparent 0%, #000 13%, #000 87%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, #000 13%, #000 87%, transparent 100%)',
          }}
          src={PLATE_SRC}
          poster={PLATE_POSTER}
          /* muted is NOT optional — every browser blocks autoplay with audio,
             and this clip has none to lose. */
          muted
          playsInline
          loop={!reducedMotion}
          autoPlay={!reducedMotion}
          preload={reducedMotion ? 'metadata' : 'auto'}
          disablePictureInPicture
          controls={false}
          aria-hidden
          onError={() => setFailed(true)}
        />
      )}

      {/* ── Left rail: what he has given back ──
          Hidden below lg, where the video already covers ~38% of the band and
          a rail would crowd the character instead of framing him.

          Carries its OWN scrim (a left-to-right fade, independent of the fill
          gradient above) rather than relying on the surround being dark enough.
          That assumption broke the moment a wider-coverage video landed: at 69%
          coverage the rail sits directly over bright office detail — window,
          skyline — and the text lost all contrast. A rail is a piece of UI; it
          needs to read regardless of what the plate underneath it is doing. */}
      <div className="hidden lg:flex absolute left-0 top-0 bottom-0 w-[30%] flex-col justify-center gap-5 z-10 pointer-events-none pl-6 pr-10 py-6"
        style={{ background: 'linear-gradient(to right, rgba(5,6,9,0.82) 0%, rgba(5,6,9,0.55) 65%, transparent 100%)' }}
      >
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
            {greeting()}
          </div>
          <div className="mt-2 text-4xl font-black tabular-nums leading-none text-white/95 drop-shadow">
            {hours.toFixed(1)}
            <span className="ml-1.5 text-lg font-bold text-white/55">hrs</span>
          </div>
          <div className="mt-1.5 text-xs text-white/55">
            given back · <span className="font-semibold text-white/80">{formatCurrency(value)}</span>
          </div>
        </div>
        {approvals.pending.length > 0 && (
          <div className="border-l-2 border-accent/70 pl-3">
            <div className="text-xl font-bold tabular-nums leading-none text-white/95">
              {approvals.pending.length}
            </div>
            <div className="text-[11px] text-white/50 mt-1">
              draft{approvals.pending.length === 1 ? '' : 's'} waiting on you
            </div>
          </div>
        )}
      </div>

      {/* ── Right rail: what he is doing ── — same reasoning, mirrored scrim. */}
      <div className="hidden lg:flex absolute right-0 top-0 bottom-0 w-[30%] flex-col justify-center gap-2.5 z-10 pointer-events-none pr-6 pl-10 py-6"
        style={{ background: 'linear-gradient(to left, rgba(5,6,9,0.82) 0%, rgba(5,6,9,0.55) 65%, transparent 100%)' }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Latest
        </div>
        {ticker.length === 0 ? (
          <p className="text-xs text-white/45 leading-relaxed">
            Nothing yet — the moment a calendar block runs, it appears here.
          </p>
        ) : (
          ticker.map((e) => {
            const d = describeEvent(e);
            const Icon = d.icon;
            return (
              <div key={e.id} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0" style={{ color: d.accent }}>
                  <Icon size={12} />
                </span>
                <p className="text-[11px] leading-snug text-white/70 line-clamp-2">{d.sentence}</p>
              </div>
            );
          })
        )}
      </div>

      {/* ── Live badge ── */}
      <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5 rounded-full border border-white/15
        bg-black/40 backdrop-blur px-2.5 py-1 z-20">
        <span className={`w-1.5 h-1.5 rounded-full ${dot} ${scene.live ? 'animate-pulse' : ''}`} />
        <span className="text-[11px] font-semibold text-white/70">
          {'Sample activity'}
        </span>
      </div>

      {/* ── Status line ── */}
      <div className="absolute bottom-4 left-5 right-5 pointer-events-none z-10">
        <div className="text-sm font-bold text-white/95 drop-shadow">{scene.beat.label}</div>
        <div className="text-xs text-white/60 truncate drop-shadow">{scene.beat.caption}</div>
      </div>

      {/* Screen readers get the same information the plate conveys. */}
      <p className="sr-only" aria-live="polite">
        {scene.beat.label}. {scene.beat.caption}
      </p>

      {/* The same real buttons, the same approval and alert cards, the same
          writes — laid out as a row because there is no camera to project
          through any more. */}
      <HotspotLayer
        layout="row"
        hotspots={scene.hotspots}
        readouts={scene.readouts}
        approvals={approvals}
        alerts={alerts}
        anchors={anchors}
      />
    </div>
  );
}
