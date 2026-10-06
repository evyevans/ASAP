/* The creative heart: turn a raw agent_event into a warm, plain-English line
 * with an icon + accent. This is what makes the live stream feel human. */

import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2, PenLine, AlertTriangle, Play, MinusCircle, ThumbsUp, ThumbsDown,
  FileText, FileCheck, StickyNote, ListPlus, CheckCheck, CalendarPlus, TrendingUp,
  DollarSign, ArrowUpRight, UserPlus, Flame, BookOpen, Activity, Clock,
} from 'lucide-react';
import type { AgentEventRow } from './agentEventTypes';

export interface EventDescription { icon: LucideIcon; accent: string; sentence: string; detail?: string; }

const A = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  info: 'var(--color-info)',
  deal: 'var(--color-deal-hot)',
  brand: 'var(--brand-400)',
  muted: 'var(--color-text-tertiary)',
};

const clean = (t?: string) => (t ?? '').replace(/^\[[^\]]*\]\s*/, '').trim();
const firstName = (n?: string) => (n ?? 'a lead').split(' ')[0];
const titleCase = (s?: string) => (s ?? '').replace(/_/g, ' ');
const money = (n?: number) =>
  n == null ? '' : n >= 1_000_000 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;

export function describeEvent(e: AgentEventRow): EventDescription {
  const p = e.payload ?? {};
  switch (e.event_type) {
    case 'block.started':
      return { icon: Play, accent: A.brand, sentence: `Started ${clean(p.block_title) || 'a block'}` };
    case 'block.executed':
      return { icon: CheckCircle2, accent: A.success, sentence: clean(p.output_summary) || `Completed ${clean(p.block_title)}`, detail: p.minutes_saved ? `saved ~${p.minutes_saved} min` : undefined };
    case 'block.needs_approval':
      return { icon: PenLine, accent: A.warning, sentence: clean(p.output_summary) || `Drafted ${clean(p.block_title)}`, detail: 'needs your approval' };
    case 'block.failed':
      return { icon: AlertTriangle, accent: A.error, sentence: clean(p.output_summary) || `Couldn't complete ${clean(p.block_title)}`, detail: titleCase(p.failure_reason) || undefined };
    case 'block.skipped':
      return { icon: MinusCircle, accent: A.muted, sentence: `Skipped ${clean(p.block_title) || 'a block'}` };
    case 'draft.approved':
      return { icon: ThumbsUp, accent: A.success, sentence: `You approved ${clean(p.block_title) || 'a draft'}` };
    case 'draft.rejected':
      return { icon: ThumbsDown, accent: A.error, sentence: `You passed on ${clean(p.block_title) || 'a draft'}` };
    case 'doc.generated':
      return { icon: FileText, accent: A.info, sentence: `Prepared a ${titleCase(p.template_key) || 'document'} for ${firstName(p.lead_name)}`, detail: 'awaiting approval' };
    case 'doc.approved':
      return { icon: FileCheck, accent: A.success, sentence: `${titleCase(p.template_key) || 'Document'} approved for ${firstName(p.lead_name)}` };
    case 'doc.rejected':
      return { icon: FileText, accent: A.error, sentence: `Document rejected for ${firstName(p.lead_name)}` };
    case 'doc.expired':
      return { icon: FileText, accent: A.muted, sentence: `A document for ${firstName(p.lead_name)} expired` };
    case 'fub.note_created':
      return { icon: StickyNote, accent: A.info, sentence: `Logged a note on ${firstName(p.lead_name)}`, detail: p.note_preview ? `"${p.note_preview}"` : undefined };
    case 'fub.task_created':
      return { icon: ListPlus, accent: A.info, sentence: `Created a task — ${p.task_name || 'follow-up'}` };
    case 'fub.task_completed':
      return { icon: CheckCheck, accent: A.success, sentence: `Completed a task — ${p.task_name || 'follow-up'}` };
    case 'fub.appointment_booked':
      return { icon: CalendarPlus, accent: A.deal, sentence: `Booked ${p.title || 'an appointment'}`, detail: p.location };
    case 'fub.stage_advanced':
      return { icon: TrendingUp, accent: A.success, sentence: `Moved ${firstName(p.lead_name)} to ${p.to_stage || 'a new stage'}`, detail: p.from_stage ? `from ${p.from_stage}` : undefined };
    case 'fub.deal_created':
      return { icon: DollarSign, accent: A.success, sentence: `Opened a new deal${p.price ? ` — ${money(p.price)}` : ''}`, detail: p.deal_name };
    case 'fub.deal_updated':
      return { icon: ArrowUpRight, accent: A.success, sentence: `Advanced a deal to ${p.to_stage || 'a new stage'}${p.commission_value ? ` — ${money(p.commission_value)} commission` : ''}` };
    case 'fub.person_updated':
      return { icon: UserPlus, accent: A.info, sentence: `Updated ${firstName(p.lead_name)}'s record` };
    case 'lead.new':
      return { icon: UserPlus, accent: A.info, sentence: `New lead — ${firstName(p.lead_name)}`, detail: p.source };
    case 'lead.stage_changed':
      return { icon: TrendingUp, accent: A.success, sentence: `${firstName(p.lead_name)} moved to ${p.to_stage}` };
    case 'lead.engaged':
      return { icon: Flame, accent: p.pulse === 'hot' ? A.error : p.pulse === 'warming' ? A.deal : A.info, sentence: `Re-engaged ${firstName(p.lead_name)} — ${p.pulse || 'warming'}` };
    case 'research.compiled':
      return { icon: BookOpen, accent: A.info, sentence: clean(p.block_title) || `Compiled a ${p.topic || 'market'} brief`, detail: p.minutes_saved ? `saved ~${p.minutes_saved} min` : undefined };
    case 'system.error':
      return { icon: AlertTriangle, accent: A.error, sentence: p.message || 'A background task hit an error', detail: p.retry_in ? `retry in ${p.retry_in}` : undefined };
    case 'system.heartbeat':
      return { icon: Activity, accent: A.muted, sentence: 'Checked your calendar — nothing due right now' };
    case 'ext.webhook_received':
      return { icon: Activity, accent: A.info, sentence: 'Received a signal from your workflow' };
    default:
      return { icon: Clock, accent: A.muted, sentence: humanizeEventType(e.event_type) };
  }
}

/** Fallback for any event_type we don't have a specific case for yet (new
 *  emissions from Hermes/n8n) — turn "ext.webhook_received" into
 *  "Ext webhook received" instead of showing the raw dotted string. */
function humanizeEventType(type: string): string {
  const words = type.replace(/[._]/g, ' ').split(' ').filter(Boolean);
  return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}
