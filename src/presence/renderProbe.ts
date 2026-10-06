/* ═══════════════════════════════════════════════════════════════════════════
   renderProbe — proof that pixels were actually drawn.

   WHY THIS IS NECESSARY

   The presence layer has three other safety nets, and every one of them catches
   a THROW: useSafeFrame catches a throwing animation callback, RenderPipeline
   catches a throwing composer, StageBoundary catches a throwing React render.

   None of them can catch the failure that actually shipped: nothing threw, and
   nothing was drawn. A silent, perfectly healthy black rectangle. tsc passed,
   321 unit tests passed, `vite build` passed, and the hero was empty.

   So this reads the framebuffer back and asserts the image is not flat.

   THE DETAIL THAT MAKES IT WORK

   It must run INSIDE the render callback, immediately after the draw, in the
   same task. The canvas is created with `preserveDrawingBuffer: false`, so the
   drawing buffer is valid only until the browser composites at the end of the
   current event-loop turn. Reading from a useEffect, a setTimeout, or a
   microtask returns garbage — usually all zeros, which would make this report
   a false failure and be worse than having no probe at all.

   COST: three small tiles (~1.5 KB), once per page load, one GPU→CPU sync of
   roughly 1-3 ms. Never in a loop.

   The classifier half is pure so it can be unit tested against synthetic
   buffers; only `probeFramebuffer` touches WebGL.
   ═══════════════════════════════════════════════════════════════════════════ */

import type * as THREE from 'three';

export interface ProbeResult {
  ok: boolean;
  /** Why it failed, for the console and the harness. */
  reason: 'ok' | 'flat' | 'single-colour' | 'empty';
  lumaMin: number;
  lumaMax: number;
  /** lumaMax - lumaMin, 0…255. The primary signal. */
  spread: number;
  /** Fraction of pixels sharing the most common quantised colour, 0…1. */
  modalShare: number;
  pixels: number;
}

/* ── Thresholds ───────────────────────────────────────────────────────────
   Two INDEPENDENT criteria, because "flat black" and "flat stage-colour" are
   different failures and either one is fatal. */

/** Below this luma range the image carries no structure at all. */
export const MIN_SPREAD = 6;
/** Above this, one colour owns the frame — a clear-colour fill and nothing else. */
export const MAX_MODAL_SHARE = 0.985;

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Classify an RGBA byte buffer. Pure — unit tested, no WebGL.
 *
 * Colours are quantised to 5 bits per channel before the modal count so that
 * dithering and 1-LSB noise don't disguise a flat fill as varied content.
 */
export function classifyProbe(px: Uint8Array | Uint8ClampedArray): ProbeResult {
  const pixels = Math.floor(px.length / 4);
  if (pixels === 0) {
    return { ok: false, reason: 'empty', lumaMin: 0, lumaMax: 0, spread: 0, modalShare: 1, pixels: 0 };
  }

  let lumaMin = Infinity;
  let lumaMax = -Infinity;
  const buckets = new Map<number, number>();

  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    const r = px[o];
    const g = px[o + 1];
    const b = px[o + 2];

    const l = luma(r, g, b);
    if (l < lumaMin) lumaMin = l;
    if (l > lumaMax) lumaMax = l;

    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  let modal = 0;
  for (const n of buckets.values()) if (n > modal) modal = n;

  /* `spread` stays max−min ON PURPOSE.
   *
   * A percentile (p99) was considered and rejected: this scene is designed so
   * that almost every pixel is near-black and the only bright ones are sparse
   * specular glints. p99 of ~900 samples is the 9th-brightest pixel, so if only
   * a handful of glints land in the tiles, a percentile would report "flat" for
   * a perfectly good frame. For the question actually being asked — "is there
   * ANY content here, or is this a flat fill?" — the maximum is the correct and
   * most sensitive statistic.
   *
   * The real fix for "the verdict hinged on luck" is more evidence, not a
   * blunter statistic: larger resolution-independent tiles (defaultProbeRects)
   * and several retries taking the best result (RenderPipeline). */
  const spread = lumaMax - lumaMin;
  const modalShare = modal / pixels;

  const reason: ProbeResult['reason'] =
    spread < MIN_SPREAD ? 'flat'
    : modalShare > MAX_MODAL_SHARE ? 'single-colour'
    : 'ok';

  return { ok: reason === 'ok', reason, lumaMin, lumaMax, spread, modalShare, pixels };
}

export interface ProbeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Read back a few tiles and classify them together.
 *
 * MUST be called inside the render callback, right after the draw — see the
 * header. Returns null if the context is gone rather than throwing, because a
 * diagnostic that can crash the thing it measures is worse than no diagnostic.
 */
export function probeFramebuffer(
  renderer: THREE.WebGLRenderer,
  rects: ProbeRect[]
): ProbeResult | null {
  try {
    const gl = renderer.getContext();
    if (!gl || (gl as WebGLRenderingContext).isContextLost?.()) return null;

    // Read from the default framebuffer, not whatever the composer left bound.
    renderer.setRenderTarget(null);

    let total = 0;
    for (const r of rects) total += r.w * r.h;
    const merged = new Uint8Array(total * 4);

    let offset = 0;
    for (const r of rects) {
      const buf = new Uint8Array(r.w * r.h * 4);
      gl.readPixels(r.x, r.y, r.w, r.h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      merged.set(buf, offset);
      offset += buf.length;
    }

    return classifyProbe(merged);
  } catch {
    return null;
  }
}

/**
 * Tiles to sample, in framebuffer pixels (origin bottom-left, as WebGL reads).
 *
 * Deliberately spread across the frame: the subject, the floor beneath it, and
 * a corner. Sampling only the centre would pass a scene where the character
 * rendered but the stage did not, and vice versa.
 */
export function defaultProbeRects(width: number, height: number): ProbeRect[] {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));

  /* Tiles are sized as a FRACTION of the framebuffer, not in absolute device
   * pixels. The previous version hard-coded 24/16/8 px, which meant a Retina
   * display (dpr 2) sampled a quarter of the image area a dpr-1 display did —
   * on a scene whose only bright pixels are sparse glints, that quartered the
   * chance of catching one. Coverage must be resolution-independent. */
  /* The buffer cap must be applied LAST. Applying the `min` floor afterwards
   * lets a 24px floor exceed an 18px-tall buffer, producing a tile that hangs
   * off the edge and a readPixels outside the framebuffer. */
  const cap = Math.max(1, Math.min(w, h));
  const tile = (frac: number, min: number) =>
    Math.max(1, Math.min(Math.max(min, Math.round(h * frac)), cap));

  const big = tile(0.14, 24);   // subject — generous, this is the signal
  const mid = tile(0.08, 16);   // secondary surface
  const small = tile(0.04, 8);  // backdrop reference

  // Place a tile by its CENTRE, clamped so it always lies inside the buffer.
  const at = (cx: number, cy: number, size: number): ProbeRect => ({
    x: Math.max(0, Math.min(Math.round(w * cx - size / 2), w - size)),
    y: Math.max(0, Math.min(Math.round(h * cy - size / 2), h - size)),
    w: size,
    h: size,
  });

  return [
    // Subject: the crystalline head. With the camera at (0.14,1.62,1.24) looking
    // at (-0.06,1.36,-1.70), the head centre projects near 0.62 of frame height.
    at(0.50, 0.62, big),
    // The near-mirror floor in FRONT of the desk. The previous tile at y=0.18
    // was labelled "stage floor" but the camera maths puts that ray on the
    // butler's black wool trousers — the darkest material in the scene, and the
    // one place guaranteed to contribute nothing. The floor's specular smear is
    // the most reliable bright feature in a noir frame.
    at(0.28, 0.10, mid),
    // Backdrop reference, giving the dark end of the range.
    at(0.03, 0.95, small),
  ];
}
