/**
 * ASAP Biometric Consent Gate — BIPA Compliance Layer
 */

import { apiUrl } from '../config/api';

const CONSENT_KEY = 'asap_biometric_consent';

interface BiometricConsent {
  granted: boolean;
  timestamp: string;
  version: string;
  jurisdiction: string;
  ip?: string;
}

const CURRENT_CONSENT_VERSION = '1.0';

/** Set from SettingsModal / App once org + session are known. */
let _orgId: string | null = null;
let _accessToken: string | null = null;

export function setPreferenceAuthContext(
  orgId: string | null,
  accessToken: string | null,
): void {
  _orgId = orgId;
  _accessToken = accessToken;
}

export function hasBiometricConsent(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    const consent: BiometricConsent = JSON.parse(raw);
    return consent.granted && consent.version === CURRENT_CONSENT_VERSION;
  } catch {
    return false;
  }
}

export function grantBiometricConsent(): void {
  const consent: BiometricConsent = {
    granted: true,
    timestamp: new Date().toISOString(),
    version: CURRENT_CONSENT_VERSION,
    jurisdiction: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  _syncPreferencesToBackend({
    biometric_consent: true,
    biometric_consent_version: CURRENT_CONSENT_VERSION,
  });
}

export function revokeBiometricConsent(): void {
  localStorage.removeItem(CONSENT_KEY);
  _syncPreferencesToBackend({ biometric_consent: false });
}

export function syncHumanReviewPreference(enabled: boolean): void {
  _syncPreferencesToBackend({ hitl_enabled: enabled });
}

export function syncNotificationPreference(channel: 'telegram'): void {
  _syncPreferencesToBackend({ notification_channel_preference: channel });
}

async function _syncPreferencesToBackend(
  payload: Record<string, boolean | string>,
): Promise<void> {
  if (!_orgId) {
    console.warn('[ASAP] Skipping preference sync — org not resolved yet');
    return;
  }
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tenant-id': _orgId,
      'x-org-id': _orgId,
    };
    if (_accessToken) {
      headers['Authorization'] = `Bearer ${_accessToken}`;
    }
    await fetch(apiUrl('/api/v1/settings/preferences'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('[ASAP] Failed to sync preferences to backend:', error);
  }
}

export type { BiometricConsent };
export { CURRENT_CONSENT_VERSION };
