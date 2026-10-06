/* ═══════════════════════════════════════════════════════════════════════════
   useVoiceSignal — the ONLY safe way to read the voice signal from React.

   WHY THIS FILE EXISTS (this bug blanked the entire 3D hero)

   `selectVoiceSignal` in agentState.ts returns a fresh object literal on every
   call. Under zustand v4 that was harmless: v4 routed selectors through
   `useSyncExternalStoreWithSelector`, which memoised the RESULT. zustand v5
   dropped that shim and calls React's `useSyncExternalStore` directly:

     useSyncExternalStore(api.subscribe, useCallback(() => selector(api.getState()), …))

   `useCallback` stabilises the FUNCTION, not the VALUE. React's
   `checkIfSnapshotChanged` then does `Object.is(lastValue, getSnapshot())` on
   every commit, gets `false` forever because the selector minted a new object,
   and calls `forceStoreRerender`. That is an unbounded render loop.

   It shipped app-wide: EdgeGlow mounts in App.tsx, so every screen paid for it,
   and the storm starved r3f's requestAnimationFrame loop until the canvas never
   painted a single frame. React does warn — "The result of getSnapshot should be
   cached to avoid an infinite loop" — but nothing was listening for it. The
   verification harness now fails on any console.error for exactly this reason.

   WHY PRIMITIVE SELECTORS AND NOT `useShallow`

   `useShallow` also fixes it, but this approach is better here on three counts:
     1. `Object.is` stability is structural. Each selector returns a primitive
        straight off the store, so there is no memoisation to get wrong — as
        opposed to `useShallow`, which is correct only because a ref survives
        zustand's unstable getSnapshot.
     2. It is one import, not a rule every future call site must remember.
     3. It is testable in plain node. `useShallow` needs a React render to
        memoise, which would have forced a jsdom dependency on the regression
        test. See agentState.selector.test.ts — that guard is what stops this
        class of bug from ever coming back.

   agentState.ts is deliberately NOT modified: it is a shared contract owned by
   a parallel work-stream. `selectVoiceSignal` stays exported and valid for
   non-React callers (directScene, tests). It simply must never be handed to a
   React hook.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';
import { useAgentState, type AgentStateStore, type VoiceSignal } from './agentState';

/** Selectors that return primitives, so every snapshot is `Object.is`-stable.
 *  Exported so the regression test can assert stability without a DOM. */
export const selectPhase = (s: AgentStateStore) => s.phase;
export const selectSince = (s: AgentStateStore) => s.since;

/**
 * Subscribe to the voice signal safely.
 *
 * Two primitive subscriptions instead of one object subscription. The extra
 * subscription is free; the object identity is not.
 */
export function useVoiceSignal(): VoiceSignal {
  const phase = useAgentState(selectPhase);
  const since = useAgentState(selectSince);
  // Re-created only when a primitive actually changed, so consumers can safely
  // use this in a useMemo dependency array (AsapPresence does exactly that).
  return useMemo(() => ({ phase, since }), [phase, since]);
}
