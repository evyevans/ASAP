/** Showcase chat transport. The production UI contract is preserved; replies
 * and explicit packet decisions use local scenario data only. No HTTP fallback. */
/** A thing Hermes says it did or wants to do, surfaced under the reply. */
export interface HermesAction {
  kind: string;
  label: string;
  /** Present when the action needs the user's OK before it commits. */
  needsApproval?: boolean;
}

export interface HermesReply {
  ok: true;
  text: string;
  actions: HermesAction[];
}

export interface HermesFailure {
  ok: false;
  /** Shown to the user verbatim. Never a status code or a stack. */
  error: string;
}

export type HermesResult = HermesReply | HermesFailure;

export interface AskContext {
  /** Prior turns, oldest first. Trimmed by the caller — the adapter does not
   *  decide how much history the agent should get. */
  history: { role: 'user' | 'agent'; text: string }[];
  /** Storage paths of files attached to THIS turn. */
  attachments?: string[];
  /** Abort when the user cancels or the watchdog fires. */
  signal?: AbortSignal;
}

/**
 * Coerce whatever Hermes returns into `HermesReply`.
 *
 * Exported because it is the riskiest pure function here: the response shape is
 * still unknown, so this is the piece most likely to be wrong when the real
 * endpoint arrives, and it should be provable against a sample body without a
 * network. It accepts several plausible key names rather than guessing one.
 */
export function normalise(body: unknown): HermesResult {
  if (typeof body === 'string') {
    return body.trim()
      ? { ok: true, text: body, actions: [] }
      : { ok: false, error: 'The agent sent an empty reply.' };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'The agent sent something I could not read.' };
  }

  const b = body as Record<string, unknown>;
  const text = [b.reply, b.text, b.message, b.output, b.answer].find(
    (v): v is string => typeof v === 'string' && v.trim().length > 0
  );
  if (!text) return { ok: false, error: 'The agent sent an empty reply.' };

  const raw = Array.isArray(b.actions) ? b.actions : [];
  const actions: HermesAction[] = raw.flatMap((a): HermesAction[] => {
    if (!a || typeof a !== 'object') return [];
    const o = a as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label
      : typeof o.title === 'string' ? o.title
      : null;
    if (!label) return [];
    return [{
      kind: typeof o.kind === 'string' ? o.kind : 'action',
      label,
      needsApproval: o.needsApproval === true || o.needs_approval === true,
    }];
  });

  return { ok: true, text, actions };
}

// The showcase deliberately has no live transport, regardless of environment variables.
export { DEMO_REPLY_PREFIX as MOCK_PREFIX } from '../demo/chat';
import { askDemo } from '../demo/chat';
export const isLive = () => false;
export async function ask(text: string, ctx: AskContext = { history: [] }): Promise<HermesResult> {
  if (!text.trim()) return { ok: false, error: 'Nothing to send.' };
  try { return await askDemo(text, ctx); }
  catch { return { ok: false, error: 'The sample action could not finish. Try again or reset the demo.' }; }
}
