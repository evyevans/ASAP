/* ═══════════════════════════════════════════════════════════════════════════
   useClients — the buyer roster and one client's full brief.

   Two hooks, deliberately separate:
     useClients()          the roster. One query, every client, no criteria.
     useClientDetail(id)   ONE client's criteria + geography, plus writes.

   That split is the cross-client leakage defence expressed as an API. The
   roster never carries criteria, so a component holding the list cannot
   accidentally score Client A's must-haves against a listing shortlisted for
   Client B. To get criteria at all you must name a single client, and what
   comes back has already been through assembleClientContext, which throws on a
   foreign row rather than filtering it away.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { asapSupabase } from '../config/supabaseClients';
import { useOrgId } from './useOrgId';
import { assembleClientContext } from '../matching/context';
import type {
  Client, Criterion, ClientGeography, ClientContext, MarketRow,
} from '../matching/types';

/* ── The roster ───────────────────────────────────────────────────────────*/

export interface ClientsData {
  clients: Client[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /**
   * Attach an ASAP buyer brief to a Follow Up Boss person, or return the one
   * that already exists.
   *
   * This replaces the old `createClient({ display_name })`. You do not create
   * clients in ASAP any more — Follow Up Boss is the roster, and this only
   * creates the small ASAP-side record that criteria, geography and matches
   * hang off. The `fub_person_id` unique index (migration 17) makes it
   * idempotent: calling it twice for the same person returns the same row
   * rather than forking the brief.
   */
  ensureClientForFubPerson: (fubPersonId: number, displayName: string) => Promise<Client | null>;
  deleteClient: (id: string) => Promise<boolean>;
  /** The brief for a FUB person, if one has been started. */
  byFubId: (fubPersonId: number) => Client | undefined;
}

export function useClients(): ClientsData {
  const { orgId } = useOrgId();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const q = await asapSupabase
      .from('asap_clients')
      .select('*')
      .order('status', { ascending: true })
      .order('display_name', { ascending: true });

    if (!mounted.current) return;
    if (q.error) {
      // Say what happened. An empty roster and a failed query look identical
      // on screen, and the difference matters a great deal to the realtor.
      setError(q.error.message);
      setClients([]);
    } else {
      setError(null);
      setClients((q.data ?? []) as Client[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  const byFubId = useCallback(
    (fubPersonId: number) => clients.find((c) => c.fub_person_id === String(fubPersonId)),
    [clients]
  );

  const ensureClientForFubPerson = useCallback(
    async (fubPersonId: number, displayName: string): Promise<Client | null> => {
      if (!orgId) {
        setError('No organisation on this session — sign in again.');
        return null;
      }

      // Already have a brief for them? Hand it back rather than forking one.
      const existing = clients.find((c) => c.fub_person_id === String(fubPersonId));
      if (existing) return existing;

      const q = await asapSupabase
        .from('asap_clients')
        .insert({
          org_id: orgId,
          fub_person_id: String(fubPersonId),
          display_name: displayName,
          status: 'active',
          representation: 'unsigned',
          budget_stretch_pct: 0,
          preapproved: false,
        })
        .select()
        .single();

      if (q.error) {
        // A unique-violation here means another tab created it between the
        // check above and this insert. That is not an error the realtor should
        // see — re-read and return what landed.
        if (q.error.code === '23505') {
          await refresh();
          const { data } = await asapSupabase
            .from('asap_clients').select('*')
            .eq('fub_person_id', String(fubPersonId)).maybeSingle();
          return (data as Client) ?? null;
        }
        setError(q.error.message);
        return null;
      }

      await refresh();
      return q.data as Client;
    },
    [orgId, clients, refresh]
  );

  const deleteClient = useCallback(async (id: string): Promise<boolean> => {
    // Criteria, geography and matches cascade (ON DELETE CASCADE, migration 17).
    const q = await asapSupabase.from('asap_clients').delete().eq('id', id);
    if (q.error) {
      setError(q.error.message);
      return false;
    }
    await refresh();
    return true;
  }, [refresh]);

  return { clients, loading, error, refresh, ensureClientForFubPerson, deleteClient, byFubId };
}

/* ── One client's brief ───────────────────────────────────────────────────*/

export interface ClientDetailData {
  context: ClientContext | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  saveClient: (patch: Partial<Client>) => Promise<void>;
  addCriterion: (draft: Omit<Criterion, 'id' | 'client_id' | 'confirmed_at'>) => Promise<void>;
  updateCriterion: (id: string, patch: Partial<Criterion>) => Promise<void>;
  removeCriterion: (id: string) => Promise<void>;
  addGeography: (draft: Omit<ClientGeography, 'id' | 'client_id' | 'confirmed_at'>) => Promise<void>;
  removeGeography: (id: string) => Promise<void>;
  /** Stamp confirmed_at across the brief — "I just spoke to them". */
  confirmAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useClientDetail(clientId: string | null): ClientDetailData {
  const { orgId } = useOrgId();
  const [context, setContext] = useState<ClientContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!clientId) {
      setContext(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    const [c, k, g] = await Promise.all([
      asapSupabase.from('asap_clients').select('*').eq('id', clientId).maybeSingle(),
      asapSupabase.from('asap_client_criteria').select('*').eq('client_id', clientId),
      asapSupabase.from('asap_client_geography').select('*').eq('client_id', clientId),
    ]);

    if (!mounted.current) return;

    const failure = c.error ?? k.error ?? g.error;
    if (failure || !c.data) {
      setError(failure?.message ?? 'That client could not be loaded.');
      setContext(null);
      setLoading(false);
      return;
    }

    try {
      // The chokepoint. If any row came back belonging to another client this
      // throws rather than quietly building a mixed brief — see context.ts.
      setContext(assembleClientContext(
        c.data as Client,
        (k.data ?? []) as Criterion[],
        (g.data ?? []) as ClientGeography[],
      ));
      setError(null);
    } catch (e) {
      setContext(null);
      setError(e instanceof Error ? e.message : 'Client data failed validation.');
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  /** Every write goes through here: set saving, run it, surface the error,
   *  re-read. Re-reading rather than patching local state means what is on
   *  screen is always what the database actually accepted — a CHECK constraint
   *  rejection can never render as a successful save. */
  // PromiseLike, not Promise: Supabase query builders are thenables, not real
  // promises, so typing this as Promise would reject every direct builder call.
  const write = useCallback(async (run: () => PromiseLike<{ error: { message: string } | null }>) => {
    setSaving(true);
    setError(null);
    const { error: e } = await run();
    if (mounted.current) {
      if (e) setError(e.message);
      else await refresh();
      setSaving(false);
    }
  }, [refresh]);

  const saveClient = useCallback(async (patch: Partial<Client>) => {
    if (!clientId) return;
    await write(() => asapSupabase.from('asap_clients').update(patch).eq('id', clientId));
  }, [clientId, write]);

  const addCriterion = useCallback(async (draft: Omit<Criterion, 'id' | 'client_id' | 'confirmed_at'>) => {
    if (!clientId || !orgId) return;
    await write(() => asapSupabase.from('asap_client_criteria').insert({
      ...draft,
      org_id: orgId,
      client_id: clientId,
      // Just stated by the realtor, so it is confirmed as of now. Freshness is
      // only meaningful if it starts honest.
      confirmed_at: new Date().toISOString(),
    }));
  }, [clientId, orgId, write]);

  const updateCriterion = useCallback(async (id: string, patch: Partial<Criterion>) => {
    await write(() => asapSupabase.from('asap_client_criteria').update(patch).eq('id', id));
  }, [write]);

  const removeCriterion = useCallback(async (id: string) => {
    await write(() => asapSupabase.from('asap_client_criteria').delete().eq('id', id));
  }, [write]);

  const addGeography = useCallback(async (draft: Omit<ClientGeography, 'id' | 'client_id' | 'confirmed_at'>) => {
    if (!clientId || !orgId) return;
    await write(() => asapSupabase.from('asap_client_geography').insert({
      ...draft,
      org_id: orgId,
      client_id: clientId,
      confirmed_at: new Date().toISOString(),
    }));
  }, [clientId, orgId, write]);

  const removeGeography = useCallback(async (id: string) => {
    await write(() => asapSupabase.from('asap_client_geography').delete().eq('id', id));
  }, [write]);

  const confirmAll = useCallback(async () => {
    if (!clientId) return;
    const now = new Date().toISOString();
    await write(async () => {
      const a = await asapSupabase.from('asap_clients').update({
        criteria_confirmed_at: now, budget_confirmed_at: now, last_reviewed_at: now,
      }).eq('id', clientId);
      if (a.error) return a;
      const b = await asapSupabase.from('asap_client_criteria')
        .update({ confirmed_at: now }).eq('client_id', clientId);
      if (b.error) return b;
      return asapSupabase.from('asap_client_geography')
        .update({ confirmed_at: now }).eq('client_id', clientId);
    });
  }, [clientId, write]);

  return {
    context, loading, saving, error,
    saveClient, addCriterion, updateCriterion, removeCriterion,
    addGeography, removeGeography, confirmAll, refresh,
  };
}

/* ── Markets ──────────────────────────────────────────────────────────────*/

export interface MarketsData {
  markets: MarketRow[];
  /** Just the ones the realtor has switched on, or all of them if none. */
  active: MarketRow[];
  loading: boolean;
  byslug: (slug: string) => MarketRow | undefined;
}

/** The Ontario market registry (asap_markets). Reference data — one fetch per
 *  mount, no realtime, because it only changes when a migration runs. */
export function useMarkets(activeSlugs: string[] = []): MarketsData {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const q = await asapSupabase
        .from('asap_markets')
        .select('*')
        .eq('active', true)
        .order('region', { ascending: true })
        .order('name', { ascending: true });
      if (!alive) return;
      setMarkets((q.data ?? []) as MarketRow[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const active = useMemo(
    // No selection means all of Ontario, not none of it.
    () => (activeSlugs.length === 0 ? markets : markets.filter((m) => activeSlugs.includes(m.slug))),
    [markets, activeSlugs]
  );

  const byslug = useCallback(
    (slug: string) => markets.find((m) => m.slug === slug),
    [markets]
  );

  return { markets, active, loading, byslug };
}
