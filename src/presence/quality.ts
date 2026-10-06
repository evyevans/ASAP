/* ═══════════════════════════════════════════════════════════════════════════
   quality — decide how much rendering this device can actually afford.

   The butler lives in a dashboard hero, ABOVE the fold, on whatever machine the
   realtor happens to own. A scene that melts a laptop fan is a worse product
   than a slightly simpler one that stays at 60fps, so the expensive passes
   (GTAO, depth-of-field, shadow maps) are opt-in per tier rather than assumed.

   Pure: it takes a probe of the environment rather than reading `navigator`
   itself, so every boundary is unit-testable.
   ═══════════════════════════════════════════════════════════════════════════ */

export type QualityTier = 'cinematic' | 'standard' | 'lite' | 'still';

/** What we can learn about the device. All optional — absent means "unknown". */
export interface DeviceProbe {
  /** navigator.hardwareConcurrency */
  cores?: number;
  /** navigator.deviceMemory, in GB (Chromium only) */
  memory?: number;
  /** matchMedia('(prefers-reduced-motion: reduce)').matches */
  reducedMotion: boolean;
  /** Viewport width in CSS pixels. */
  width: number;
  /** UNMASKED_RENDERER_WEBGL, when the debug extension is available. */
  renderer?: string | null;
  /** window.devicePixelRatio */
  dpr?: number;
  /** navigator.userAgent — only consulted to spot mobile GPUs. */
  userAgent?: string;
}

export interface QualitySettings {
  tier: QualityTier;
  /** r3f `dpr` clamp — [min, max]. */
  dpr: [number, number];
  /** Run the post-processing composer at all. */
  post: boolean;
  /** Ground-truth ambient occlusion — the single biggest realism win, and the
   *  single most expensive pass. */
  gtao: boolean;
  /** Depth of field. Cheap-ish, but pointless without post. */
  dof: boolean;
  bloom: boolean;
  /** Real-time shadow map from the key light. */
  shadows: boolean;
  shadowMapSize: number;
  /** Render continuously, or only when something changed. */
  frameloop: 'always' | 'demand';
  /** Cap the animation clock so low tiers don't burn battery at 120Hz. */
  maxFps: number;
  /** Subdivision multiplier for lathed/curved geometry. */
  detail: number;
  /**
   * MSAA sample count on the post-processing composer's render targets.
   *
   * This was the "pixelated" bug. EffectComposer builds its target as
   * `new WebGLRenderTarget(w, h, { type: HalfFloatType })` with no `samples`,
   * so it defaults to 0 — and the Canvas sets `antialias: !post`, which is
   * false whenever post is on. Result: NO hardware anti-aliasing at all on the
   * two tiers that actually run post, leaving SMAA to cope alone. SMAA is a
   * morphological post-filter, weakest on exactly what this scene is made of:
   * crystal facets, sub-pixel glint quads, window mullions, lapel edges.
   *
   * 0 on `lite` is correct, not an oversight — lite has post:false, so it gets
   * true MSAA from the Canvas itself via `antialias: !post`.
   *
   * 2 and not 4 on cinematic, measured on an M5 at dpr 2 (2140x836):
   *     MSAA 0 -> 59.9fps   MSAA 2 -> 50.1fps   MSAA 4 -> ~27fps
   * 4x falls off a bandwidth cliff on a HalfFloat target at this resolution.
   * 2x plus the existing SMAA pass gets the geometry edges cleanly, and with
   * `dof` disabled (see below) the whole thing runs at a full 60fps.
   */
  msaa: number;
  /* ── Crystalline-head instance budget ──
     Lit octahedral gems (real geometry, static matrices, zero per-frame cost)
     and additive glints (one ShaderMaterial, O(1) per frame regardless of N).
     `flares` is how many of the largest glints also throw a star flare. */
  gems: number;
  glints: number;
  flares: number;
}

const SETTINGS: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
  cinematic: {
    /* dof: false — DELIBERATE, and measured. BokehPass at focus 3.75 /
     * aperture 0.00055 produces about 0.6 device pixels of blur at this camera
     * distance: a full-screen pass for something invisible. Disabling it
     * recovered ~10fps, which is exactly what MSAA 2x costs. Free anti-aliasing,
     * paid for by deleting an effect nobody could see. */
    dpr: [1, 2], post: true, gtao: true, dof: false, bloom: true,
    shadows: true, shadowMapSize: 2048, frameloop: 'always', maxFps: 60, detail: 1,
    gems: 380, glints: 900, flares: 48, msaa: 2,
  },
  standard: {
    dpr: [1, 1.5], post: true, gtao: false, dof: false, bloom: true,
    shadows: true, shadowMapSize: 1024, frameloop: 'always', maxFps: 60, detail: 0.75,
    gems: 260, glints: 600, flares: 28, msaa: 2,
  },
  lite: {
    dpr: [1, 1], post: false, gtao: false, dof: false, bloom: false,
    shadows: false, shadowMapSize: 512, frameloop: 'always', maxFps: 30, detail: 0.5,
    gems: 120, glints: 260, flares: 12, msaa: 0,
  },
  // One frame, then nothing. Respects prefers-reduced-motion completely:
  // the scene is still fully rendered and readable, it simply never moves.
  still: {
    dpr: [1, 2], post: true, gtao: true, dof: true, bloom: true,
    shadows: true, shadowMapSize: 1024, frameloop: 'demand', maxFps: 0, detail: 1,
    gems: 380, glints: 900, flares: 48, msaa: 2,
  },
};

/** Renderer strings that mean "there is no real GPU here". */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;
const MOBILE_UA = /android|iphone|ipad|ipod|mobile/i;

/**
 * Pick a tier from what we know about the device.
 *
 * Order matters: an accessibility preference outranks raw horsepower, and a
 * software rasteriser outranks a high core count (16 cores emulating a GPU is
 * still not a GPU).
 */
export function pickTier(probe: DeviceProbe): QualityTier {
  // 1. The user asked for less motion. That is not negotiable by hardware.
  if (probe.reducedMotion) return 'still';

  // 2. No hardware acceleration — anything fancy will crawl.
  if (probe.renderer && SOFTWARE_RENDERER.test(probe.renderer)) return 'lite';

  // 3. Phones: small viewport and a thermally-limited GPU.
  if (probe.width < 640) return 'lite';
  if (probe.userAgent && MOBILE_UA.test(probe.userAgent)) return 'lite';

  const cores = probe.cores ?? 4;   // unknown ⇒ assume a modest laptop
  const memory = probe.memory ?? 8; // deviceMemory is Chromium-only

  if (cores >= 8 && memory >= 8 && probe.width >= 1024) return 'cinematic';
  if (cores >= 4) return 'standard';
  return 'lite';
}

/** Full settings for a probe. */
export function resolveQuality(probe: DeviceProbe): QualitySettings {
  const tier = pickTier(probe);
  return { tier, ...SETTINGS[tier] };
}

/** Settings for a tier you already picked (used by the manual override). */
export function settingsFor(tier: QualityTier): QualitySettings {
  return { tier, ...SETTINGS[tier] };
}

/** Read the real environment. Guarded so it is safe under SSR and in jsdom. */
export function probeDevice(): DeviceProbe {
  if (typeof window === 'undefined') {
    return { reducedMotion: true, width: 1280 };
  }
  let renderer: string | null = null;
  try {
    // A throwaway context purely to identify the GPU. Released immediately —
    // browsers cap live WebGL contexts, and the scene needs one of its own.
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    renderer = null; // never let GPU sniffing break the page
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    cores: nav.hardwareConcurrency,
    memory: nav.deviceMemory,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    width: window.innerWidth,
    renderer,
    dpr: window.devicePixelRatio,
    userAgent: nav.userAgent,
  };
}
