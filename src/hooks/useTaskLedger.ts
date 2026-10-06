import { useCallback, useEffect, useRef, useState } from 'react';
import { asapSupabase } from '../config/supabaseClients';
import type { TaskLedgerRow } from '../analytics/tabTypes';

export interface TaskLedgerData {
  rows: TaskLedgerRow[];
  loading: boolean;
  dataMode: 'live' | 'empty';
  refresh: () => void;
}

/** Reads the honest per-task ledger (agent_task_ledger) — real tokens/cost/runtime
 *  Hermes writes after each task. RLS-scoped by org; polls every 60s and subscribes
 *  to realtime inserts. Degrades to empty (neutral) pre-data. Backs the Memory tab. */
export function useTaskLedger(): TaskLedgerData {
  const [rows, setRows] = useState<TaskLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const fetchAll = useCallback(async () => {
    const q = await asapSupabase
      .from('agent_task_ledger')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (mounted.current && !q.error && q.data) setRows(q.data as TaskLedgerRow[]);
    if (mounted.current) setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchAll();
    const poll = setInterval(fetchAll, 60_000);
    const channel = asapSupabase
      .channel('asap-task-ledger-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_task_ledger' }, () => fetchAll())
      .subscribe();
    return () => {
      mounted.current = false;
      clearInterval(poll);
      asapSupabase.removeChannel(channel);
    };
  }, [fetchAll]);

  return { rows, loading, dataMode: rows.length > 0 ? 'live' : 'empty', refresh: fetchAll };
}
