/**
 * Resolve the authenticated user's organization from Supabase user_profiles.
 * Auto-provisions org + profile via backend when missing (legacy signups).
 */

import { useEffect, useState } from 'react';
import { supabase, useAuth } from '../auth/AuthContext';
import { apiUrl } from '../config/api';
import { devTenantId, isGuestAccess } from '../auth/devBypass';

export interface UserProfile {
  org_id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
}

async function loadProfile(authUserId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('org_id, first_name, last_name, role')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error || !data?.org_id) {
    return null;
  }
  return data as UserProfile;
}

async function provisionProfile(accessToken: string): Promise<UserProfile | null> {
  const res = await fetch(apiUrl('/api/v1/auth/provision'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.warn('[ASAP] Profile provision failed:', res.status, await res.text());
    return null;
  }
  const body = await res.json();
  if (!body?.org_id) return null;
  return {
    org_id: body.org_id,
    first_name: null,
    last_name: null,
    role: 'owner',
  };
}

export function useOrgId(): {
  orgId: string | null;
  profile: UserProfile | null;
  loading: boolean;
} {
  const { user, session } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isGuestAccess()) {
      setOrgId(devTenantId());
      setProfile(null);
      setLoading(false);
      return;
    }

    if (!user?.id || !session) {
      setOrgId(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        let data = await loadProfile(user!.id);

        if (!data && session!.access_token) {
          console.info('[ASAP] No user_profiles row — provisioning organization…');
          data = await provisionProfile(session!.access_token);
        }

        if (cancelled) return;

        if (!data?.org_id) {
          console.warn('[ASAP] No user_profiles row for auth user after provision');
          setOrgId(null);
          setProfile(null);
        } else {
          setOrgId(data.org_id);
          setProfile(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[ASAP] Failed to load org profile:', err);
          setOrgId(null);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, session]);

  return { orgId, profile, loading };
}
