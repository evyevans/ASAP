/* ═══════════════════════════════════════════════════════════════════════════
   useSafeFrame — a per-frame callback that cannot take the whole scene down.

   THE FAILURE MODE THIS EXISTS FOR

   r3f runs every useFrame subscriber in one bare loop, sorted by priority
   ascending, with no try/catch, and it schedules the NEXT animation frame
   BEFORE running the body:

     requestAnimationFrame(loop)                 // ← next frame already queued
     for (i = 0; i < subscribers.length; i++)
       subscribers[i].ref.current(state, delta)  // ← a throw here escapes

   Combine that with a priority-1 renderer (RenderPipeline) and the consequence
   is brutal: priority-0 callbacks all run FIRST, so a single throw in something
   as trivial as the wall-clock hands aborts the frame before anything is drawn.
   Forever, ~60 times a second. And because it happens inside requestAnimationFrame
   rather than during React's render phase, no error boundary can see it — the
   DOM stays perfectly healthy while the canvas stays perfectly black.

   That is exactly how this hero shipped blank.

   THE FIX

   Wrap every animation callback. On the first throw, that ONE callback is
   retired and everything else keeps running. The clock hands freeze; the scene
   renders. A degradation nobody would notice, instead of a black rectangle.

   Retirement is permanent and deliberate: a callback that threw once will throw
   every frame, and 60 exceptions/second is a thermal event, not diagnostics.
   The error is reported once, then the subscriber goes quiet.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';

export interface FrameError {
  label: string;
  message: string;
  stack?: string;
}

/* Module scope, not React state: the harness reads this after the fact, and a
 * frame error must never itself trigger a re-render. */
const seen = new Set<string>();
const errors: FrameError[] = [];

export function reportFrameError(label: string, err: unknown): void {
  if (seen.has(label)) return;
  seen.add(label);
  const e = err instanceof Error ? err : new Error(String(err));
  errors.push({ label, message: e.message, stack: e.stack });
  console.error(`[presence] frame callback "${label}" threw and was retired:`, e);
}

/** Every frame error seen this page-load. Asserted on by verify-presence.mjs. */
export const getFrameErrors = (): readonly FrameError[] => errors;

/** Test-only. */
export function __resetFrameErrors(): void {
  seen.clear();
  errors.length = 0;
}

type SafeFrameCallback = (state: RootState, delta: number) => void;

/**
 * `useFrame`, but a throw retires only this callback.
 *
 * @param label  stable identifier used to dedupe reports — name the component
 * @param priority  leave at 0 unless you intend to take over rendering
 */
export function useSafeFrame(
  label: string,
  cb: SafeFrameCallback,
  priority = 0
): void {
  const dead = useRef(false);
  useFrame((state, delta) => {
    if (dead.current) return;
    try {
      cb(state, delta);
    } catch (err) {
      dead.current = true;
      reportFrameError(label, err);
    }
  }, priority);
}
