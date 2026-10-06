import { useCallback, useEffect, useRef, useState } from 'react';
import { asapSupabase } from '../config/supabaseClients';
import type {
  ExecutionLogRow,
  WeeklyExecutionRow,
  PlannerContext,
  PlannedEvent,
} from '../analytics/executionTypes';

export interface ExecutionData {
  logs: ExecutionLogRow[];
  weekly: WeeklyExecutionRow[];
  planner: PlannerContext | null;
  loading: boolean;
  dataMode: 'live' | 'empty';
  refresh: () => void;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
};

const asEvents = (v: unknown): PlannedEvent[] => {
  if (Array.isArray(v)) return v as PlannedEvent[];
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
};

/** Reads ASAP execution truth + planner context from Supabase (RLS-scoped by org).
 *  Polls every 60s and subscribes to realtime inserts. Each query is independent
 *  and degrades to empty on error, so pre-migration the dashboard shows neutral
 *  states instead of crashing. */
export function useExecutionData(): ExecutionData {
  const [logs, setLogs] = useState<ExecutionLogRow[]>([]);
  const [weekly, setWeekly] = useState<WeeklyExecutionRow[]>([]);
  const [planner, setPlanner] = useState<PlannerContext | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const fetchAll = useCallback(async () => {
    // Execution log — the rich, real data (11 rows for Evy today).
    const logsQ = await asapSupabase
      .from('asap_execution_log')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(80);
    if (mounted.current && !logsQ.error && logsQ.data) {
      setLogs(logsQ.data as ExecutionLogRow[]);
    }

    // Weekly rollups (empty until the Sunday retro fires).
    const weeklyQ = await asapSupabase
      .from('asap_weekly_execution')
      .select('*')
      .order('week_start', { ascending: false })
      .limit(8);
    if (mounted.current && !weeklyQ.error && weeklyQ.data) {
      setWeekly(weeklyQ.data as WeeklyExecutionRow[]);
    }

    // Planner context — monthly goals (income / commission / bottleneck).
    const mspQ = await asapSupabase
      .from('msp_success_plans')
      .select('goal_income, avg_commission, bottleneck, main_focus, primary_market, form_date')
      .order('form_date', { ascending: false })
      .limit(1);
    // Weekly plan — priority + the color-coded calendar time-blocks.
    const planQ = await asapSupabase
      .from('asap_plans')
      .select('weekly_priority, events_created, bottleneck, week_start')
      .order('week_start', { ascending: false })
      .limit(1);

    if (mounted.current) {
      const msp = !mspQ.error && mspQ.data?.[0] ? (mspQ.data[0] as Record<string, unknown>) : null;
      const plan = !planQ.error && planQ.data?.[0] ? (planQ.data[0] as Record<string, unknown>) : null;
      if (msp || plan) {
        setPlanner({
          goalIncome: num(msp?.goal_income),
          avgCommission: num(msp?.avg_commission),
          bottleneck: (msp?.bottleneck as string) ?? (plan?.bottleneck as string) ?? null,
          mainFocus: (msp?.main_focus as string) ?? null,
          primaryMarket: (msp?.primary_market as string) ?? null,
          weeklyPriority: (plan?.weekly_priority as string) ?? null,
          events: asEvents(plan?.events_created),
        });
      }
    }

    if (mounted.current) setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchAll();

    // 60s poll (Hermes writes on a 15-min cron, so this is plenty).
    const poll = setInterval(fetchAll, 60_000);

    // Realtime — best effort; no-op if the table isn't in the publication.
    const channel = asapSupabase
      .channel('asap-execution-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'asap_execution_log' },
        () => fetchAll()
      )
      .subscribe();

    return () => {
      mounted.current = false;
      clearInterval(poll);
      asapSupabase.removeChannel(channel);
    };
  }, [fetchAll]);

  return {
    logs,
    weekly,
    planner,
    loading,
    dataMode: logs.length > 0 ? 'live' : 'empty',
    refresh: fetchAll,
  };
}
