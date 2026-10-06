import { GUEST_KEY } from '../components/ProtectedRoute';

/** Guest/dev-bypass access has been retired — the app requires a real sign-in.
 *  Kept as a stub (always false) so any lingering references never re-enable it. */
export function isGuestAccess(): boolean {
  return false;
}

/** Voice widget is retired; kept as a stub so its (unrendered) component still compiles. */
export const DEV_AUTO_VOICE = false;

/** Clears any legacy guest flag left over from before guest mode was retired. */
export function clearGuestAccess(): void {
  try {
    sessionStorage.removeItem('asap_dev_bypass_disabled');
    localStorage.removeItem(GUEST_KEY);
  } catch {
    /* ignore */
  }
}

export function devTenantId(): string {
  return (import.meta.env.VITE_TENANT_ID as string) || 'default';
}
