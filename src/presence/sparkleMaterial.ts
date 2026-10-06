/* ═══════════════════════════════════════════════════════════════════════════
   sparkleMaterial — the glint field, and the anamorphic star flares.

   WHY A RAW ShaderMaterial AND NOT instanceColor

   `instanceColor` would mean rewriting 800×3 floats on the CPU and re-uploading
   the whole attribute buffer EVERY FRAME, forever, on a hero that stays mounted
   as long as the dashboard is open. It also scales linearly: more gems, more
   per-frame cost.

   This is O(1) per frame regardless of instance count — one `uTime` write plus
   a handful of scalars. Every per-instance value (seed, tint, flare, normal)
   uploads once at mount and is never touched again. It also makes the character
   state machine nearly free: each state is ONE set of uniform writes rather
   than 800 CPU-side colour recomputations.

   Not `onBeforeCompile` either: chunk injection couples us to three's internal
   shader chunk names, which change between releases and fail silently under
   `vite build`. And these gems do not WANT to be lit — they are light sources.
   Unlit + additive skips all lighting, env sampling and shadow work, and
   composes correctly with bloom.

   Instancing comes free: three auto-declares `instanceMatrix` and defines
   USE_INSTANCING for any non-Raw ShaderMaterial on an InstancedMesh.

   THE FLARES ARE PROCEDURAL, NOT A TEXTURE. At hero size a flare quad is
   20–50px; a 128² star sprite stretched over that is visibly soft and aliases
   as the head moves. Two exponential falloffs cost ~12 ALU, stay crisp at any
   resolution, and use zero texture memory. The horizontal arm is weighted 1.7×
   the vertical because real anamorphic flares are strongly horizontal — a
   symmetric cross reads as a sparkle emoji, not as an optical artefact.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import type { SparkleLayout } from './sparkleLayout';

export interface SparkleUniforms {
  uTime: { value: number };
  uAmp: { value: number };
  uRate: { value: number };
  uCoherence: { value: number };
  uTintPush: { value: THREE.Vector3 };
  uFlare: { value: number };
  uBand: { value: number };
  uBandY: { value: number };
  uSize: { value: number };
}

const VERT = /* glsl */`
  attribute float aSeed;
  attribute vec3  aTint;
  attribute float aFlare;
  attribute vec3  aNrm;

  uniform float uTime;
  uniform float uAmp;
  uniform float uRate;
  uniform float uCoherence;
  uniform vec3  uTintPush;
  uniform float uFlare;
  uniform float uBand;
  uniform float uBandY;
  uniform float uSize;

  varying vec3  vColor;
  varying float vFlare;
  varying vec2  vUv;

  void main() {
    vUv = uv;

    // Billboard: take the instance ORIGIN into view space, then offset in
    // screen-aligned x/y. This is what keeps every gem facing the camera
    // without a per-instance lookAt on the CPU.
    vec4 originView = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float s = length(instanceMatrix[0].xyz);

    // Coherence blends each gem's own phase toward a single shared phase.
    // At 1.0 the whole head breathes as one organism; at 0.0 it shimmers.
    float phase = mix(aSeed * 6.2831853, 0.0, uCoherence);
    float tw = 0.5 + 0.5 * sin(uTime * uRate * (1.0 + 1.6 * aSeed) + phase);
    // pow(..., 7) makes the twinkle SPARSE and snappy — most gems dark most of
    // the time, with sudden bright hits. A raw sine reads as a uniform shimmer.
    // Exponent 4.5, not 7: at 7 so few gems are lit at any instant that the
    // head reads as a dark blob with specks. 4.5 keeps the twinkle snappy
    // while sustaining the DENSE field the reference actually shows.
    tw = pow(tw, 4.5);

    // Fade gems on the far side of the head. This single term does more for
    // the look than anything else: it stops back-facing gems popping through,
    // and it means the head's FORM is described by where highlights cluster —
    // which is exactly how the reference image reads.
    vec3 nView = normalize(normalMatrix * mat3(instanceMatrix) * aNrm);
    float facing = smoothstep(-0.15, 0.45, nView.z);

    // A travelling band that sweeps vertically during 'thinking'.
    float band = 1.0 + uBand * smoothstep(0.22, 0.0, abs(aNrm.y - uBandY)) * 2.5;

    // The 0.28 floor keeps a base shimmer on every gem, so the head always
    // reads as a faceted crystal mass rather than as a few lit specks.
    float energy = uAmp * (0.28 + tw) * band * facing;

    vColor = max(aTint + uTintPush, vec3(0.0)) * energy;
    vFlare = aFlare * uFlare * energy;

    // Flared gems draw a larger quad so their arms have room to extend.
    float quad = s * uSize * (1.0 + vFlare * 3.0);
    originView.xy += position.xy * quad;

    gl_Position = projectionMatrix * originView;
  }
`;

const FRAG = /* glsl */`
  precision highp float;

  varying vec3  vColor;
  varying float vFlare;
  varying vec2  vUv;

  void main() {
    // uv 0..1 -> -1..1
    vec2 p = (vUv - 0.5) * 2.0;

    float core = exp(-dot(p, p) * 26.0);

    // Anamorphic arms: long and thin. Horizontal dominates.
    float hx = exp(-abs(p.y) * 46.0) * exp(-abs(p.x) * 3.2);
    float hy = exp(-abs(p.x) * 52.0) * exp(-abs(p.y) * 4.6);

    float a = core + (hx + 0.58 * hy) * vFlare;
    if (a < 0.003) discard;

    vec3 c = vColor * a;
    // Hot centres blow out to white while the arms keep their tint — the way a
    // real over-exposed specular behaves.
    c = mix(c, vec3(dot(c, vec3(0.3333))), core * 0.55);

    gl_FragColor = vec4(c, 1.0);   // additive: alpha is ignored
  }
`;

export function createSparkleMaterial(): THREE.ShaderMaterial & { uniforms: SparkleUniforms } {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uAmp: { value: 0.35 },
      uRate: { value: 0.35 },
      uCoherence: { value: 0.15 },
      uTintPush: { value: new THREE.Vector3(0, 0, 0) },
      uFlare: { value: 0.5 },
      uBand: { value: 0 },
      uBandY: { value: 0 },
      uSize: { value: 8.5 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    // depthTest ON so gems behind the opaque skull are correctly hidden;
    // depthWrite OFF so they never occlude each other.
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  return mat as THREE.ShaderMaterial & { uniforms: SparkleUniforms };
}

/**
 * Build the InstancedMesh for a layout.
 *
 * `frustumCulled = false` is required: the vertex shader expands each quad well
 * beyond the bounding sphere three computes from the raw geometry, so culling
 * would pop the whole field out of view as the head nears the frame edge.
 */
export function createSparkleMesh(
  layout: SparkleLayout,
  material: THREE.ShaderMaterial
): THREE.InstancedMesh {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, layout.count));

  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(layout.matrices, 16);
  mesh.instanceMatrix.needsUpdate = true;

  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(layout.seeds, 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(layout.tints, 3));
  geo.setAttribute('aFlare', new THREE.InstancedBufferAttribute(layout.flares, 1));
  geo.setAttribute('aNrm', new THREE.InstancedBufferAttribute(layout.normals, 3));

  mesh.count = layout.count;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}
