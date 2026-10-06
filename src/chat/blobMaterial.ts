/* ═══════════════════════════════════════════════════════════════════════════
   blobMaterial — the animated core, and how it cycles the spectrum.

   WHY A RAW ShaderMaterial AND NOT drei's `shaderMaterial()`
   Two reasons, and the first is not stylistic. `@react-three/drei`'s barrel
   import is broken under Vite 8 in this repo — it resolves to a missing
   `useDepthBuffer.js`, and only `vite build` surfaces it, never `vite dev`. The
   second is convention: `presence/sparkleMaterial.ts` documents at length why
   this codebase builds shader materials by hand, and a second mechanism for the
   same job is a maintenance tax with no payoff.

   HOW THE RAINBOW WORKS, AND WHY HUE IS UNTOUCHED BY STATE
   The user asked for a full 360-degree cycle. The obvious next move — driving
   hue from the agent's state — is the wrong one here, because the screen edges
   already carry state as ORANGE (see presence/EdgeGlow.tsx). A ball that turns
   green while the edges glow orange reads as two unrelated effects rather than
   one system.

   So hue is a clean, uninterrupted cycle that never reacts to anything, and
   STATE IS EXPRESSED THROUGH MOTION instead: how fast the surface churns, how
   far it displaces, how hot the rim burns. The ball stays legibly alive without
   ever competing with the edges for the same channel.

   Hue is converted in the FRAGMENT shader, from a single `uHue` float. Sending
   one scalar per frame instead of a THREE.Color keeps this O(1) and means the
   cycle can never drift between the core and its corona — they read the same
   uniform.

   The simplex noise and the Fresnel rim are adapted from the capa-showcase
   reference; the hue cycle, the state model and the two-layer corona are new.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';

/** One full trip around the hue wheel, in seconds. */
export const HUE_CYCLE_SECONDS = 24;

/**
 * How the ball moves in each phase.
 *
 * `VoicePhase` from agent/agentState.ts has five members; `transcribing` shares
 * `listening`'s profile deliberately — from the user's side those are one
 * continuous "it is taking in what I said" beat, and giving them separate looks
 * made the ball twitch mid-sentence.
 */
export interface BlobProfile {
  /** Churn rate of the surface noise. */
  speed: number;
  /** How far vertices displace along their normals. */
  noise: number;
  /** Rim brightness — the Fresnel term's multiplier. */
  intensity: number;
  /** Opacity of the outer corona shell. */
  corona: number;
  /** Bob/tilt rate of the whole group. */
  motion: number;
}

export const BLOB_PROFILES = {
  idle:         { speed: 0.30, noise: 0.15, intensity: 1.30, corona: 0.12, motion: 1.0 },
  listening:    { speed: 0.55, noise: 0.28, intensity: 1.75, corona: 0.22, motion: 1.8 },
  transcribing: { speed: 0.55, noise: 0.28, intensity: 1.75, corona: 0.22, motion: 1.8 },
  thinking:     { speed: 1.00, noise: 0.42, intensity: 2.30, corona: 0.30, motion: 2.6 },
  speaking:     { speed: 0.80, noise: 0.36, intensity: 2.00, corona: 0.26, motion: 2.2 },
} as const satisfies Record<string, BlobProfile>;

export type BlobPhase = keyof typeof BLOB_PROFILES;

export const profileFor = (phase: string): BlobProfile =>
  (BLOB_PROFILES as Record<string, BlobProfile>)[phase] ?? BLOB_PROFILES.idle;

/**
 * Frame-rate-independent easing toward a target.
 *
 * Same formulation as presence/characterState.ts's `approach`, and for the same
 * reason: a plain `lerp(a, b, 0.04)` per frame converges more than twice as
 * fast at 120Hz as at 50Hz, so the ball's reaction time would silently depend
 * on the user's monitor.
 */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (!Number.isFinite(current)) return target;
  if (tau <= 0 || !Number.isFinite(dt) || dt <= 0) return target;
  return target + (current - target) * Math.exp(-dt / tau);
}

/** Wraps into [0,1). `uHue` grows without bound otherwise and loses float
 *  precision after a few hours on a tab left open. */
export const wrapHue = (h: number): number => h - Math.floor(h);

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uNoise;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vDisplace;

  // Ashima simplex noise (public domain). Verbatim — it is a known-good
  // implementation and paraphrasing it would only risk introducing artefacts.
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    float n = snoise(position * 2.0 + uTime * uSpeed);
    vDisplace = n;

    vec3 displaced = position + normal * (n * uNoise);

    // Re-derive the normal from two neighbouring samples of the SAME field.
    // Reusing the sphere's original normal (as the reference does) leaves the
    // rim lighting flat while the silhouette churns — the lighting stops
    // agreeing with the shape you can see.
    float e = 0.035;
    vec3 tangent = normalize(abs(normal.y) < 0.99 ? cross(normal, vec3(0.0, 1.0, 0.0))
                                                  : cross(normal, vec3(1.0, 0.0, 0.0)));
    vec3 bitangent = normalize(cross(normal, tangent));
    vec3 pa = position + tangent * e;
    vec3 pb = position + bitangent * e;
    vec3 da = pa + normal * (snoise(pa * 2.0 + uTime * uSpeed) * uNoise);
    vec3 db = pb + normal * (snoise(pb * 2.0 + uTime * uSpeed) * uNoise);
    vNormal = normalize(normalMatrix * normalize(cross(da - displaced, db - displaced)));

    vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
    vViewPosition = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uHue;
  uniform float uIntensity;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vDisplace;

  // Smooth, full-gamut hue → RGB. Cheaper than a texture lookup and, unlike a
  // 6-way branch, produces no seam where the wheel wraps.
  vec3 hue2rgb(float h) {
    vec3 k = mod(vec3(5.0, 3.0, 1.0) + h * 6.0, 6.0);
    return clamp(min(k, 4.0 - k), 0.0, 1.0);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewPosition);

    float fresnel = pow(clamp(1.0 - dot(v, n), 0.0, 1.0), 2.8);

    // Offset the rim's hue slightly ahead of the core's. A single flat hue
    // reads as plastic; a small shift makes the edge look refracted, which is
    // what sells this as a light source rather than a painted ball.
    vec3 core = hue2rgb(uHue);
    vec3 rim  = hue2rgb(fract(uHue + 0.08));

    // Displacement drives brightness, so the churning surface reads as volume
    // instead of a flat silhouette that happens to wobble.
    float depth = clamp(vDisplace * 0.5 + 0.5, 0.0, 1.0);
    vec3 base = mix(core * 0.22, core * 0.95, depth);

    vec3 finalColor = base + rim * fresnel * uIntensity;

    gl_FragColor = vec4(finalColor, 0.94);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface BlobUniforms {
  uTime: { value: number };
  uHue: { value: number };
  uSpeed: { value: number };
  uNoise: { value: number };
  uIntensity: { value: number };
}

/** Fresh material per mount — uniforms are per-instance state, so a module-level
 *  cache (the pattern used for the static materials in presence/) would make two
 *  mounted balls share one hue. */
export function createBlobMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHue: { value: 0.06 },       // start on brand orange, then drift onward
      uSpeed: { value: BLOB_PROFILES.idle.speed },
      uNoise: { value: BLOB_PROFILES.idle.noise },
      uIntensity: { value: BLOB_PROFILES.idle.intensity },
    } satisfies BlobUniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
  });
}
