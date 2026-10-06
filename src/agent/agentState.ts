/* ═══════════════════════════════════════════════════════════════════════════
   agentState — what ASAP is doing RIGHT NOW, locally.

   THE PROBLEM THIS SOLVES
   sceneDirector already derives ASAP's performance from the live feed, and it
   does that well — but every one of its inputs is a row that has already landed
   in Supabase. That is the correct latency for "ASAP filed something to memory";
   it is the wrong latency for "you are holding the mic button down". Voice needs
   a signal that changes in the same frame as the user's finger.

   So there are two clocks, and they are kept deliberately separate:
     · agent_events  — what ASAP DID.    Server truth, seconds old, durable.
     · agentState    — what ASAP IS doing. Local, immediate, ephemeral.

   THE ONE RULE
   Nothing subscribes to this store to decide how to LOOK. The butler and the
   edge glow both read the single SceneState that directScene() returns, and
   this store is an INPUT to that function — not a parallel source of truth.
   That is what makes "the glow is always in sync with the character" a
   structural property rather than a thing we have to remember: there is only
   one object describing the performance, so there is nothing to synchronise.
   ═══════════════════════════════════════════════════════════════════════════ */

import { create } from 'zustand';

/** The local half of ASAP's state — the part the server does not know yet. */
export type VoicePhase =
  | 'idle'          // mic closed
  | 'listening'     // holding to talk, audio streaming up
  | 'transcribing'  // button released, STT still resolving
  | 'thinking'      // transcript handed to Hermes, waiting on the first token
  | 'speaking';     // TTS playing back

/** Phases during which ASAP is mid-turn and the UI must reflect it. */
export const ACTIVE_VOICE_PHASES: readonly VoicePhase[] = [
  'listening', 'transcribing', 'thinking', 'speaking',
];

export const isVoiceActive = (p: VoicePhase): boolean =>
  (ACTIVE_VOICE_PHASES as readonly string[]).includes(p);

export interface VoiceState {
  phase: VoicePhase;
  /** ms epoch the current phase began — drives motion timing, injected not read. */
  since: number;
  /** Live interim transcript while listening; the final one once transcribing ends. */
  transcript: string;
  /** True once the transcript is final rather than interim. */
  final: boolean;
  /** Last error, surfaced in the UI rather than swallowed. */
  error: string | null;
}

export interface AgentStateStore extends VoiceState {
  /** Move to a phase. Stamps `since` so motion and glow timing stay honest. */
  setPhase: (phase: VoicePhase, now?: number) => void;
  setTranscript: (transcript: string, final: boolean) => void;
  /** Record a failure and return to idle — voice must never strand the UI. */
  fail: (error: string, now?: number) => void;
  reset: (now?: number) => void;
}

const initial = (now: number): VoiceState => ({
  phase: 'idle',
  since: now,
  transcript: '',
  final: false,
  error: null,
});

export const useAgentState = create<AgentStateStore>((set) => ({
  ...initial(Date.now()),

  setPhase: (phase, now = Date.now()) =>
    set((s) => (s.phase === phase ? s : {
      phase,
      since: now,
      // Starting a new turn clears the previous one's transcript, so a stale
      // sentence can never be read back as if it were what was just said.
      transcript: phase === 'listening' ? '' : s.transcript,
      final: phase === 'listening' ? false : s.final,
      error: null,
    })),

  setTranscript: (transcript, final) => set({ transcript, final }),

  fail: (error, now = Date.now()) =>
    set({ phase: 'idle', since: now, error, final: false }),

  reset: (now = Date.now()) => set(initial(now)),
}));

/** The shape sceneDirector consumes. Kept tiny so the director stays pure. */
export interface VoiceSignal {
  phase: VoicePhase;
  since: number;
}

/** Selector — the only thing the presence layer should pull from this store. */
export const selectVoiceSignal = (s: AgentStateStore): VoiceSignal => ({
  phase: s.phase,
  since: s.since,
});
