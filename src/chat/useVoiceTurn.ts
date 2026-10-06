/* ═══════════════════════════════════════════════════════════════════════════
   useVoiceTurn — runs the voice machine, and is the thing that finally lights
   the screen edges.

   `presence/EdgeGlow.tsx` has been mounted app-wide in App.tsx since it was
   written, mapping `listening` and `thinking` to the brand orange. It has never
   lit up once, because NOTHING HAS EVER WRITTEN A VOICE PHASE. This hook is
   that missing producer: it mirrors every machine transition into
   `agentState`, and the edges follow for free.

   SPEECH RECOGNITION IS A SEAM, NOT A DECISION
   Transcription here uses the browser's built-in SpeechRecognition, which works
   today in Chrome, Edge and Safari and needs no infrastructure. That is an
   INTERIM: the intended path is the NVIDIA Nemotron ASR gateway, and it plugs
   in at exactly one place — `startRecognition` below. Everything downstream
   (the machine, the watchdogs, the edge glow, the ball) is transport-agnostic
   and does not change when it is swapped.

   Where recognition is unavailable, `supported` comes back false and the UI
   hides the mic rather than offering a button that does nothing.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAgentState } from '../agent/agentState';
import { writeVoiceLevel, clearVoiceLevel, rmsFromTimeDomain } from '../voice/voiceLevel';
import {
  voiceReduce, initialVoiceState, type VoiceMachineState, type VoiceEvent,
} from './voiceMachine';

/* The Web Speech API is not in TypeScript's DOM lib. These are the members
   actually used — deliberately minimal rather than a full ambient declaration
   that would imply more support than is relied on. */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionCtor | null;
}

/** Human copy for the error codes SpeechRecognition reports. */
const RECOGNITION_ERROR: Record<string, string> = {
  'not-allowed': 'I need microphone access. Enable it in your browser settings and try again.',
  'service-not-allowed': 'I need microphone access. Enable it in your browser settings and try again.',
  'no-speech': "I didn't catch anything. Try again?",
  'audio-capture': 'No microphone found. Check that one is connected.',
  network: "I couldn't reach the speech service. Check your connection.",
  aborted: '',   // user-initiated; not an error worth showing
};

export interface VoiceTurn {
  state: VoiceMachineState;
  /** False when the browser cannot transcribe — hide the mic entirely. */
  supported: boolean;
  press: () => void;
  release: () => void;
  cancel: () => void;
  /** Called by the caller once Hermes has replied / finished speaking. */
  send: (e: VoiceEvent) => void;
}

/* ── The amplitude meter ──────────────────────────────────────────────────
   Feeds `voiceLevel`, which the ball reads once per frame. Separate from
   SpeechRecognition on purpose: that API reports WORDS, never loudness, so a
   visualiser driven by it can only pulse when a phrase lands rather than moving
   with the voice. */
interface Meter { stop: () => void }

async function startMeter(): Promise<Meter | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) { stream.getTracks().forEach((t) => t.stop()); return null; }

    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      writeVoiceLevel(rmsFromTimeDomain(buf));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return {
      stop: () => {
        cancelAnimationFrame(raf);
        // Stop the TRACKS, not just the context: leaving them live keeps the
        // browser's recording indicator on, which reads as spyware.
        stream.getTracks().forEach((t) => t.stop());
        source.disconnect();
        void ctx.close().catch(() => { /* already closed */ });
        clearVoiceLevel();
      },
    };
  } catch {
    // Denied or unavailable. The turn still works; the ball just does not
    // react to amplitude, which is a downgrade rather than a failure.
    return null;
  }
}

export function useVoiceTurn(onFinalTranscript: (text: string) => void): VoiceTurn {
  const [state, setState] = useState<VoiceMachineState>(() => initialVoiceState(Date.now()));
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const meter = useRef<Meter | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const supported = useMemo(() => recognitionCtor() !== null, []);

  // Mirror the machine's phase into the shared store. This is what EdgeGlow,
  // and anything else reading the voice signal, actually reacts to.
  const setPhase = useAgentState((s) => s.setPhase);
  const setTranscript = useAgentState((s) => s.setTranscript);
  const failVoice = useAgentState((s) => s.fail);

  const dispatch = useCallback((e: VoiceEvent) => {
    // PARTIAL carries no timestamp — it never changes the phase, so it has no
    // transition to stamp. Everything that DOES transition brings its own `at`.
    const at = 'at' in e ? e.at : Date.now();
    setState((prev) => {
      const next = voiceReduce(prev, e);
      if (next === prev) return prev;

      if (next.error && next.phase === 'idle') failVoice(next.error, at);
      else if (next.phase !== prev.phase) setPhase(next.phase, at);

      if (next.transcript !== prev.transcript) setTranscript(next.transcript, next.final);
      return next;
    });
  }, [setPhase, setTranscript, failVoice]);

  /* The watchdog. One interval for the whole machine rather than a timer per
     transition: a timer that outlives its phase is exactly how a stuck turn
     leaves the app-wide glow on, and there is nothing to leak here. */
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'TICK', at: Date.now() }), 1000);
    return () => clearInterval(id);
  }, [dispatch]);

  const stopRecognition = useCallback(() => {
    meter.current?.stop();
    meter.current = null;

    const r = recognition.current;
    recognition.current = null;
    if (!r) return;
    r.onresult = null; r.onerror = null; r.onend = null;
    try { r.stop(); } catch { /* already stopped */ }
  }, []);

  // Never leave the microphone open, or the phase non-idle, on unmount. Both
  // are app-wide: the mic is a hardware indicator, the phase is the edge glow.
  useEffect(() => () => {
    stopRecognition();
    useAgentState.getState().reset();
  }, [stopRecognition]);

  const press = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      dispatch({ type: 'ERROR', message: 'This browser cannot transcribe speech. Type instead?', at: Date.now() });
      return;
    }
    stopRecognition();
    dispatch({ type: 'PRESS', at: Date.now() });

    const r = new Ctor();
    r.lang = 'en-CA';
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (e) => {
      let interim = '';
      let done = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const alt = e.results[i][0];
        if (e.results[i].isFinal) done += alt.transcript;
        else interim += alt.transcript;
      }
      if (done) dispatch({ type: 'FINAL', text: done, at: Date.now() });
      else if (interim) dispatch({ type: 'PARTIAL', text: interim });
    };

    r.onerror = (e) => {
      const msg = RECOGNITION_ERROR[e.error];
      // An empty string means "expected, say nothing" (a user-initiated abort).
      if (msg === '') dispatch({ type: 'CANCEL', at: Date.now() });
      else dispatch({ type: 'ERROR', message: msg ?? 'Something went wrong listening.', at: Date.now() });
      stopRecognition();
    };

    r.onend = () => {
      // Recognition can end on its own (a pause it reads as the end of speech).
      // If the machine is still mid-turn, treat whatever we have as final so
      // the phase advances instead of hanging until the watchdog fires.
      const s = stateRef.current;
      if (s.phase === 'listening' || s.phase === 'transcribing') {
        dispatch({ type: 'FINAL', text: s.transcript, at: Date.now() });
      }
    };

    recognition.current = r;
    try { r.start(); } catch {
      dispatch({ type: 'ERROR', message: 'I could not start listening. Try again?', at: Date.now() });
      return;
    }

    // Fire-and-forget: the meter is a nicety, and awaiting it would delay the
    // moment listening visibly begins. If the turn ends before it resolves, the
    // guard below stops an orphaned stream from outliving it.
    void startMeter().then((m) => {
      if (!m) return;
      if (recognition.current !== r) { m.stop(); return; }
      meter.current = m;
    });
  }, [dispatch, stopRecognition]);

  const release = useCallback(() => {
    if (stateRef.current.phase !== 'listening') return;
    dispatch({ type: 'RELEASE', at: Date.now() });
    // The meter's job is over the moment the user stops talking; recognition's
    // is not, so only the meter is torn down here. `onend` delivers the text.
    meter.current?.stop();
    meter.current = null;
    const r = recognition.current;
    if (r) { try { r.stop(); } catch { /* already stopped */ } }
  }, [dispatch]);

  const cancel = useCallback(() => {
    stopRecognition();
    dispatch({ type: 'CANCEL', at: Date.now() });
  }, [dispatch, stopRecognition]);

  /* Hand the finished transcript up exactly once per turn. Keyed on the
     transition INTO `thinking` rather than on the transcript string, so two
     identical questions in a row both fire. */
  const lastSent = useRef(0);
  useEffect(() => {
    if (state.phase === 'thinking' && state.final && state.since !== lastSent.current) {
      lastSent.current = state.since;
      onFinalTranscript(state.transcript);
    }
  }, [state.phase, state.final, state.since, state.transcript, onFinalTranscript]);

  return { state, supported, press, release, cancel, send: dispatch };
}
