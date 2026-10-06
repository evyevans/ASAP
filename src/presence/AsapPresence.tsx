/* ═══════════════════════════════════════════════════════════════════════════
   AsapPresence — the Home-screen hero.

   A thin shell on purpose. It gathers the live world, hands it to the pure
   sceneDirector, and renders three layers:
     1. the 3D stage + butler (Canvas)
     2. the projected hotspot buttons + action cards (DOM, accessible)
     3. the status line and Live badge

   Sandbox unchanged: 16/9, max 420px.

   ── PHASE 1 HARDENING ─────────────────────────────────────────────────────
   This component previously rendered a permanently blank canvas. Four separate
   defects converged here, and so do their fixes:

   1. `useAgentState(selectVoiceSignal)` returned a new object each call, which
      under zustand v5 is an unbounded render loop that starved r3f's rAF loop.
      → useVoiceSignal() (see src/agent/useVoiceSignal.ts).
   2. Post-processing took priority-1 in useFrame, which stops r3f rendering and
      makes the composer the ONLY source of pixels — with no fallback.
      → RenderPipeline, which degrades to gl.render() instead of blanking.
   3. No error boundary existed, so a crash was silent.
      → StageBoundary + StagePoster.
   4. The Canvas measured its height from a percentage inside an aspect-ratio
      box with a max-height clamp; r3f skips createRoot entirely if that
      resolves to 0.
      → an `absolute inset-0` wrapper, plus a ResizeObserver that says so loudly.

   PERFORMANCE POSTURE
   The loop stops when nobody is looking — scrolled away, or tab backgrounded.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAgentEvents } from '../hooks/useAgentEvents';
import { useAlerts } from '../hooks/useAlerts';
import { useExecutionData } from '../hooks/useExecutionData';
import { useVoiceSignal } from '../agent/useVoiceSignal';
import { directScene } from './sceneDirector';
import { resolveQuality, probeDevice, settingsFor, type QualityTier } from './quality';
import { Figure } from './Figure';
import { Stage, STAGE } from './Stage';
import { RenderPipeline, type PipelineStatus } from './RenderPipeline';
import { StageBoundary } from './StageBoundary';
import { StagePoster } from './StagePoster';
import { HotspotLayer, type AnchorRefs } from './Hotspots';
// Separate module because it is the only half that needs three.js — see the
// header of Hotspots.tsx for the bundle regression that forced the split.
import { HotspotProjector } from './HotspotProjector';
import { useApprovals } from './useApprovals';
import { getFrameErrors } from './useSafeFrame';
import { isExecuted } from '../analytics/metricsMap';

/* The camera is fixed — this aims it once. The stage is composed for exactly
 * this framing.
 *
 * WHY IT MOVED. The old rig sat at (0.14, 1.62, 1.24) looking at y=1.36 from
 * 3.0 units back: a wide establishing shot of the room, taken from ABOVE the
 * figure's chest. Two things followed. The figure occupied under a third of the
 * frame, and because the camera looked down, the desk edge rode high and buried
 * everything below his sternum. What was left was a head and a sliver of torso.
 *
 * You do not put the lead character in an establishing shot and then wonder why
 * he has no presence. This drops the camera to roughly his chest line and pushes
 * in, so the desk edge falls to the bottom of frame and he stands against the
 * back wall instead of behind furniture. The desk still occludes — that is what
 * a desk is for — it just no longer occludes the subject.
 *
 * Kept as ONE fixed framing on purpose. Voice mode dollies closer still
 * (VoiceStage); having two authored framings is the point, having a free camera
 * is not. */
export const HOME_CAM = {
  position: [0.08, 1.52, 0.62] as const,
  target: [-0.10, 1.40, -1.78] as const,
};

function CameraRig() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(...HOME_CAM.position);
    camera.lookAt(...HOME_CAM.target);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

const SEVERITY_ORDER = { critical: 3, warning: 2, info: 1 } as const;

/** How long a 0-height frame is tolerated before we call it a mount failure. */
const ZERO_SIZE_GRACE_MS = 750;

export interface AsapPresenceProps {
  /**
   * Force a quality tier. HARNESS ONLY — production never passes this.
   *
   * It exists because the verification harness previously *displayed* a `?tier=`
   * parameter without applying it, so every "tier matrix" run was silently the
   * same auto-detected tier. An explicit prop makes the override real and
   * impossible to mistake for something production does.
   */
  tierOverride?: QualityTier;
}

export function AsapPresence({ tierOverride }: AsapPresenceProps = {}) {
  const { events, connected } = useAgentEvents();
  const { logs, planner } = useExecutionData();
  const alerts = useAlerts();
  const approvals = useApprovals();
  // The local half of ASAP's state. Server truth (events) is seconds old; this
  // changes in the same frame as the user's finger on the mic button.
  // MUST be useVoiceSignal — see the header, defect 1.
  const voice = useVoiceSignal();

  const anchors = useRef<AnchorRefs>({});
  const frameRef = useRef<HTMLDivElement>(null);

  // Probed once — re-probing per render would thrash the tier.
  const quality = useMemo(
    () => (tierOverride ? settingsFor(tierOverride) : resolveQuality(probeDevice())),
    [tierOverride]
  );

  /**
   * Set ONLY by unambiguous, deterministic failures: a React throw caught by
   * StageBoundary, WebGL context loss, or a genuinely zero-sized mount.
   *
   * Deliberately NOT set by the render probe. The probe is a statistical guess
   * about 900-odd pixels; showing the poster tears down the entire Canvas. On a
   * 120Hz display the probe fired 67ms after mount — before the environment map
   * was baked, before the camera was aimed, before the rig was posed — sampled a
   * legitimately half-built scene, and destroyed it. Wiring a heuristic to a
   * destructive action was the design error, so that wire is now cut.
   */
  const [degraded, setDegraded] = useState<string | null>(null);

  /* ── Pause when nobody is looking ── */
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: '120px' } // resume just before it scrolls back in
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* ── Zero-size mount detector (defect 4) ──
     r3f silently skips createRoot when the container measures 0 in either axis,
     which produces a canvas element that exists and never renders. Rather than
     reason about whether percentage height resolves inside an aspect-ratio box,
     measure it and say so. */
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const mountedAt = performance.now();
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if ((width > 0 && height > 0) || performance.now() - mountedAt < ZERO_SIZE_GRACE_MS) return;
      console.error(`[presence] canvas frame measured ${width}×${height} — the 3D stage cannot mount`);
      setDegraded('The stage could not be measured.');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── A 1s tick so acts decay to standby without needing a new event ── */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!onScreen || !tabVisible) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [onScreen, tabVisible]);

  /* ── Derive everything from one pure function ── */
  const activeAlerts = useMemo(
    () => alerts.alerts.filter((a) => a.status === 'active'),
    [alerts.alerts]
  );

  const alertSeverity = useMemo(() => {
    let best: 'info' | 'warning' | 'critical' | null = null;
    for (const a of activeAlerts) {
      const s = a.severity as keyof typeof SEVERITY_ORDER | undefined;
      if (!s || !(s in SEVERITY_ORDER)) continue;
      if (!best || SEVERITY_ORDER[s] > SEVERITY_ORDER[best]) best = s;
    }
    return best;
  }, [activeAlerts]);

  const executedTitles = useMemo(
    () => logs.filter(isExecuted).map((l) => l.block_title ?? '').filter(Boolean),
    [logs]
  );

  const scene = useMemo(() => directScene({
    connected,
    events,
    pendingApprovals: approvals.pending.length,
    activeAlerts: activeAlerts.length,
    alertSeverity,
    plannedEvents: planner?.events ?? [],
    executedTitles,
    voice,
    now,
  }), [connected, events, approvals.pending.length, activeAlerts.length, alertSeverity, planner?.events, executedTitles, voice, now]);

  /* ── Pipeline status → poster, and a handle for the verification harness ── */
  const onPipelineStatus = useCallback((s: PipelineStatus) => {
    if (s.kind === 'probe') {
      // DIAGNOSTIC ONLY. Recorded for scripts/verify-presence.py and logged by
      // RenderPipeline, but it never degrades the UI — see `degraded` above for
      // why a pixel heuristic must not be able to unmount the scene.
      (window as unknown as Record<string, unknown>).__asapRenderProbe = s.result;
      return;
    }
    if (s.kind === 'context-lost') setDegraded('Graphics context was lost.');
    // 'post-failed' is NOT degraded: the pipeline already fell back to a direct
    // render, so the scene is still on screen, just without post-processing.
  }, []);

  // Expose diagnostics for scripts/verify-presence.mjs. Cheap, and it means the
  // harness asserts on the same values the app itself reacts to.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__asapPresence = {
      tier: quality.tier,
      frameErrors: getFrameErrors,
    };
  }, [quality.tier]);

  const running = onScreen && tabVisible;
  const animate = running && quality.tier !== 'still';
  const frameloop = animate ? 'always' : 'demand';

  const dot = scene.live ? 'bg-success' : 'bg-text-tertiary';

  return (
    <div
      ref={frameRef}
      className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-[#050609] shadow-lg"
      style={{ aspectRatio: '16 / 9', maxHeight: 420 }}
    >
      {degraded ? (
        <StagePoster
          label={scene.beat.label}
          caption={scene.beat.caption}
          reason={degraded}
          onRetry={() => setDegraded(null)}
        />
      ) : (
        <StageBoundary
          onError={() => { /* already logged by the boundary */ }}
          fallback={(reason, retry) => (
            <StagePoster
              label={scene.beat.label}
              caption={scene.beat.caption}
              reason={reason}
              onRetry={retry}
            />
          )}
        >
          {/* `absolute inset-0` takes the parent's USED height unconditionally.
              A percentage height resolving against an aspect-ratio-derived,
              max-height-clamped box is the classic 0-measurement edge case, and
              r3f refuses to create its root when either axis measures 0. */}
          <div className="absolute inset-0">
            <Canvas
              dpr={quality.dpr}
              shadows={quality.shadows}
              frameloop={frameloop}
              // Must match HOME_CAM, or the first frame renders from the old
              // position before CameraRig's effect runs and snaps it.
              camera={{ position: [...HOME_CAM.position], fov: 36, near: 0.1, far: 24 }}
              gl={{
                // With post enabled, SMAA handles AA — MSAA on top is wasted work.
                antialias: !quality.post,
                alpha: false,
                powerPreference: 'high-performance',
                preserveDrawingBuffer: false,
              }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                // 0.82: the noir grade was tuned against a path with no ACES pass at all.
                gl.toneMappingExposure = 0.82;
                gl.shadowMap.type = THREE.PCFSoftShadowMap;
              }}
            >
              <CameraRig />
              {/* Near-black, not #000000: on pure black a correctly-rendered
                  dark scene and a blank canvas are the same pixels, which would
                  blind the render probe. See renderProbe.ts. */}
              <color attach="background" args={['#050609']} />
              <Stage readouts={scene.readouts} quality={quality} />
              <group position={[STAGE.butler.x, 0, STAGE.butler.z]}>
                <Figure
                  act={scene.act}
                  glow={scene.glow}
                  intensity={scene.intensity}
                  detail={quality.detail}
                  animate={animate}
                  gems={quality.gems}
                  glints={quality.glints}
                  flares={quality.flares}
                />
              </group>
              {/* Mounted on EVERY tier — it is the renderer, not an effect. */}
              <RenderPipeline quality={quality} onStatus={onPipelineStatus} />
              <HotspotProjector anchors={anchors} />
            </Canvas>
          </div>
        </StageBoundary>
      )}

      {/* ── Live badge ── */}
      <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5 rounded-full border border-white/15
        bg-black/40 backdrop-blur px-2.5 py-1 z-10">
        <span className={`w-1.5 h-1.5 rounded-full ${dot} ${scene.live ? 'animate-pulse' : ''}`} />
        <span className="text-[11px] font-semibold text-white/70">
          {scene.live ? 'Live' : 'Offline'}
        </span>
      </div>

      {/* ── Status line. Hidden behind the poster, which draws its own. ── */}
      {!degraded && (
        <div className="absolute bottom-4 left-5 right-5 pointer-events-none z-10">
          <div className="text-sm font-bold text-white/95 drop-shadow">{scene.beat.label}</div>
          <div className="text-xs text-white/60 truncate drop-shadow">{scene.beat.caption}</div>
        </div>
      )}

      {/* Screen readers get the same information the animation conveys. */}
      <p className="sr-only" aria-live="polite">
        {scene.beat.label}. {scene.beat.caption}
      </p>

      <HotspotLayer
        hotspots={scene.hotspots}
        readouts={scene.readouts}
        approvals={approvals}
        alerts={alerts}
        anchors={anchors}
      />
    </div>
  );
}
