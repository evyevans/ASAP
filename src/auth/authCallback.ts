/** Detect Supabase auth callback in the URL hash (recovery, signup, magic link). */
export function getAuthHashParams(): URLSearchParams {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

export function isPasswordRecoveryUrl(): boolean {
  return getAuthHashParams().get('type') === 'recovery';
}

export function clearAuthHashFromUrl(): void {
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
