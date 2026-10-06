/* ═══════════════════════════════════════════════════════════════════════════
   headSculpt — give the crystal head an actual skull under it.

   WHAT WAS WRONG

   The head was `LatheGeometry` plus hash noise. A lathe is a solid of
   revolution, so it is radially symmetric by construction: it can have bumps,
   but it can never have a FACE. There is no brow, no nose bridge, no cheekbone,
   no jaw — and noise cannot invent them, because noise has no anatomy. At hero
   size that reads as a lumpy ball wearing sparkles.

   WHAT THIS DOES

   Displaces each vertex along its own normal by the sum of a few positioned
   gaussian "features" — brow ridge, nose, eye sockets, cheekbones, jaw, chin,
   temples, occiput. That is enough to give a recognisable human silhouette in
   profile and three-quarter, which is all the reference actually shows through
   the crystal.

   It stays FACETED. The caller still runs toNonIndexed() + computeVertexNormals()
   afterwards, so the result is cut crystal with a skull inside it — not a
   smoothed head. This adds structure; it does not soften anything.

   Pure and deterministic: same input, byte-identical output. No three.js, no
   randomness, so the anatomy is unit-testable in plain node — which matters,
   because "does this look like a head" is otherwise pure opinion.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface HeadFeature {
  /** Name, for test diagnostics. */
  id: string;
  /** Centre in UNIT head space: x right, y up, z forward. */
  at: readonly [number, number, number];
  /** Displacement along the vertex normal, in head radii. Negative = inward. */
  amount: number;
  /** Gaussian falloff radius in unit head space. */
  radius: number;
  /** Also apply the feature mirrored across x. */
  mirror?: boolean;
  /**
   * Only affect vertices whose normal faces roughly this way. Stops the brow
   * ridge from also denting the back of the skull, which is what happens if
   * you weight purely by distance.
   */
  facing?: readonly [number, number, number];
}

/**
 * A stylised male head, tuned for a figure seen from the front and
 * three-quarter at hero size. Amounts are deliberately small — this is a
 * suggestion of a skull beneath faceted glass, not a portrait.
 */
export const HEAD_FEATURES: readonly HeadFeature[] = [
  // Forehead + brow: the single most recognisable landmark in silhouette.
  { id: 'brow',       at: [0.00,  0.30,  0.86], amount:  0.050, radius: 0.55, facing: [0, 0.2, 1] },
  { id: 'forehead',   at: [0.00,  0.58,  0.66], amount:  0.028, radius: 0.55, facing: [0, 0.5, 1] },
  // Eye sockets sit BEHIND the brow — the shadow they cast is what reads as eyes.
  { id: 'socket',     at: [0.38,  0.13,  0.80], amount: -0.052, radius: 0.30, mirror: true, facing: [0.2, 0, 1] },
  { id: 'nasion',     at: [0.00,  0.16,  0.94], amount: -0.030, radius: 0.16, facing: [0, 0, 1] },
  // Nose.
  { id: 'nose',       at: [0.00, -0.04,  1.02], amount:  0.070, radius: 0.22, facing: [0, 0, 1] },
  { id: 'nostril',    at: [0.00, -0.20,  0.94], amount:  0.020, radius: 0.16, facing: [0, -0.2, 1] },
  // Cheekbones out, hollows under them — the classic couture face.
  { id: 'cheekbone',  at: [0.62, -0.04,  0.64], amount:  0.042, radius: 0.34, mirror: true, facing: [0.6, 0.1, 0.8] },
  { id: 'cheekHollow',at: [0.52, -0.34,  0.66], amount: -0.034, radius: 0.30, mirror: true, facing: [0.5, -0.2, 0.8] },
  // Jaw + chin.
  { id: 'jawAngle',   at: [0.66, -0.54,  0.12], amount:  0.038, radius: 0.34, mirror: true, facing: [0.9, -0.3, 0.2] },
  { id: 'chin',       at: [0.00, -0.76,  0.62], amount:  0.048, radius: 0.28, facing: [0, -0.4, 1] },
  { id: 'jawLine',    at: [0.40, -0.70,  0.50], amount:  0.022, radius: 0.28, mirror: true, facing: [0.4, -0.5, 0.7] },
  // Temples in, occiput out — stops the skull reading as a sphere from the side.
  { id: 'temple',     at: [0.86,  0.34,  0.30], amount: -0.030, radius: 0.34, mirror: true, facing: [1, 0.2, 0.2] },
  { id: 'occiput',    at: [0.00,  0.08, -1.00], amount:  0.036, radius: 0.55, facing: [0, 0, -1] },
];

const dot3 = (ax: number, ay: number, az: number, b: readonly [number, number, number]) =>
  ax * b[0] + ay * b[1] + az * b[2];

/**
 * Sculpt a head in place-free fashion: returns NEW positions, leaving the input
 * untouched so tests can compare before and after.
 *
 * @param positions flat xyz, centred on the head's origin
 * @param normals   flat xyz, parallel to positions
 * @param radius    the head's nominal radius, used to normalise into unit space
 */
export function sculptHead(
  positions: Float32Array,
  normals: Float32Array,
  radius: number,
  features: readonly HeadFeature[] = HEAD_FEATURES
): Float32Array {
  const out = new Float32Array(positions);
  if (!(radius > 0)) return out;

  // Pre-expand mirrored features once, rather than branching per vertex.
  const all: HeadFeature[] = [];
  for (const f of features) {
    all.push(f);
    if (f.mirror) {
      all.push({
        ...f,
        id: `${f.id}:mirror`,
        at: [-f.at[0], f.at[1], f.at[2]],
        facing: f.facing ? [-f.facing[0], f.facing[1], f.facing[2]] : undefined,
        mirror: false,
      });
    }
  }

  // Normalise `facing` vectors once.
  const facings = all.map((f) => {
    if (!f.facing) return null;
    const [x, y, z] = f.facing;
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l] as [number, number, number];
  });

  for (let v = 0; v < out.length; v += 3) {
    // Unit head space.
    const px = positions[v] / radius;
    const py = positions[v + 1] / radius;
    const pz = positions[v + 2] / radius;

    const nx = normals[v], ny = normals[v + 1], nz = normals[v + 2];

    let disp = 0;
    for (let i = 0; i < all.length; i++) {
      const f = all[i];
      const dx = px - f.at[0];
      const dy = py - f.at[1];
      const dz = pz - f.at[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      const r2 = f.radius * f.radius;
      // Cheap early-out: beyond ~3 sigma the gaussian is negligible.
      if (d2 > r2 * 9) continue;

      let w = Math.exp(-d2 / (2 * r2));

      const fa = facings[i];
      if (fa) {
        // Weight by how much this vertex's normal agrees with the feature's
        // direction, clamped at 0 so a feature never reaches around the head.
        const align = dot3(nx, ny, nz, fa);
        if (align <= 0) continue;
        w *= align;
      }
      disp += f.amount * w;
    }

    const d = disp * radius;
    out[v] = positions[v] + nx * d;
    out[v + 1] = positions[v + 1] + ny * d;
    out[v + 2] = positions[v + 2] + nz * d;
  }

  return out;
}

/**
 * Total displacement at a unit-space point, without needing a mesh.
 * Exported so tests can assert the anatomy directly — "is the brow further out
 * than the temple" is a question about the field, not about a particular
 * tessellation.
 */
export function featureFieldAt(
  p: readonly [number, number, number],
  n: readonly [number, number, number],
  features: readonly HeadFeature[] = HEAD_FEATURES
): number {
  const fake = new Float32Array([p[0], p[1], p[2]]);
  const fakeN = new Float32Array([n[0], n[1], n[2]]);
  const out = sculptHead(fake, fakeN, 1, features);
  // Recover the scalar displacement along the normal.
  return (out[0] - p[0]) * n[0] + (out[1] - p[1]) * n[1] + (out[2] - p[2]) * n[2];
}
