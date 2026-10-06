/* The composer: type it, speak it, or attach a file and say what to do with it.
   One control, one thread — the "documents tab" is this paperclip, which is why
   there is no separate Documents page. */

import { useEffect, useRef, useState } from 'react';
import { Mic, Paperclip, ArrowUp, Square, X } from 'lucide-react';
import { ACCEPT_ATTR, formatBytes, rejectReason, type ChatAttachment } from './chatTypes';

export interface ComposerProps {
  /** Non-idle means a turn is in flight. */
  phase: string;
  onSend: (text: string, files: File[]) => void;
  /** Click once to start listening, click again to stop and send. */
  onMicClick: () => void;
  onCancel: () => void;
  /** Live interim transcript, shown in place of the input while listening. */
  interim?: string;
  pendingAttachments?: ChatAttachment[];
  disabled?: boolean;
  /** Seeds the textarea once on mount — e.g. the "Give ASAP direction" shortcut
   *  from a pending draft arrives here already typed, cursor at the end, so the
   *  user only ever has to type their instruction. Read once; changing it after
   *  mount does nothing, which is correct — ChatPage remounts this component
   *  (a fresh navigation to /chat) whenever a new draft is being handed over. */
  initialText?: string;
}

export function Composer({
  phase, onSend, onMicClick, onCancel, interim, disabled, initialText,
}: ComposerProps) {
  const [text, setText] = useState(initialText ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const listening = phase === 'listening';
  const busy = phase === 'transcribing' || phase === 'thinking' || phase === 'speaking';
  const canSend = (text.trim().length > 0 || files.length > 0) && !busy && !listening;

  /* Grow with the content, up to a ceiling. A fixed-height input makes people
     write one-line questions; a growing one invites the whole thought. */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  /* Land the cursor at the end of the prefilled text — after "My direction: "
     — rather than at the start, so the user can just start typing. Runs once:
     an empty dependency array is deliberate, matching the "read once" contract
     above; re-running this on every `initialText` identity would fight the
     user's own edits. */
  const focusedInitialText = useRef(false);
  useEffect(() => {
    if (focusedInitialText.current) return;
    focusedInitialText.current = true;
    const el = inputRef.current;
    if (!el || !initialText) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [initialText]);

  useEffect(() => {
    if (!rejected) return;
    const id = setTimeout(() => setRejected(null), 5000);
    return () => clearTimeout(id);
  }, [rejected]);

  const addFiles = (incoming: FileList | File[]) => {
    const accepted: File[] = [];
    for (const f of Array.from(incoming)) {
      const why = rejectReason(f);
      if (why) { setRejected(why); continue; }
      accepted.push(f);
    }
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  };

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim(), files);
    setText('');
    setFiles([]);
  };

  return (
    <div
      className={`rounded-2xl border bg-bg-elevated transition-colors ${
        dragging ? 'border-accent border-dashed bg-accent/5' : 'border-border'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
      }}
    >
      {rejected && (
        <div className="flex items-start gap-2 border-b border-border px-4 py-2">
          <X size={13} className="text-error mt-0.5 shrink-0" />
          <span className="text-xs text-text-secondary">{rejected}</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5">
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-2 py-1"
            >
              <Paperclip size={11} className="text-text-tertiary" />
              <span className="text-[11px] font-medium text-text-primary truncate max-w-[12rem]">{f.name}</span>
              <span className="text-[10px] text-text-tertiary tabular-nums">{formatBytes(f.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="text-text-tertiary hover:text-text-primary"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 p-2.5">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            // Reset so picking the SAME file twice still fires a change event.
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || busy}
          aria-label="Attach a file"
          className="shrink-0 rounded-xl p-2 text-text-tertiary hover:text-text-primary hover:bg-bg-surface
            disabled:opacity-40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Paperclip size={17} />
        </button>

        {listening ? (
          /* While listening the input is replaced by the live transcript, so
             there is exactly one place to look. Two live text fields at once
             is the thing that makes voice UIs feel frantic. */
          <div className="flex-1 min-h-[2.5rem] flex items-center px-2">
            <span className="text-sm text-text-primary">
              {interim || <span className="text-text-tertiary">Listening…</span>}
              <span className="ml-0.5 inline-block w-0.5 h-4 align-middle bg-accent animate-pulse" />
            </span>
          </div>
        ) : (
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            disabled={disabled || busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter newlines — the convention everywhere.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder={busy ? 'ASAP is working…' : 'Ask ASAP anything, or click the mic to speak'}
            className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-text-primary
              placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
          />
        )}

        {busy ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Stop"
            className="shrink-0 rounded-xl bg-bg-surface border border-border p-2 text-text-secondary
              hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Square size={15} />
          </button>
        ) : (
          <>
            <button
              type="button"
              // Click to start, click again to stop and send — no need to hold
              // the button down while speaking.
              onClick={onMicClick}
              disabled={disabled}
              aria-label={listening ? 'Stop and send' : 'Click to speak'}
              aria-pressed={listening}
              className={`shrink-0 rounded-xl p-2 transition-colors focus:outline-none
                focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${
                listening
                  ? 'bg-accent text-text-on-accent'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-bg-surface'
              }`}
            >
              <Mic size={17} />
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send"
              className="shrink-0 rounded-xl bg-accent p-2 text-text-on-accent transition-opacity
                disabled:opacity-25 hover:bg-accent-hover focus:outline-none focus-visible:ring-2
                focus-visible:ring-accent"
            >
              <ArrowUp size={17} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
