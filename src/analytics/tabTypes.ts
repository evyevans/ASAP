/* Row types for the Profile / Alerts / Memory tabs — transcribed 1:1 from the
 * Supabase migrations 06–09 (asap-engine/supabase/asap/). One agent (ASAP): the
 * ledger records task *types*, never a fleet of sub-agents. */

/** agent_task_ledger — the honest ledger behind the Memory tab (06). */
export interface TaskLedgerRow {
  id: number;
  org_id: string;
  task_id: string | null;
  task_type: string;
  summary: string;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  tokens: number | null;
  cost_usd: number | null;
  runtime_ms: number | null;
  status: string; // ok | error | partial
  created_at: string;
}

/** asap_alerts — a fired notification (07). */
export interface AlertRow {
  id: number;
  org_id: string;
  kind: string; // approval_needed | deadline | new_lead | digest | system
  title: string;
  body: string | null;
  channel: string | null; // telegram | email | in_app
  severity: string; // info | warning | urgent
  status: string; // active | acknowledged | resolved | snoozed
  related_url: string | null;
  last_triggered_at: string | null;
  created_at: string;
  acknowledged_at: string | null;
}

/** asap_alert_prefs — "when & how ASAP may reach you" (07). One row per org. */
export interface AlertPrefs {
  org_id: string;
  channel: string;
  quiet_hours_start: string | null; // 'HH:MM:SS'
  quiet_hours_end: string | null;
  timezone: string;
  digest_frequency: string; // off | daily | weekly | instant
  urgent_override: boolean;
  consent: boolean;
  updated_at?: string;
}

/** asap_agent_mandate — the goals + permissions ASAP acts on (08). One row per org. */
export interface MandateRow {
  org_id: string;
  autonomy_level: string; // observe | draft | act
  permissions: Record<string, boolean>;
  focus: string | null;
  guardrails: string | null;
  /** Global gate every external_comm action in the action registry checks
   *  before reaching a client. Defaults false — see 13_approvals_hardening /
   *  the T6 migration. Distinct from the per-action permissions above: those
   *  say WHICH actions are allowed once comms are enabled at all. */
  client_comms_enabled: boolean;

  /* ── Matching settings (added by 17_clients_and_criteria.sql) ──────────
     These live on the mandate rather than in their own table because they are
     the same kind of thing as everything above: standing instructions ASAP
     reads before it acts. */

  /** Ontario markets this realtor is actively working. Slugs from asap_markets.
   *  Empty means "all" — a new account should not see an empty product. */
  active_markets: string[];
  /** Matches below this band are computed and stored, but not surfaced. */
  match_min_band: 'strong' | 'possible' | 'stretch';
  /** Ceiling on proposals per client per day. The review-fatigue control. */
  match_daily_cap: number;
  /** Criteria older than this are treated as unconfirmed and band down. */
  match_stale_days: number;

  updated_at?: string;
}

/** The permission keys the Profile tab exposes as toggles. */
export const MANDATE_PERMISSIONS: { key: string; label: string; help: string }[] = [
  { key: 'draft_replies', label: 'Draft replies', help: 'Prepare email/SMS replies for your approval.' },
  { key: 'send_email', label: 'Send email', help: 'Send emails without asking first.' },
  { key: 'send_sms', label: 'Send SMS', help: 'Send texts without asking first.' },
  { key: 'book_meetings', label: 'Book meetings', help: 'Place events on your calendar autonomously.' },
  { key: 'update_crm', label: 'Update CRM', help: 'Write notes / advance stages in Follow Up Boss.' },
  { key: 'generate_docs', label: 'Generate documents', help: 'Produce documents (always routed to approval).' },
];

export const AUTONOMY_LEVELS: { key: string; label: string; help: string }[] = [
  { key: 'observe', label: 'Observe', help: 'Watch and report only — never act.' },
  { key: 'draft', label: 'Draft', help: 'Prepare everything, wait for your approval.' },
  { key: 'act', label: 'Act', help: 'Execute low-risk actions autonomously.' },
];
