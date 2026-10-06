import { useEffect, useState } from 'react';
import { supabase, useAuth } from '../auth/AuthContext';

export interface UserProfile {
  org_id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
}

/** Reads the signed-in user's profile (for personalization only — the data
 *  queries themselves don't need this, RLS scopes by org server-side). Unlike
 *  the old useOrgId, this has NO fallback to the deleted backend. */
export function useUserProfile(): { profile: UserProfile | null; loading: boolean } {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('user_profiles')
        .select('org_id, first_name, last_name, role')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setProfile((data as UserProfile) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { profile, loading };
}
