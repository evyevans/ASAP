/* ═══════════════════════════════════════════════════════════════════════════
   Figure — ASAP, modelled rather than turned.

   Replaces Butler.tsx, which built the whole character from LatheGeometry —
   solids of revolution that are radially symmetric by construction and
   therefore cannot have a lapel that rolls, a chest deeper than the back, a
   sleeve that gathers at the elbow, or a head with a brow and a jaw.

   Everything structural is now a LOFT of differing cross-sections
   (geometry/loft.ts), the head has an anatomical displacement field under the
   crystal (geometry/headSculpt.ts), and every segment count runs through the
   quality tier instead of being hard-coded.

   Butler.tsx is deliberately left on disk: AsapPresence imports one or the
   other, so reverting this rebuild is a one-line change. Nothing was committed
   before this work started.

   UNCHANGED, ON PURPOSE: the joint hierarchy, AXIS_SIGN, applyPose, the
   cross-fade, and the `P` proportions table — robotClips.ts's poses were
   authored against those exact numbers and every existing test still applies.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  evalAct, blendPose, ease, fadeSeconds, type Pose, type JointName,
} from './robotClips';
import type { Act, Glow } from './sceneDirector';
import { characterStateFor, profileFor, approach } from './characterState';
import { obsidian, satin, noirJacket, noirTrouser, noirShirt, noirMetal, NOIR } from './noirMaterials';
import { buildSparkleLayout } from './sparkleLayout';
import { createSparkleMaterial, createSparkleMesh } from './sparkleMaterial';
import { useSafeFrame } from './useSafeFrame';
import { readVoiceLevel } from '../voice/voiceLevel';
import { buildLoft, type SectionSpec } from './geometry/loft';
import { sculptHead } from './geometry/headSculpt';
import {
  toBufferGeometry, buildJacket, buildUpperSleeve, buildForeSleeve,
  buildLapel, buildTrouser, buildNeck,
} from './geometry/garment';
import { buildPhalanx, buildPalm, FINGERS, THUMB } from './geometry/hand';

/* PROPORTIONS.
 *
 * Verified safe to change: robotClips.ts imports only `Act` and has no code
 * dependency on this table. Poses are joint ROTATIONS, so moving a pivot
 * translates a limb without altering the shape of any pose.
 *
 * Two numbers moved, and both were making the figure read as a thermos:
 *
 * shoulderX 0.206 -> 0.232. The arm pivot sat inboard of where a deltoid
 * belongs, so the upper body had no width and the silhouette narrowed toward
 * the top. The shoulder line, not the hem, has to be the widest thing on a
 * suited figure.
 *
 * headR 0.158 -> 0.174. Against a ~0.65-wide shoulder span a 0.32 head is a
 * pinhead; roughly 2:1 shoulder-to-head is what reads as an adult. This also
 * closes the last of the "floating head" — the head loft's underside drops from
 * y=0.554 to y=0.537, which is inside the collar's 0.493..0.551 band, so skull
 * and collar now physically overlap instead of merely touching. */
const P = {
  hipY: 0.92,
  shoulderY: 0.450,
  shoulderX: 0.232,
  upperArm: 0.285,
  foreArm: 0.265,
  neckY: 0.530,
  headY: 0.185,
  headR: 0.174,
} as const;

const AXIS_SIGN: Partial<Record<JointName, readonly [number, number, number]>> = {
  elbowL: [-1, 1, 1],
  elbowR: [-1, 1, 1],
};

/**
 * Every segment count in this file goes through here.
 *
 * Previously `detail` existed in quality.ts but only the head, torso and
 * trousers used it — the arms, shoulders, elbows, cuffs, collar and buttons
 * were hard-coded, so the cinematic tier rendered the same low-poly limbs as
 * the phone tier at 2140x836 device pixels.
 */
const makeSeg = (detail: number) =>
  (base: number, min = 8) => Math.max(min, Math.round(base * detail));

const rbox = (w: number, h: number, d: number, r = 0.008, bevel = 6) =>
  new RoundedBoxGeometry(w, h, d, bevel, Math.min(r, Math.min(w, h, d) / 2.05));

/* ── Head ────────────────────────────────────────────────────────────────*/

/**
 * The crystal skull.
 *
 * 1. loft a head-shaped envelope (taller than wide, narrower at the jaw)
 * 2. apply the anatomical field — brow, nose, sockets, cheekbones, jaw, chin
 * 3. toNonIndexed + computeVertexNormals => FLAT FACETS
 *
 * Step 2 replaces hash noise. Noise has no anatomy; it produced a lumpy ball.
 * The faceting in step 3 is unchanged — this is still cut crystal, it simply
 * has a skull inside it now.
 */
function buildCrystalHead(seg: (b: number, m?: number) => number): THREE.BufferGeometry {
  const R = P.headR;
  const sections: SectionSpec[] = [
    { y: -R * 1.02, width: R * 0.20, depth: R * 0.22, power: 2.0 },
    { y: -R * 0.86, width: R * 0.50, depth: R * 0.56, power: 2.1 },
    { y: -R * 0.58, width: R * 0.72, depth: R * 0.80, power: 2.2 },
    { y: -R * 0.24, width: R * 0.88, depth: R * 0.97, power: 2.3 },
    { y:  R * 0.06, width: R * 0.97, depth: R * 1.04, power: 2.3 },
    { y:  R * 0.40, width: R * 0.99, depth: R * 1.00, power: 2.2 },
    { y:  R * 0.70, width: R * 0.88, depth: R * 0.88, power: 2.1 },
    { y:  R * 0.94, width: R * 0.58, depth: R * 0.58, power: 2.0 },
    { y:  R * 1.06, width: R * 0.18, depth: R * 0.18, power: 2.0 },
  ];

  const loft = buildLoft(sections, { segments: seg(34, 14) });
  const sculpted = sculptHead(loft.positions, loft.normals, R);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(sculpted, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(loft.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(loft.indices, 1));

  // Non-indexed + recomputed normals => per-face normals => true flat facets.
  const faceted = geo.toNonIndexed();
  faceted.computeVertexNormals();
  faceted.computeBoundingSphere();
  geo.dispose();
  return faceted;
}

/* ── Hand ────────────────────────────────────────────────────────────────*/

function Hand({ side, gripRef, seg }: {
  side: -1 | 1;
  gripRef: React.MutableRefObject<number>;
  seg: (b: number, m?: number) => number;
}) {
  const joints = useRef<THREE.Group[]>([]);

  const geo = useMemo(() => {
    const s = seg(14, 8);
    return {
      palm: toBufferGeometry(buildPalm(seg(18, 10))),
      proximal: FINGERS.map((f) => toBufferGeometry(buildPhalanx(f.length * 0.58, f.base, f.base * 0.88, s))),
      distal: FINGERS.map((f) => toBufferGeometry(buildPhalanx(f.length * 0.46, f.base * 0.86, f.tip, s))),
      thumb: toBufferGeometry(buildPhalanx(THUMB.length, THUMB.base, THUMB.tip, s)),
    };
  }, [seg]);

  useEffect(() => () => {
    geo.palm.dispose(); geo.thumb.dispose();
    geo.proximal.forEach((g) => g.dispose());
    geo.distal.forEach((g) => g.dispose());
  }, [geo]);

  useSafeFrame('Figure.Hand', () => {
    const g = gripRef.current;
    joints.current.forEach((j, i) => {
      if (j) j.rotation.x = -(0.12 + g * 1.30 + (i % 4) * 0.06);
    });
  });

  return (
    <group>
      <mesh geometry={geo.palm} material={obsidian()} castShadow />
      {FINGERS.map((f, i) => (
        <group
          key={i}
          ref={(el) => { if (el) joints.current[i] = el; }}
          position={[f.offsetX, -0.070, 0.002]}
        >
          <mesh geometry={geo.proximal[i]} material={obsidian()} />
          {/* second knuckle — curls a little further than the first */}
          <group
            ref={(el) => { if (el) joints.current[i + 4] = el; }}
            position={[0, -f.length * 0.58, 0]}
          >
            <mesh geometry={geo.distal[i]} material={obsidian()} />
          </group>
        </group>
      ))}
      <group
        ref={(el) => { if (el) joints.current[3] = el; }}
        position={[side * THUMB.offsetX, -0.030, 0.012]}
        rotation={[0, 0, side * 0.62]}
      >
        <mesh geometry={geo.thumb} material={obsidian()} />
      </group>
    </group>
  );
}

/* ── Arm ─────────────────────────────────────────────────────────────────*/

function Arm({ side, joints, gripRef, seg }: {
  side: -1 | 1;
  joints: React.MutableRefObject<Partial<Record<JointName, THREE.Group>>>;
  gripRef: React.MutableRefObject<number>;
  seg: (b: number, m?: number) => number;
}) {
  const L = side === -1 ? 'L' : 'R';
  const geo = useMemo(() => ({
    upper: toBufferGeometry(buildUpperSleeve(P.upperArm, seg(48, 14))),
    fore: toBufferGeometry(buildForeSleeve(P.foreArm, seg(48, 14))),
    cuff: new THREE.CylinderGeometry(0.041, 0.040, 0.030, seg(48, 12)),
    stud: new THREE.SphereGeometry(0.0058, seg(14, 6), seg(10, 5)),
  }), [seg]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group
      ref={(el) => { if (el) joints.current[`shoulder${L}` as JointName] = el; }}
      position={[side * P.shoulderX, P.shoulderY, 0]}
    >
      {/* No separate yoke mesh: the jacket loft's own shoulder sections carry
          the shoulder line, and the sleeve head below merges into it. An extra
          lofted cap here just produced a lump on each shoulder. */}
      <mesh geometry={geo.upper} material={noirJacket()} castShadow receiveShadow />

      <group
        ref={(el) => { if (el) joints.current[`elbow${L}` as JointName] = el; }}
        position={[0, -P.upperArm, 0]}
      >
        <mesh geometry={geo.fore} material={noirJacket()} castShadow receiveShadow />
        {/* white cuff + stud: one of the few high-key notes on the figure */}
        <mesh geometry={geo.cuff} material={noirShirt()} position={[0, -P.foreArm + 0.013, 0]} />
        <mesh geometry={geo.stud} material={noirMetal()} position={[side * 0.040, -P.foreArm + 0.013, 0.013]} />

        <group
          ref={(el) => { if (el) joints.current[`wrist${L}` as JointName] = el; }}
          position={[0, -P.foreArm, 0]}
        >
          <Hand side={side} gripRef={gripRef} seg={seg} />
        </group>
      </group>
    </group>
  );
}

/* ── Torso ───────────────────────────────────────────────────────────────*/

function Torso({ seg, coreMat }: {
  seg: (b: number, m?: number) => number;
  coreMat: THREE.MeshStandardMaterial;
}) {
  const geo = useMemo(() => ({
    jacket: toBufferGeometry(buildJacket(seg(64, 20))),
    neck: toBufferGeometry(buildNeck(seg(40, 14))),
    lapel: toBufferGeometry(buildLapel(seg(64, 20))),
    placket: rbox(0.074, 0.42, 0.024, 0.010),
    /* Collar SHORTENED 0.058 -> 0.034 and the bow enlarged. At the old
     * proportions the white cylinder was taller than the black bow in front of
     * it, so from the camera the neckwear read as a single white band — a bib,
     * or a napkin tucked in. On a tuxedo the bow is the signature and the collar
     * is a sliver of white behind it. Reversing which one dominates is the whole
     * fix; neither element moved. */
    collar: new THREE.CylinderGeometry(0.084, 0.076, 0.034, seg(56, 16), 1, true),
    bowKnot: rbox(0.030, 0.034, 0.026, 0.008),
    bowWing: rbox(0.063, 0.047, 0.019, 0.010),
    button: new THREE.SphereGeometry(0.0112, seg(20, 8), seg(16, 6)),
  }), [seg]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group>
      {/* The jacket. No z-scale hack: the loft's own sections carry the
          front-to-back asymmetry, which is what a lathe could never do. */}
      <mesh geometry={geo.jacket} material={noirJacket()} castShadow receiveShadow />
      {/* the neck the figure never had — obsidian, like the head and hands */}
      <mesh geometry={geo.neck} material={obsidian()} castShadow />

      <mesh geometry={geo.placket} material={noirShirt()} position={[0, 0.235, 0.124]} />

      {/* copper core through the shirt gap — the one warm accent */}
      <mesh material={coreMat} position={[0, 0.300, 0.136]}>
        <torusGeometry args={[0.025, 0.0075, 12, seg(30, 12)]} />
      </mesh>

      {/* Satin peak lapels, mirrored. These ROLL — see lapelSections(). */}
      <mesh geometry={geo.lapel} material={satin()} castShadow />
      <mesh geometry={geo.lapel} material={satin()} scale={[-1, 1, 1]} castShadow />

      <mesh geometry={geo.collar} material={noirShirt()} position={[0, 0.520, 0.004]} />
      <mesh geometry={geo.bowKnot} material={satin()} position={[0, 0.516, 0.078]} />
      <mesh geometry={geo.bowWing} material={satin()} position={[-0.042, 0.516, 0.070]} rotation={[0, 0.32, 0.16]} />
      <mesh geometry={geo.bowWing} material={satin()} position={[0.042, 0.516, 0.070]} rotation={[0, -0.32, -0.16]} />

      {/* Double-breasted: two columns sitting on the actual overlap. */}
      {[0.185, 0.075, -0.035].map((y) => (
        <group key={y}>
          <mesh geometry={geo.button} material={satin()} position={[-0.078, y, 0.132]} />
          <mesh geometry={geo.button} material={satin()} position={[0.078, y, 0.132]} />
        </group>
      ))}
    </group>
  );
}

function Legs({ seg }: { seg: (b: number, m?: number) => number }) {
  const geo = useMemo(() => ({
    trouser: toBufferGeometry(buildTrouser(seg(44, 14))),
    shoe: rbox(0.100, 0.050, 0.208, 0.024),
    waist: new THREE.CylinderGeometry(0.150, 0.145, 0.06, seg(56, 16)),
  }), [seg]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group position={[0, -0.34, 0]}>
      <mesh geometry={geo.waist} material={noirTrouser()} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.078, -0.02, 0]}>
          <mesh geometry={geo.trouser} material={noirTrouser()} castShadow />
          <mesh geometry={geo.shoe} material={obsidian()} position={[s * -0.006, -0.90, 0.052]} castShadow />
        </group>
      ))}
    </group>
  );
}

/* ── The figure ──────────────────────────────────────────────────────────*/

export interface FigureProps {
  act: Act;
  glow: Glow;
  intensity: number;
  detail: number;
  animate: boolean;
  gems: number;
  glints: number;
  flares: number;
}

export function Figure({ act, glow, intensity, detail, animate, gems, glints, flares }: FigureProps) {
  const joints = useRef<Partial<Record<JointName, THREE.Group>>>({});
  const gripL = useRef(0.15);
  const gripR = useRef(0.15);
  const invalidate = useThree((s) => s.invalidate);

  const state = characterStateFor(act, glow);
  const seg = useMemo(() => makeSeg(detail), [detail]);

  const head = useMemo(() => buildCrystalHead(seg), [seg]);

  const layout = useMemo(() => {
    const pos = head.attributes.position.array as Float32Array;
    const nrm = head.attributes.normal.array as Float32Array;
    return {
      lit: buildSparkleLayout({
        positions: pos, normals: nrm, index: null,
        count: gems, flareCount: 0, seed: 11,
        /* -0.78, not -0.55. This gates sparkle placement by face normal, so
         * -0.55 excluded every downward-facing facet — which is exactly the jaw
         * and the underside of the chin. Combined with all the light arriving
         * from head height or above, the lower third of the skull rendered as
         * pure black and the head read as a ball hovering over the collar
         * rather than a head attached to a neck. */
        sizeRange: [P.headR * 0.030, P.headR * 0.075], minNormalY: -0.78,
      }),
      glint: buildSparkleLayout({
        positions: pos, normals: nrm, index: null,
        count: glints, flareCount: flares, seed: 29,
        sizeRange: [P.headR * 0.012, P.headR * 0.055], minNormalY: -0.78,
      }),
    };
  }, [head, gems, glints, flares]);

  const sparkleMat = useMemo(() => createSparkleMaterial(), []);

  const gemMesh = useMemo(() => {
    const g = new THREE.OctahedronGeometry(1, 0);
    const m = new THREE.InstancedMesh(g, obsidian(), Math.max(1, layout.lit.count));
    m.instanceMatrix = new THREE.InstancedBufferAttribute(layout.lit.matrices, 16);
    m.instanceMatrix.needsUpdate = true;
    m.count = layout.lit.count;
    m.castShadow = true;
    return m;
  }, [layout.lit]);

  const glintMesh = useMemo(
    () => createSparkleMesh(layout.glint, sparkleMat),
    [layout.glint, sparkleMat]
  );

  const coreMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#000000', emissive: new THREE.Color(NOIR.ember),
    emissiveIntensity: 1, toneMapped: false, roughness: 0.4, metalness: 0,
  }), []);

  useEffect(() => () => {
    head.dispose();
    gemMesh.geometry.dispose();
    glintMesh.geometry.dispose();
    sparkleMat.dispose();
    coreMat.dispose();
  }, [head, gemMesh, glintMesh, sparkleMat, coreMat]);

  /* ── Cross-fade bookkeeping — ported verbatim ── */
  const anim = useRef({
    act, startedAt: 0, fade: 1,
    from: evalAct(act, 0, intensity),
    current: evalAct(act, 0, intensity),
  });

  useEffect(() => {
    if (anim.current.act === act) return;
    anim.current.from = anim.current.current;
    anim.current.act = act;
    anim.current.startedAt = -1;
    anim.current.fade = 0;
    invalidate();
  }, [act, invalidate]);

  const drive = useRef({
    amp: 0.35, rate: 0.35, coherence: 0.15, flare: 0.5, band: 0,
    push: new THREE.Vector3(),
  });

  const applyPose = (pose: Pose) => {
    for (const name of Object.keys(pose.joints) as JointName[]) {
      const node = joints.current[name];
      if (!node) continue;
      const [x, y, z] = pose.joints[name];
      const s = AXIS_SIGN[name];
      node.rotation.set(s ? x * s[0] : x, s ? y * s[1] : y, s ? z * s[2] : z);
    }
    const root = joints.current.root;
    if (root) root.position.y = pose.lift;
    gripL.current = pose.gripL;
    gripR.current = pose.gripR;
    coreMat.emissiveIntensity = 0.4 + pose.core * 2.8;
    anim.current.current = pose;
  };

  useEffect(() => { applyPose(evalAct(act, 0, intensity)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useSafeFrame('Figure', (rs, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = rs.clock.elapsedTime;

    let pose = anim.current.current;
    if (animate) {
      const a = anim.current;
      if (a.startedAt < 0) a.startedAt = t;
      const local = t - a.startedAt;
      const target = evalAct(a.act, local, intensity);
      if (a.fade < 1) {
        a.fade = Math.min(1, a.fade + dt / fadeSeconds(a.act));
        pose = blendPose(a.from, target, ease(a.fade));
      } else {
        pose = target;
      }
      applyPose(pose);
    }

    const prof = profileFor(state);
    const d = drive.current;
    const tau = prof.tauIn;

    const level = prof.audioGain > 0 ? readVoiceLevel().rms : 0;
    const ampTarget = prof.amp + level * prof.audioGain
      + pose.core * 0.25 + pose.hatLift * 6.0;

    d.amp = approach(d.amp, ampTarget, dt, tau);
    d.rate = approach(d.rate, prof.rate * (0.7 + pose.aperture * 0.9), dt, tau);
    d.coherence = approach(d.coherence, prof.coherence, dt, tau);
    d.flare = approach(d.flare, prof.flare, dt, tau);
    d.band = approach(d.band, prof.band, dt, tau);
    d.push.set(
      approach(d.push.x, prof.tintPush[0], dt, tau),
      approach(d.push.y, prof.tintPush[1], dt, tau),
      approach(d.push.z, prof.tintPush[2], dt, tau)
    );

    const u = sparkleMat.uniforms;
    u.uTime.value = t;
    u.uAmp.value = d.amp;
    u.uRate.value = d.rate;
    u.uCoherence.value = d.coherence;
    u.uFlare.value = d.flare;
    u.uBand.value = d.band;
    u.uTintPush.value.copy(d.push);
    u.uBandY.value = pose.scan * 2 - 1;
  });

  return (
    <group ref={(el) => { if (el) joints.current.root = el; }}>
      <group position={[0, P.hipY, 0]}>
        <group ref={(el) => { if (el) joints.current.spine = el; }}>
          <Torso seg={seg} coreMat={coreMat} />
          <Arm side={-1} joints={joints} gripRef={gripL} seg={seg} />
          <Arm side={1} joints={joints} gripRef={gripR} seg={seg} />

          <group ref={(el) => { if (el) joints.current.neck = el; }} position={[0, P.neckY, 0]}>
            <group ref={(el) => { if (el) joints.current.head = el; }}>
              <group position={[0, P.headY, 0]}>
                <mesh geometry={head} material={obsidian()} castShadow receiveShadow />
                <primitive object={gemMesh} />
                <primitive object={glintMesh} />
              </group>
              {/* kept so applyPose still finds a `hat` node; hatLift now drives
                  the sparkle burst rather than a top-hat piston */}
              <group ref={(el) => { if (el) joints.current.hat = el; }} />
            </group>
          </group>
        </group>
        <Legs seg={seg} />
      </group>
    </group>
  );
}
