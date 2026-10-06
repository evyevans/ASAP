/* Shared shapes for the Chat tab. Kept in their own module so the pure logic
   (voiceMachine, hermesAdapter) and the components agree on one vocabulary
   without importing each other's React. */

import type { HermesAction } from './hermesAdapter';

export interface ChatAttachment {
  /** Local id, stable for the lifetime of the message. */
  id: string;
  filename: string;
  /** Bytes. Shown to the user, and checked against MAX_UPLOAD_BYTES. */
  size: number;
  /** Supabase Storage path, once the upload has landed. */
  storagePath?: string;
  /** Row id in asap_documents, once created. */
  documentId?: number;
  status: 'uploading' | 'stored' | 'failed';
  /** Why it failed, in words a user can act on. */
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  /** ms epoch. A number rather than a Date so messages survive JSON round-trips
   *  through Supabase without a revive step. */
  at: number;
  /** Only ever set on agent messages. */
  actions?: HermesAction[];
  /** Only ever set on user messages. */
  attachments?: ChatAttachment[];
  /** True while the agent's reply is still being produced. */
  pending?: boolean;
  /** Set instead of `text` when the turn failed. Rendered differently. */
  error?: string;
  /** True when this turn was spoken rather than typed — the bubble says so, so
   *  a transcription mistake is legible as one. */
  spoken?: boolean;
}

/** 20 MB. Comfortably covers a scanned agreement of purchase and sale, and well
 *  under Supabase Storage's default per-file limit. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** What Hermes can usefully do something with. Anything else is refused at the
 *  picker with an explanation, rather than uploaded and silently ignored. */
export const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/heic',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,.heic,.txt,.csv,.doc,.docx,.xls,.xlsx';

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Why a file cannot be accepted, or null if it can.
 *
 * Pure and exported so the rules are testable without a file picker — and so
 * the composer and the drop target cannot drift apart on what they allow.
 */
export function rejectReason(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  }
  // Browsers report an empty `type` for some formats (notably .heic and files
  // dragged from certain apps), so fall back to the extension rather than
  // refusing something the user can plainly see is a PDF.
  if (file.type && !(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPT_ATTR.split(',').includes(ext)) {
      return `I can't read ${file.name} — try a PDF, image, spreadsheet or document.`;
    }
  }
  return null;
}
