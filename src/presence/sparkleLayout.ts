/* ═══════════════════════════════════════════════════════════════════════════
   sparkleLayout — where the glints sit on the crystalline head.

   The reference look is a dark faceted head carrying hundreds of tiny points of
   light: mostly white, flecked with gold, cyan and red, with a handful large
   enough to throw anamorphic star flares. This module decides, once at mount,
   where each of those lives and what it looks like.

   PURE ON PURPOSE. It takes raw typed arrays rather than a THREE.Mesh, so it
   imports nothing, runs in plain node, and its output is byte-for-byte
   reproducible from a seed. That means "the sparkle distribution is correct" is
   a unit test rather than a screenshot someone eyeballs.

   DETERMINISM IS A FEATURE, NOT A DETAIL. Math.random() would re-roll the
   entire head on every hot reload and every remount, which reads as flicker —
   the same doctrine materials.ts already follows with its hash2 noise.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SparkleLayoutOptions {
  /** Flat xyz triples of the surface to scatter over. */
  positions: Float32Array;
  /** Flat xyz normals, parallel to `positions`. */
  normals: Float32Array;
  /** Triangle indices; omit for non-indexed geometry. */
  index?: Uint16Array | Uint32Array | null;
  count: number;
  /** How many of the largest gems also throw a star flare. */
  flareCount: number;
  seed: number;
  /** [min, max] gem radius, in the same units as `positions`. */
  sizeRange: [number, number];
  /** Reject faces pointing below this (skips gems buried in the collar). */
  minNormalY?: number;
}

export interface SparkleLayout {
  /** 16 floats per instance — column-major mat4, ready for InstancedMesh. */
  matrices: Float32Array;
  /** Per-instance phase seed, 0…1. */
  seeds: Float32Array;
  /** Per-instance rgb tint, 3 floats each. */
  tints: Float32Array;
  /** Per-instance flare strength; 0 for all but the largest `flareCount`. */
  flares: Float32Array;
  /** Per-instance surface normal, 3 floats each — drives the `facing` term. */
  normals: Float32Array;
  /** Per-instance uniform scale. */
  scales: Float32Array;
  count: number;
}

/* Tints sampled from the reference: overwhelmingly white, with warm gold, cool
 * cyan and a few red flecks — the colours visible in the sparkle field. */
const TINTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [1.00, 1.00, 1.00, 0.68], // white
  [1.00, 0.85, 0.63, 0.12], // gold
  [0.62, 0.91, 1.00, 0.10], // cyan
  [1.00, 0.48, 0.42, 0.10], // red
];

/** Seeded LCG (Numerical Recipes). Deterministic across engines and platforms. */
function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickTint(u: number): readonly [number, number, number] {
  let acc = 0;
  for (const [r, g, b, w] of TINTS) {
    acc += w;
    if (u <= acc) return [r, g, b];
  }
  return [1, 1, 1];
}

/**
 * Scatter `count` gems across the surface, area-weighted so density is even
 * rather than clustered wherever the mesh happens to have small triangles.
 *
 * Area weighting is done with a cumulative-area table plus a binary search —
 * about thirty lines, and it avoids depending on three's MeshSurfaceSampler
 * (which needs a real THREE.Mesh and would make this module untestable in node).
 */
export function buildSparkleLayout(opts: SparkleLayoutOptions): SparkleLayout {
  const {
    positions, normals, index = null, count, flareCount,
    seed, sizeRange, minNormalY = -1,
  } = opts;

  const rand = lcg(seed);
  const [sMin, sMax] = sizeRange;

  // ── Build the eligible triangle list and its cumulative area table ──
  const triCount = index ? index.length / 3 : positions.length / 9;
  const tris: number[] = [];
  const cum: number[] = [];
  let total = 0;

  const vi = (t: number, k: number) => (index ? index[t * 3 + k] : t * 3 + k);

  for (let t = 0; t < triCount; t++) {
    const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);

    // Average normal decides eligibility — cheap, and enough to drop faces
    // pointing down into the collar where a gem would never be seen.
    const ny = (normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1]) / 3;
    if (ny < minNormalY) continue;

    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const nyy = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const area = 0.5 * Math.hypot(nx, nyy, nz);
    if (!(area > 0)) continue;

    total += area;
    tris.push(t);
    cum.push(total);
  }

  const n = tris.length > 0 ? count : 0;

  const matrices = new Float32Array(n * 16);
  const seeds = new Float32Array(n);
  const tints = new Float32Array(n * 3);
  const flares = new Float32Array(n);
  const outNormals = new Float32Array(n * 3);
  const scales = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    // Area-weighted triangle choice.
    const target = rand() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1; else hi = mid;
    }
    const t = tris[lo];
    const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);

    // Uniform barycentric point in the triangle.
    let u = rand();
    let v = rand();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;

    const px = positions[a * 3] * w + positions[b * 3] * u + positions[c * 3] * v;
    const py = positions[a * 3 + 1] * w + positions[b * 3 + 1] * u + positions[c * 3 + 1] * v;
    const pz = positions[a * 3 + 2] * w + positions[b * 3 + 2] * u + positions[c * 3 + 2] * v;

    let nx = normals[a * 3] * w + normals[b * 3] * u + normals[c * 3] * v;
    let ny = normals[a * 3 + 1] * w + normals[b * 3 + 1] * u + normals[c * 3 + 1] * v;
    let nz = normals[a * 3 + 2] * w + normals[b * 3 + 2] * u + normals[c * 3 + 2] * v;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;

    /* Heavy-tailed scale: u^2.6 puts most gems near the minimum and only a few
     * near the maximum. That is what produces "hundreds of pinpricks and a
     * handful of real jewels" instead of a uniform bead blanket. */
    const s = sMin + (sMax - sMin) * Math.pow(rand(), 2.6);

    // Lift slightly along the normal so a gem is never half-sunk in the skull.
    const off = s * 0.45;
    const o = i * 16;
    matrices[o + 0] = s; matrices[o + 5] = s; matrices[o + 10] = s; matrices[o + 15] = 1;
    matrices[o + 12] = px + nx * off;
    matrices[o + 13] = py + ny * off;
    matrices[o + 14] = pz + nz * off;

    seeds[i] = rand();
    const [tr, tg, tb] = pickTint(rand());
    tints[i * 3] = tr; tints[i * 3 + 1] = tg; tints[i * 3 + 2] = tb;
    outNormals[i * 3] = nx; outNormals[i * 3 + 1] = ny; outNormals[i * 3 + 2] = nz;
    scales[i] = s;
  }

  /* Flares go to the largest gems, as a BUILD-TIME attribute. No runtime
   * spawning, no extra objects, no extra draw calls — the flare is just a term
   * in the fragment shader that most instances multiply by zero. */
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((x, y) => scales[y] - scales[x]);
  const flared = Math.max(0, Math.min(flareCount, n));
  for (let rank = 0; rank < flared; rank++) {
    // Brightest flare on the biggest gem, tapering down the ranking.
    flares[order[rank]] = 1 + 0.6 * (1 - rank / Math.max(1, flared));
  }

  return { matrices, seeds, tints, flares, normals: outNormals, scales, count: n };
}
