/* ═══════════════════════════════════════════════════════════════════════════
   materials — where the realism actually comes from.

   A robot in a tuxedo is a MANUFACTURED object, and manufactured objects don't
   read as real because of polygon count. They read as real because of what
   light does at their surface: the anisotropic streak of brushed titanium, the
   sheen roll-off on wool, the tight specular of satin, the way brass goes warm
   in shadow. So all of the effort here goes into surface response, not geometry.

   Every map is generated into a <canvas> at runtime — no image files, no CDN,
   nothing to license, nothing to 404. Textures and materials are cached at
   module scope: the scene remounts on every tab return, and regenerating a
   dozen 512² canvases each time would cost ~200ms of jank.

   COLOUR SPACE, because it is the classic silent bug:
   · colour/albedo maps → SRGBColorSpace
   · data maps (roughness, normal, AO) → NoColorSpace
   Getting this backwards makes everything look subtly plasticky and washed out.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';

/* ── Brand palette, lifted from src/index.css @theme ──────────────────────
   The character is built FROM the design system rather than decorated with it. */
export const PALETTE = {
  titanium: '#B9B5AE',
  titaniumDark: '#6E6A65',
  spaceBlack: '#171614',
  wool: '#1B1A18',
  satin: '#0E0D0C',
  shirt: '#F4F2EC',
  glove: '#EFEDE6',
  brass: '#C19932',
  brassDark: '#8A6C22',
  copper: '#E8733A',
  success: '#3D8B5D',
  error: '#B54230',
  walnut: '#3A2A1E',
  oak: '#8A6A48',
  plaster: '#E7E3DA',
  rug: '#CFC7B6',
  visor: '#0B0C0E',
} as const;

export type Tint = 'copper' | 'success' | 'error';
export const TINT_HEX: Record<Tint, string> = {
  copper: PALETTE.copper,
  success: PALETTE.success,
  error: PALETTE.error,
};

/* ── Canvas plumbing ──────────────────────────────────────────────────────*/

const canvasCache = new Map<string, THREE.Texture>();

function makeCanvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { canvas: c, ctx: c.getContext('2d')! };
}

function finish(canvas: HTMLCanvasElement, srgb: boolean, repeat: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Cache wrapper — every generator goes through this. */
function cached(key: string, build: () => THREE.Texture): THREE.Texture {
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const tex = build();
  canvasCache.set(key, tex);
  return tex;
}

/** Deterministic value noise. Math.random() would make every reload look
 *  different, which reads as flicker across HMR and remounts. */
function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Build a tangent-space normal map by differencing a height function.
 * This is what gives woven fabric and machined metal their micro-relief without
 * a single extra triangle.
 */
function normalFromHeight(
  size: number,
  strength: number,
  height: (x: number, y: number) => number
): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => height((x + size) % size, (y + size) % size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Central differences → surface gradient → normal.
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Write a single-channel field as a greyscale data texture. */
function greyscale(size: number, field: (x: number, y: number) => number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.max(0, Math.min(1, field(x, y))) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/* ── The maps ─────────────────────────────────────────────────────────────*/

/** Brushed metal: long horizontal streaks. The DIRECTIONALITY is the whole
 *  point — it's what makes a surface read as machined rather than merely shiny. */
export const brushedRoughness = () => cached('brushed-r', () => {
  const S = 512;
  return finish(greyscale(S, (x, y) => {
    // Streaks are strongly correlated along x and noisy across y.
    const streak = hash2(Math.floor(x / 3), y, 1) * 0.5 + hash2(Math.floor(x / 17), y, 2) * 0.5;
    const grain = hash2(x, y, 3) * 0.12;
    return 0.20 + streak * 0.22 + grain;
  }), false, 2);
});

export const brushedNormal = () => cached('brushed-n', () => {
  const S = 512;
  return finish(normalFromHeight(S, 1.4, (x, y) =>
    hash2(Math.floor(x / 3), y, 1) * 0.6 + hash2(Math.floor(x / 11), y, 5) * 0.4
  ), false, 2);
});

/** Fine wool twill. A diagonal rib at a scale you can only just resolve —
 *  which is exactly why the eye reads "cloth" instead of "matte plastic". */
export const woolNormal = () => cached('wool-n', () => {
  const S = 512;
  return finish(normalFromHeight(S, 2.2, (x, y) => {
    const twill = Math.sin((x + y) * 0.75) * 0.5 + 0.5;      // the diagonal rib
    const warp = Math.sin(x * 1.6) * 0.25 + 0.5;             // individual threads
    const weft = Math.sin(y * 1.6) * 0.25 + 0.5;
    return twill * 0.55 + warp * 0.25 + weft * 0.25 + hash2(x, y, 9) * 0.08;
  }), false, 10);
});

export const woolRoughness = () => cached('wool-r', () => {
  const S = 256;
  return finish(greyscale(S, (x, y) =>
    0.86 + Math.sin((x + y) * 0.75) * 0.05 + hash2(x, y, 11) * 0.06
  ), false, 10);
});

/**
 * A softbox: bright in the middle, falling smoothly to nothing at every edge.
 *
 * This is not a surface map — it is the FACE OF A LIGHT, used by
 * noirMaterials.buildStageEnvironment to shape what the character reflects.
 *
 * It exists because a flat emissive panel reflects as a constant-brightness bar
 * with hard ends, and nothing in the physical world looks like that. A real
 * studio strip has falloff, so its reflection *travels and fades* across a glossy
 * shoulder. On a near-black glossy figure that moving, fading highlight is
 * essentially the entire drawing — so the shape of this gradient matters more to
 * the final image than any material parameter.
 *
 * `pow` controls the falloff per axis: 1 is linear, higher is a tighter hot
 * centre. Deliberately NoColorSpace so `pow` means what it says rather than
 * being bent again by an sRGB decode.
 */
export const softbox = (uPow = 2, vPow = 2) => cached(`softbox-${uPow}-${vPow}`, () => {
  const S = 128; // Blurred by PMREM anyway; more resolution would be wasted.
  const t = finish(greyscale(S, (x, y) => {
    const u = ((x + 0.5) / S) * 2 - 1;
    const v = ((y + 0.5) / S) * 2 - 1;
    return Math.pow(Math.max(0, 1 - Math.abs(u)), uPow)
         * Math.pow(Math.max(0, 1 - Math.abs(v)), vPow);
  }), false, 1);
  // Must NOT tile: finish() defaults to RepeatWrapping, which would mirror the
  // falloff back up at the panel edge and reinstate the hard end this removes.
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
});

/** Silk: near-uniform, very smooth, with a faint moiré that catches the light. */
export const silkRoughness = () => cached('silk-r', () => {
  const S = 256;
  return finish(greyscale(S, (x, y) =>
    0.24 + Math.sin(x * 0.35) * 0.03 + Math.sin(y * 0.11) * 0.02 + hash2(x, y, 13) * 0.03
  ), false, 4);
});

/** Paper fibre — subtle, but it stops the approval stack reading as plastic. */
export const paperNormal = () => cached('paper-n', () => {
  const S = 256;
  return finish(normalFromHeight(S, 0.6, (x, y) =>
    hash2(x, y, 17) * 0.6 + hash2(Math.floor(x / 2), Math.floor(y / 2), 19) * 0.4
  ), false, 1);
});

/** Wood grain, tinted at call time so walnut and oak share one generator. */
export const woodColor = (hex: string, key: string) => cached(`wood-c-${key}`, () => {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S);
  const base = new THREE.Color(hex);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Rings: a low-frequency wave along y, warped by noise so it never repeats
      // visibly, plus a fine pore texture along the grain direction.
      const warp = hash2(Math.floor(x / 24), 0, 23) * 12;
      const ring = Math.sin((y + warp) * 0.32) * 0.5 + 0.5;
      const pore = hash2(x, Math.floor(y / 4), 29) * 0.18;
      const k = 0.78 + ring * 0.26 - pore;
      const i = (y * S + x) * 4;
      img.data[i] = base.r * 255 * k;
      img.data[i + 1] = base.g * 255 * k;
      img.data[i + 2] = base.b * 255 * k;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(canvas, true, 1);
});

export const woodRoughness = () => cached('wood-r', () => {
  const S = 256;
  return finish(greyscale(S, (x, y) =>
    0.42 + Math.sin(y * 0.32) * 0.10 + hash2(x, Math.floor(y / 4), 31) * 0.10
  ), false, 1);
});

/** Plaster walls: broad, soft undulation. Flat walls are a dead giveaway. */
export const plasterNormal = () => cached('plaster-n', () => {
  const S = 256;
  return finish(normalFromHeight(S, 0.5, (x, y) =>
    hash2(Math.floor(x / 8), Math.floor(y / 8), 37) * 0.7 + hash2(x, y, 41) * 0.3
  ), false, 3);
});

/** Micro-scratches on a lacquered floor — catches the window light. */
export const floorRoughness = () => cached('floor-r', () => {
  const S = 512;
  return finish(greyscale(S, (x, y) => {
    const scratch = hash2(Math.floor(x / 2), Math.floor(y / 40), 43) > 0.96 ? 0.18 : 0;
    return 0.30 + scratch + hash2(x, y, 47) * 0.06;
  }), false, 4);
});

/* ── Materials ────────────────────────────────────────────────────────────*/

const materialCache = new Map<string, THREE.Material>();

function mat<T extends THREE.Material>(key: string, build: () => T): T {
  const hit = materialCache.get(key);
  if (hit) return hit as T;
  const m = build();
  materialCache.set(key, m);
  return m;
}

/** Brushed titanium — his plating. Anisotropy makes the streaks smear the
 *  highlight the way real machined metal does. */
export const titanium = () => mat('titanium', () => new THREE.MeshPhysicalMaterial({
  color: PALETTE.titanium,
  metalness: 1,
  roughness: 0.30,
  roughnessMap: brushedRoughness(),
  normalMap: brushedNormal(),
  normalScale: new THREE.Vector2(0.35, 0.35),
  anisotropy: 0.7,
  anisotropyRotation: 0,
  envMapIntensity: 1.1,
}));

/** The darker metal inside panel gaps and joints. Recessed geometry reads as
 *  manufactured only if what's behind the gap is genuinely darker. */
export const gapMetal = () => mat('gap', () => new THREE.MeshStandardMaterial({
  color: PALETTE.titaniumDark,
  metalness: 1,
  roughness: 0.62,
  envMapIntensity: 0.5,
}));

export const brass = () => mat('brass', () => new THREE.MeshPhysicalMaterial({
  color: PALETTE.brass,
  metalness: 1,
  roughness: 0.20,
  roughnessMap: brushedRoughness(),
  anisotropy: 0.4,
  envMapIntensity: 1.3,
}));

export const brassDark = () => mat('brass-dark', () => new THREE.MeshStandardMaterial({
  color: PALETTE.brassDark, metalness: 1, roughness: 0.42, envMapIntensity: 0.9,
}));

/** Tuxedo wool. `sheen` is the critical parameter — it's the retroreflective
 *  halo at grazing angles that separates cloth from black plastic. */
export const wool = () => mat('wool', () => new THREE.MeshPhysicalMaterial({
  color: PALETTE.wool,
  metalness: 0,
  roughness: 0.92,
  roughnessMap: woolRoughness(),
  normalMap: woolNormal(),
  normalScale: new THREE.Vector2(0.6, 0.6),
  sheen: 1,
  sheenColor: new THREE.Color('#4A4640'),
  sheenRoughness: 0.75,
  envMapIntensity: 0.6,
}));

/** Satin peak lapels: a clearcoat over a dark base gives the tight, wet
 *  highlight that distinguishes a lapel from the body of the jacket. */
export const satin = () => mat('satin', () => new THREE.MeshPhysicalMaterial({
  color: PALETTE.satin,
  metalness: 0,
  roughness: 0.34,
  clearcoat: 1,
  clearcoatRoughness: 0.10,
  sheen: 0.6,
  sheenColor: new THREE.Color('#6B6659'),
  envMapIntensity: 1.0,
}));

/** Silk top hat — sheen plus a low roughness for that directional silk gleam. */
export const silk = () => mat('silk', () => new THREE.MeshPhysicalMaterial({
  color: PALETTE.spaceBlack,
  metalness: 0,
  roughness: 0.30,
  roughnessMap: silkRoughness(),
  sheen: 0.9,
  sheenColor: new THREE.Color('#5B5648'),
  sheenRoughness: 0.35,
  clearcoat: 0.4,
  clearcoatRoughness: 0.3,
  envMapIntensity: 0.9,
}));

export const shirt = () => mat('shirt', () => new THREE.MeshPhysicalMaterial({
  color: PALETTE.shirt, metalness: 0, roughness: 0.72,
  sheen: 0.4, sheenRoughness: 0.6, envMapIntensity: 0.7,
}));

export const glove = () => mat('glove', () => new THREE.MeshPhysicalMaterial({
  color: PALETTE.glove, metalness: 0, roughness: 0.80,
  normalMap: woolNormal(), normalScale: new THREE.Vector2(0.25, 0.25),
  sheen: 0.35, envMapIntensity: 0.6,
}));

/** The smoked visor. Transmission (not opacity) is what makes the arcs behind
 *  it feel like they are INSIDE a glass dome rather than painted on it. */
export const visorGlass = () => mat('visor', () => new THREE.MeshPhysicalMaterial({
  color: PALETTE.visor,
  metalness: 0.1,
  roughness: 0.06,
  transmission: 0.42,
  thickness: 0.05,
  ior: 1.52,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  transparent: true,
  opacity: 0.96,
  envMapIntensity: 1.4,
}));

/** Monocle glass — clearer than the visor, and it catches a scan line. */
export const monocleGlass = () => mat('monocle', () => new THREE.MeshPhysicalMaterial({
  color: '#DCE6EC', metalness: 0, roughness: 0.02,
  transmission: 0.9, thickness: 0.02, ior: 1.5,
  transparent: true, opacity: 0.5, envMapIntensity: 1.6,
}));

/** Emissive materials are NOT cached by tint alone — the scene mutates their
 *  intensity every frame, so each call site owns its instance. `toneMapped:
 *  false` keeps the glow from being crushed by ACES before bloom sees it. */
export function makeEmissive(hex: string, intensity = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#000000',
    emissive: new THREE.Color(hex),
    emissiveIntensity: intensity,
    toneMapped: false,
    roughness: 0.4,
    metalness: 0,
  });
}

/* ── Room materials ───────────────────────────────────────────────────────*/

export const walnut = () => mat('walnut', () => new THREE.MeshPhysicalMaterial({
  map: woodColor(PALETTE.walnut, 'walnut'),
  roughnessMap: woodRoughness(),
  roughness: 0.45, metalness: 0,
  clearcoat: 0.55, clearcoatRoughness: 0.28,
  envMapIntensity: 0.8,
}));

export const oakFloor = () => mat('oak', () => {
  const map = woodColor(PALETTE.oak, 'oak') as THREE.CanvasTexture;
  map.repeat.set(5, 5);
  return new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap: floorRoughness(),
    roughness: 0.38, metalness: 0,
    clearcoat: 0.35, clearcoatRoughness: 0.4,
    envMapIntensity: 0.7,
  });
});

export const plaster = () => mat('plaster', () => new THREE.MeshStandardMaterial({
  color: PALETTE.plaster,
  normalMap: plasterNormal(),
  normalScale: new THREE.Vector2(0.3, 0.3),
  roughness: 0.95, metalness: 0, envMapIntensity: 0.5,
}));

export const rugCloth = () => mat('rug', () => new THREE.MeshPhysicalMaterial({
  color: PALETTE.rug,
  normalMap: woolNormal(), normalScale: new THREE.Vector2(0.8, 0.8),
  roughness: 0.98, metalness: 0,
  sheen: 0.8, sheenColor: new THREE.Color('#FFFFFF'), sheenRoughness: 0.9,
  envMapIntensity: 0.4,
}));

export const paper = () => mat('paper', () => new THREE.MeshStandardMaterial({
  color: '#F7F5EF',
  normalMap: paperNormal(), normalScale: new THREE.Vector2(0.2, 0.2),
  roughness: 0.88, metalness: 0, envMapIntensity: 0.6,
}));

export const darkPlastic = () => mat('plastic', () => new THREE.MeshPhysicalMaterial({
  color: '#232120', metalness: 0.2, roughness: 0.45,
  clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: 0.7,
}));

export const steel = () => mat('steel', () => new THREE.MeshPhysicalMaterial({
  color: '#9A968F', metalness: 1, roughness: 0.34,
  roughnessMap: brushedRoughness(), anisotropy: 0.5, envMapIntensity: 1.0,
}));

export const foliage = () => mat('foliage', () => new THREE.MeshPhysicalMaterial({
  color: '#3F5B3A', roughness: 0.72, metalness: 0,
  sheen: 0.5, sheenColor: new THREE.Color('#8FBF7A'),
  side: THREE.DoubleSide, envMapIntensity: 0.7,
}));

/** Release everything. Called when the scene unmounts for good — WebGL
 *  resources are not garbage collected with the React tree. */
export function disposeMaterialCache() {
  materialCache.forEach((m) => m.dispose());
  materialCache.clear();
  canvasCache.forEach((t) => t.dispose());
  canvasCache.clear();
}
