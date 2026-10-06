/* ═══════════════════════════════════════════════════════════════════════════
   characterState — the six states the brief asks the character to express,
   plus the sparkle drive that expresses them.

   DERIVED, NEVER STORED. sceneDirector already produced a SceneState this
   frame; this reads it. There is no second source of truth, so the character
   and the edge glow cannot drift apart — the same structural guarantee that
   EdgeGlow relies on. sceneDirector.ts and agentState.ts are untouched.

   ── THE SUBTLETY THAT MAKES OR BREAKS "THINKING" ──────────────────────────
   sceneDirector deliberately collapses voice phases `listening`, `transcribing`
   and `thinking` into ONE act (`listening`), because swapping the body's motion
   twice inside two seconds reads as a twitch. It carries the finer distinction
   on `glow.tone` instead.

   So Thinking CANNOT be read from `act` alone. It needs (act, glow.tone)
   together. Get this wrong and Thinking looks identical to Listening — which
   destroys the latency mask the whole feature exists to provide, since the
   several seconds spent waiting on Hermes is exactly when the user most needs
   to see that something is happening.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Act, Glow } from './sceneDirector';

export type CharacterState =
  | 'offline'    // the realtime channel is gone
  | 'idle'       // standing by
  | 'listening'  // the mic is open, he is attending to you
  | 'thinking'   // reasoning — his own work, or waiting on Hermes
  | 'speaking'   // talking back
  | 'success'    // a win landed
  | 'error';     // something needs attention

export const CHARACTER_STATES: readonly CharacterState[] = [
  'offline', 'idle', 'listening', 'thinking', 'speaking', 'success', 'error',
];

/**
 * Map the scene's act + glow onto the character's expressive state.
 *
 * Exhaustive over every Act, with a `never` check: if the parallel session adds
 * a twelfth act, this stops compiling rather than silently rendering it as idle.
 */
export function characterStateFor(act: Act, glow: Glow): CharacterState {
  switch (act) {
    case 'dormant':
      return 'offline';

    case 'listening':
      // The act is the same for three voice phases — the glow tone is what
      // separates "I'm hearing you" from "I'm working on it".
      return glow.tone === 'listening' ? 'listening' : 'thinking';

    case 'speaking':
      return 'speaking';

    case 'commending':
      return 'success';

    case 'alerting':
      return 'error';

    // Real work in flight. From the user's side this is indistinguishable from
    // reasoning, and showing it as such is honest: ASAP IS thinking.
    case 'drafting':
    case 'reviewing':
    case 'dispatching':
    case 'filing':
      return 'thinking';

    // Waiting on the user is a calm state, not a busy one.
    case 'presenting':
    case 'standby':
      return 'idle';

    default: {
      const never: never = act;
      return never;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   The sparkle drive.

   COHERENCE IS THE PRIMARY AXIS, not colour. It controls whether every gem
   pulses in phase or each runs on its own seed:

     coherence → 1   one organism taking a single deliberate breath
                     (attentive listening, a bow, an alarm)
     coherence → 0   chaotic shimmer, many things at once
                     (idle drift, active reasoning)

   That reads instantly, survives greyscale and colour-blindness, and — usefully
   — is something automated frame-differencing can actually measure. Colour
   alone would satisfy none of those.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SparkleProfile {
  /** Master brightness of the glint field, 0…~1.6. */
  amp: number;
  /** Twinkle frequency multiplier. */
  rate: number;
  /** 0 = every gem independent, 1 = all in phase. */
  coherence: number;
  /** Additive rgb pushed into every tint. */
  tintPush: readonly [number, number, number];
  /** Star-flare intensity multiplier. */
  flare: number;
  /** Strength of the travelling band that sweeps the head. 0 = none. */
  band: number;
  /** How strongly live audio RMS drives `amp`. */
  audioGain: number;
  /** Seconds to ease INTO this state. */
  tauIn: number;
}

const NEUTRAL = [0, 0, 0] as const;

export const SPARKLE_PROFILES: Record<CharacterState, SparkleProfile> = {
  offline: {
    amp: 0.05, rate: 0.15, coherence: 0, tintPush: [-0.08, -0.06, -0.04],
    flare: 0, band: 0, audioGain: 0, tauIn: 0.80,
  },
  idle: {
    amp: 0.62, rate: 0.35, coherence: 0.15, tintPush: NEUTRAL,
    flare: 0.7, band: 0, audioGain: 0, tauIn: 0.30,
  },
  listening: {
    // Held attention: bright, unhurried, and above all COHERENT.
    amp: 0.95, rate: 0.50, coherence: 0.85, tintPush: [0, 0.06, 0.15],
    flare: 1.0, band: 0, audioGain: 0.4, tauIn: 0.22,
  },
  thinking: {
    // Fast and incoherent — many parallel processes. The travelling band is
    // the visual "it is chewing on something".
    amp: 0.80, rate: 1.60, coherence: 0.10, tintPush: [0.25, 0.10, -0.05],
    flare: 0.8, band: 0.9, audioGain: 0, tauIn: 0.25,
  },
  speaking: {
    amp: 0.78, rate: 2.40, coherence: 0.40, tintPush: [0.18, 0.08, 0],
    flare: 1.2, band: 0.2, audioGain: 1.6, tauIn: 0.18,
  },
  success: {
    amp: 1.40, rate: 0.80, coherence: 0.90, tintPush: [-0.10, 0.35, 0],
    flare: 1.6, band: 0, audioGain: 0, tauIn: 0.08,
  },
  error: {
    // An alarm SNAPS. Every other state eases — mirroring the doctrine
    // robotClips.ts already applies to the body's cross-fades.
    amp: 1.10, rate: 6.00, coherence: 1.00, tintPush: [0.55, -0.25, -0.25],
    flare: 1.4, band: 0, audioGain: 0, tauIn: 0.05,
  },
};

export const profileFor = (s: CharacterState): SparkleProfile => SPARKLE_PROFILES[s];

/**
 * Frame-rate-independent easing toward a target.
 *
 * `1 - exp(-dt/tau)` rather than a fixed lerp factor, so the transition takes
 * the same wall-clock time at 30fps as at 144fps. A plain `cur += (t-cur)*0.1`
 * is twice as fast on a 120Hz display, which is how state changes end up
 * feeling different on different machines.
 */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (!(tau > 0)) return target;
  const k = 1 - Math.exp(-Math.max(0, dt) / tau);
  return current + (target - current) * k;
}
