/* ═══════════════════════════════════════════════════════════════════════════
   Office — the set.

   The camera is FIXED. That is a deliberate constraint, not a limitation: it
   means every polygon and every light can be spent on what is actually on
   screen. Nothing is modelled behind the camera, the far walls carry no detail,
   and the depth-of-field falls off exactly where the composition wants it to.

   Lighting is a procedural studio IBL (three's own RoomEnvironment through a
   PMREMGenerator) plus four practical lights. No .hdr download, no CDN, nothing
   to license — and image-based lighting is what makes the metal read as metal.

   Materials all come from the shared cache in materials.ts, so the whole room
   is a few dozen draw calls.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Readouts } from './sceneDirector';
import type { QualitySettings } from './quality';
import {
  walnut, oakFloor, plaster, rugCloth, brass, brassDark,
  gapMetal, foliage, darkPlastic,
} from './materials';
import { DeskMonitor, InTray, Whiteboard, DeskPhone, WallClock, FileCabinet } from './liveProps';

const rbox = (w: number, h: number, d: number, r = 0.01) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2.05));

/* ── Set layout ───────────────────────────────────────────────────────────
   One table so the composition can be tuned without hunting through JSX.
   +X is camera-RIGHT, −X is camera-LEFT, −Z is deeper into the room. */
export const SET = {
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

/* ── Procedural studio IBL ────────────────────────────────────────────────*/

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const target = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = target.texture;
    return () => {
      // WebGL resources are not reclaimed with the React tree.
      target.dispose();
      pmrem.dispose();
      roomEnv.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

/* ── Shell: floor, walls, ceiling ─────────────────────────────────────────*/

function Shell() {
  const { room } = SET;
  const geo = useMemo(() => ({
    baseboard: rbox(room.w, 0.11, 0.03, 0.004),
  }), [room.w]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group>
      {/* herringbone-lacquered oak floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={oakFloor()} receiveShadow>
        <planeGeometry args={[room.w, room.d]} />
      </mesh>

      {/* back wall + side walls (only the parts the camera can see) */}
      <mesh position={[0, room.h / 2, room.backZ]} material={plaster()} receiveShadow>
        <planeGeometry args={[room.w, room.h]} />
      </mesh>
      <mesh position={[-room.w / 2, room.h / 2, room.backZ + room.d / 2]} rotation={[0, Math.PI / 2, 0]} material={plaster()} receiveShadow>
        <planeGeometry args={[room.d, room.h]} />
      </mesh>
      <mesh position={[room.w / 2, room.h / 2, room.backZ + room.d / 2]} rotation={[0, -Math.PI / 2, 0]} material={plaster()} receiveShadow>
        <planeGeometry args={[room.d, room.h]} />
      </mesh>
      <mesh position={[0, room.h, room.backZ + room.d / 2]} rotation={[Math.PI / 2, 0, 0]} material={plaster()}>
        <planeGeometry args={[room.w, room.d]} />
      </mesh>

      {/* baseboard — a small detail that does a lot for "this is a real room" */}
      <mesh geometry={geo.baseboard} material={plaster()} position={[0, 0.055, room.backZ + 0.02]} />

      {/* wool rug, grounding the desk cluster */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[SET.desk.x, 0.004, -1.05]} material={rugCloth()} receiveShadow>
        <planeGeometry args={[3.5, 2.5]} />
      </mesh>
    </group>
  );
}

/* ── Window: city at blue hour, plus the light it throws ──────────────────*/

function Window({ shafts }: { shafts: boolean }) {
  const { window: W, room } = SET;

  // A vertical gradient standing in for a city sky, with a few lit windows.
  const view = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#9FB6CE');
    g.addColorStop(0.55, '#C9D3DA');
    g.addColorStop(1, '#E4E2D9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    // Distant buildings — deliberately low contrast so they stay out of focus.
    ctx.fillStyle = 'rgba(120,132,146,0.35)';
    for (let i = 0; i < 14; i++) {
      const x = (i * 37) % 256;
      const h = 40 + ((i * 53) % 90);
      ctx.fillRect(x, 256 - h, 22, h);
    }
    ctx.fillStyle = 'rgba(255,216,150,0.5)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 61) % 250;
      const y = 150 + ((i * 29) % 90);
      ctx.fillRect(x, y, 3, 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => view.dispose(), [view]);

  const viewMat = useMemo(() => new THREE.MeshBasicMaterial({ map: view, toneMapped: false }), [view]);
  useEffect(() => () => viewMat.dispose(), [viewMat]);

  return (
    <group position={[W.x, W.y, room.backZ + 0.02]}>
      <mesh material={viewMat}>
        <planeGeometry args={[W.w, W.h]} />
      </mesh>
      {/* frame + mullions */}
      <mesh material={brassDark()} position={[0, 0, 0.012]}>
        <boxGeometry args={[W.w + 0.08, 0.05, 0.05]} />
      </mesh>
      <mesh material={brassDark()} position={[0, W.h / 2, 0.012]}>
        <boxGeometry args={[W.w + 0.08, 0.05, 0.05]} />
      </mesh>
      <mesh material={brassDark()} position={[0, -W.h / 2, 0.012]}>
        <boxGeometry args={[W.w + 0.08, 0.05, 0.05]} />
      </mesh>
      <mesh material={brassDark()} position={[-W.w / 2, 0, 0.012]}>
        <boxGeometry args={[0.05, W.h, 0.05]} />
      </mesh>
      <mesh material={brassDark()} position={[W.w / 2, 0, 0.012]}>
        <boxGeometry args={[0.05, W.h, 0.05]} />
      </mesh>

      {/* Light shafts. Additive cones — the cheapest convincing volumetric
          you can buy, and they only run on tiers that can afford them. */}
      {shafts && (
        <group position={[0, -0.2, 0.6]} rotation={[0.34, -0.30, 0]}>
          {[-0.28, 0, 0.28].map((o) => (
            <mesh key={o} position={[o, -0.55, 0.9]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.30, 0.52, 2.6, 12, 1, true]} />
              <meshBasicMaterial
                color="#FFF3E2"
                transparent
                opacity={0.045}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/* ── Desk ─────────────────────────────────────────────────────────────────*/

function Desk() {
  const D = SET.desk;
  const geo = useMemo(() => ({
    top: rbox(D.w, 0.045, D.d, 0.010),
    apron: rbox(D.w - 0.16, 0.10, 0.04, 0.006),
    leg: rbox(0.07, D.y - 0.05, 0.07, 0.010),
    drawer: rbox(0.52, 0.16, 0.60, 0.008),
    keyboard: rbox(0.42, 0.016, 0.145, 0.005),
    key: new THREE.BoxGeometry(0.019, 0.004, 0.019),
    lampArm: new THREE.CylinderGeometry(0.008, 0.008, 0.42, 10),
    lampHead: new THREE.CylinderGeometry(0.052, 0.075, 0.09, 20, 1, true),
    lampBase: new THREE.CylinderGeometry(0.075, 0.085, 0.018, 24),
    mug: new THREE.CylinderGeometry(0.042, 0.036, 0.092, 24),
  }), [D.w, D.d, D.y]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const legX = D.w / 2 - 0.10;
  const legZ = D.d / 2 - 0.10;

  return (
    <group position={[D.x, 0, D.z]}>
      <mesh geometry={geo.top} material={walnut()} position={[0, D.y, 0]} castShadow receiveShadow />
      <mesh geometry={geo.apron} material={walnut()} position={[0, D.y - 0.08, -D.d / 2 + 0.04]} />
      {[[-legX, -legZ], [legX, -legZ], [-legX, legZ], [legX, legZ]].map(([x, z]) => (
        <mesh key={`${x},${z}`} geometry={geo.leg} material={brassDark()} position={[x, (D.y - 0.05) / 2, z]} castShadow />
      ))}
      <mesh geometry={geo.drawer} material={walnut()} position={[D.w / 2 - 0.36, 0.40, 0]} castShadow />
      <mesh material={brass()} position={[D.w / 2 - 0.36, 0.40, 0.31]}>
        <boxGeometry args={[0.16, 0.018, 0.02]} />
      </mesh>

      {/* keyboard — the thing he actually types on */}
      <group position={[-0.50, D.y + 0.031, 0.16]} rotation={[0, 0.06, 0]}>
        <mesh geometry={geo.keyboard} material={darkPlastic()} castShadow />
        {Array.from({ length: 4 }, (_, r) =>
          Array.from({ length: 14 }, (_, c) => (
            <mesh
              key={`${r}-${c}`}
              geometry={geo.key}
              material={gapMetal()}
              position={[-0.19 + c * 0.029, 0.011, -0.043 + r * 0.029]}
            />
          ))
        )}
      </group>

      {/* brass desk lamp — the warm practical that models his cheekbone */}
      <group position={[-1.00, D.y + 0.022, -0.24]}>
        <mesh geometry={geo.lampBase} material={brass()} castShadow />
        <mesh geometry={geo.lampArm} material={brass()} position={[0.055, 0.21, 0]} rotation={[0, 0, -0.26]} />
        <mesh geometry={geo.lampHead} material={brass()} position={[0.175, 0.40, 0]} rotation={[0, 0, -0.95]} castShadow />
        <mesh position={[0.175, 0.40, 0]}>
          <sphereGeometry args={[0.030, 12, 10]} />
          <meshStandardMaterial color="#FFE7C4" emissive="#FFD9A0" emissiveIntensity={3.2} toneMapped={false} />
        </mesh>
      </group>

      {/* coffee — nobody works without one */}
      <group position={[0.30, D.y + 0.068, 0.20]}>
        <mesh geometry={geo.mug} castShadow>
          <meshPhysicalMaterial color="#F2EFE7" roughness={0.32} clearcoat={0.7} clearcoatRoughness={0.2} />
        </mesh>
        <mesh position={[0, 0.040, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.034, 20]} />
          <meshPhysicalMaterial color="#3B2416" roughness={0.18} clearcoat={1} />
        </mesh>
      </group>
    </group>
  );
}

/* ── Bookshelf + plant, filling the right of frame ────────────────────────*/

function Bookshelf() {
  const geo = useMemo(() => ({
    frame: rbox(0.36, 1.95, 0.90, 0.012),
    shelf: rbox(0.32, 0.026, 0.84, 0.004),
    book: rbox(0.055, 0.24, 0.17, 0.004),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const bookMats = useMemo(() => ['#4A3B2E', '#2E3A44', '#5A3A32', '#3E4438', '#6A5334', '#2B2A28']
    .map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.82 })), []);
  useEffect(() => () => bookMats.forEach((m) => m.dispose()), [bookMats]);

  return (
    <group position={[2.44, 0, -1.85]}>
      <mesh geometry={geo.frame} material={walnut()} position={[0, 0.975, 0]} castShadow receiveShadow />
      {[0.42, 0.90, 1.38].map((y) => (
        <group key={y}>
          <mesh geometry={geo.shelf} material={walnut()} position={[0, y, 0]} />
          {Array.from({ length: 9 }, (_, i) => (
            <mesh
              key={i}
              geometry={geo.book}
              material={bookMats[(i + Math.round(y * 10)) % bookMats.length]}
              position={[0, y + 0.133, -0.34 + i * 0.075]}
              rotation={[i === 7 ? 0.22 : 0, 0, 0]}
              castShadow
            />
          ))}
        </group>
      ))}
    </group>
  );
}

function Plant() {
  const leaves = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.4;
    const tilt = 0.5 + (i % 4) * 0.18;
    const h = 0.42 + ((i * 7) % 5) * 0.09;
    return { a, tilt, h, s: 0.8 + ((i * 13) % 5) * 0.09 };
  }), []);

  const geo = useMemo(() => ({
    pot: new THREE.CylinderGeometry(0.17, 0.13, 0.26, 24),
    soil: new THREE.CircleGeometry(0.16, 20),
    leaf: new THREE.SphereGeometry(0.13, 10, 8),
    stem: new THREE.CylinderGeometry(0.008, 0.010, 0.5, 6),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group position={[1.62, 0, -1.42]}>
      <mesh geometry={geo.pot} material={potMat} position={[0, 0.13, 0]} castShadow receiveShadow />
      <mesh geometry={geo.soil} material={soilMat} position={[0, 0.261, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      {leaves.map(({ a, tilt, h, s }, i) => (
        <group key={i} rotation={[0, a, 0]}>
          <mesh geometry={geo.stem} material={foliage()} position={[0.05, 0.26 + h / 2, 0]} rotation={[0, 0, -0.28]} />
          <mesh
            geometry={geo.leaf}
            material={foliage()}
            position={[0.14 * tilt, 0.26 + h, 0]}
            rotation={[0, 0, -tilt]}
            scale={[s * 1.5, s * 0.22, s * 0.85]}
            castShadow
          />
        </group>
      ))}
    </group>
  );
}

const potMat = new THREE.MeshPhysicalMaterial({ color: '#B9A78C', roughness: 0.85, metalness: 0 });
const soilMat = new THREE.MeshStandardMaterial({ color: '#3A2E24', roughness: 1 });

/* ── Lighting ─────────────────────────────────────────────────────────────*/

function Lighting({ quality }: { quality: QualitySettings }) {
  const key = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    if (!key.current) return;
    const cam = key.current.shadow.camera;
    cam.left = -3.4; cam.right = 3.4; cam.top = 3.4; cam.bottom = -2.2;
    cam.near = 0.5; cam.far = 12;
    cam.updateProjectionMatrix();
    key.current.shadow.bias = -0.0009;
    key.current.shadow.normalBias = 0.022;
  }, [quality.shadowMapSize]);

  return (
    <>
      {/* Ambient is kept low — the IBL is doing the real fill work. */}
      <ambientLight intensity={0.20} color="#F2EEE6" />

      {/* KEY: daylight through the window, warm, the only shadow caster. */}
      <directionalLight
        ref={key}
        position={[3.4, 3.6, 0.4]}
        intensity={1.55}
        color="#FFF1DE"
        castShadow={quality.shadows}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
      />

      {/* RIM: cool bounce off the back wall, separating him from the room. */}
      <directionalLight position={[-2.6, 2.2, -2.4]} intensity={0.55} color="#CBD9F0" />

      {/* PRACTICAL: the desk lamp, warm and close. */}
      <pointLight position={[-1.10, 1.20, -1.40]} intensity={2.4} distance={3.4} decay={2} color="#FFD9A0" />

      {/* BOUNCE: soft fill from camera level so his visor never goes muddy. */}
      <pointLight position={[0.2, 1.5, 1.6]} intensity={0.55} distance={6} decay={2} color="#FFF6EC" />
    </>
  );
}

/* ── The set ──────────────────────────────────────────────────────────────*/

export function Office({ readouts, quality }: { readouts: Readouts; quality: QualitySettings }) {
  const { scene } = useThree();

  // A touch of atmosphere so the far wall sits back. Cheap and very effective.
  useEffect(() => {
    scene.fog = new THREE.Fog('#D9D4C9', 5.5, 12);
    return () => { scene.fog = null; };
  }, [scene]);

  return (
    <>
      <Environment />
      <Lighting quality={quality} />
      <Shell />
      <Window shafts={quality.post} />
      <Desk />
      <Bookshelf />
      <Plant />

      <group position={[SET.monitor.x + SET.desk.x, SET.desk.y + 0.022, SET.monitor.z]} rotation={[0, 0.22, 0]}>
        <DeskMonitor monitor={readouts.monitor} />
      </group>

      <group position={[SET.tray.x + SET.desk.x, SET.desk.y + 0.028, SET.tray.z]} rotation={[0, -0.18, 0]}>
        <InTray tray={readouts.tray} />
      </group>

      <group position={[SET.phone.x + SET.desk.x, SET.desk.y + 0.045, SET.phone.z]} rotation={[0, -0.35, 0]}>
        <DeskPhone phone={readouts.phone} />
      </group>

      <group position={[SET.board.x, SET.board.y, SET.room.backZ + 0.04]}>
        <Whiteboard board={readouts.board} />
      </group>

      <group position={[SET.clock.x, SET.clock.y, SET.room.backZ + 0.05]}>
        <WallClock clock={readouts.clock} />
      </group>

      <group position={[SET.cabinet.x, 0, SET.cabinet.z]} rotation={[0, 0.34, 0]}>
        <FileCabinet cabinet={readouts.cabinet} />
      </group>
    </>
  );
}
