/* The unified agent_events stream — types transcribed 1:1 from Hermes's
 * "Dashboard Data Protocol". Every action ASAP/DAAM takes lands here. */

export type AgentEventType =
  // block lifecycle
  | 'block.started' | 'block.executed' | 'block.needs_approval' | 'block.failed' | 'block.skipped'
  // approval lifecycle
  | 'draft.approved' | 'draft.rejected'
  | 'doc.generated' | 'doc.approved' | 'doc.rejected' | 'doc.expired'
  // FUB mutations
  | 'fub.note_created' | 'fub.task_created' | 'fub.task_completed' | 'fub.appointment_booked'
  | 'fub.stage_advanced' | 'fub.deal_created' | 'fub.deal_updated' | 'fub.person_updated'
  // DAAM sweep
  | 'lead.new' | 'lead.stage_changed' | 'lead.overdue' | 'lead.engaged'
  // research + lifecycle
  | 'research.compiled' | 'system.heartbeat' | 'system.error'
  // System + external side-effects. These were already mapped in
  // sceneDirector.ts and present in live rows, but missing from this union —
  // a real drift between the animator's vocabulary and the feed's. Closed here.
  | 'system.scheduler_fired' | 'system.snapshot_created'
  | 'ext.vector_synced' | 'ext.email_sent' | 'ext.calendar_event_created'
  | 'ext.call_outcome' | 'ext.webhook_received'
  // Client matching (migrations 16-18)
  | 'match.found' | 'match.shortlisted' | 'match.dismissed'
  | 'client.profile_updated' | 'client.criteria_stale'
  | 'listing.ingested'
  // ASAP calendar (migration 19)
  | 'cal.event_created' | 'cal.event_updated' | 'cal.conflict_detected';

/** Permissive payload — the union of every field across event types (all optional). */
export interface AgentEventPayload {
  calendar_event_id?: string;
  block_category?: string;
  block_title?: string;
  week_start?: string;
  minutes_allocated?: number;
  minutes_saved?: number;
  output_summary?: string;
  approval_type?: string;
  failure_reason?: string;
  lead_ids?: number[];
  approved_at?: string;
  // docs
  doc_id?: number;
  template_key?: string;
  expires_at?: string;
  telegram_message_id?: string;
  decided_at?: string;
  // fub / leads
  lead_id?: number | string;
  lead_name?: string;
  lead_stage?: string;
  stage?: string;
  note_length?: number;
  note_preview?: string;
  task_id?: number;
  task_name?: string;
  due_date?: string;
  assigned_to?: string;
  completed_at?: string;
  appointment_id?: number;
  title?: string;
  start?: string;
  end?: string;
  location?: string;
  from_stage?: string;
  to_stage?: string;
  trigger?: string;
  deal_id?: number;
  deal_name?: string;
  pipeline?: string;
  price?: number;
  projected_close?: string;
  commission_value?: number;
  source?: string;
  type?: string;
  detected_by?: string;
  // engagement pulse
  last_touch?: string;
  action?: string;
  pulse?: 'hot' | 'warming' | 'cooling' | 'cold' | string;
  days_since_last_contact?: number;
  // research
  data_sources?: string[];
  topic?: string;
  markets_covered?: string[];
  // system
  cron?: string;
  blocks_found?: number;
  window_start?: string;
  window_end?: string;
  error_type?: string;
  message?: string;
  retry_in?: string;
  // client matching + calendar (migrations 16-19)
  client_id?: string;
  listing_id?: string;
  match_id?: string;
  /** 'strong' | 'possible' | 'stretch' — the FIT band, never a valuation. */
  band?: string;
  score?: number;
  address?: string;
  market_slug?: string;
  count?: number;
  reason?: string;
  days_stale?: number;
}

/** One row of the live stream. */
export interface AgentEventRow {
  id: string;
  org_id: string;
  sequence: number;
  event_type: AgentEventType | string;
  agent_id: string | null;
  payload: AgentEventPayload | null;
  created_at: string;
}

export const isBlockEvent = (t: string) => t.startsWith('block.');
export const isFubEvent = (t: string) => t.startsWith('fub.');
export const isLeadEvent = (t: string) => t.startsWith('lead.');
export const isDocEvent = (t: string) => t.startsWith('doc.');
export const isSystemEvent = (t: string) => t.startsWith('system.');
