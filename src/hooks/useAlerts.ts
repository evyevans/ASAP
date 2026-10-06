import { useCallback, useEffect, useRef, useState } from 'react';
import { asapSupabase } from '../config/supabaseClients';
import { useOrgId } from './useOrgId';
import type { AlertRow, AlertPrefs } from '../analytics/tabTypes';

const DEFAULT_PREFS = (org_id: string): AlertPrefs => ({
  org_id,
  channel: 'telegram',
  quiet_hours_start: '21:00:00',
  quiet_hours_end: '08:00:00',
  timezone: 'America/Toronto',
  digest_frequency: 'daily',
  urgent_override: true,
  consent: true,
});

export interface AlertsData {
  alerts: AlertRow[];
  prefs: AlertPrefs | null;
  loading: boolean;
  saving: boolean;
  savePrefs: (patch: Partial<AlertPrefs>) => Promise<void>;
  setAlertStatus: (id: number, status: AlertStatus) => Promise<void>;
  refresh: () => void;
}

/** The statuses the realtor can set from the dashboard. `resolved` is not here —
 *  nothing in the UI sets it, and the RPC's whitelist would reject it. */
export type AlertStatus = 'acknowledged' | 'snoozed' | 'active';

/** Reads fired alerts (asap_alerts) + the "when & how ASAP may reach you" contract
 *  (asap_alert_prefs). Alerts poll + subscribe to realtime inserts; prefs are a
 *  single editable row (upsert on save). Backs the Alerts tab. */
export function useAlerts(): AlertsData {
  const { orgId } = useOrgId();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [prefs, setPrefs] = useState<AlertPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

  const fetchAll = useCallback(async () => {
    const aQ = await asapSupabase
      .from('asap_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (mounted.current && !aQ.error && aQ.data) setAlerts(aQ.data as AlertRow[]);

    const pQ = await asapSupabase.from('asap_alert_prefs').select('*').limit(1).maybeSingle();
    if (mounted.current) {
      if (!pQ.error && pQ.data) setPrefs(pQ.data as AlertPrefs);
      else if (orgId) setPrefs(DEFAULT_PREFS(orgId)); // neutral defaults until the user saves
    }
    if (mounted.current) setLoading(false);
  }, [orgId]);

  useEffect(() => {
    mounted.current = true;
    fetchAll();
    const poll = setInterval(fetchAll, 60_000);
    const channel = asapSupabase
      .channel('asap-alerts-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asap_alerts' }, () => fetchAll())
      .subscribe();
    return () => {
      mounted.current = false;
      clearInterval(poll);
      asapSupabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const savePrefs = useCallback(
    async (patch: Partial<AlertPrefs>) => {
      if (!orgId) return;
      const next = { ...(prefs ?? DEFAULT_PREFS(orgId)), ...patch, org_id: orgId };
      setPrefs(next); // optimistic
      setSaving(true);
      const { error } = await asapSupabase.from('asap_alert_prefs').upsert(next, { onConflict: 'org_id' });
      if (error) console.warn('[ASAP] savePrefs failed:', error.message);
      if (mounted.current) setSaving(false);
    },
    [orgId, prefs]
  );

  /* Moves an alert off (or back onto) 'active' via the acknowledge_alert RPC from
   * migration 13. The RPC exists because asap_alerts has no UPDATE policy — a
   * direct .update() here would come back "successful" with zero rows changed,
   * silently doing nothing. The RPC returns its row count so we can tell the
   * difference between "done" and "that wasn't yours / migration 13 not applied",
   * and roll the optimistic patch back when it changed nothing. */
  const setAlertStatus = useCallback(
    async (id: number, status: AlertStatus) => {
      const prev = alerts;
      setAlerts((rows) =>
        rows.map((a) =>
          a.id === id
            ? { ...a, status, acknowledged_at: status === 'active' ? null : new Date().toISOString() }
            : a
        )
      );
      setSaving(true);

      const { data, error } = await asapSupabase.rpc('acknowledge_alert', {
        p_alert_id: id,
        p_status: status,
      });

      if (!mounted.current) return;
      setSaving(false);

      if (error || data === 0) {
        console.warn('[ASAP] setAlertStatus changed nothing:', error?.message ?? 'row not found for this org');
        setAlerts(prev); // revert — never leave the UI claiming a write that did not land
        return;
      }
      fetchAll();
    },
    [alerts, fetchAll]
  );

  return { alerts, prefs, loading, saving, savePrefs, setAlertStatus, refresh: fetchAll };
}
