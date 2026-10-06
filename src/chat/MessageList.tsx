/* The thread. Light-themed against ASAP's tokens — the capa-showcase reference
   this borrows its motion from is dark-themed, so the styling is rebuilt rather
   than copied. Only the enter/exit transitions carry over. */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, AlertCircle, Mic, Loader2, CheckCircle2 } from 'lucide-react';
import type { ChatMessage, ChatAttachment } from './chatTypes';
import { formatBytes } from './chatTypes';

const timeShort = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-CA', {
    timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit',
  });

function Attachment({ a }: { a: ChatAttachment }) {
  const Icon = a.status === 'uploading' ? Loader2
    : a.status === 'failed' ? AlertCircle
    : CheckCircle2;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-primary/60 px-2.5 py-1.5">
      <Icon
        size={13}
        className={
          a.status === 'uploading' ? 'text-text-tertiary animate-spin'
          : a.status === 'failed' ? 'text-error'
          : 'text-success'
        }
      />
      <span className="text-[11px] font-medium text-text-primary truncate max-w-[14rem]">
        {a.filename}
      </span>
      <span className="text-[10px] text-text-tertiary tabular-nums shrink-0">
        {a.status === 'failed' ? (a.error ?? 'failed') : `${formatBytes(a.size)} · local preview`}
      </span>
    </div>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const isUser = m.role === 'user';

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[min(38rem,85%)] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1.5`}>
        {m.attachments && m.attachments.length > 0 && (
          <div className="flex flex-col gap-1.5 w-full">
            {m.attachments.map((a) => <Attachment key={a.id} a={a} />)}
          </div>
        )}

        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            m.error
              ? 'border border-error/30 bg-error/5 text-text-primary'
              : isUser
                // The user's own words carry the accent; the agent's sit on the
                // surface. Reversing this made every reply shout.
                ? 'bg-accent text-text-on-accent rounded-br-md'
                : 'border border-border bg-bg-surface text-text-primary rounded-bl-md'
          }`}
        >
          {m.error ? (
            <span className="flex items-start gap-2">
              <AlertCircle size={14} className="text-error mt-0.5 shrink-0" />
              <span>{m.error}</span>
            </span>
          ) : m.pending ? (
            /* Three dots rather than a spinner: a spinner reads as "loading a
               page", dots read as "composing a reply". The edges of the screen
               are already glowing orange, so this only has to say WHERE. */
            <span className="flex items-center gap-1 py-1" aria-label="Thinking">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-text-tertiary"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </span>
          ) : (
            <p className="whitespace-pre-wrap break-words">{m.text}</p>
          )}
        </div>

        {m.actions && m.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.actions.map((a, i) => (
              <span
                key={`${a.kind}-${i}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  a.needsApproval
                    ? 'border-warning/40 bg-warning/10 text-text-primary'
                    : 'border-border bg-bg-surface text-text-secondary'
                }`}
              >
                <FileText size={11} />
                {a.label}
                {a.needsApproval && <span className="text-warning font-semibold">needs your OK</span>}
              </span>
            ))}
          </div>
        )}

        <div className={`flex items-center gap-1.5 px-1 text-[10px] text-text-tertiary ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="tabular-nums">{timeShort(m.at)}</span>
          {/* Marking spoken turns means a transcription mistake is legible as
              one, instead of looking like the user typed something odd. */}
          {m.spoken && <><Mic size={9} /><span>spoken</span></>}
        </div>
      </div>
    </motion.div>
  );
}

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  /* Only auto-scroll when the user is already at the bottom. Yanking someone
     back down while they are reading earlier context is the single most
     irritating thing a chat UI can do. */
  const pinned = useRef(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (pinned.current) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <div
      ref={scrollerRef}
      className="flex-1 overflow-y-auto px-1 py-2"
      role="log"
      aria-live="polite"
      aria-label="Conversation with ASAP"
    >
      <div className="flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {messages.map((m) => <Bubble key={m.id} m={m} />)}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
    </div>
  );
}
