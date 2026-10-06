/* ═══════════════════════════════════════════════════════════════════════════
   liveProps — the six objects in the office that are actually instruments.

   This is the answer to "it has no utility or function". None of these are set
   dressing: the monitor renders the real activity beat, the paper stack in the
   in-tray is literally as tall as your pending-approval count, the whiteboard
   lists this week's real calendar blocks with the executed ones struck through,
   the phone glows by real alert severity, the clock's brass marker points at
   your real next block, and the cabinet counts real memory writes.

   Everything here is driven by `Readouts` from sceneDirector — a pure object —
   so what these props display is unit-tested upstream rather than assembled
   ad hoc in the render path.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useRef, useEffect } from 'react';
import { useSafeFrame } from './useSafeFrame';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Readouts } from './sceneDirector';
import { paper, makeEmissive, PALETTE } from './materials';
import { noirMetal, noirGlass, obsidian } from './noirMaterials';
/* The stage is near-black, so every prop that used brass/steel/plaster now
 * reads from the noir palette. Only the paper stack stays light — a small
 * high-key accent is exactly what a dark frame needs. */
const brass = noirMetal;
const brassDark = noirMetal;
const steel = noirMetal;
const gapMetal = obsidian;
const darkPlastic = noirGlass;

const rbox = (w: number, h: number, d: number, r = 0.01) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2.05));

/* ── Canvas → texture ─────────────────────────────────────────────────────
   Screens and the whiteboard are drawn with the real UI fonts so in-world text
   matches the dashboard around it. */
function useCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: unknown[]
) {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  useEffect(() => {
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    tex.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Wrap text to a pixel width. Canvas has no text layout, so this is manual. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) return lines;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/* ── 1 · Desk monitor — the live activity beat ────────────────────────────*/

export function DeskMonitor({ monitor }: { monitor: Readouts['monitor'] }) {
  const screen = useCanvasTexture(1024, 640, (ctx, w, h) => {
    // Deep charcoal panel, not pure black — a black screen reads as "off".
    ctx.fillStyle = '#111214';
    ctx.fillRect(0, 0, w, h);

    // A faint copper wash from the top, echoing the dashboard's hero card.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(232,115,58,0.13)');
    g.addColorStop(1, 'rgba(232,115,58,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Title bar
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, w, 74);
    ctx.fillStyle = PALETTE.copper;
    ctx.beginPath();
    ctx.arc(44, 37, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '600 26px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('ASAP · LIVE', 72, 46);
    ctx.textAlign = 'right';
    ctx.fillText(monitor.stamp, w - 40, 46);
    ctx.textAlign = 'left';

    // Headline
    ctx.font = '700 52px Inter, sans-serif';
    ctx.fillStyle = '#F4F2EC';
    ctx.fillText(monitor.heading, 44, 168);

    // Body, wrapped
    ctx.font = '400 36px Inter, sans-serif';
    ctx.fillStyle = 'rgba(244,242,236,0.68)';
    wrap(ctx, monitor.body, w - 96, 4).forEach((line, i) => {
      ctx.fillText(line, 44, 236 + i * 50);
    });

    // A ruled baseline, so the panel reads as an instrument rather than a poster.
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    for (let y = 470; y < h; y += 34) {
      ctx.beginPath();
      ctx.moveTo(44, y);
      ctx.lineTo(w - 44, y);
      ctx.stroke();
    }
  }, [monitor.heading, monitor.body, monitor.stamp]);

  const geo = useMemo(() => ({
    bezel: rbox(0.62, 0.40, 0.022, 0.012),
    stand: rbox(0.05, 0.17, 0.05, 0.014),
    foot: rbox(0.24, 0.014, 0.14, 0.006),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const screenMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: screen, emissiveMap: screen, emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.85, toneMapped: false, roughness: 0.28, metalness: 0,
  }), [screen]);
  useEffect(() => () => screenMat.dispose(), [screenMat]);

  return (
    <group>
      <mesh geometry={geo.foot} material={steel()} position={[0, 0.007, 0]} castShadow />
      <mesh geometry={geo.stand} material={steel()} position={[0, 0.095, 0]} castShadow />
      <mesh geometry={geo.bezel} material={darkPlastic()} position={[0, 0.39, 0]} castShadow>
        <mesh material={screenMat} position={[0, 0, 0.013]}>
          <planeGeometry args={[0.585, 0.365]} />
        </mesh>
      </mesh>
    </group>
  );
}

/* ── 2 · In-tray — the paper stack IS the pending count ───────────────────*/

export function InTray({ tray }: { tray: Readouts['tray'] }) {
  const sheets = Math.min(tray.pending, 12); // beyond a dozen it stops reading
  const geo = useMemo(() => ({
    frame: rbox(0.30, 0.012, 0.22, 0.004),
    rail: rbox(0.012, 0.035, 0.22, 0.004),
    sheet: rbox(0.245, 0.0022, 0.175, 0.001),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const glowMat = useMemo(() => makeEmissive(PALETTE.copper, 0), []);
  useEffect(() => () => glowMat.dispose(), [glowMat]);

  // The tray breathes when something is waiting on you — the only thing in the
  // room that asks for attention without an alarm.
  useSafeFrame('liveProps.InTray', (state) => {
    glowMat.emissiveIntensity = sheets > 0
      ? 0.5 + Math.sin(state.clock.elapsedTime * 1.7) * 0.35
      : 0;
  });

  return (
    <group>
      <mesh geometry={geo.frame} material={brassDark()} castShadow receiveShadow />
      <mesh geometry={geo.rail} material={brassDark()} position={[-0.145, 0.018, 0]} />
      <mesh geometry={geo.rail} material={brassDark()} position={[0.145, 0.018, 0]} />
      {/* a thin copper edge-light under the stack */}
      <mesh material={glowMat} position={[0, 0.008, 0.108]}>
        <boxGeometry args={[0.26, 0.002, 0.004]} />
      </mesh>
      {Array.from({ length: sheets }, (_, i) => (
        <mesh
          key={i}
          geometry={geo.sheet}
          material={paper()}
          position={[0, 0.014 + i * 0.0032, 0]}
          rotation={[0, (i % 3 - 1) * 0.012, 0]}
          castShadow
        />
      ))}
    </group>
  );
}

/* ── 3 · Whiteboard — this week's real blocks ─────────────────────────────*/

export function Whiteboard({ board }: { board: Readouts['board'] }) {
  const tex = useCanvasTexture(1024, 700, (ctx, w, h) => {
    // Backlit dark slate, not a white board — a white rectangle would be the
    // brightest thing on a near-black stage and steal the frame.
    ctx.fillStyle = '#0E1014';
    ctx.fillRect(0, 0, w, h);

    ctx.font = '700 34px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('THIS WEEK', 56, 78);

    if (board.items.length === 0) {
      ctx.font = '400 34px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('No blocks planned yet', 56, 160);
      return;
    }

    board.items.forEach((item, i) => {
      const y = 156 + i * 92;
      // Marker dot: copper when still to do, green once executed.
      ctx.fillStyle = item.done ? PALETTE.success : PALETTE.copper;
      ctx.beginPath();
      ctx.arc(70, y - 11, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '500 40px Inter, sans-serif';
      ctx.fillStyle = item.done ? 'rgba(255,255,255,0.30)' : 'rgba(244,242,236,0.92)';
      const text = item.title.length > 30 ? `${item.title.slice(0, 29)}…` : item.title;
      ctx.fillText(text, 104, y);

      if (item.done) {
        // Struck through — the single clearest "this is finished" signal.
        const width = ctx.measureText(text).width;
        ctx.strokeStyle = 'rgba(255,255,255,0.30)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(104, y - 13);
        ctx.lineTo(104 + width, y - 13);
        ctx.stroke();
      }
    });
  }, [board.items]);

  const geo = useMemo(() => ({
    frame: rbox(1.30, 0.90, 0.03, 0.008),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const faceMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.55, toneMapped: false, roughness: 0.34, metalness: 0,
  }), [tex]);
  useEffect(() => () => faceMat.dispose(), [faceMat]);

  return (
    <group>
      <mesh geometry={geo.frame} material={brassDark()} castShadow receiveShadow />
      <mesh material={faceMat} position={[0, 0, 0.017]}>
        <planeGeometry args={[1.25, 0.855]} />
      </mesh>
    </group>
  );
}

/* ── 4 · Desk phone — glows by real alert severity ────────────────────────*/

const SEVERITY_HEX: Record<Readouts['phone']['severity'], string> = {
  none: PALETTE.copper,
  info: PALETTE.copper,
  warning: PALETTE.brass,
  critical: PALETTE.error,
};

export function DeskPhone({ phone }: { phone: Readouts['phone'] }) {
  const geo = useMemo(() => ({
    base: rbox(0.20, 0.045, 0.16, 0.012),
    handset: rbox(0.055, 0.040, 0.20, 0.018),
    cradle: rbox(0.03, 0.022, 0.05, 0.008),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const lampMat = useMemo(() => makeEmissive(PALETTE.copper, 0), []);
  useEffect(() => () => lampMat.dispose(), [lampMat]);

  useSafeFrame('liveProps.DeskPhone', (state) => {
    if (phone.alerts === 0) {
      lampMat.emissiveIntensity = 0.06; // a dim standby pip, never fully dead
      lampMat.emissive.set(PALETTE.copper);
      return;
    }
    lampMat.emissive.set(SEVERITY_HEX[phone.severity]);
    // Critical alerts blink hard; lower severities breathe.
    const speed = phone.severity === 'critical' ? 5.5 : 2.0;
    const depth = phone.severity === 'critical' ? 1.8 : 0.9;
    lampMat.emissiveIntensity = 0.7 + Math.abs(Math.sin(state.clock.elapsedTime * speed)) * depth;
  });

  return (
    <group>
      <mesh geometry={geo.base} material={darkPlastic()} castShadow receiveShadow />
      <mesh geometry={geo.cradle} material={darkPlastic()} position={[0, 0.03, -0.055]} />
      <mesh geometry={geo.cradle} material={darkPlastic()} position={[0, 0.03, 0.055]} />
      <mesh geometry={geo.handset} material={darkPlastic()} position={[0, 0.055, 0]} castShadow />
      {/* the message lamp */}
      <mesh material={lampMat} position={[0.072, 0.024, 0.062]}>
        <sphereGeometry args={[0.011, 14, 12]} />
      </mesh>
      {/* brass keypad hint */}
      <mesh material={brass()} position={[-0.055, 0.024, 0.045]}>
        <boxGeometry args={[0.05, 0.003, 0.05]} />
      </mesh>
    </group>
  );
}

/* ── 5 · Wall clock — real time, brass marker on the next block ───────────*/

export function WallClock({ clock }: { clock: Readouts['clock'] }) {
  const hour = useRef<THREE.Group>(null);
  const minute = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null);

  const geo = useMemo(() => ({
    case: new THREE.CylinderGeometry(0.15, 0.15, 0.035, 40),
    face: new THREE.CircleGeometry(0.138, 40),
    hourHand: rbox(0.012, 0.075, 0.006, 0.003),
    minHand: rbox(0.009, 0.106, 0.005, 0.002),
    tick: rbox(0.006, 0.014, 0.004, 0.001),
    markerGeo: rbox(0.010, 0.026, 0.005, 0.002),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  useSafeFrame('liveProps.WallClock', () => {
    const now = new Date();
    const mins = now.getMinutes() + now.getSeconds() / 60;
    const hours = (now.getHours() % 12) + mins / 60;
    // Clock hands run clockwise, so the rotation is negative about Z.
    if (minute.current) minute.current.rotation.z = -(mins / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(hours / 12) * Math.PI * 2;

    if (marker.current) {
      if (!clock.next) {
        marker.current.visible = false;
      } else {
        const at = new Date(clock.next.at);
        const m = at.getMinutes() + at.getHours() * 60;
        marker.current.visible = true;
        marker.current.rotation.z = -((m % 720) / 720) * Math.PI * 2;
      }
    }
  });

  return (
    <group>
      <mesh geometry={geo.case} material={brassDark()} rotation={[Math.PI / 2, 0, 0]} castShadow />
      <mesh geometry={geo.face} position={[0, 0, 0.019]}>
        <meshStandardMaterial color="#0D0F13" emissive="#141821" emissiveIntensity={0.6} roughness={0.5} metalness={0} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh
            key={i}
            geometry={geo.tick}
            material={i % 3 === 0 ? brass() : gapMetal()}
            position={[Math.sin(a) * 0.118, Math.cos(a) * 0.118, 0.021]}
            rotation={[0, 0, -a]}
          />
        );
      })}
      {/* the brass marker sits where your NEXT block starts */}
      <group ref={marker} position={[0, 0, 0.022]}>
        <mesh geometry={geo.markerGeo} material={brass()} position={[0, 0.122, 0]} />
      </group>
      <group ref={hour} position={[0, 0, 0.024]}>
        <mesh geometry={geo.hourHand} material={gapMetal()} position={[0, 0.030, 0]} />
      </group>
      <group ref={minute} position={[0, 0, 0.027]}>
        <mesh geometry={geo.minHand} material={gapMetal()} position={[0, 0.045, 0]} />
      </group>
      <mesh position={[0, 0, 0.030]}>
        <sphereGeometry args={[0.010, 12, 10]} />
        <meshStandardMaterial color={PALETTE.copper} metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

/* ── 6 · Filing cabinet — long-term memory ────────────────────────────────*/

export function FileCabinet({ cabinet }: { cabinet: Readouts['cabinet'] }) {
  const geo = useMemo(() => ({
    body: rbox(0.46, 1.05, 0.50, 0.012),
    drawer: rbox(0.42, 0.30, 0.02, 0.008),
    handle: rbox(0.16, 0.022, 0.028, 0.008),
    label: rbox(0.10, 0.036, 0.004, 0.002),
  }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const labelMat = useMemo(() => makeEmissive(PALETTE.copper, 0), []);
  useEffect(() => () => labelMat.dispose(), [labelMat]);

  // Brightness rises with how much ASAP has committed to memory.
  useSafeFrame('liveProps.FileCabinet', (state) => {
    const base = Math.min(1, cabinet.writes / 8);
    labelMat.emissiveIntensity = base === 0
      ? 0.05
      : 0.3 + base * 0.9 + Math.sin(state.clock.elapsedTime * 1.2) * 0.12;
  });

  return (
    <group>
      <mesh geometry={geo.body} material={steel()} position={[0, 0.525, 0]} castShadow receiveShadow />
      {[0.82, 0.52, 0.22].map((y, i) => (
        <group key={y} position={[0, y, 0.251]}>
          <mesh geometry={geo.drawer} material={steel()} />
          <mesh geometry={geo.handle} material={brass()} position={[0, 0, 0.018]} />
          <mesh geometry={geo.label} material={i === 0 ? labelMat : gapMetal()} position={[-0.14, 0.09, 0.012]} />
        </group>
      ))}
    </group>
  );
}
