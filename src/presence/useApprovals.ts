/* ═══════════════════════════════════════════════════════════════════════════
   useApprovals — the one genuinely new write path in the scene.

   Reads the drafts waiting on you (asap_execution_log where status =
   'needs_approval' and approved is null) and commits your decision through the
   `decide_execution_approval` RPC added by migration 15.

   WHY AN RPC AND NOT A DIRECT .update()
   Two reasons, and this codebase has already been bitten by both:
   1. An RLS UPDATE policy cannot restrict WHICH COLUMNS get written. A policy
      permissive enough to let the realtor set `approved` would also let any
      authenticated session rewrite `block_title`, `output_summary`, or `org_id`
      on their own rows. The SECURITY DEFINER function is the narrow door.
   2. With no UPDATE policy at all, a direct `.update()` comes back SUCCESSFUL
      with zero rows changed — a silent no-op. useAlerts.ts:88 documents this
      exact trap. So this hook checks the affected row count and treats 0 as a
      failure, never as success.

   GRACEFUL DEGRADATION
   Until migration 15 is applied, PostgREST answers "could not find the
   function". That is detected and surfaced as `writeState: 'unavailable'`, and
   the UI disables the buttons with a real reason. It never silently pretends.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { asapSupabase } from '../config/supabaseClients';
import type { ExecutionLogRow } from '../analytics/executionTypes';

export interface PendingApproval {
  id: number;
  title: string;
  summary: string;
  category: string | null;
  at: string;
}

export type WriteState = 'ready' | 'unavailable';

export interface ApprovalsData {
  pending: PendingApproval[];
  loading: boolean;
  /** 'unavailable' means migration 15 has not been applied to this project. */
  writeState: WriteState;
  /** Row id currently being written, for per-row spinners. */
  deciding: number | null;
  decide: (id: number, approved: boolean) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => void;
}

const RPC = 'decide_execution_approval';

/** PostgREST/Postgres signatures for "that function isn't there". */
function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '42883' || err.code === 'PGRST202') return true;
  const m = (err.message ?? '').toLowerCase();
  return m.includes('could not find the function') || m.includes('does not exist');
}

const clean = (t: string | null | undefined) => (t ?? 'Untitled draft').replace(/^\[[^\]]*\]\s*/, '');

export function useApprovals(): ApprovalsData {
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [writeState, setWriteState] = useState<WriteState>('ready');
  const [deciding, setDeciding] = useState<number | null>(null);
  const mounted = useRef(true);

  const fetchPending = useCallback(async () => {
    const { data, error } = await asapSupabase
      .from('asap_execution_log')
      .select('id, block_title, output_summary, artifact_text, block_category, executed_at, status, approved')
      .eq('status', 'needs_approval')
      .is('approved', null)
      .order('executed_at', { ascending: false })
      .limit(25);

    if (!mounted.current) return;
    if (!error && data) {
      setPending((data as ExecutionLogRow[]).map((r) => ({
        id: r.id,
        title: clean(r.block_title),
        summary: r.artifact_text || r.output_summary || 'No preview available.',
        category: r.block_category ?? null,
        at: r.executed_at,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchPending();
    const poll = setInterval(fetchPending, 60_000);

    // Realtime, best effort — a no-op if the table isn't in the publication.
    const channel = asapSupabase
      .channel('asap-approvals')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'asap_execution_log' },
        () => fetchPending())
      .subscribe();

    return () => {
      mounted.current = false;
      clearInterval(poll);
      asapSupabase.removeChannel(channel);
    };
  }, [fetchPending]);

  const decide = useCallback(async (id: number, approved: boolean) => {
    setDeciding(id);
    try {
      const { data, error } = await asapSupabase.rpc(RPC, {
        p_log_id: id,
        p_approved: approved,
      });

      if (error) {
        if (isMissingFunction(error)) {
          setWriteState('unavailable');
          return { ok: false, error: 'Approvals need migration 15 applied in Supabase.' };
        }
        return { ok: false, error: error.message };
      }

      // The RPC returns the number of rows it changed. Zero means the row is
      // not in your org or was already decided — that is NOT a success.
      if (typeof data === 'number' && data === 0) {
        await fetchPending();
        return { ok: false, error: 'That draft was already decided.' };
      }

      // Optimistically drop it, then reconcile against the server.
      setPending((p) => p.filter((r) => r.id !== id));
      await fetchPending();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
    } finally {
      if (mounted.current) setDeciding(null);
    }
  }, [fetchPending]);

  return { pending, loading, writeState, deciding, decide, refresh: fetchPending };
}
