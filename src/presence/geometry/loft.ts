/* ═══════════════════════════════════════════════════════════════════════════
   loft — the primitive that lets the figure be tailored instead of turned.

   WHY THIS EXISTS

   The whole figure was built from `LatheGeometry`: a profile spun around an
   axis. A lathe is radially symmetric BY CONSTRUCTION, and that single property
   is what capped the character's realism. A solid of revolution cannot have:

     · a chest that is broader than it is deep
     · a back that is flatter than the front
     · a lapel that rolls
     · a sleeve that pinches and folds at the elbow
     · a hem, a vent, or a shoulder line

   No normal map recovers any of that, because the silhouette is wrong — and the
   silhouette is what you actually read at hero size.

   A LOFT skins a stack of cross-sections, and every section is free to differ in
   width, depth, roundness, and offset. That is the entire difference between a
   turned barrel and a garment.

   PURE ON PURPOSE. Returns raw typed arrays rather than a THREE.BufferGeometry,
   so the maths is unit-testable in plain node with no three.js import and no
   WebGL. The thin adapter that wraps these into a BufferGeometry lives at the
   call site. Watertightness and outward-facing normals are asserted in tests
   rather than eyeballed — for a change this large, "it looked fine" is not
   evidence.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SectionSpec {
  /** Height of this cross-section along the loft axis. */
  y: number;
  /** Half-extent on X (side to side). */
  width: number;
  /** Half-extent on Z (front to back). */
  depth: number;
  /**
   * Superellipse exponent. 2 = a true ellipse; higher values square the
   * corners off. A chest wants ~2.4 (slightly boxy), a waist ~2.0.
   */
  power?: number;
  /** Shift the whole section. Lets the chest sit forward of the waist. */
  offsetX?: number;
  offsetZ?: number;
  /**
   * Scale applied only to the +Z (front) half. Below 1 flattens the back
   * relative to the front — the single most "human torso" parameter here,
   * and one a lathe cannot express at all.
   */
  frontScale?: number;
  /** Rotate the section about Y, in radians. */
  rotate?: number;
}

export interface LoftResult {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Vertices per ring — useful for slicing the result. */
  segments: number;
  rings: number;
}

export interface LoftOptions {
  /** Points around each cross-section. */
  segments: number;
  /** Close the ends with a triangle fan. Needed for a watertight solid. */
  capStart?: boolean;
  capEnd?: boolean;
}

/** Signed power, so the superellipse stays symmetric through the origin. */
const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

/**
 * One closed cross-section ring, as flat xz pairs.
 * Exported so tests can assert the section shape independently of the loft.
 */
export function sectionRing(spec: SectionSpec, segments: number): Float32Array {
  const {
    width, depth, power = 2, offsetX = 0, offsetZ = 0,
    frontScale = 1, rotate = 0,
  } = spec;

  const e = 2 / Math.max(0.2, power);
  const out = new Float32Array(segments * 2);
  const cr = Math.cos(rotate);
  const sr = Math.sin(rotate);

  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    let x = width * spow(Math.cos(t), e);
    let z = depth * spow(Math.sin(t), e);

    // Front/back asymmetry: only the +Z half is scaled.
    if (z > 0) z *= frontScale;

    const rx = x * cr - z * sr;
    const rz = x * sr + z * cr;

    out[i * 2] = rx + offsetX;
    out[i * 2 + 1] = rz + offsetZ;
  }
  return out;
}

/**
 * Skin a stack of cross-sections into a watertight surface.
 *
 * Sections must be ordered along the axis (ascending `y`). Adjacent rings share
 * their vertices via the index buffer, so no cracks can open between them — the
 * same reason the crystal head displaces while still indexed before it is
 * faceted.
 */
export function buildLoft(specs: readonly SectionSpec[], opts: LoftOptions): LoftResult {
  const segments = Math.max(3, Math.floor(opts.segments));
  const rings = specs.length;
  if (rings < 2) {
    throw new Error(`buildLoft needs at least 2 sections, received ${rings}`);
  }

  const capStart = opts.capStart ?? true;
  const capEnd = opts.capEnd ?? true;

  const ringVerts = rings * segments;
  const capVerts = (capStart ? 1 : 0) + (capEnd ? 1 : 0);
  const vertexCount = ringVerts + capVerts;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);

  // ── vertices ──
  for (let r = 0; r < rings; r++) {
    const ring = sectionRing(specs[r], segments);
    const y = specs[r].y;
    for (let i = 0; i < segments; i++) {
      const v = (r * segments + i) * 3;
      positions[v] = ring[i * 2];
      positions[v + 1] = y;
      positions[v + 2] = ring[i * 2 + 1];
    }
  }

  // Cap centres sit at the centroid of their ring, not at x=z=0, so an offset
  // section still caps flush.
  const centroid = (r: number): [number, number] => {
    let sx = 0, sz = 0;
    for (let i = 0; i < segments; i++) {
      sx += positions[(r * segments + i) * 3];
      sz += positions[(r * segments + i) * 3 + 2];
    }
    return [sx / segments, sz / segments];
  };

  let startCapIdx = -1;
  let endCapIdx = -1;
  let next = ringVerts;
  if (capStart) {
    startCapIdx = next++;
    const [cx, cz] = centroid(0);
    positions[startCapIdx * 3] = cx;
    positions[startCapIdx * 3 + 1] = specs[0].y;
    positions[startCapIdx * 3 + 2] = cz;
  }
  if (capEnd) {
    endCapIdx = next++;
    const [cx, cz] = centroid(rings - 1);
    positions[endCapIdx * 3] = cx;
    positions[endCapIdx * 3 + 1] = specs[rings - 1].y;
    positions[endCapIdx * 3 + 2] = cz;
  }

  // ── indices ──
  const sideTris = (rings - 1) * segments * 2;
  const capTris = (capStart ? segments : 0) + (capEnd ? segments : 0);
  const indices = new Uint32Array((sideTris + capTris) * 3);
  let k = 0;

  for (let r = 0; r < rings - 1; r++) {
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      const a = r * segments + i;
      const b = r * segments + j;
      const c = (r + 1) * segments + j;
      const d = (r + 1) * segments + i;
      // Winding chosen so face normals point OUTWARD; asserted in loft.test.ts.
      indices[k++] = a; indices[k++] = d; indices[k++] = c;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
    }
  }

  if (capStart) {
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      indices[k++] = startCapIdx; indices[k++] = i; indices[k++] = j;
    }
  }
  if (capEnd) {
    const base = (rings - 1) * segments;
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      indices[k++] = endCapIdx; indices[k++] = base + j; indices[k++] = base + i;
    }
  }

  computeSmoothNormals(positions, indices, normals);
  return { positions, normals, indices, segments, rings };
}

/** Area-weighted vertex normals, accumulated from face normals. */
export function computeSmoothNormals(
  positions: Float32Array,
  indices: Uint32Array,
  out: Float32Array
): void {
  out.fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const e1x = positions[b] - ax, e1y = positions[b + 1] - ay, e1z = positions[b + 2] - az;
    const e2x = positions[c] - ax, e2y = positions[c + 1] - ay, e2z = positions[c + 2] - az;
    // Cross product magnitude is twice the triangle area, so larger faces
    // contribute proportionally — that is what "area-weighted" buys us.
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      out[v] += nx; out[v + 1] += ny; out[v + 2] += nz;
    }
  }
  for (let v = 0; v < out.length; v += 3) {
    const len = Math.hypot(out[v], out[v + 1], out[v + 2]);
    if (len > 1e-9) {
      out[v] /= len; out[v + 1] /= len; out[v + 2] /= len;
    } else {
      out[v] = 0; out[v + 1] = 1; out[v + 2] = 0;
    }
  }
}

/**
 * Interpolate a run of intermediate sections between two keys.
 *
 * Lets a garment be authored from a handful of meaningful sections (shoulder,
 * chest, waist, hem) while still producing a smooth surface. `ease` shapes the
 * blend so cloth can gather quickly and release slowly.
 */
export function subdivideSections(
  keys: readonly SectionSpec[],
  perSpan: number,
  ease: (t: number) => number = (t) => t
): SectionSpec[] {
  if (keys.length < 2 || perSpan < 1) return [...keys];
  const out: SectionSpec[] = [];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  for (let i = 0; i < keys.length - 1; i++) {
    const A = keys[i], B = keys[i + 1];
    const steps = i === keys.length - 2 ? perSpan + 1 : perSpan;
    for (let s = 0; s < steps; s++) {
      const t = ease(s / perSpan);
      out.push({
        y: lerp(A.y, B.y, t),
        width: lerp(A.width, B.width, t),
        depth: lerp(A.depth, B.depth, t),
        power: lerp(A.power ?? 2, B.power ?? 2, t),
        offsetX: lerp(A.offsetX ?? 0, B.offsetX ?? 0, t),
        offsetZ: lerp(A.offsetZ ?? 0, B.offsetZ ?? 0, t),
        frontScale: lerp(A.frontScale ?? 1, B.frontScale ?? 1, t),
        rotate: lerp(A.rotate ?? 0, B.rotate ?? 0, t),
      });
    }
  }
  return out;
}
