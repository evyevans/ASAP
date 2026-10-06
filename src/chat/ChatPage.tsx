/* ═══════════════════════════════════════════════════════════════════════════
   Chat — one thread, three ways in: type it, say it, or drop a file on it.

   WHY THE DOCUMENTS TAB IS NOT A TAB
   Uploading a file and telling an agent what to do with it IS a message. Giving
   it its own page would mean two inboxes, two histories, and a user having to
   decide which one a question belongs in before asking it. The paperclip in the
   composer is the whole documents feature.

   WHY THE BALL IS HERE AND NOT ON HOME
   The ball is the voice agent's face, so it lives where the voice lives. Home
   stays an ambient dashboard. One voice surface means one state machine, and
   the screen edges glow from either tab regardless, because EdgeGlow is mounted
   app-wide in App.tsx.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { CHAT_KEY } from '../demo/seed';
import { AiCore } from './AiCore';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { useVoiceTurn } from './useVoiceTurn';
import { useDocumentUpload } from './useDocumentUpload';
import { ask, isLive } from './hermesAdapter';
import { buildDraftPrompt, categoryHint, categoryLabel, type DraftContext } from './draftPrompt';
import type { ChatMessage } from './chatTypes';

/** How many prior turns Hermes is given. Enough for a follow-up ("book the
 *  second one") without shipping an unbounded transcript on every request. */
const HISTORY_TURNS = 12;

let seq = 0;
const nextId = () => `m${++seq}-${Date.now()}`;

const PHASE_CAPTION: Record<string, string> = {
  idle: 'Ask me anything about your clients, your calendar or a document.',
  listening: 'Listening…',
  transcribing: 'Got it — one moment.',
  thinking: 'Working on it…',
  speaking: 'Here you go.',
};

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? 'null');
      if (Array.isArray(stored)) return stored.filter(m => m && typeof m.text === 'string' && ['user', 'agent'].includes(m.role)).map(m => m.pending ? { ...m, pending: false, error: 'This sample turn was interrupted. Send it again.' } : m);
    } catch { /* Start with a clean thread. */ }
    return [];
  });
  useEffect(() => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-60))); } catch { /* in-memory chat still works */ } }, [messages]);
  const { upload } = useDocumentUpload();
  const inFlight = useRef<AbortController | null>(null);

  /* The "Give ASAP direction" shortcut on a pending draft (Home's "Needs you",
   * or the tray card) lands here by navigating to /chat with the draft in
   * router state. Read with a lazy initializer so it is captured exactly once
   * — a later re-render must not re-apply it, or dismissing/editing the
   * composer would keep getting overwritten. */
  const location = useLocation();
  const navigate = useNavigate();
  const [activeDraft] = useState<DraftContext | undefined>(
    () => (location.state as { draft?: DraftContext } | null)?.draft
  );
  const consumedDraftState = useRef(false);
  useEffect(() => {
    if (consumedDraftState.current || !activeDraft) return;
    consumedDraftState.current = true;
    // Clears the router state so navigating back to /chat later (browser back,
    // or the tab bar) does not resurrect the same prefill a second time. The
    // ref guard above is what makes this a run-once effect regardless of how
    // often navigate/location identity changes.
    navigate(location.pathname, { replace: true });
  }, [activeDraft, navigate, location.pathname]);

  const patch = useCallback((id: string, next: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...next } : m)));
  }, []);

  /** One path for typed and spoken turns alike — they differ only in a flag. */
  const runTurn = useCallback(async (text: string, files: File[], spoken: boolean) => {
    const userId = nextId();
    const agentId = nextId();

    const attachments = files.map((f) => ({
      id: `${f.name}-${f.size}-${nextId()}`,
      filename: f.name,
      size: f.size,
      status: 'uploading' as const,
    }));

    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', text, at: Date.now(), spoken, attachments: attachments.length ? attachments : undefined },
      { id: agentId, role: 'agent', text: '', at: Date.now(), pending: true },
    ]);

    // Upload first: Hermes is told the storage paths, so the files have to
    // exist before the question is asked, not alongside it.
    const stored: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const res = await upload(files[i], text);
      const a = attachments[i];
      setMessages((prev) => prev.map((m) => {
        if (m.id !== userId || !m.attachments) return m;
        return {
          ...m,
          attachments: m.attachments.map((x) => x.id !== a.id ? x : res.ok
            ? { ...x, status: 'stored' as const, storagePath: res.path, documentId: res.documentId }
            : { ...x, status: 'failed' as const, error: res.error }),
        };
      }));
      if (res.ok) stored.push(res.path);
    }

    const controller = new AbortController();
    inFlight.current = controller;

    const history = messages
      .filter((m) => !m.pending && !m.error && m.text)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text }));

    const res = await ask(text || 'Preview my attachment', { history, attachments: stored, signal: controller.signal });
    inFlight.current = null;

    patch(agentId, res.ok
      ? { text: res.text, actions: res.actions, pending: false, at: Date.now() }
      : { text: '', error: res.error, pending: false, at: Date.now() });

    return res.ok;
  }, [messages, upload, patch]);

  /* Voice: the transcript arrives from the machine, runs the same turn, then
     reports back so the phase advances thinking → speaking → idle. Without
     these the edges would stay orange until the watchdog fired. */
  const voiceRef = useRef<ReturnType<typeof useVoiceTurn> | null>(null);
  const voice = useVoiceTurn(
    useCallback((transcript: string) => {
      void runTurn(transcript, [], true).then((ok) => {
        const at = Date.now();
        if (!ok) { voiceRef.current?.send({ type: 'ERROR', message: 'That did not go through.', at }); return; }
        voiceRef.current?.send({ type: 'REPLY', at });
        // No TTS yet, so "spoken" completes as soon as the reply is on screen.
        // When the NVIDIA gateway lands this fires on audio end instead.
        voiceRef.current?.send({ type: 'SPOKEN', at: at + 1 });
      });
    }, [runTurn])
  );
  useEffect(() => { voiceRef.current = voice; }, [voice]);

  const phase = voice.state.phase;

  const onSend = useCallback((text: string, files: File[]) => {
    void runTurn(text, files, false);
  }, [runTurn]);

  const onCancel = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    voice.cancel();
    setMessages((prev) => prev.map((m) => m.pending
      ? { ...m, pending: false, error: 'Cancelled.' } : m));
  }, [voice]);

  /** Click once to start listening, click again to stop and send — no holding. */
  const onMicClick = useCallback(() => {
    if (phase === 'listening') voice.release();
    else voice.press();
  }, [phase, voice]);

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-6 flex flex-col" style={{ minHeight: 'calc(100vh - 6rem)' }}>
      {/* ── The ball ── */}
      <div className="relative flex flex-col items-center shrink-0">
        <AiCore phase={phase} className="w-40 h-40 md:w-52 md:h-52" />
        <p className="-mt-2 text-sm text-text-secondary text-center min-h-[1.25rem]" aria-live="polite">
          {voice.state.error ?? PHASE_CAPTION[phase] ?? PHASE_CAPTION.idle}
        </p>
        {!isLive() && (
          /* Keep the local scenario boundary visible beside the chat surface. */
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border
            bg-bg-surface px-2.5 py-1 text-[11px] text-text-tertiary">
            <Info size={11} /> Interactive sample scenarios · no live agent connected
          </span>
        )}
      </div>

      {/* ── The thread ── */}
      {messages.length === 0 ? (
        activeDraft ? (
          // Arrived via "Give ASAP direction" on a pending draft. The composer
          // below already carries the context and the draft's own text
          // (buildDraftPrompt) — this card just confirms, at a glance, which
          // draft the conversation is about.
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 py-10">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {categoryLabel(activeDraft.category)} draft — needs your direction
            </span>
            <h2 className="text-base font-semibold text-text-primary max-w-md">{activeDraft.title}</h2>
            <p className="text-sm text-text-secondary max-w-sm leading-relaxed">
              Tell ASAP what to do with it — for example, {categoryHint(activeDraft.category)}.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 py-10">
            <h2 className="text-base font-semibold text-text-primary">Start a conversation</h2>
            <p className="text-sm text-text-secondary max-w-sm leading-relaxed">
              Explore the monthly plan, Sarah’s brief, or her prepared packet.
              <br />
              Try an attachment preview; file contents are not processed.
              <br />
              Click the mic to speak instead of typing.
            </p>
          </div>
        )
      ) : (
        <MessageList messages={messages} />
      )}

      <div className="flex flex-wrap gap-2 mt-4" aria-label="Sample prompts">
        {['What is my monthly plan?', 'Explain next week', 'Show Sarah’s brief', 'Show Sarah’s packet'].map(prompt => <button key={prompt} disabled={messages.some(m => m.pending)} onClick={() => onSend(prompt, [])} className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-surface disabled:opacity-40">{prompt}</button>)}
      </div>
      {/* ── The composer ── */}
      <div className="shrink-0 pt-3">
        <Composer
          phase={messages.some(m => m.pending) && phase === 'idle' ? 'thinking' : phase}
          interim={voice.state.transcript}
          onSend={onSend}
          onMicClick={onMicClick}
          onCancel={onCancel}
          disabled={!voice.supported && false}
          initialText={activeDraft ? buildDraftPrompt(activeDraft) : undefined}
        />
        <p className="mt-2 text-center text-[11px] text-text-tertiary">
          {voice.supported
            ? 'Enter to send · Shift+Enter for a new line · click the mic to speak'
            : 'Enter to send · Shift+Enter for a new line'}
        </p>
      </div>
    </div>
  );
}
