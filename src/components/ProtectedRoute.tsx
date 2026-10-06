import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { ReactNode } from 'react';
import { isPasswordRecoveryUrl } from '../auth/authCallback';

/** Legacy localStorage key from the retired guest-access flow — devBypass.ts
 *  clears it on sign-out so no stale flag lingers. */
export const GUEST_KEY = 'asap_guest_access';

interface ProtectedRouteProps {
  children: ReactNode;
}

/** Redirects to /login when there is no authenticated session. */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (isPasswordRecoveryUrl() && location.pathname !== '/login') {
    return <Navigate to={`/login${window.location.hash}`} replace />;
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg-primary, var(--neutral-0))',
          color: 'var(--color-text-tertiary, var(--neutral-500))',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          letterSpacing: '0.1em',
        }}
      >
        ASAP
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
