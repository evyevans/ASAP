/* Row types + domain constants for the ASAP execution data the dashboard reads. */

export type BlockCategory =
  | 'outreach' | 'content' | 'crm' | 'prep' | 'deal' | 'unresolved';

export type BlockStatus = 'executed' | 'needs_approval' | 'skipped' | 'failed';

/** One row per calendar block Hermes acted on (asap_execution_log). */
export interface ExecutionLogRow {
  id: number;
  week_start: string;
  calendar_event_id: string | null;
  block_category: BlockCategory | string | null;
  block_title: string | null;
  status: BlockStatus | string;
  output_summary: string | null;
  artifact_text?: string | null; // the full deliverable (Hermes wiring in progress)
  approved: boolean | null;
  executed_at: string;
  org_id?: string | null;
  agent_id?: string | null;
}

/** Weekly rollup written by the Sunday retro (asap_weekly_execution). */
export interface WeeklyExecutionRow {
  week_start: string;
  blocks_scheduled: number | null;
  blocks_executed: number | null;
  blocks_skipped: number | null;
  categories_completed: Record<string, number> | null;
  categories_skipped: Record<string, number> | null;
  drafts_produced: number | null;
  drafts_approved: number | null;
  execution_win: string | null;
  execution_bottleneck: string | null;
  summary: string | null;
  created_at: string;
}

/** A single calendar time-block extracted from asap_plans.events_created (jsonb). */
export interface PlannedEvent {
  eventName?: string;
  summary?: string;
  title?: string;
  eventDescription?: string;
  description?: string;
  colorId?: string | number;
  start?: string;
  [k: string]: unknown;
}

/** Normalised monthly/weekly planner context (from msp_success_plans / asap_plans). */
export interface PlannerContext {
  goalIncome: number | null;      // desired monthly income (CAD)
  avgCommission: number | null;   // commission per closed deal (CAD)
  bottleneck: string | null;      // the realtor's stated #1 problem
  mainFocus: string | null;
  primaryMarket: string | null;
  weeklyPriority: string | null;
  events: PlannedEvent[];
}

/** A DAAM document awaiting the realtor's approval (daam_doc_approvals). */
export interface DaamApprovalRow {
  id: number;
  lead_name: string | null;
  template_key: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
}

/* ── Domain constants ─────────────────────────────────────────── */

/** Manual minutes each executed block-category is estimated to save the agent.
 *  Interim category baselines (upgrade to a real per-block minutes_saved later). */
export const CATEGORY_MINUTES: Record<string, number> = {
  outreach: 30,
  content: 45,
  crm: 20,
  prep: 45,
  deal: 60,
  unresolved: 15,
};

/** Human labels + accent colour per category (accents map to theme tokens). */
export const CATEGORY_META: Record<string, { label: string; accent: string }> = {
  outreach:   { label: 'Prospecting',   accent: 'var(--color-scan-sale, #0F52BA)' },
  content:    { label: 'Content',       accent: 'var(--color-warning)' },
  crm:        { label: 'CRM & Admin',   accent: 'var(--color-info)' },
  prep:       { label: 'Client Prep',   accent: 'var(--color-deal-hot)' },
  deal:       { label: 'Deals',         accent: 'var(--color-error)' },
  unresolved: { label: 'Unresolved',    accent: 'var(--color-text-tertiary)' },
};

/** Dollar value of one hour of the agent's time saved (reused from AnalyticsEngine). */
export const HOURLY_VALUE = 50;
