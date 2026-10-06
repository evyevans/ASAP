/* ═══════════════════════════════════════════════════════════════════════════
   RenderPipeline — the single owner of the render loop, with a degrade path.

   WHAT WENT WRONG BEFORE

   The old Postprocessing.tsx took `useFrame(cb, 1)`. In r3f v8 that one choice
   has a consequence that is easy to miss:

     if (!state.internal.priority && state.gl.render) state.gl.render(scene, camera)

   Any subscriber with priority > 0 sets `internal.priority`, and r3f stops
   rendering ENTIRELY. The composer becomes the only thing that can put pixels
   on screen. It had no try/catch and no fallback, so any failure — in the
   composer, or in any of the eight priority-0 callbacks that run BEFORE it —
   produced a permanently black canvas, at 60 exceptions per second, invisible
   to React error boundaries because it all happens inside requestAnimationFrame.

   FOUR DECISIONS THAT MAKE THIS ONE SAFE

   1. It mounts on EVERY quality tier, including `lite` where there is no
      post-processing. Previously `quality.post` decided *who owns the loop*, so
      lite and cinematic ran structurally different code and only one of them was
      ever exercised. One path, one place to instrument, one thing to certify.

   2. `gl.setRenderTarget(null)` before every direct render. A throw inside
      `composer.render()` leaves a render target bound; without the reset the
      fallback draws into an offscreen buffer and you get a blank canvas FROM
      THE FALLBACK — the bug wearing the fix as a disguise.

   3. The mode lives in a ref and the failure is permanent. Flipping React state
      from inside rAF would re-render mid-frame; retrying a broken composer 60
      times a second is a thermal event, not a recovery strategy.

   4. The composer is built and disposed in ONE useEffect, held in useState —
      never useMemo. Under StrictMode, `useMemo` + a cleanup keyed on the memo
      disposes every render target and pass material and then reuses the same
      object. three lazily re-creates most of it, so it usually self-heals, which
      is worse than failing: the code is wrong and nothing tells you.

   And it never calls `composer.dispose()` from the catch — disposing after a
   mid-render throw just throws again. Unmount cleans up.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { useSafeFrame } from './useSafeFrame';
import { probeFramebuffer, defaultProbeRects, type ProbeResult } from './renderProbe';
import type { QualitySettings } from './quality';

/* ── The mode machine, pure so it can be unit tested ──────────────────────*/

export type PipelineMode = 'direct' | 'composer';
export type PipelineEvent = 'composer-ready' | 'composer-failed' | 'context-lost';

export interface PipelineState {
  mode: PipelineMode;
  /** Once true, never go back to the composer for this page-load. */
  failedPermanently: boolean;
}

/** Starts DIRECT: "not ready yet" and "permanently failed" are the same code
 *  path, so the fallback is exercised on every single page load rather than
 *  only in the failure we hope never happens. */
export const INITIAL_PIPELINE: PipelineState = { mode: 'direct', failedPermanently: false };

export function pipelineReduce(s: PipelineState, ev: PipelineEvent): PipelineState {
  switch (ev) {
    case 'composer-ready':
      return s.failedPermanently ? s : { ...s, mode: 'composer' };
    case 'composer-failed':
    case 'context-lost':
      return { mode: 'direct', failedPermanently: true };
    default:
      return s;
  }
}

/* ── Status reporting ─────────────────────────────────────────────────────*/

export type PipelineStatus =
  | { kind: 'probe'; result: ProbeResult }
  | { kind: 'post-failed'; message: string }
  | { kind: 'context-lost' };

export interface RenderPipelineProps {
  quality: QualitySettings;
  onStatus?: (s: PipelineStatus) => void;
}

/* ── Probe scheduling ─────────────────────────────────────────────────────
   The previous rule was `frames >= 8 || elapsed > 3000ms`, and it was badly
   wrong. At 120Hz frame 8 arrives at 67ms, so a fast machine sampled a scene
   that had not been built yet: the PMREM environment is baked in a passive
   effect (and the noir materials are nothing without it), the camera has not
   been aimed, the rig has not been posed, the sparkle drive is still cold, and
   the composer may not be installed. Meanwhile on a ~1.5fps software renderer
   the 3000ms deadline fired first, sampling a fully-settled scene — so the
   trigger was effectively measuring GPU speed, and the slow machine was the
   only one that ever passed.

   Wall-clock is what actually correlates with "the scene has settled". The
   frame floor just guarantees something was genuinely drawn. */
const PROBE_FIRST_MS = 1_200;
const PROBE_MIN_FRAMES = 4;
/** Retry cadence — several chances, so no single unlucky sample is decisive. */
const PROBE_INTERVAL_MS = 600;
const PROBE_MAX_ATTEMPTS = 5;

export function RenderPipeline({ quality, onStatus }: RenderPipelineProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const [composer, setComposer] = useState<EffectComposer | null>(null);
  const state = useRef<PipelineState>(INITIAL_PIPELINE);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  /* ── Build the composer. One effect owns creation AND disposal. ── */
  useEffect(() => {
    if (!quality.post) {
      setComposer(null);
      return;
    }

    let c: EffectComposer;
    try {
      c = new EffectComposer(gl);

      /* MULTISAMPLING — the fix for the "pixelated" report.
       *
       * EffectComposer constructs its targets as
       *   new WebGLRenderTarget(w, h, { type: HalfFloatType })
       * with no `samples`, so it defaults to 0. Combined with the Canvas's
       * `antialias: !quality.post` (false whenever post is on), the cinematic
       * and standard tiers were running with NO hardware anti-aliasing at all.
       *
       * Set BEFORE the first render, so the framebuffer is created with it —
       * `samples` is only read at framebuffer setup, and changing it after a
       * target has been used would require a dispose() to take effect.
       *
       * Both targets must be set: renderTarget2 is cloned in the constructor,
       * and while clone() copies `samples`, that clone already happened above.
       * EffectComposer.setSize only calls setSize on them, so this survives
       * resizes. GTAO is unaffected — it allocates its own depth/normal target,
       * which is correct because AO wants non-multisampled depth. */
      c.renderTarget1.samples = quality.msaa;
      c.renderTarget2.samples = quality.msaa;

      c.addPass(new RenderPass(scene, camera));

      if (quality.gtao) {
        const gtao = new GTAOPass(scene, camera, size.width, size.height);
        gtao.output = GTAOPass.OUTPUT.Default;
        /* 0.06m, not 0.22m. The head radius is 0.158m and the surface gems are
         * 5-12mm, so a 22cm sample radius meant every gem occluded every other
         * gem and the AO multiplied down the character's single brightest
         * region. Occlusion belongs in the creases. */
        gtao.updateGtaoMaterial({
          radius: 0.06, distanceExponent: 1, thickness: 1, scale: 1, samples: 16,
        });
        c.addPass(gtao);
      }

      if (quality.dof) {
        c.addPass(new BokehPass(scene, camera, { focus: 3.75, aperture: 0.00055, maxblur: 0.011 }));
      }

      /* SMAA BEFORE OutputPass — three r183's own class doc: "SMAAPass operates
       * in linear-srgb so this pass must be executed before OutputPass." */
      c.addPass(new SMAAPass());
      c.addPass(new OutputPass());

      /* BLOOM LAST, AND THIS ORDERING IS LOAD-BEARING.
       *
       * The canonical order (RenderPass → Bloom → Output, which is what three's
       * own example uses) renders a COMPLETELY BLACK frame on this machine —
       * verified on ANGLE Metal / Apple M5, readPixels returning all zeros over
       * 19k pixels, at both the `standard` and `cinematic` tiers. Bisected pass
       * by pass: RenderPass+Output renders correctly; adding Bloom in the middle
       * blanks it; moving Bloom last renders correctly again.
       *
       * The difference is which branch of UnrealBloomPass.render() executes.
       * Mid-chain it takes `setRenderTarget(readBuffer)` and blends in place —
       * writing into the very buffer it sampled for its high-pass a moment
       * earlier. As the last pass it takes the `renderToScreen` branch, which
       * copies the scene to the default framebuffer first and then adds bloom.
       * Every pass's `needsSwap` is correct, so this is a driver-level issue
       * with the in-place read-modify-write, not a wiring mistake.
       *
       * Bloom therefore runs on the tone-mapped image rather than in linear
       * space. That is a real trade-off, not free: it blooms what is VISUALLY
       * bright rather than what is numerically bright. For this scene that is
       * acceptable and arguably preferable — the only things above the 0.92
       * threshold are deliberately blown-out specular glints either way.
       *
       * Do not "fix" this back to the canonical order without re-running
       * scripts/verify-presence.py on a real GPU. It will look correct and
       * render nothing. */
      if (quality.bloom) {
        // Threshold 0.92 is deliberately high: only genuinely emissive surfaces
        // bloom. A low threshold fogs the whole image and reads as amateur.
        c.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.42, 0.55, 0.92));
      }
    } catch (err) {
      // A pass that cannot even be constructed on this GPU. Stay direct.
      state.current = pipelineReduce(state.current, 'composer-failed');
      const message = err instanceof Error ? err.message : String(err);
      console.error('[presence] post-processing unavailable, rendering direct:', err);
      statusRef.current?.({ kind: 'post-failed', message });
      setComposer(null);
      return;
    }

    setComposer(c);
    state.current = pipelineReduce(state.current, 'composer-ready');

    return () => {
      c.passes.forEach((p) => (p as { dispose?: () => void }).dispose?.());
      c.dispose();
    };
  }, [gl, scene, camera, quality.post, quality.gtao, quality.dof, quality.bloom, size.width, size.height]);

  /* ── Resize ── */
  useEffect(() => {
    if (!composer) return;
    composer.setSize(size.width, size.height);
    composer.setPixelRatio(gl.getPixelRatio());
  }, [composer, size.width, size.height, gl]);

  /* ── Context loss. Nothing handled this before. ── */
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault(); // required, or the context can never be restored
      state.current = pipelineReduce(state.current, 'context-lost');
      console.error('[presence] WebGL context lost');
      statusRef.current?.({ kind: 'context-lost' });
    };
    canvas.addEventListener('webglcontextlost', onLost);
    return () => canvas.removeEventListener('webglcontextlost', onLost);
  }, [gl]);

  /* ── The loop ── */
  const frames = useRef(0);
  const mountedAt = useRef(performance.now());
  const probeAttempts = useRef(0);
  const probeNextAt = useRef(0);
  const probeBest = useRef<ProbeResult | null>(null);
  const probeSettled = useRef(false);

  useSafeFrame('RenderPipeline', (_, delta) => {
    const d = Math.min(delta, 0.1); // a backgrounded tab returns a huge delta

    const direct = () => {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
    };

    if (state.current.mode === 'composer' && composer) {
      try {
        composer.render(d);
      } catch (err) {
        state.current = pipelineReduce(state.current, 'composer-failed');
        const message = err instanceof Error ? err.message : String(err);
        console.error('[presence] composer threw, falling back to direct render:', err);
        statusRef.current?.({ kind: 'post-failed', message });
        direct();
      }
    } else {
      direct();
    }

    frames.current++;

    /* Probe HERE — inside the same task as the draw. With
     * preserveDrawingBuffer:false the buffer is valid only until the browser
     * composites at end of turn, so reading from an effect or a timeout returns
     * garbage. Sampled repeatedly, keeping the BEST result: a transient early
     * frame can no longer condemn a healthy scene, while a genuinely blank
     * canvas still fails every attempt and reports reliably. */
    if (!probeSettled.current) {
      const now = performance.now();
      const elapsed = now - mountedAt.current;
      const due = elapsed >= PROBE_FIRST_MS
        && frames.current >= PROBE_MIN_FRAMES
        && now >= probeNextAt.current;

      if (due) {
        probeAttempts.current++;
        probeNextAt.current = now + PROBE_INTERVAL_MS;

        const ctx = gl.getContext();
        const bw = ctx?.drawingBufferWidth ?? 0;
        const bh = ctx?.drawingBufferHeight ?? 0;

        if (bw > 0 && bh > 0) {
          const result = probeFramebuffer(gl, defaultProbeRects(bw, bh));
          if (result) {
            // Keep whichever attempt saw the most structure.
            const best = probeBest.current;
            if (!best || result.spread > best.spread) probeBest.current = result;

            if (result.ok || probeAttempts.current >= PROBE_MAX_ATTEMPTS) {
              probeSettled.current = true;
              const final = probeBest.current ?? result;
              if (!final.ok) {
                console.error(
                  `[presence] render probe FAILED after ${probeAttempts.current} attempts `
                  + `(${final.reason}) — spread ${final.spread.toFixed(1)}, `
                  + `modal ${(final.modalShare * 100).toFixed(1)}%. `
                  + 'The scene is still rendering; this is a diagnostic, not a teardown.'
                );
              }
              statusRef.current?.({ kind: 'probe', result: final });
            }
          }
        } else if (probeAttempts.current >= PROBE_MAX_ATTEMPTS) {
          // Never leave the harness waiting on a result that will never come.
          probeSettled.current = true;
        }
      }
    }
  }, 1); // priority 1 — this component IS the renderer

  return null;
}
