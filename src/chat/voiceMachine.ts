/* ═══════════════════════════════════════════════════════════════════════════
   voiceMachine — the voice turn, as a pure reducer.

   WHY PURE
   Same reason as presence/renderProbe.ts's `classifyProbe` and
   RenderPipeline's `pipelineReduce`: the interesting behaviour here is
   sequencing and timeout, and both are miserable to test through a microphone,
   a socket and a React tree. As a reducer over (state, event) they are ordinary
   unit tests that run in node in milliseconds.

   WHY WATCHDOGS ARE THE POINT
   Every non-idle phase lights the screen edges orange (presence/EdgeGlow.tsx).
   So a dropped socket does not merely lose a turn — it leaves the WHOLE
   APPLICATION glowing, on every tab, forever, with no way back. That is a worse
   failure than never having started, and it cannot be prevented by being
   careful in the happy path. Every phase that waits on something external
   carries a deadline, and expiry always lands in `idle` with an error the UI
   can show.

   The phases are `VoicePhase` from agent/agentState.ts, not a parallel
   vocabulary — the character, the edge glow and the ball all already read that
   union, and a second one would be a drift bug waiting to happen.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { VoicePhase } from '../agent/agentState';

/** How long each phase may wait before the watchdog gives up, in ms.
 *
 *  `thinking` is by far the longest because it is the one waiting on Hermes,
 *  which does real work — CRM reads, calendar writes, an LLM call. 45s is
 *  generous on purpose: killing a turn that was about to succeed is a worse
 *  experience than a long wait with live edges telling you it is still going. */
export const DEADLINES: Record<Exclude<VoicePhase, 'idle'>, number> = {
  listening: 60_000,
  transcribing: 12_000,
  thinking: 45_000,
  speaking: 120_000,
};

export interface VoiceMachineState {
  phase: VoicePhase;
  /** When the current phase began (ms epoch). */
  since: number;
  /** Interim while listening, final once transcribing completes. */
  transcript: string;
  final: boolean;
  error: string | null;
}

export type VoiceEvent =
  | { type: 'PRESS'; at: number }
  | { type: 'RELEASE'; at: number }
  | { type: 'PARTIAL'; text: string }
  | { type: 'FINAL'; text: string; at: number }
  | { type: 'REPLY'; at: number }
  | { type: 'SPOKEN'; at: number }
  | { type: 'CANCEL'; at: number }
  | { type: 'ERROR'; message: string; at: number }
  | { type: 'TICK'; at: number };

export const initialVoiceState = (now = 0): VoiceMachineState => ({
  phase: 'idle',
  since: now,
  transcript: '',
  final: false,
  error: null,
});

const to = (
  s: VoiceMachineState,
  phase: VoicePhase,
  at: number,
  patch: Partial<VoiceMachineState> = {}
): VoiceMachineState => ({ ...s, phase, since: at, ...patch });

/** Is `phase` past its deadline at time `now`? Exported so the UI can show a
 *  "still working" hint without duplicating the table. */
export function isExpired(phase: VoicePhase, since: number, now: number): boolean {
  if (phase === 'idle') return false;
  const limit = DEADLINES[phase];
  return Number.isFinite(since) && now - since >= limit;
}

/**
 * The reducer. Total over (state, event) — every pair returns a valid state,
 * and any event that does not apply in the current phase is IGNORED rather than
 * throwing. A stray socket message arriving after a cancel is normal, not
 * exceptional, and must not be able to break the UI.
 */
export function voiceReduce(s: VoiceMachineState, e: VoiceEvent): VoiceMachineState {
  switch (e.type) {
    case 'PRESS':
      // Re-pressing mid-turn abandons the old turn and starts clean. Anything
      // else means a stuck turn can lock the user out of their own mic.
      return to(s, 'listening', e.at, { transcript: '', final: false, error: null });

    case 'RELEASE':
      // Only meaningful while actually listening.
      return s.phase === 'listening' ? to(s, 'transcribing', e.at) : s;

    case 'PARTIAL':
      // Interim text never advances the phase — it only feeds the live caption.
      return s.phase === 'listening' ? { ...s, transcript: e.text, final: false } : s;

    case 'FINAL': {
      if (s.phase !== 'listening' && s.phase !== 'transcribing') return s;
      // An empty final means the user pressed and said nothing. Going to
      // `thinking` would ask Hermes to answer silence and hold the edge glow
      // for 45s over it.
      if (!e.text.trim()) {
        return to(s, 'idle', e.at, { transcript: '', final: false });
      }
      return to(s, 'thinking', e.at, { transcript: e.text, final: true });
    }

    case 'REPLY':
      return s.phase === 'thinking' ? to(s, 'speaking', e.at) : s;

    case 'SPOKEN':
      return s.phase === 'speaking' ? to(s, 'idle', e.at) : s;

    case 'CANCEL':
      return s.phase === 'idle' ? s : to(s, 'idle', e.at, { final: false });

    case 'ERROR':
      // Always lands in idle. An error that left the phase non-idle would keep
      // the whole app's edges glowing with no path back.
      return to(s, 'idle', e.at, { error: e.message, final: false });

    case 'TICK':
      if (!isExpired(s.phase, s.since, e.at)) return s;
      return to(s, 'idle', e.at, {
        error: TIMEOUT_MESSAGE[s.phase] ?? 'That took too long.',
        final: false,
      });

    default:
      // Exhaustiveness: adding a variant to VoiceEvent without handling it here
      // fails typecheck, because `e` is only assignable to `never` when every
      // case above is covered. Returning `s` keeps the reducer total at runtime.
      return ((_exhaustive: never) => s)(e);
  }
}

/** User-facing timeout copy. Says what happened and what to do, never a code. */
const TIMEOUT_MESSAGE: Partial<Record<VoicePhase, string>> = {
  listening: "I stopped listening after a minute — tap the mic to try again.",
  transcribing: "I couldn't make that out. Give it another go?",
  thinking: 'That one took too long. Try asking again, or type it instead.',
  speaking: 'The reply cut off. The transcript above is the full answer.',
};
