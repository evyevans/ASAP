/* ═══════════════════════════════════════════════════════════════════════════
   voiceLevel — live audio amplitude, readable from the render loop at 60Hz
   without a single React re-render.

   WHY A MODULE-SCOPE BOX AND NOT STATE

   The character's sparkle pulses with the actual audio, so this value is read
   once per frame. Routing it through React state would commit 60 times a second
   and re-render the whole hero to describe something only a shader consumes.
   `Hotspots.tsx` already uses this write-to-a-ref discipline for the same
   reason; this is the same idea with a module-level box.

   THE STALENESS GUARD IS NOT OPTIONAL. If a voice turn dies mid-sentence — a
   dropped socket, a thrown handler — the last RMS value would otherwise sit
   there forever and freeze the head at whatever brightness it happened to hold.
   Reads older than STALE_MS report silence.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Older than this and the meter is presumed dead, not quiet. */
const STALE_MS = 250;

interface Level {
  rms: number;
  at: number;
}

const box: Level = { rms: 0, at: 0 };

/** Called by the analyser loop in useVoiceSession. */
export function writeVoiceLevel(rms: number): void {
  box.rms = Number.isFinite(rms) ? Math.max(0, Math.min(1, rms)) : 0;
  box.at = performance.now();
}

/** Read from the render loop. Returns silence if nothing has written recently. */
export function readVoiceLevel(): { rms: number } {
  if (box.at === 0 || performance.now() - box.at > STALE_MS) return { rms: 0 };
  return { rms: box.rms };
}

/** Called when a turn ends, so the head settles immediately rather than
 *  drifting down over the staleness window. */
export function clearVoiceLevel(): void {
  box.rms = 0;
  box.at = 0;
}

/**
 * Perceptual shaping for a raw RMS.
 *
 * Raw RMS on speech sits low and spiky; `(rms * 3.2) ^ 0.6` lifts conversational
 * level into a usable range and compresses the peaks, so the sparkle tracks the
 * shape of the voice rather than flickering on consonants.
 * Pure, so it is unit-testable.
 */
export function perceptualLevel(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  return Math.max(0, Math.min(1, Math.pow(rms * 3.2, 0.6)));
}

/** Compute RMS from a time-domain byte buffer (128 = silence). */
export function rmsFromTimeDomain(buf: Uint8Array): number {
  if (buf.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}
