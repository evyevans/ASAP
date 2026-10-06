/* ═══════════════════════════════════════════════════════════════════════════
   useFubPeople — the Clients roster, read live from Follow Up Boss.

   There is no mirror table. Every call goes through the `fub-people` edge
   function to FUB and back, so what you see is what the CRM says right now.
   That is deliberate: success-criteria/10-explicit-non-goals.md SC-10.5 keeps
   client PII in the CRM, and a Supabase copy would be both a second PII store
   and stale between syncs.

   The cost of not caching in a table is latency, so it is cached HERE — in
   memory, per query string, for the life of the page. Typing "sar" then "sara"
   then back to "sar" is one network round trip, not three.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { callDemoFub } from '../demo/fub';

/* ── Row types, mirroring the edge function's projection exactly ───────────
   (asap-engine/supabase/functions/fub-people/index.ts). It is a projection,
   not a passthrough — FUB returns ~45 fields and most are internal routing
   state nothing here renders. */

export interface FubContact {
  value: string;
  type?: string;
  isPrimary?: boolean;
}

export interface FubPerson {
  id: number;
  name: string;
  firstName: string | null;
  lastName: string | null;
  stage: string | null;
  source: string | null;
  tags: string[];
  emails: FubContact[];
  phones: FubContact[];
  assignedTo: string | null;
  assignedUserId: number | null;
  created: string | null;
  updated: string | null;
  lastActivity: string | null;
  contacted: number | null;
  price: number | null;
  timeframeId: number | null;
  timeframeStatus: string | null;
  dealName: string | null;
  dealStage: string | null;
  dealPrice: number | null;
  dealCloseDate: string | null;
  addresses: unknown[];
  fubUrl: string;
}

export interface FubNote { id: number; subject?: string; body?: string; created?: string; createdBy?: string }
export interface FubTask { id: number; name?: string; dueDate?: string; isCompleted?: boolean }
export interface FubAppointment { id: number; title?: string; start?: string; end?: string; location?: string }
export interface FubDeal { id: number; name?: string; stage?: string; price?: number; closeDate?: string }

export interface FubPersonDetail {
  person: FubPerson;
  notes: FubNote[];
  tasks: FubTask[];
  appointments: FubAppointment[];
  deals: FubDeal[];
}

/* ── Transport ────────────────────────────────────────────────────────────*/

/** Call the edge function with the caller's session JWT.
 *
 *  The session token is essential, not incidental: the function refuses the
 *  anon key outright (`role: "anon"` cannot read client records). Sending the
 *  anon key here would 403 on every request. */
const callFub = callDemoFub;

/* ── The roster ───────────────────────────────────────────────────────────*/

interface RosterResponse {
  people: FubPerson[];
  total: number;
  stages: string[];
}

export interface FubPeopleData {
  people: FubPerson[];
  total: number;
  /** Stage values actually present on this account — the filter chips are built
   *  from these rather than a hardcoded list that drifts when someone renames a
   *  stage in FUB. */
  stages: string[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const DEBOUNCE_MS = 300;

export function useFubPeople(query: string, stage: string | null = null): FubPeopleData {
  const [people, setPeople] = useState<FubPerson[]>([]);
  const [total, setTotal] = useState(0);
  const [stages, setStages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cache = useRef(new Map<string, RosterResponse>());
  const mounted = useRef(true);
  const [nonce, setNonce] = useState(0);

  const key = `${query.trim().toLowerCase()}|${stage ?? ''}`;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const cached = cache.current.get(key);
    if (cached && nonce === 0) {
      setPeople(cached.people);
      setTotal(cached.total);
      setStages(cached.stages);
      setLoading(false);
      setError(null);
      return;
    }

    // Debounced so a search box does not fire a request per keystroke. The
    // timer is cleared on every change, so only the last one runs.
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ limit: '200' });
      if (query.trim()) params.set('q', query.trim());
      if (stage) params.set('stage', stage);

      const { data, error: e } = await callFub<RosterResponse>(`?${params.toString()}`);
      if (cancelled || !mounted.current) return;

      if (e || !data) {
        setError(e ?? 'Could not load your clients.');
        setPeople([]);
        setTotal(0);
      } else {
        cache.current.set(key, data);
        setPeople(data.people);
        setTotal(data.total);
        // Keep the widest stage list seen: filtering BY a stage returns only
        // that stage, which would otherwise collapse the chip row to one.
        setStages((prev) => (data.stages.length >= prev.length ? data.stages : prev));
        setError(null);
      }
      setLoading(false);
    }, query.trim() ? DEBOUNCE_MS : 0);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, query, stage, nonce]);

  const refresh = useCallback(() => {
    cache.current.delete(key);
    setNonce((n) => n + 1);
  }, [key]);

  return { people, total, stages, loading, error, refresh };
}

/* ── One person ───────────────────────────────────────────────────────────*/

export interface FubPersonDetailData {
  detail: FubPersonDetail | null;
  loading: boolean;
  error: string | null;
}

export function useFubPerson(personId: number | null): FubPersonDetailData {
  const [detail, setDetail] = useState<FubPersonDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<number, FubPersonDetail>());

  useEffect(() => {
    if (personId === null) {
      setDetail(null);
      setLoading(false);
      return;
    }

    const cached = cache.current.get(personId);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error: e } = await callFub<FubPersonDetail>(`/${personId}`);
      if (cancelled) return;
      if (e || !data) {
        setError(e ?? 'Could not load that client.');
        setDetail(null);
      } else {
        cache.current.set(personId, data);
        setDetail(data);
        setError(null);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [personId]);

  return { detail, loading, error };
}
