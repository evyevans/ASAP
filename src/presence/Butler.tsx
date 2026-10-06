/* ═══════════════════════════════════════════════════════════════════════════
   Butler — ASAP, rebuilt to the reference.

   A figure in a black double-breasted tuxedo — satin peak lapels, bow tie,
   white shirt with studs, white cuffs — whose head is a faceted dark-crystal
   mass carrying hundreds of glinting points of light, a handful of them large
   enough to throw anamorphic star flares.

   ── WHAT IS REUSED, AND WHY IT MATTERS ────────────────────────────────────
   `robotClips.ts` is used BYTE-FOR-BYTE. It is pure, has ~10KB of tests, and it
   already emits exactly the scalar drives a sparkle head needs. Only their
   MEANING is remapped — no line of the tested module changes:

       core     chest reactor        →  sparkle master amplitude
       aperture visor arc width      →  sparkle rate / spread
       scan     monocle scan line    →  the travelling glint band
       hatLift  top-hat piston       →  sparkle BURST  ← the reference has no
                                        hat, so a win becomes a bow plus a
                                        bloom of light across the head
       tint     copper/green/red     →  global hue push

   The joint hierarchy, AXIS_SIGN, applyPose and the blendPose cross-fade are
   ported verbatim, and the proportions table `P` keeps its exact numbers —
   the poses were authored against them, so changing them makes `presenting`
   and `commending` read wrong.
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
import { obsidian, satin, noirWool, noirShirt, noirMetal, NOIR } from './noirMaterials';
import { buildSparkleLayout } from './sparkleLayout';
import { createSparkleMaterial, createSparkleMesh } from './sparkleMaterial';
import { useSafeFrame } from './useSafeFrame';
import { readVoiceLevel } from '../voice/voiceLevel';

/* Identical to the previous rig — robotClips' poses depend on these numbers. */
const P = {
  hipY: 0.92,
  shoulderY: 0.450,
  shoulderX: 0.206,
  upperArm: 0.285,
  foreArm: 0.265,
  neckY: 0.530,
  headY: 0.185,
  headR: 0.158,   // geometry only — no pose in robotClips reads this
} as const;

/** The pose convention writes elbow flexion as a positive magnitude, but a
 *  child hanging along −Y must rotate about −X to swing forward. The remap
 *  lives here, in the only file that touches three. */
const AXIS_SIGN: Partial<Record<JointName, readonly [number, number, number]>> = {
  elbowL: [-1, 1, 1],
  elbowR: [-1, 1, 1],
};

const rbox = (w: number, h: number, d: number, r = 0.008) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2.05));

function lathe(pts: readonly (readonly [number, number])[], segs: number) {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)),
    Math.max(8, segs)
  );
}

/** Deterministic noise — Math.random() would re-cut the crystal on every hot
 *  reload, which reads as flicker. Mirrors materials.ts's hash2 doctrine. */
function hash1(x: number, seed: number): number {
  const n = Math.sin(x * 127.1 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * The crystalline skull.
 *
 * Order is load-bearing:
 *   1. lathe a head silhouette at LOW segment count
 *   2. displace along normals WHILE STILL INDEXED — shared vertices keep the
 *      surface watertight, so no cracks open between facets
 *   3. toNonIndexed + computeVertexNormals → per-face normals → true flat
 *      facets, i.e. cut crystal rather than a smooth blob
 */
function buildCrystalHead(detail: number): THREE.BufferGeometry {
  const R = P.headR;
  const segs = Math.max(14, Math.round(24 * detail));

  const geo = lathe([
    [0.00, -R * 1.06], [R * 0.50, -R * 0.96], [R * 0.84, -R * 0.58],
    [R * 0.99, -R * 0.06], [R * 1.00, R * 0.40], [R * 0.86, R * 0.76],
    [R * 0.52, R * 0.99], [0.00, R * 1.06],
  ], segs);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const amp = R * 0.075;

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    // Quantised input so neighbouring vertices share a displacement and the
    // result reads as flat cut planes rather than as noise.
    const key = Math.round(px * 26) * 31 + Math.round(py * 26) * 7 + Math.round(pz * 26);
    const d = (hash1(key, 3) - 0.5) * 2 * amp;
    pos.setXYZ(i, px + nrm.getX(i) * d, py + nrm.getY(i) * d, pz + nrm.getZ(i) * d);
  }
  pos.needsUpdate = true;

  const faceted = geo.toNonIndexed();
  faceted.computeVertexNormals();
  geo.dispose();
  return faceted;
}

/* ── Hand: obsidian glove ────────────────────────────────────────────────*/

function Hand({ side, gripRef }: { side: -1 | 1; gripRef: React.MutableRefObject<number> }) {
  const fingers = useRef<THREE.Group[]>([]);
  const geo = useMemo(() => ({
    palm: rbox(0.062, 0.082, 0.032, 0.014),
    seg: rbox(0.016, 0.042, 0.016, 0.007),
    thumb: rbox(0.018, 0.038, 0.018, 0.008),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  useSafeFrame('Butler.Hand', () => {
    const g = gripRef.current;
    fingers.current.forEach((f, i) => {
      if (f) f.rotation.x = -(0.15 + g * 1.35 + i * 0.05);
    });
  });

  return (
    <group>
      <mesh geometry={geo.palm} material={obsidian()} position={[0, -0.038, 0]} castShadow />
      {[-1, 0, 1].map((i, idx) => (
        <group key={i} ref={(el) => { if (el) fingers.current[idx] = el; }}
          position={[i * 0.019, -0.078, 0.004]}>
          <mesh geometry={geo.seg} material={obsidian()} position={[0, -0.021, 0]} />
        </group>
      ))}
      <group ref={(el) => { if (el) fingers.current[3] = el; }}
        position={[side * 0.03, -0.05, 0.012]} rotation={[0, 0, side * 0.5]}>
        <mesh geometry={geo.thumb} material={obsidian()} position={[0, -0.019, 0]} />
      </group>
    </group>
  );
}

/* ── Arm ─────────────────────────────────────────────────────────────────*/

function Arm({ side, joints, gripRef }: {
  side: -1 | 1;
  joints: React.MutableRefObject<Partial<Record<JointName, THREE.Group>>>;
  gripRef: React.MutableRefObject<number>;
}) {
  const L = side === -1 ? 'L' : 'R';
  const geo = useMemo(() => ({
    upper: lathe([[0.066, 0], [0.072, -0.05], [0.063, -P.upperArm * 0.7], [0.052, -P.upperArm]], 18),
    fore: lathe([[0.053, 0], [0.056, -0.06], [0.045, -P.foreArm * 0.8], [0.038, -P.foreArm]], 18),
    cap: new THREE.SphereGeometry(0.090, 20, 16),
    elbow: new THREE.SphereGeometry(0.042, 14, 12),
    cuff: new THREE.CylinderGeometry(0.039, 0.039, 0.030, 20),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group ref={(el) => { if (el) joints.current[`shoulder${L}` as JointName] = el; }}
      position={[side * P.shoulderX, P.shoulderY, 0]}>
      <mesh geometry={geo.cap} material={noirWool()} scale={[1.06, 0.74, 0.92]} castShadow />
      <mesh geometry={geo.upper} material={noirWool()} castShadow />

      <group ref={(el) => { if (el) joints.current[`elbow${L}` as JointName] = el; }}
        position={[0, -P.upperArm, 0]}>
        <mesh geometry={geo.elbow} material={noirWool()} />
        <mesh geometry={geo.fore} material={noirWool()} castShadow />
        {/* The white cuff — one of the few high-key notes on the whole figure. */}
        <mesh geometry={geo.cuff} material={noirShirt()} position={[0, -P.foreArm + 0.012, 0]} />
        <mesh material={noirMetal()} position={[side * 0.038, -P.foreArm + 0.012, 0.012]}>
          <cylinderGeometry args={[0.006, 0.006, 0.006, 8]} />
        </mesh>

        <group ref={(el) => { if (el) joints.current[`wrist${L}` as JointName] = el; }}
          position={[0, -P.foreArm, 0]}>
          <Hand side={side} gripRef={gripRef} />
        </group>
      </group>
    </group>
  );
}

/* ── Torso: the double-breasted tuxedo ───────────────────────────────────*/

function Torso({ detail, coreMat }: { detail: number; coreMat: THREE.MeshStandardMaterial }) {
  const geo = useMemo(() => {
    const body = lathe([
      [0.150, -0.34], [0.154, -0.22], [0.148, -0.06], [0.182, 0.12],
      [0.216, 0.30], [0.224, 0.42], [0.186, 0.50], [0.116, 0.55], [0, 0.56],
    ], Math.max(20, Math.round(40 * detail)));

    // Peak lapel: a V opening toward the shoulders.
    const lap = new THREE.Shape();
    lap.moveTo(0, -0.20);
    lap.lineTo(0.054, 0.10);
    lap.lineTo(0.116, 0.30);
    lap.lineTo(0.072, 0.345);
    lap.lineTo(0.026, 0.16);
    lap.lineTo(0.004, -0.18);
    lap.closePath();
    const lapel = new THREE.ExtrudeGeometry(lap, {
      depth: 0.018, bevelEnabled: true, bevelThickness: 0.005,
      bevelSize: 0.005, bevelSegments: 2, curveSegments: 10,
    });
    lapel.center();

    return {
      body, lapel,
      placket: rbox(0.084, 0.46, 0.030, 0.010),
      bowKnot: rbox(0.028, 0.030, 0.024, 0.008),
      bowWing: rbox(0.052, 0.042, 0.018, 0.010),
      collar: new THREE.CylinderGeometry(0.092, 0.084, 0.050, 24, 1, true),
      button: new THREE.SphereGeometry(0.0115, 12, 10),
    };
  }, [detail]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group>
      {/* Elliptical cross-section — a lathe alone would read as a barrel. */}
      <group scale={[1, 1, 0.70]}>
        <mesh geometry={geo.body} material={noirWool()} castShadow receiveShadow />
      </group>

      <mesh geometry={geo.placket} material={noirShirt()} position={[0, 0.24, 0.150]} />

      {/* The one warm accent: a copper core glowing through the shirt gap. */}
      <mesh material={coreMat} position={[0, 0.30, 0.166]}>
        <torusGeometry args={[0.026, 0.008, 12, 26]} />
      </mesh>

      {/* Satin peak lapels. */}
      <mesh geometry={geo.lapel} material={satin()} position={[-0.058, 0.30, 0.148]} rotation={[0.10, 0.20, 0]} />
      <mesh geometry={geo.lapel} material={satin()} position={[0.058, 0.30, 0.148]} rotation={[0.10, -0.20, 0]} scale={[-1, 1, 1]} />

      {/* Wing collar + bow tie. */}
      <mesh geometry={geo.collar} material={noirShirt()} position={[0, 0.505, 0]} />
      <mesh geometry={geo.bowKnot} material={satin()} position={[0, 0.500, 0.082]} />
      <mesh geometry={geo.bowWing} material={satin()} position={[-0.036, 0.500, 0.074]} rotation={[0, 0.32, 0.18]} />
      <mesh geometry={geo.bowWing} material={satin()} position={[0.036, 0.500, 0.074]} rotation={[0, -0.32, -0.18]} />

      {/* DOUBLE-BREASTED: two columns of buttons. This is the detail that
          makes the jacket read as the reference's rather than a generic suit. */}
      {[0.20, 0.09, -0.02].map((y) => (
        <group key={y}>
          <mesh geometry={geo.button} material={satin()} position={[-0.088, y, 0.148]} />
          <mesh geometry={geo.button} material={satin()} position={[0.088, y, 0.148]} />
        </group>
      ))}
    </group>
  );
}

function Legs({ detail }: { detail: number }) {
  const geo = useMemo(() => ({
    trouser: lathe([[0.088, 0], [0.082, -0.28], [0.062, -0.62], [0.058, -0.88]], Math.max(12, Math.round(20 * detail))),
    shoe: rbox(0.098, 0.052, 0.205, 0.024),
    waist: new THREE.CylinderGeometry(0.152, 0.146, 0.06, 24),
  }), [detail]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group position={[0, -0.34, 0]}>
      <mesh geometry={geo.waist} material={noirWool()} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.078, -0.02, 0]}>
          <mesh geometry={geo.trouser} material={noirWool()} castShadow />
          <mesh geometry={geo.shoe} material={obsidian()} position={[s * -0.006, -0.90, 0.052]} castShadow />
        </group>
      ))}
    </group>
  );
}

/* ── The butler ──────────────────────────────────────────────────────────*/

export interface ButlerProps {
  act: Act;
  glow: Glow;
  intensity: number;
  detail: number;
  animate: boolean;
  /** Instance budget from the quality tier. */
  gems: number;
  glints: number;
  flares: number;
}

export function Butler({ act, glow, intensity, detail, animate, gems, glints, flares }: ButlerProps) {
  const joints = useRef<Partial<Record<JointName, THREE.Group>>>({});
  const gripL = useRef(0.15);
  const gripR = useRef(0.15);
  const invalidate = useThree((s) => s.invalidate);

  const state = characterStateFor(act, glow);

  /* ── Head geometry + the two sparkle layers ── */
  const head = useMemo(() => buildCrystalHead(detail), [detail]);

  const layout = useMemo(() => {
    const pos = head.attributes.position.array as Float32Array;
    const nrm = head.attributes.normal.array as Float32Array;
    return {
      lit: buildSparkleLayout({
        positions: pos, normals: nrm, index: null,
        count: gems, flareCount: 0, seed: 11,
        sizeRange: [P.headR * 0.030, P.headR * 0.075], minNormalY: -0.55,
      }),
      glint: buildSparkleLayout({
        positions: pos, normals: nrm, index: null,
        count: glints, flareCount: flares, seed: 29,
        sizeRange: [P.headR * 0.012, P.headR * 0.055], minNormalY: -0.55,
      }),
    };
  }, [head, gems, glints, flares]);

  const sparkleMat = useMemo(() => createSparkleMaterial(), []);

  /** Layer A: real octahedral gems, lit by the stage. Static matrices, uploaded
   *  once — they give the head substance and silhouette bite. */
  const gemMesh = useMemo(() => {
    const g = new THREE.OctahedronGeometry(1, 0);
    const m = new THREE.InstancedMesh(g, obsidian(), Math.max(1, layout.lit.count));
    m.instanceMatrix = new THREE.InstancedBufferAttribute(layout.lit.matrices, 16);
    m.instanceMatrix.needsUpdate = true;
    m.count = layout.lit.count;
    m.castShadow = true;
    return m;
  }, [layout.lit]);

  /** Layer B: the additive glints and their flares. */
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

  /* ── Cross-fade bookkeeping (ported verbatim) ── */
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

  /** Smoothed sparkle drive — never snaps a uniform. */
  const drive = useRef({ amp: 0.35, rate: 0.35, coherence: 0.15, flare: 0.5, band: 0, push: new THREE.Vector3() });

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

  useSafeFrame('Butler', (rs, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = rs.clock.elapsedTime;

    /* ── body ── */
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

    /* ── sparkle ── */
    const prof = profileFor(state);
    const d = drive.current;
    const tau = prof.tauIn;

    // Live audio drives brightness while listening or speaking, so the head
    // literally pulses with the voice rather than on a timer.
    const level = prof.audioGain > 0 ? readVoiceLevel().rms : 0;
    const ampTarget = prof.amp + level * prof.audioGain
      // robotClips' `core` and `hatLift` still drive the head, just remapped:
      // hatLift (once a top-hat piston) is now the celebratory burst.
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
    // `scan` (once the monocle sweep) now drives the band's position.
    u.uBandY.value = pose.scan * 2 - 1;
  });

  return (
    <group ref={(el) => { if (el) joints.current.root = el; }}>
      <group position={[0, P.hipY, 0]}>
        <group ref={(el) => { if (el) joints.current.spine = el; }}>
          <Torso detail={detail} coreMat={coreMat} />
          <Arm side={-1} joints={joints} gripRef={gripL} />
          <Arm side={1} joints={joints} gripRef={gripR} />

          <group ref={(el) => { if (el) joints.current.neck = el; }} position={[0, P.neckY, 0]}>
            <group ref={(el) => { if (el) joints.current.head = el; }}>
              <group position={[0, P.headY, 0]}>
                {/* The faceted crystal skull. */}
                <mesh geometry={head} material={obsidian()} castShadow receiveShadow />
                <primitive object={gemMesh} />
                <primitive object={glintMesh} />
              </group>
              {/* Kept so applyPose still finds a `hat` node; the reference has
                  no hat, so it carries no geometry — hatLift became the burst. */}
              <group ref={(el) => { if (el) joints.current.hat = el; }} />
            </group>
          </group>
        </group>
        <Legs detail={detail} />
      </group>
    </group>
  );
}
