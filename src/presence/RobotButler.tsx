/* ═══════════════════════════════════════════════════════════════════════════
   RobotButler — ASAP, rendered.

   A brushed-titanium automaton in a space-black wool tuxedo, satin peak lapels,
   a silk top hat on a visible piston, a brass monocle on a chain, white cotton
   gloves, and one copper reactor core glowing through the shirt placket.

   HOW HE IS BUILT
   Everything is a rigid hierarchy: root → spine → neck → head → hat, and
   shoulder → elbow → wrist → hand per side. No skinning, no bones, no .glb.
   The scene graph composes the rotations that robotClips.ts evaluates, which is
   precisely how you animate a machine — and it means every motion is authored
   against ASAP's real events instead of whatever clips a stock asset shipped with.

   Geometry deliberately avoids raw primitives: profiles are lathed, the lapels
   and brim are bevel-extruded, panels are rounded boxes, and recessed PANEL GAPS
   in a darker metal do most of the work of reading as "manufactured".
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useSafeFrame } from './useSafeFrame';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  evalAct, blendPose, ease, fadeSeconds,
  type Pose, type JointName,
} from './robotClips';
import type { Act } from './sceneDirector';
import {
  titanium, gapMetal, brass, brassDark, wool, satin, silk, shirt, glove,
  visorGlass, monocleGlass, makeEmissive, darkPlastic, TINT_HEX,
} from './materials';

/* ── Proportions ──────────────────────────────────────────────────────────
   One place to tune the whole figure. Metres; he stands ~1.78 m. */
const P = {
  hipY: 0.92,
  chestY: 0.42,     // relative to spine origin
  shoulderY: 0.450,
  shoulderX: 0.206,
  upperArm: 0.285,
  foreArm: 0.265,
  neckY: 0.530,
  headY: 0.185,
  headR: 0.135,
  hatY: 0.325,   // = headY + headR*1.05 (the skull's crown). Lower and the brim eats his face.
} as const;

/**
 * How a pose euler maps onto a scene-graph rotation.
 *
 * The pose convention authors elbow flexion as a POSITIVE magnitude because
 * that is the intuitive way to write "bend the arm" — but in the scene graph a
 * child hanging along −Y must rotate about −X to swing forward. Rather than
 * invert the signs inside the tested clip module, the remap lives here, in the
 * one place that actually touches three.js.
 */
const AXIS_SIGN: Partial<Record<JointName, readonly [number, number, number]>> = {
  elbowL: [-1, 1, 1],
  elbowR: [-1, 1, 1],
};

/* ── Geometry helpers ─────────────────────────────────────────────────────*/

/** Lathe a profile of [radius, height] pairs. `detail` scales the segment count. */
function lathe(points: readonly (readonly [number, number])[], segments: number, detail: number) {
  const pts = points.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y));
  return new THREE.LatheGeometry(pts, Math.max(8, Math.round(segments * detail)));
}

/** Bevel-extrude a 2D shape — used for the lapels and the hat brim. */
function extrude(shape: THREE.Shape, depth: number, bevel = 0.006) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12,
  });
  g.center();
  return g;
}

const rbox = (w: number, h: number, d: number, r = 0.008, seg = 3) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2.05));

/* ── Head ─────────────────────────────────────────────────────────────────*/

function Head({ detail, arcMat, monocleMat }: {
  detail: number;
  arcMat: THREE.MeshStandardMaterial;
  monocleMat: THREE.MeshStandardMaterial;
}) {
  const geo = useMemo(() => {
    const R = P.headR;
    // An ovoid, slightly taller than wide, flattened at the crown so the hat sits.
    const skull = lathe([
      [0.0, -R * 1.02], [R * 0.52, -R * 0.92], [R * 0.86, -R * 0.55],
      [R * 1.00, -R * 0.05], [R * 0.99, R * 0.42], [R * 0.84, R * 0.78],
      [R * 0.50, R * 1.00], [0.0, R * 1.05],
    ], 48, detail);

    // The fluted brow band — his most identifiable silhouette detail after the hat.
    const brow = new THREE.TorusGeometry(R * 0.995, R * 0.075, 10, 40, Math.PI * 1.15);

    // A recessed gap where the faceplate meets the skull.
    const seam = new THREE.TorusGeometry(R * 0.965, R * 0.022, 8, 40, Math.PI * 1.25);

    // Jaw/chin block, chamfered.
    const jaw = rbox(R * 1.15, R * 0.42, R * 1.0, R * 0.16);

    return { skull, brow, seam, jaw };
  }, [detail]);

  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const R = P.headR;

  return (
    <group position={[0, P.headY, 0]}>
      <mesh geometry={geo.skull} material={titanium()} castShadow receiveShadow />
      <mesh geometry={geo.jaw} material={titanium()} position={[0, -R * 0.78, R * 0.16]} castShadow />

      {/* recessed seam (darker metal behind the gap = the "manufactured" cue) */}
      <mesh geometry={geo.seam} material={gapMetal()} position={[0, R * 0.02, 0]} rotation={[0, 0, Math.PI * 0.375]} />

      {/* fluted brass brow band */}
      <mesh geometry={geo.brow} material={brass()} position={[0, R * 0.34, 0]} rotation={[0, 0, Math.PI * 0.425]} />

      {/* ── the face: a smoked-glass visor, never eyes ── */}
      {/* A theta-limited sphere caps around +Y, so without this quarter-turn the
          "visor" becomes a lid on top of his skull instead of a face. */}
      <mesh position={[0, -R * 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={visorGlass()}>
        <sphereGeometry args={[R * 1.01, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.34]} />
      </mesh>
      {/* dark cavity just INSIDE the glass. It must not swallow the arcs, so it
          sits at a smaller radius than they do — see the arc placement below. */}
      <mesh position={[0, -R * 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[R * 0.84, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.36]} />
        <meshStandardMaterial color="#08090B" roughness={0.9} metalness={0} />
      </mesh>

      {/* the two copper filament arcs — his expression lives in their shape */}
      <mesh position={[-R * 0.30, R * 0.02, R * 0.90]} rotation={[0, -0.20, 0.16]} material={arcMat}>
        <torusGeometry args={[R * 0.22, R * 0.038, 8, 28, Math.PI * 0.95]} />
      </mesh>
      <mesh position={[R * 0.30, R * 0.02, R * 0.90]} rotation={[0, 0.20, -0.16]} material={arcMat}>
        <torusGeometry args={[R * 0.22, R * 0.038, 8, 28, Math.PI * 0.95]} />
      </mesh>

      {/* ── the monocle: brass ring + glass, over the RIGHT arc ── */}
      <group position={[R * 0.31, R * 0.02, R * 0.96]}>
        <mesh material={brass()}>
          <torusGeometry args={[R * 0.40, R * 0.045, 10, 32]} />
        </mesh>
        <mesh material={monocleMat}>
          <circleGeometry args={[R * 0.38, 28]} />
        </mesh>
        <mesh material={monocleGlass()} position={[0, 0, 0.002]}>
          <circleGeometry args={[R * 0.39, 28]} />
        </mesh>
      </group>

      {/* the chain, falling from the monocle toward the lapel */}
      <mesh material={brassDark()} position={[R * 0.52, -R * 0.62, R * 0.42]} rotation={[0.25, 0, 0.30]}>
        <cylinderGeometry args={[R * 0.014, R * 0.014, R * 1.5, 6]} />
      </mesh>

      {/* exposed brass vertebrae at the back of the collar */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} material={brass()} position={[0, -R * (0.55 + i * 0.16), -R * 0.66]}>
          <boxGeometry args={[R * 0.30, R * 0.09, R * 0.16]} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Top hat ──────────────────────────────────────────────────────────────*/

function TopHat({ detail, bandMat }: { detail: number; bandMat: THREE.MeshStandardMaterial }) {
  const geo = useMemo(() => {
    const R = P.headR;
    const crown = lathe([
      [0, 0], [R * 1.02, 0], [R * 1.04, R * 0.35], [R * 1.06, R * 1.35],
      [R * 1.04, R * 1.62], [R * 0.92, R * 1.70], [0, R * 1.72],
    ], 44, detail);

    const brimShape = new THREE.Shape();
    brimShape.absarc(0, 0, R * 1.72, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, R * 1.02, 0, Math.PI * 2, true);
    brimShape.holes.push(hole);
    const brim = extrude(brimShape, R * 0.075, 0.004);

    // The piston that lifts it — visible, because a hat that detaches by magic
    // is a cartoon and this character is a machine.
    const piston = new THREE.CylinderGeometry(R * 0.05, R * 0.05, R * 0.5, 10);
    return { crown, brim, piston };
  }, [detail]);

  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  const R = P.headR;

  return (
    <group>
      <mesh geometry={geo.piston} material={steelish} position={[0, -R * 0.2, 0]} />
      <mesh geometry={geo.crown} material={silk()} castShadow receiveShadow />
      <mesh geometry={geo.brim} material={silk()} rotation={[Math.PI / 2, 0, 0]} position={[0, R * 0.04, 0]} castShadow />
      {/* champagne-brass hat band */}
      <mesh material={bandMat} position={[0, R * 0.30, 0]}>
        <cylinderGeometry args={[R * 1.075, R * 1.06, R * 0.24, 40, 1, true]} />
      </mesh>
      {/* machined vent grille on the band */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} material={gapMetal()} position={[Math.sin(a) * R * 1.07, R * 0.30, Math.cos(a) * R * 1.07]} rotation={[0, a, 0]}>
            <boxGeometry args={[R * 0.05, R * 0.14, R * 0.012]} />
          </mesh>
        );
      })}
    </group>
  );
}

// Shared piston material (module scope so the hat doesn't rebuild it).
const steelish = new THREE.MeshStandardMaterial({ color: '#8E8A84', metalness: 1, roughness: 0.35 });

/* ── Hand ─────────────────────────────────────────────────────────────────*/

function Hand({ side, gripRef }: { side: -1 | 1; gripRef: React.MutableRefObject<number> }) {
  const fingers = useRef<THREE.Group[]>([]);
  const geo = useMemo(() => ({
    palm: rbox(0.062, 0.082, 0.032, 0.014),
    seg: rbox(0.016, 0.042, 0.016, 0.007),
    thumb: rbox(0.018, 0.038, 0.018, 0.008),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  useSafeFrame('RobotButler.Hand', () => {
    const g = gripRef.current;
    fingers.current.forEach((f, i) => {
      if (f) f.rotation.x = -(0.15 + g * 1.35 + i * 0.05);
    });
  });

  return (
    <group>
      <mesh geometry={geo.palm} material={glove()} position={[0, -0.038, 0]} castShadow />
      {[-1, 0, 1].map((i, idx) => (
        <group
          key={i}
          ref={(el) => { if (el) fingers.current[idx] = el; }}
          position={[i * 0.019, -0.078, 0.004]}
        >
          <mesh geometry={geo.seg} material={glove()} position={[0, -0.021, 0]} />
        </group>
      ))}
      <group
        ref={(el) => { if (el) fingers.current[3] = el; }}
        position={[side * 0.03, -0.05, 0.012]}
        rotation={[0, 0, side * 0.5]}
      >
        <mesh geometry={geo.thumb} material={glove()} position={[0, -0.019, 0]} />
      </group>
    </group>
  );
}

/* ── Arm ──────────────────────────────────────────────────────────────────*/

function Arm({ side, joints, gripRef }: {
  side: -1 | 1;
  joints: React.MutableRefObject<Partial<Record<JointName, THREE.Group>>>;
  gripRef: React.MutableRefObject<number>;
}) {
  const L = side === -1 ? 'L' : 'R';
  const geo = useMemo(() => ({
    upper: lathe([
      [0.064, 0], [0.070, -0.05], [0.062, -P.upperArm * 0.7], [0.052, -P.upperArm],
    ], 20, 1),
    fore: lathe([
      [0.052, 0], [0.055, -0.06], [0.045, -P.foreArm * 0.8], [0.038, -P.foreArm],
    ], 20, 1),
    shoulderCap: new THREE.SphereGeometry(0.090, 20, 16),
    elbowJoint: new THREE.SphereGeometry(0.040, 16, 12),
    cuff: new THREE.CylinderGeometry(0.037, 0.037, 0.030, 20),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group
      ref={(el) => { if (el) joints.current[`shoulder${L}` as JointName] = el; }}
      position={[side * P.shoulderX, P.shoulderY, 0]}
    >
      {/* shoulder pauldron — the jacket's shoulder line */}
      {/* flattened + widened so it reads as a jacket shoulder line, not a joint ball */}
      <mesh geometry={geo.shoulderCap} material={wool()} scale={[1.06, 0.74, 0.92]} castShadow />
      <mesh geometry={geo.upper} material={wool()} castShadow />

      <group
        ref={(el) => { if (el) joints.current[`elbow${L}` as JointName] = el; }}
        position={[0, -P.upperArm, 0]}
      >
        <mesh geometry={geo.elbowJoint} material={wool()} />
        <mesh geometry={geo.fore} material={wool()} castShadow />
        {/* white shirt cuff + a brass stud, visible at the wrist */}
        <mesh geometry={geo.cuff} material={shirt()} position={[0, -P.foreArm + 0.012, 0]} />
        <mesh material={brass()} position={[side * 0.036, -P.foreArm + 0.012, 0.012]}>
          <cylinderGeometry args={[0.006, 0.006, 0.006, 8]} />
        </mesh>

        <group
          ref={(el) => { if (el) joints.current[`wrist${L}` as JointName] = el; }}
          position={[0, -P.foreArm, 0]}
        >
          <Hand side={side} gripRef={gripRef} />
        </group>
      </group>
    </group>
  );
}

/* ── Torso ────────────────────────────────────────────────────────────────*/

function Torso({ detail, coreMat }: { detail: number; coreMat: THREE.MeshStandardMaterial }) {
  const geo = useMemo(() => {
    // Jacket silhouette: broad at the shoulder, nipped at the waist.
    const body = lathe([
      [0.150, -0.34], [0.154, -0.22], [0.148, -0.06], [0.182, 0.12],
      [0.216, 0.30], [0.224, 0.42], [0.186, 0.50], [0.116, 0.55], [0, 0.56],
    ], 40, detail);

    // Peak lapel: a V that opens toward the shoulders.
    const lap = new THREE.Shape();
    lap.moveTo(0, -0.20);
    lap.lineTo(0.052, 0.10);
    lap.lineTo(0.112, 0.30);
    lap.lineTo(0.070, 0.34);
    lap.lineTo(0.026, 0.16);
    lap.lineTo(0.004, -0.18);
    lap.closePath();
    const lapel = extrude(lap, 0.016, 0.005);

    const placket = rbox(0.084, 0.46, 0.030, 0.010);
    const bowKnot = rbox(0.028, 0.030, 0.024, 0.008);
    const bowWing = rbox(0.052, 0.042, 0.018, 0.010);
    const collar = new THREE.CylinderGeometry(0.092, 0.084, 0.050, 24, 1, true);
    const pocketSq = rbox(0.048, 0.030, 0.006, 0.004);

    return { body, lapel, placket, bowKnot, bowWing, collar, pocketSq };
  }, [detail]);

  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group>
      {/* the jacket — scaled on Z so the cross-section is elliptical, not round */}
      <group scale={[1, 1, 0.70]}>
        <mesh geometry={geo.body} material={wool()} castShadow receiveShadow />
      </group>

      {/* white shirt placket down the centre */}
      <mesh geometry={geo.placket} material={shirt()} position={[0, 0.24, 0.150]} />

      {/* the copper reactor core, glowing THROUGH the placket gap */}
      <mesh material={coreMat} position={[0, 0.30, 0.166]}>
        <torusGeometry args={[0.028, 0.009, 12, 28]} />
      </mesh>
      <mesh material={coreMat} position={[0, 0.30, 0.164]}>
        <circleGeometry args={[0.020, 20]} />
      </mesh>

      {/* satin peak lapels */}
      <mesh geometry={geo.lapel} material={satin()} position={[-0.056, 0.30, 0.146]} rotation={[0.10, 0.20, 0]} />
      <mesh geometry={geo.lapel} material={satin()} position={[0.056, 0.30, 0.146]} rotation={[0.10, -0.20, 0]} scale={[-1, 1, 1]} />

      {/* wing collar + bow tie */}
      <mesh geometry={geo.collar} material={shirt()} position={[0, 0.505, 0]} />
      <mesh geometry={geo.bowKnot} material={satin()} position={[0, 0.505, 0.078]} />
      <mesh geometry={geo.bowWing} material={satin()} position={[-0.036, 0.505, 0.070]} rotation={[0, 0.32, 0.18]} />
      <mesh geometry={geo.bowWing} material={satin()} position={[0.036, 0.505, 0.070]} rotation={[0, -0.32, -0.18]} />

      {/* copper pocket square — the only warm accent on the suit */}
      <mesh geometry={geo.pocketSq} material={pocketSquareMat} position={[-0.138, 0.315, 0.142]} rotation={[0, 0.26, 0.10]} />

      {/* brass studs down the placket */}
      {[0.16, 0.08, 0.00].map((y) => (
        <mesh key={y} material={brass()} position={[0, y, 0.168]}>
          <cylinderGeometry args={[0.008, 0.008, 0.006, 10]} />
        </mesh>
      ))}
    </group>
  );
}

const pocketSquareMat = new THREE.MeshPhysicalMaterial({
  color: '#E8733A', roughness: 0.55, sheen: 0.9, sheenColor: new THREE.Color('#FFB489'), metalness: 0,
});

/* ── Lower body ───────────────────────────────────────────────────────────*/

function Legs({ detail }: { detail: number }) {
  const geo = useMemo(() => ({
    trouser: lathe([[0.088, 0], [0.082, -0.28], [0.062, -0.62], [0.058, -0.88]], 20, detail),
    shoe: rbox(0.098, 0.052, 0.205, 0.024),
    waist: new THREE.CylinderGeometry(0.152, 0.146, 0.06, 28),
  }), [detail]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group position={[0, -0.34, 0]}>
      <mesh geometry={geo.waist} material={wool()} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.078, -0.02, 0]}>
          <mesh geometry={geo.trouser} material={wool()} castShadow />
          {/* heels together — the posture IS the character */}
          <mesh geometry={geo.shoe} material={patentLeather} position={[s * -0.006, -0.90, 0.052]} castShadow />
        </group>
      ))}
    </group>
  );
}

const patentLeather = new THREE.MeshPhysicalMaterial({
  color: '#0C0B0A', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0.1,
});

/* ── The butler ───────────────────────────────────────────────────────────*/

export interface RobotButlerProps {
  act: Act;
  intensity: number;
  /** Geometry subdivision multiplier from the quality tier. */
  detail: number;
  /** When false the animator holds a single frame (reduced motion). */
  animate: boolean;
}

export function RobotButler({ act, intensity, detail, animate }: RobotButlerProps) {
  const joints = useRef<Partial<Record<JointName, THREE.Group>>>({});
  const gripL = useRef(0.15);
  const gripR = useRef(0.15);
  const invalidate = useThree((s) => s.invalidate);

  // Emissive materials are mutated every frame, so each gets its own instance
  // rather than coming from the shared material cache.
  const coreMat = useMemo(() => makeEmissive(TINT_HEX.copper, 1), []);
  const arcMat = useMemo(() => makeEmissive(TINT_HEX.copper, 1.6), []);
  const monocleMat = useMemo(() => makeEmissive(TINT_HEX.copper, 0), []);
  const bandMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#C19932', metalness: 1, roughness: 0.22,
  }), []);

  useEffect(() => () => {
    [coreMat, arcMat, monocleMat, bandMat].forEach((m) => m.dispose());
  }, [coreMat, arcMat, monocleMat, bandMat]);

  /* Cross-fade bookkeeping. When the act changes we freeze the pose currently on
   * screen and ease from it into the new act, so nothing ever snaps. */
  const anim = useRef({
    act,
    startedAt: 0,
    fade: 1,
    from: evalAct(act, 0, intensity),
    current: evalAct(act, 0, intensity),
  });

  useEffect(() => {
    if (anim.current.act === act) return;
    anim.current.from = anim.current.current;
    anim.current.act = act;
    anim.current.startedAt = -1; // stamped on the next frame
    anim.current.fade = 0;
    invalidate(); // needed when the quality tier runs frameloop="demand"
  }, [act, invalidate]);

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

    const hat = joints.current.hat;
    if (hat) hat.position.y = P.hatY + pose.hatLift;

    gripL.current = pose.gripL;
    gripR.current = pose.gripR;

    // Core + visor arcs carry the tint and the drive.
    const hex = TINT_HEX[pose.tint];
    coreMat.emissive.set(hex);
    coreMat.emissiveIntensity = 0.5 + pose.core * 3.2;
    arcMat.emissive.set(hex);
    // Aperture is expression: narrowed = focused, wide = alert.
    arcMat.emissiveIntensity = 0.6 + pose.aperture * 2.6;
    // The monocle only lights while he is actually reading.
    monocleMat.emissive.set(hex);
    monocleMat.emissiveIntensity = pose.scan > 0 ? 0.35 + Math.sin(pose.scan * Math.PI) * 1.5 : 0;

    anim.current.current = pose;
  };

  // Paint the initial pose once, so a demand-frameloop scene is never empty.
  useEffect(() => { applyPose(evalAct(act, 0, intensity)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useSafeFrame('RobotButler', (state, delta) => {
    if (!animate) return;
    const a = anim.current;
    if (a.startedAt < 0) a.startedAt = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - a.startedAt;

    const target = evalAct(a.act, t, intensity);
    if (a.fade < 1) {
      a.fade = Math.min(1, a.fade + delta / fadeSeconds(a.act));
      applyPose(blendPose(a.from, target, ease(a.fade)));
    } else {
      applyPose(target);
    }
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
              <Head detail={detail} arcMat={arcMat} monocleMat={monocleMat} />
              <group ref={(el) => { if (el) joints.current.hat = el; }} position={[0, P.hatY, 0]}>
                <TopHat detail={detail} bandMat={bandMat} />
              </group>
            </group>
          </group>
        </group>
        <Legs detail={detail} />
      </group>
    </group>
  );
}

export { P as BUTLER_PROPORTIONS, darkPlastic };
