import { useCallback, useEffect, useRef, useState } from 'react';
import { asapSupabase } from '../config/supabaseClients';
import { useOrgId } from './useOrgId';
import type { MandateRow } from '../analytics/tabTypes';

const DEFAULT_MANDATE = (org_id: string): MandateRow => ({
  org_id,
  autonomy_level: 'draft',
  permissions: { draft_replies: true, update_crm: true, generate_docs: true, book_meetings: false, send_email: false, send_sms: false },
  focus: null,
  guardrails: null,
  // Structural gate for every external_comm action in the action registry.
  // Defaults false: the operator is not a licensed realtor today, and
  // client-facing sends must stay off by default regardless of the
  // per-action permissions above (see policy/action-registry.yaml).
  client_comms_enabled: false,
  // Empty = every Ontario market. A realtor who has not picked yet should see
  // a working product, not an empty one.
  active_markets: [],
  match_min_band: 'possible',
  match_daily_cap: 5,
  match_stale_days: 90,
});

export interface MandateData {
  mandate: MandateRow | null;
  loading: boolean;
  saving: boolean;
  /** Set when the last saveMandate() call failed. The optimistic update was
   *  rolled back — mandate reflects the last known-good server state, not
   *  the rejected draft. Cleared on the next attempt. */
  saveError: string | null;
  saveMandate: (patch: Partial<MandateRow>) => Promise<void>;
}

/** Reads + persists the agent mandate (asap_agent_mandate) — the autonomy level +
 *  permissions ASAP reads before acting. Single editable row per org (upsert on
 *  save). Backs the Profile tab's "permissions" section. */
export function useMandate(): MandateData {
  const { orgId } = useOrgId();
  const [mandate, setMandate] = useState<MandateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchOne = useCallback(async () => {
    const q = await asapSupabase.from('asap_agent_mandate').select('*').limit(1).maybeSingle();
    if (mounted.current) {
      if (!q.error && q.data) setMandate(q.data as MandateRow);
      else if (orgId) setMandate(DEFAULT_MANDATE(orgId));
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    mounted.current = true;
    fetchOne();
    return () => {
      mounted.current = false;
    };
  }, [fetchOne]);

  const saveMandate = useCallback(
    async (patch: Partial<MandateRow>) => {
      if (!orgId) return;
      const previous = mandate; // snapshot to roll back to — this is the fix:
      // the optimistic update below used to have no way back on failure, so a
      // write rejected by a CHECK constraint (invalid autonomy_level, an
      // unrecognised permission key) rendered as a successful save.
      const next = { ...(mandate ?? DEFAULT_MANDATE(orgId)), ...patch, org_id: orgId };
      setMandate(next); // optimistic
      setSaving(true);
      setSaveError(null);
      const { error } = await asapSupabase.from('asap_agent_mandate').upsert(next, { onConflict: 'org_id' });
      if (mounted.current) {
        if (error) {
          console.warn('[ASAP] saveMandate failed:', error.message);
          setMandate(previous); // roll back — do not leave the rejected draft displayed as saved
          setSaveError(error.message);
        }
        setSaving(false);
      }
    },
    [orgId, mandate]
  );

  return { mandate, loading, saving, saveError, saveMandate };
}
