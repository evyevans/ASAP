/* Session/OS gating for the boot ceremony — split out from BootSequence.tsx
 * because a component file may only export components (react-refresh's
 * fast-refresh boundary rule); these are plain values/functions. */

export const BOOT_SESSION_KEY = 'asap:boot:played';

export function shouldSkipBoot(): boolean {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { return reduced || sessionStorage.getItem(BOOT_SESSION_KEY) === '1'; }
  catch { return true; }
}
