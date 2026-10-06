/* ═══════════════════════════════════════════════════════════════════════════
   draftPrompt — turns a pending draft into a Chat-tab starting point.

   WHY THIS EXISTS
   "Needs you" used to mean a plain Approve/Reject button (see the tray card in
   Hotspots.tsx, still there for a fast yes/no). But not every category is a
   yes/no decision: a content draft might need to be posted to Instagram, saved
   to Drive, or held; a deal document might need to go to the other agent's
   lawyer, not just "approved". Hard-coding one button per possible action per
   category is a combinatorial mess that will always be one action behind what
   a realtor actually wants to do.

   So instead of more buttons, the card becomes a shortcut into Chat — the
   surface that can express "post this to Instagram" and "send this to the
   Smiths and log it in FUB" equally well, because it is free text to Hermes,
   not a fixed vocabulary of buttons.

   This module only builds the TEXT. Where it is used decides what the button
   looks like and how navigation happens (Home's PendingRow, the tray card).
   ═══════════════════════════════════════════════════════════════════════════ */

import { CATEGORY_META } from '../analytics/executionTypes';

export interface DraftContext {
  id: number;
  title: string;
  /** BlockCategory or 'unresolved' — anything else falls back the same as
   *  CATEGORY_META itself does. */
  category: string | null;
  /** The draft's own text — artifact_text or output_summary, whichever the
   *  caller has on hand. */
  summary: string;
}

/** How long a quoted excerpt can run before it swallows the whole composer.
 *  240 chars is roughly two sentences — enough to remind, not enough to read
 *  as the message itself. */
const EXCERPT_LIMIT = 240;

function excerpt(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= EXCERPT_LIMIT) return clean;
  // Break on a word boundary so it never reads as a truncated word.
  const cut = clean.slice(0, EXCERPT_LIMIT);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : EXCERPT_LIMIT)}…`;
}

const categoryLabel = (category: string | null): string =>
  (CATEGORY_META[category ?? 'unresolved'] ?? CATEGORY_META.unresolved).label;

/**
 * The message that lands in the composer, already typed. The user's cursor
 * lands at the end — after "My direction:" — so they only ever have to type
 * the instruction itself, never the context around it.
 */
export function buildDraftPrompt(draft: DraftContext): string {
  const label = categoryLabel(draft.category);
  const body = draft.summary.trim()
    ? `\n\nContext: "${excerpt(draft.summary)}"`
    : '';
  return `Re: "${draft.title}" — a ${label} draft ASAP prepared and is waiting on you.${body}\n\nMy direction: `;
}

/** Category-specific examples of what "direction" can mean here — never sent,
 *  shown only as a caption so the blank composer does not feel like a trick
 *  question. Phrased as things a realtor would actually say. */
const CATEGORY_HINTS: Record<string, string> = {
  outreach: 'send it now, save it to CRM, or hold it for later',
  content: 'post it, save it to Drive, or hold it for review',
  crm: 'log it in FUB, skip it, or flag it for later',
  prep: 'save it to the client file, or ask for changes first',
  deal: "send it to the other agent, revise the terms, or hold it",
  unresolved: 'tell ASAP what to do with it',
};

export function categoryHint(category: string | null): string {
  return CATEGORY_HINTS[category ?? 'unresolved'] ?? CATEGORY_HINTS.unresolved;
}

export { categoryLabel };
