/* eslint-disable react-refresh/only-export-components -- Preserve the source app's combined auth API at this demo boundary. */
/* Demo boundary: production screens receive the same auth and data interfaces,
 * but this build never creates a network-backed Supabase client. */
import type { ReactNode } from 'react';
import type { Session, User, SupabaseClient } from '@supabase/supabase-js';
import { demoStore } from '../demo/store';
import { DEMO_USER, CHAT_KEY } from '../demo/seed';

const user: User = { id: DEMO_USER, email: 'guest@example.com', user_metadata: { full_name: 'Guest User' }, app_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() };
const session: Session = { user, access_token: 'local-demo-only', token_type: 'bearer', refresh_token: '', expires_in: 3600 };
const unsupported = async (...args: unknown[]) => { void args; return { error: 'Accounts are not connected in this frontend demo.' }; };
const localClient = {
  ...demoStore,
  auth: { getSession: async () => ({ data: { session }, error: null }) },
};
// Only the subset used by the copied UI is implemented. Unsupported operations
// fail locally; there is deliberately no network fallback or credential lookup.
export const supabase = localClient as unknown as SupabaseClient;
export const mapAuthError = (message: string) => message;
export function resetDemo() {
  demoStore.reset();
  try { sessionStorage.removeItem(CHAT_KEY); sessionStorage.removeItem('asap:boot:played'); } catch { /* memory-only session */ }
  window.location.assign('/');
}
const auth = { user, session, loading: false, passwordRecoveryMode: false,
  signInWithPassword: unsupported, signUp: unsupported, resetPasswordForEmail: unsupported, updatePassword: unsupported,
  signInWithGoogle: async () => {}, signOut: async () => resetDemo(),
};
export function AuthProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
export function useAuth() { return auth; }
