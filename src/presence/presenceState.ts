/* Pure mapping: the LIVE world signals (connection status + the latest activity
 * beat) → ASAP's on-screen presence. ONE agent — this describes ASAP itself, never
 * a fleet. Kept pure + tested so the 3D layer (AsapPresence) stays a thin view.
 *
 * When the real rigged glTF lands, `mode` maps 1:1 to animation clips:
 *   idle → "Idle" · thinking → "Thinking" · working → "Typing" · offline → "Idle" (frozen). */

export type PresenceMode = 'offline' | 'idle' | 'thinking' | 'working';

export interface LatestBeat {
  summary: string;
  timestamp: string; // ISO 8601
}

export interface Presence {
  mode: PresenceMode;
  live: boolean; // realtime channel connected
  label: string; // headline status ("ASAP is working…")
  caption: string; // sub-line (the current beat or a standby line)
}

const WORKING_WINDOW_S = 6; // a beat this recent → actively working
const WINDDOWN_WINDOW_S = 20; // still winding down (thinking) up to here

/** Derive ASAP's presence from system status + the most recent activity beat.
 *  `now` is injected (ms epoch) so this stays pure and testable. */
export function derivePresence(
  systemStatus: 'connected' | 'reconnecting' | 'disconnected',
  latest: LatestBeat | null,
  now: number
): Presence {
  const live = systemStatus === 'connected';

  if (systemStatus === 'disconnected') {
    return { mode: 'offline', live, label: 'ASAP is offline', caption: 'Reconnecting to your workspace…' };
  }

  const secsSince = latest ? (now - Date.parse(latest.timestamp)) / 1000 : Infinity;

  if (latest && secsSince < WORKING_WINDOW_S) {
    return { mode: 'working', live, label: 'ASAP is working…', caption: latest.summary };
  }
  if (latest && secsSince < WINDDOWN_WINDOW_S) {
    return { mode: 'thinking', live, label: 'ASAP is wrapping up…', caption: latest.summary };
  }
  return {
    mode: 'idle',
    live,
    label: 'ASAP is standing by',
    caption: latest ? `Last: ${latest.summary}` : 'Watching your calendar for the next block.',
  };
}
