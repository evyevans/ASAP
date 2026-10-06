/* ═══════════════════════════════════════════════════════════════════════════
   useMatches / useListings — the read side of the match queue.

   Matches are READ-ONLY here. Decisions go through the decide_client_match RPC
   in migration 18, never a direct UPDATE, because asap_client_matches has no
   write policy at all: an UPDATE policy cannot restrict which columns are
   written, so a policy permissive enough to let the realtor shortlist would
   equally let any session rewrite `score`, `reasons` or `failed_gates` — that
   is, rewrite the explanation after the fact. The explanation is the product.

   Follows useApprovals.ts exactly on the two things that matter:
     · a missing RPC degrades to writeState:'unavailable' with a real message
       naming the migration, rather than silently doing nothing
     · an RPC returning 0 rows is a FAILURE, never a success
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { asapSupabase } from '../config/supabaseClients';
import type { MatchRow, MatchState, Listing, MatchBand } from '../matching/types';

const POLL_MS = 60_000;

/** A match joined to the listing it is about — what every surface renders. */
export interface MatchWithListing {
  match: MatchRow;
  listing: Listing;
}

export type WriteState = 'ready' | 'unavailable';

export interface MatchesData {
  matches: MatchWithListing[];
  loading: boolean;
  error: string | null;
  writeState: WriteState;
  /** Why writes are unavailable — shown verbatim, names the migration. */
  writeReason: string | null;
  decide: (matchId: string, state: 'shortlisted' | 'dismissed' | 'surfaced')
    => Promise<{ ok: boolean; error?: string }>;
  refresh: () => Promise<void>;
}

export interface UseMatchesOptions {
  /** Restrict to one client. Omit for the whole queue. */
  clientId?: string | null;
  /** Which states to show. Defaults to everything still actionable. */
  states?: MatchState[];
  minBand?: MatchBand;
  limit?: number;
}

const BAND_INDEX: Record<MatchBand, number> = { stretch: 0, possible: 1, strong: 2 };

/** The error shapes Postgrest returns when a function does not exist. Same set
 *  useApprovals.ts checks — an unapplied migration must present as "not wired
 *  up yet", not as a mysterious failure. */
const isMissingFunction = (code?: string, message?: string): boolean =>
  code === '42883' || code === 'PGRST202' ||
  (message ?? '').toLowerCase().includes('could not find the function');

export function useMatches(options: UseMatchesOptions = {}): MatchesData {
  const { clientId = null, states, minBand, limit = 200 } = options;

  const [matches, setMatches] = useState<MatchWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writeState, setWriteState] = useState<WriteState>('ready');
  const [writeReason, setWriteReason] = useState<string | null>(null);
  const mounted = useRef(true);

  const stateKey = (states ?? ['new', 'surfaced', 'shortlisted']).join(',');

  const refresh = useCallback(async () => {
    let q = asapSupabase
      .from('asap_client_matches')
      .select('*, listing:asap_listings(*)')
      .order('score', { ascending: false })
      .limit(limit);

    if (clientId) q = q.eq('client_id', clientId);
    const wanted = stateKey.split(',').filter(Boolean);
    if (wanted.length) q = q.in('state', wanted);

    const res = await q;
    if (!mounted.current) return;

    if (res.error) {
      setError(res.error.message);
      setMatches([]);
    } else {
      setError(null);
      const rows = (res.data ?? []) as (MatchRow & { listing: Listing | null })[];
      setMatches(
        rows
          // A match whose listing was deleted is not renderable. Dropping it is
          // right; pretending it is a match with a blank address is not.
          .filter((r): r is MatchRow & { listing: Listing } => r.listing !== null)
          .map(({ listing, ...match }) => ({ match: match as MatchRow, listing }))
      );
    }
    setLoading(false);
  }, [clientId, stateKey, limit]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const id = setInterval(refresh, POLL_MS);

    // Realtime on top of the poll, not instead of it. Hermes writes on a cron,
    // so the poll guarantees correctness and realtime just makes it feel live.
    const channel = asapSupabase
      .channel('asap-client-matches')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'asap_client_matches' },
        () => { refresh(); })
      .subscribe();

    return () => {
      mounted.current = false;
      clearInterval(id);
      asapSupabase.removeChannel(channel);
    };
  }, [refresh]);

  const decide = useCallback(
    async (matchId: string, state: 'shortlisted' | 'dismissed' | 'surfaced') => {
      const { data, error: e } = await asapSupabase.rpc('decide_client_match', {
        p_match_id: matchId,
        p_state: state,
      });

      if (e) {
        if (isMissingFunction(e.code, e.message)) {
          setWriteState('unavailable');
          setWriteReason(
            'Match decisions need migration 18_client_rpcs.sql applied to Supabase. ' +
            'Until then this view is read-only.'
          );
          return { ok: false, error: 'Not wired up yet — see 18_client_rpcs.sql.' };
        }
        return { ok: false, error: e.message };
      }

      // The RPC returns rows changed. Zero means the row was not yours, did not
      // exist, or the transition was illegal — all failures. Treating it as
      // success is exactly the silent no-op the return value exists to expose.
      if (data === 0) {
        await refresh();
        return { ok: false, error: 'That match was already decided, or is no longer yours.' };
      }

      await refresh();
      return { ok: true };
    },
    [refresh]
  );

  const filtered = useMemo(
    () => (minBand
      ? matches.filter((m) => BAND_INDEX[m.match.band] >= BAND_INDEX[minBand])
      : matches),
    [matches, minBand]
  );

  return { matches: filtered, loading, error, writeState, writeReason, decide, refresh };
}

/* ── Listings ─────────────────────────────────────────────────────────────*/

export interface ListingsData {
  listings: Listing[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addListing: (draft: Omit<Listing, 'id'>) => Promise<Listing | null>;
  removeListing: (id: string) => Promise<boolean>;
}

export interface UseListingsOptions {
  marketSlug?: string | null;
  tenure?: Listing['tenure'];
  /** Include sold comps. Off by default — they are context, never candidates. */
  includeSold?: boolean;
  limit?: number;
}

export function useListings(options: UseListingsOptions = {}): ListingsData {
  const { marketSlug = null, tenure, includeSold = false, limit = 500 } = options;

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    let q = asapSupabase
      .from('asap_listings')
      .select('*')
      .order('source_fetched_at', { ascending: false })
      .limit(limit);

    if (marketSlug) q = q.eq('market_slug', marketSlug);
    if (tenure) q = q.eq('tenure', tenure);
    else if (!includeSold) q = q.neq('tenure', 'sold');

    const res = await q;
    if (!mounted.current) return;

    if (res.error) {
      setError(res.error.message);
      setListings([]);
    } else {
      setError(null);
      setListings((res.data ?? []) as Listing[]);
    }
    setLoading(false);
  }, [marketSlug, tenure, includeSold, limit]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  const addListing = useCallback(async (draft: Omit<Listing, 'id'>): Promise<Listing | null> => {
    // Upsert on the identity index from migration 16, so adding a home the
    // realtor already researched updates it instead of failing.
    const q = await asapSupabase
      .from('asap_listings')
      .upsert(draft, { onConflict: 'org_id,market_slug,address_norm,unit_norm,tenure' })
      .select()
      .single();
    if (q.error) {
      setError(q.error.message);
      return null;
    }
    await refresh();
    return q.data as Listing;
  }, [refresh]);

  const removeListing = useCallback(async (id: string): Promise<boolean> => {
    const q = await asapSupabase.from('asap_listings').delete().eq('id', id);
    if (q.error) {
      setError(q.error.message);
      return false;
    }
    await refresh();
    return true;
  }, [refresh]);

  return { listings, loading, error, refresh, addListing, removeListing };
}
