/* ═══════════════════════════════════════════════════════════════════════════
   Stage — the dark office.

   LIGHTING A BLACK SUBJECT ON A BLACK BACKGROUND IS A LIGHTING PROBLEM,
   NOT A MATERIAL PROBLEM.

   Almost nothing here is diffuse. The figure is legible because of three
   decisions, in order of importance:

   1. TWO RIM KICKERS AT DIFFERENT COLOUR TEMPERATURES — cold from behind
      camera-right, warm from behind camera-left. The cold one is what actually
      separates a black tuxedo from a black wall; the hue split between them is
      what the eye reads as three-dimensional form. Remove these and the figure
      becomes a silhouette.
   2. A BESPOKE ENVIRONMENT MAP of light SHAPES, not a bright studio box. What
      you see in wet obsidian is the reflected shape of the strip lights curving
      around the form. three's RoomEnvironment is white and flat and would turn
      the whole character grey.
   3. NEAR-ZERO AMBIENT (0.03). Any meaningful ambient lifts black to grey and
      the image dies. There is deliberately NO camera-side fill: a fill from
      camera flattens the specular structure, which is the only structure the
      image has.

   The layout keys mirror the previous set exactly, so Hotspots' anchors and the
   sceneDirector Readouts contract keep working untouched.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Readouts } from './sceneDirector';
import type { QualitySettings } from './quality';
import {
  obsidian, noirFloor, noirWall, noirGlass, noirMetal, NOIR, buildStageEnvironment,
} from './noirMaterials';
import { DeskMonitor, InTray, Whiteboard, DeskPhone, WallClock, FileCabinet } from './liveProps';

const rbox = (w: number, h: number, d: number, r = 0.01) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2.05));

/** Same keys and same world positions as the previous set — the hotspot
 *  anchors and prop readouts depend on them. */
export const STAGE = {
  room: { w: 5.8, d: 5.4, h: 2.95, backZ: -2.62 },
  desk: { x: -0.10, y: 0.74, z: -1.16, w: 2.16, d: 0.86 },
  butler: { x: -0.10, z: -1.78 },
  monitor: { x: -0.62, z: -1.34 },
  tray: { x: 0.63, z: -1.22 },
  phone: { x: 0.68, z: -0.92 },
  board: { x: -1.52, y: 1.82 },
  clock: { x: 0.62, y: 2.16 },
  cabinet: { x: -2.22, z: -2.05 },
  window: { x: 1.92, y: 1.62, w: 1.30, h: 1.45 },
} as const;

/* ── Environment: light shapes, baked once ───────────────────────────────*/

function StageEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = buildStageEnvironment();
    const target = pmrem.fromScene(env, 0.04);
    scene.environment = target.texture;
    return () => {
      target.dispose();
      pmrem.dispose();
      env.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
      scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

/* ── Shell ───────────────────────────────────────────────────────────────*/

function Shell() {
  const { room } = STAGE;
  return (
    <group>
      {/* Near-mirror floor: the kickers and the head's glints smear vertically
          in it, which is what stops a void from reading as empty space. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={noirFloor()} receiveShadow>
        <planeGeometry args={[room.w * 2, room.d * 2]} />
      </mesh>
      <mesh position={[0, room.h / 2, room.backZ]} material={noirWall()} receiveShadow>
        <planeGeometry args={[room.w, room.h]} />
      </mesh>
      <mesh position={[-room.w / 2, room.h / 2, room.backZ + room.d / 2]} rotation={[0, Math.PI / 2, 0]} material={noirWall()}>
        <planeGeometry args={[room.d, room.h]} />
      </mesh>
      <mesh position={[room.w / 2, room.h / 2, room.backZ + room.d / 2]} rotation={[0, -Math.PI / 2, 0]} material={noirWall()}>
        <planeGeometry args={[room.d, room.h]} />
      </mesh>
    </group>
  );
}

/** A city at night, seen through glass. Provides the only large cool value in
 *  the frame and gives the rim lights something to be motivated by. */
function NightWindow() {
  const { window: W, room } = STAGE;

  const view = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#0A1020');
    g.addColorStop(0.62, '#122036');
    g.addColorStop(1, '#1B2C44');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    // Deliberately low contrast — this must never compete with the character.
    ctx.fillStyle = 'rgba(6,10,18,0.85)';
    for (let i = 0; i < 16; i++) {
      const x = (i * 37) % 256;
      const h = 46 + ((i * 53) % 96);
      ctx.fillRect(x, 256 - h, 24, h);
    }
    ctx.fillStyle = 'rgba(255,208,148,0.75)';
    for (let i = 0; i < 90; i++) {
      const x = (i * 61) % 252;
      const y = 140 + ((i * 29) % 104);
      ctx.fillRect(x, y, 2, 3);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => view.dispose(), [view]);

  const viewMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: view, toneMapped: false }),
    [view]
  );
  useEffect(() => () => viewMat.dispose(), [viewMat]);

  return (
    <group position={[W.x, W.y, room.backZ + 0.02]}>
      <mesh material={viewMat}>
        <planeGeometry args={[W.w, W.h]} />
      </mesh>
      {[[0, 0], [0, W.h / 2], [0, -W.h / 2]].map(([x, y]) => (
        <mesh key={`h${y}`} material={noirMetal()} position={[x, y, 0.012]}>
          <boxGeometry args={[W.w + 0.06, 0.035, 0.04]} />
        </mesh>
      ))}
      {[-W.w / 2, W.w / 2].map((x) => (
        <mesh key={`v${x}`} material={noirMetal()} position={[x, 0, 0.012]}>
          <boxGeometry args={[0.035, W.h, 0.04]} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Desk ────────────────────────────────────────────────────────────────*/

function Desk() {
  const D = STAGE.desk;
  const geo = useMemo(() => ({
    top: rbox(D.w, 0.035, D.d, 0.008),
    leg: rbox(0.055, D.y - 0.05, 0.055, 0.008),
    keyboard: rbox(0.42, 0.014, 0.145, 0.005),
    key: new THREE.BoxGeometry(0.019, 0.003, 0.019),
    lampArm: new THREE.CylinderGeometry(0.007, 0.007, 0.42, 10),
    lampHead: new THREE.CylinderGeometry(0.048, 0.070, 0.085, 18, 1, true),
    lampBase: new THREE.CylinderGeometry(0.070, 0.080, 0.016, 20),
  }), [D.w, D.d, D.y]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const legX = D.w / 2 - 0.10;
  const legZ = D.d / 2 - 0.10;

  return (
    <group position={[D.x, 0, D.z]}>
      {/* Black glass top — it reflects the character, doubling his presence. */}
      <mesh geometry={geo.top} material={noirGlass()} position={[0, D.y, 0]} castShadow receiveShadow />
      {[[-legX, -legZ], [legX, -legZ], [-legX, legZ], [legX, legZ]].map(([x, z]) => (
        <mesh key={`${x},${z}`} geometry={geo.leg} material={noirMetal()} position={[x, (D.y - 0.05) / 2, z]} castShadow />
      ))}

      <group position={[-0.50, D.y + 0.026, 0.16]} rotation={[0, 0.06, 0]}>
        <mesh geometry={geo.keyboard} material={obsidian()} castShadow />
        {Array.from({ length: 3 }, (_, r) =>
          Array.from({ length: 12 }, (_, c) => (
            <mesh key={`${r}-${c}`} geometry={geo.key} material={noirMetal()}
              position={[-0.16 + c * 0.029, 0.010, -0.029 + r * 0.029]} />
          ))
        )}
      </group>

      {/* The practical: a small warm lamp. Motivates the warm kicker and puts a
          highlight on the jaw. */}
      <group position={[-1.00, D.y + 0.020, -0.24]}>
        <mesh geometry={geo.lampBase} material={noirMetal()} castShadow />
        <mesh geometry={geo.lampArm} material={noirMetal()} position={[0.055, 0.21, 0]} rotation={[0, 0, -0.26]} />
        <mesh geometry={geo.lampHead} material={noirMetal()} position={[0.175, 0.40, 0]} rotation={[0, 0, -0.95]} castShadow />
        <mesh position={[0.175, 0.40, 0]}>
          <sphereGeometry args={[0.026, 12, 10]} />
          <meshStandardMaterial color="#FFE7C4" emissive="#FFD9A0" emissiveIntensity={4} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/* ── Lighting ────────────────────────────────────────────────────────────*/

function Lighting({ quality }: { quality: QualitySettings }) {
  const key = useRef<THREE.SpotLight>(null);

  useEffect(() => {
    if (!key.current) return;
    key.current.shadow.bias = -0.0009;
    key.current.shadow.normalBias = 0.022;
    key.current.target.position.set(STAGE.butler.x, 1.2, STAGE.butler.z);
    key.current.target.updateMatrixWorld();
  }, [quality.shadowMapSize]);

  return (
    <>
      {/* Near zero. Real ambient turns black into grey and the image dies. */}
      <ambientLight intensity={0.048} color="#0C1424" />

      {/* KEY — warm, high, camera-left. Its job is the white shirt and the
          lapel edge, not general illumination. Only shadow caster. */}
      <spotLight
        ref={key}
        position={[-1.9, 3.1, 1.3]}
        angle={0.50}
        penumbra={0.95}
        /* 7, not 26. The key's job in a noir frame is the white shirt and the
         * lapel edge — NOT to light the room. At 26 it was washing the entire
         * tuxedo to grey, which is the opposite of the brief. */
        intensity={4.2}
        distance={11}
        decay={2}
        color="#FFF4E8"
        castShadow={quality.shadows}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
      />

      {/* KICKER A — the money light. Cold, from behind camera-right. THIS is
          what separates a black tuxedo from a black background. */}
      <spotLight
        position={[2.6, 2.4, -3.0]}
        angle={0.7} penumbra={0.9} intensity={48} distance={12} decay={2}
        color={NOIR.cool}
      />

      {/* KICKER B — warm, mirrored. Two rims at different colour temperatures
          is the classic black-on-black recipe; the hue split reads as form. */}
      <spotLight
        position={[-2.9, 2.0, -2.8]}
        angle={0.75} penumbra={0.9} intensity={22} distance={12} decay={2}
        color={NOIR.warm}
      />

      {/* Head accent. Its ONLY job is to fire the glints, and the previous
          placement failed at exactly that: at intensity 2.6 / distance 1.5 it
          delivered ~4x intensity to the SHOULDERS, and because wool is a rough
          diffuse surface (unlike the smooth satin lapels, which stayed correctly
          black) that flood-lit the tuxedo to mid-grey. Pulled in close to the
          head with a hard 0.6m cutoff so it dies before it reaches the chest. */}
      <pointLight
        position={[STAGE.butler.x + 0.08, 1.88, STAGE.butler.z + 0.26]}
        intensity={0.9} distance={0.42} decay={2} color="#FFFFFF"
      />
    </>
  );
}

/* ── The stage ───────────────────────────────────────────────────────────*/

export function Stage({ readouts, quality }: { readouts: Readouts; quality: QualitySettings }) {
  const { scene } = useThree();

  useEffect(() => {
    // Exponential fog pulls the far wall into the dark rather than ending the
    // room at a visible plane.
    scene.fog = new THREE.FogExp2(NOIR.stage, 0.16);
    return () => { scene.fog = null; };
  }, [scene]);

  return (
    <>
      <StageEnvironment />
      <Lighting quality={quality} />
      <Shell />
      <NightWindow />
      <Desk />

      <group position={[STAGE.monitor.x + STAGE.desk.x, STAGE.desk.y + 0.018, STAGE.monitor.z]} rotation={[0, 0.22, 0]}>
        <DeskMonitor monitor={readouts.monitor} />
      </group>
      <group position={[STAGE.tray.x + STAGE.desk.x, STAGE.desk.y + 0.022, STAGE.tray.z]} rotation={[0, -0.18, 0]}>
        <InTray tray={readouts.tray} />
      </group>
      <group position={[STAGE.phone.x + STAGE.desk.x, STAGE.desk.y + 0.040, STAGE.phone.z]} rotation={[0, -0.35, 0]}>
        <DeskPhone phone={readouts.phone} />
      </group>
      <group position={[STAGE.board.x, STAGE.board.y, STAGE.room.backZ + 0.04]}>
        <Whiteboard board={readouts.board} />
      </group>
      <group position={[STAGE.clock.x, STAGE.clock.y, STAGE.room.backZ + 0.05]}>
        <WallClock clock={readouts.clock} />
      </group>
      <group position={[STAGE.cabinet.x, 0, STAGE.cabinet.z]} rotation={[0, 0.34, 0]}>
        <FileCabinet cabinet={readouts.cabinet} />
      </group>
    </>
  );
}
