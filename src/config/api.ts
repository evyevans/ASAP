/**
 * Central API configuration — single source of truth for backend URLs.
 * Override via Vite env: VITE_API_BASE_URL, VITE_BACKEND_URL, VITE_WS_URL
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  'http://localhost:8000';

export const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${API_BASE_URL.replace(/^http/, 'ws')}/ws/events`;

export const ELEVENLABS_AGENT_ID =
  (import.meta.env.VITE_ELEVENLABS_AGENT_ID as string) || '';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
