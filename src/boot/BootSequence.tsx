/* Full-screen boot overlay. Plays once per session after auth; skips for
 * returning sessions + prefers-reduced-motion; jumps to reveal on frame drops.
 *
 * rAF design: a SINGLE persistent loop is started on mount and torn down on
 * unmount. It never re-subscribes per phase — instead it reads the current
 * phase off a ref (`phaseRef`) that a separate, cheap effect keeps in sync
 * with the machine snapshot. That split is what lets the frame-drop guard
 * observe genuinely consecutive frames (recreating the loop per phase would
 * reset its frame counter at every transition) and keeps the particle field
 * initialized exactly once instead of on every phase change. */
import { useEffect, useRef } from 'react';
import { useMachine } from '@xstate/react';
import { bootMachine, BOOT_TIMINGS, BOOT_WORD } from './bootMachine';
import { BootParticles, type BootPhase } from './bootParticles';
import { BOOT_SESSION_KEY, shouldSkipBoot } from './bootSession';

const ANIMATED_PHASES = new Set<string>(Object.keys(BOOT_TIMINGS));
/** Must match the overlay's CSS `transitionDuration` below — this is what
 * makes the fade-out actually visible instead of being cut short by an
 * immediate unmount the instant `status` flips to 'done'. */
const FADE_OUT_MS = 200;

function isAnimatedPhase(phase: string): phase is BootPhase {
  return ANIMATED_PHASES.has(phase);
}

export function BootSequence({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // useRef's initializer only seeds `.current` on the first render — matching
  // @xstate/react, which likewise only honors the actor's FIRST input. Both
  // land on the same skip decision by construction.
  const skip = useRef(shouldSkipBoot()).current;

  const [snap, send] = useMachine(bootMachine, { input: { skip } });

  const phase = snap.value as string;
  const status = snap.status;

  // Phase bookkeeping the rAF loop reads via refs — updating these does not
  // recreate the loop below.
  const phaseRef = useRef(phase);
  const phaseStartRef = useRef(performance.now());
  useEffect(() => {
    phaseRef.current = phase;
    phaseStartRef.current = performance.now();
  }, [phase]);

  // Latest-callback ref so the timer below only ever depends on `status` —
  // an inline `onDone` from the parent (Home re-renders for unrelated
  // reasons, e.g. useLiveWorldFeed) must not re-arm/extend the fade timer.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (status !== 'done') return;
    try { sessionStorage.setItem(BOOT_SESSION_KEY, '1'); } catch { /* Boot also works without persistence. */ }
    // Defer the unmount so the CSS opacity transition below gets to actually
    // play instead of being cut short the instant `status` flips.
    const timer = setTimeout(() => onDoneRef.current(), FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // The one persistent rAF loop for the whole boot ceremony. Mount-only:
  // `send` is a stable bound method (@xstate/react memoizes the actor) and
  // `skip` is fixed for the component's lifetime, so this never needs to
  // restart mid-boot. When `skip` is set (reduced-motion OR a returning
  // session) the machine starts at `reveal` and NO particles are ever
  // drawn — just the bare bg-primary overlay for 350ms, then the 200ms
  // CSS fade below. That is the "quick, honest fade" skip path; it does
  // not flash the fully-formed word before dissolving it.
  useEffect(() => {
    if (skip) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const particles = new BootParticles();
    particles.init(canvas, BOOT_WORD);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let frames = 0;
    let slowFrames = 0;
    let guardTripped = false;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = now - last;
      last = now;

      // Sustained <30fps in the opening frames bails the whole ceremony —
      // a stuttering boot is worse than a short fade straight to the app.
      if (!guardTripped && frames < 12) {
        frames++;
        if (dt > 34) slowFrames++;
        if (frames === 12 && slowFrames >= 6) {
          guardTripped = true;
          send({ type: 'SKIP' });
        }
      }

      const currentPhase = phaseRef.current;
      if (isAnimatedPhase(currentPhase)) {
        const t = Math.min(1, (now - phaseStartRef.current) / BOOT_TIMINGS[currentPhase]);
        particles.render(ctx, currentPhase, t);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  }, [send, skip]);

  return (
    <div
      className={`fixed inset-0 z-50 bg-bg-primary transition-opacity${
        status === 'done' ? ' pointer-events-none' : ''
      }`}
      style={{ opacity: status === 'done' ? 0 : 1, transitionDuration: `${FADE_OUT_MS}ms` }}
      aria-hidden
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
