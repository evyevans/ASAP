/* ═══════════════════════════════════════════════════════════════════════════
   noirMaterials — black on black, and how it stays readable.

   THE CENTRAL PROBLEM
   The reference is a black tuxedo on a black background. Almost none of the
   image is diffuse shading — the form is described ENTIRELY by specular
   highlights. So the materials here are tuned around one question: what shape
   does the reflected light take as it wraps this surface?

   Two consequences drive every value below:

   1. `envMapIntensity` must be HIGH. With nothing to reflect, obsidian renders
      as a dead flat silhouette. What makes black glass read as an object is
      seeing the SHAPE of the studio strip-lights curve around it — the same
      trick every car-paint and product render uses.

   2. The lapels are visible because of ROUGHNESS CONTRAST, not colour. Jacket
      wool at 0.86 next to satin at 0.22, both essentially black. Colour does
      nothing here; the difference in how tightly each one focuses a highlight
      does everything.

   Reuses materials.ts's generators (woolNormal, silkRoughness, brushedRoughness)
   rather than duplicating them — that module's canvas-texture machinery and
   deterministic hash2 noise are good and dependency-free.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { woolNormal, silkRoughness, softbox } from './materials';

export const NOIR = {
  /** Not pure black. See renderProbe: on #000000 a correctly-rendered dark
   *  scene and a catastrophically blank one are the same pixels. A near-black
   *  with a faint lift is both better cinematography and a measurable signal. */
  stage: '#050609',
  stageLift: '#16181F',
  obsidian: '#04050A',
  satin: '#0A0A0C',
  wool: '#0E0E10',
  shirt: '#F2F1EC',
  /** The brand orange, kept for the core and the think-glow. */
  ember: '#E8733A',
  cool: '#CFE6FF',
  warm: '#FFD6A8',
} as const;

const cache = new Map<string, THREE.Material>();
function mat<T extends THREE.Material>(key: string, build: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = build();
  cache.set(key, m);
  return m;
}

/** Wet obsidian — the head, the gloves, the shoes.
 *  metalness 0 + roughness 0.045 + clearcoat 1 means 100% of what you see is
 *  the specular lobe. `iridescence` supplies the red/gold/cyan facet flecks
 *  visible in the reference for free, with no custom shader. */
export const obsidian = () => mat('noir.obsidian', () => new THREE.MeshPhysicalMaterial({
  color: NOIR.obsidian,
  metalness: 0,
  roughness: 0.045,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  ior: 1.7,
  reflectivity: 1,
  envMapIntensity: 1.8,
  /* 0.28 -> 0.12. Iridescence tints the specular gold/copper/cyan by film
   * thickness. At 0.28 it was invisible, because the only strong source was
   * behind the figure. Adding the front beauty dish lit the neck and hands
   * properly for the first time and the iridescence fired at full strength —
   * turning them brass. Kept low: it should flick colour into a facet as the
   * head turns, never tint the whole surface. */
  iridescence: 0.12,
  iridescenceIOR: 1.5,
  iridescenceThicknessRange: [140, 520],
  // No `transmission`: it forces an extra full scene render, and a black glass
  // head does not need refraction to read as glass.
}));

/** Satin peak lapels + bow tie.
 *
 *  Both this and the jacket are essentially the same black. Colour does nothing
 *  to separate them. What separates them is HOW TIGHTLY EACH FOCUSES A
 *  HIGHLIGHT: 0.05 here against 0.16 there is a roughly 3x narrower specular
 *  lobe, so the lapel carries a hard bright edge where the jacket carries a soft
 *  broad one. That contrast is the only thing drawing the lapel line, and if a
 *  viewer cannot see the tailoring without being told it is there, this pair of
 *  numbers is what to change — not the geometry.
 *
 *  Anisotropy stretches that highlight ALONG the lapel roll, which is the
 *  difference between satin and black plastic. */
export const satin = () => mat('noir.satin', () => new THREE.MeshPhysicalMaterial({
  color: NOIR.satin,
  /* 0.09, NOT 0.05 — and this is a correction to an over-correction.
   *
   * Reasoning from "sharper = more visible" says drive the lapel toward a
   * mirror. The render says the opposite. A near-mirror black surface reflects
   * ONE thing: whatever it happens to point at. Aimed at an unlit corner of a
   * dark studio it returns pure black, so at 0.05 the lapels vanished entirely
   * into the jacket — less visible than before the change.
   *
   * 0.09 is wide enough that the whole lapel face picks up SOMETHING, while
   * still roughly half the jacket's 0.16 — so the edge between them stays a
   * hard step. The contrast is what draws the tailoring; the absolute value has
   * to stay in the range where a black surface returns anything at all. */
  metalness: 0,
  roughness: 0.09,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  // Sheen dropped from 0.6: at the old near-diffuse jacket roughness it helped
  // the lapel separate, but against a glossy jacket it only lifts the black.
  sheen: 0.18,
  sheenColor: new THREE.Color('#23232B'),
  sheenRoughness: 0.3,
  anisotropy: 0.65,
  anisotropyRotation: Math.PI / 2,
  envMapIntensity: 3.2,
}));

/* ── The jacket, and the correction that took four passes to find ──────────
 *
 * WHAT WAS WRONG. This material was `roughness: 0.92` with a 0.86 roughness map
 * and `envMapIntensity: 0.12` — while the head next to it is `obsidian()` at
 * roughness 0.045 and envMapIntensity 1.8. The torso is the largest object on
 * screen and it was receiving FIFTEEN TIMES less environment light than the
 * head, then scattering what little it got across a near-diffuse lobe.
 *
 * A #0E0E10 surface at envMapIntensity 0.12, in a room lit almost entirely by
 * its environment, renders as a flat black hole with no information in it. That
 * is precisely what shipped: a featureless cone with no lapels, no bow tie, no
 * sleeves, and a sparkle head apparently floating above it.
 *
 * Four consecutive passes then added geometry — lofted sections, a sculpted
 * head, knuckles, a lapel roll — to a surface that returned no light. None of it
 * could ever have been visible. You cannot see geometry that does not reflect
 * anything.
 *
 * WHY LACQUER. Matte black is the single hardest material to sell in real time:
 * it needs subsurface detail, contact shadow and fibre before it reads as
 * anything. Glossy black is the easiest — every curve becomes a travelling
 * highlight and the environment does the drawing for free. This is not a
 * compromise for performance; it is choosing the problem the medium is good at.
 * It is also strictly CHEAPER than what it replaces: the roughness map is gone.
 *
 * The normal map stays, at a third of its old strength. That is what keeps this
 * reading as lacquered CLOTH rather than moulded plastic — you can still just
 * resolve the twill under the gloss. */
export const noirJacket = () => mat('noir.jacket', () => new THREE.MeshPhysicalMaterial({
  color: NOIR.wool,
  metalness: 0,
  roughness: 0.16,
  normalMap: woolNormal(),
  // 0.5 -> 0.18. At full strength the twill fights the specular and the
  // highlight breaks into noise instead of travelling cleanly across a shoulder.
  normalScale: new THREE.Vector2(0.18, 0.18),
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  ior: 1.5,
  reflectivity: 0.62,
  /* Sheen deliberately OFF. It is a retroreflective lobe that brightens cloth
   * toward the viewer at every angle — useful on matte wool, actively harmful
   * here, where it lifts the blacks and destroys the value range that makes
   * this look expensive. */
  /* 1.6, not 2.2. The clearcoat layer carries the sharp highlight; this controls
   * how much of the whole environment the BASE layer picks up, which is what
   * lifts the blacks. The target is plate 3: a body that stays genuinely black
   * with a handful of hard specular streaks, not a mid-grey body that is evenly
   * bright everywhere. */
  envMapIntensity: 1.6,
}));

/** Trousers. A hair rougher than the jacket, which is the only thing telling
 *  the viewer it is a different weight of cloth — the colour is identical. */
export const noirTrouser = () => mat('noir.trouser', () => new THREE.MeshPhysicalMaterial({
  color: NOIR.wool,
  metalness: 0,
  roughness: 0.20,
  normalMap: woolNormal(),
  normalScale: new THREE.Vector2(0.16, 0.16),
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  ior: 1.5,
  reflectivity: 0.58,
  envMapIntensity: 1.5,
}));

/** @deprecated Kept only so `Butler.tsx` — the previous figure, retained for a
 *  one-line rollback — still compiles. New code uses `noirJacket` /
 *  `noirTrouser`. Do not add call sites. */
export const noirWool = noirJacket;

/** Shirt + cuffs — the only high-key element on the figure. At 420px tall it
 *  does more compositional work than everything else combined. */
export const noirShirt = () => mat('noir.shirt', () => new THREE.MeshPhysicalMaterial({
  color: NOIR.shirt,
  metalness: 0,
  roughness: 0.55,
  sheen: 0.3,
  sheenRoughness: 0.5,
  envMapIntensity: 0.5,
}));

/** Near-mirror floor. Picks up the kickers and the head's glints as a vertical
 *  smear — the cheapest way to make a void feel like a room. */
export const noirFloor = () => mat('noir.floor', () => new THREE.MeshPhysicalMaterial({
  color: '#05060A',
  metalness: 0,
  roughness: 0.10,
  roughnessMap: silkRoughness(),
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  envMapIntensity: 1.4,
}));

/** Matte walls that fall away into the dark. */
export const noirWall = () => mat('noir.wall', () => new THREE.MeshStandardMaterial({
  color: '#0A0B10',
  roughness: 0.95,
  metalness: 0,
  envMapIntensity: 0.25,
}));

/** Dark glass for desk surfaces and props. */
export const noirGlass = () => mat('noir.glass', () => new THREE.MeshPhysicalMaterial({
  color: '#070810',
  metalness: 0.1,
  roughness: 0.12,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  envMapIntensity: 1.3,
}));

/** Brushed dark bronze for hardware, so it is not another black. */
export const noirMetal = () => mat('noir.metal', () => new THREE.MeshPhysicalMaterial({
  // Dark gunmetal with only a hint of warmth. At #6E5A44 this read as light
  // brown against a near-black stage and pulled focus from the character.
  color: '#232019',
  metalness: 1,
  roughness: 0.42,
  anisotropy: 0.5,
  envMapIntensity: 0.65,
}));

/**
 * The studio environment, built as an emissive box and baked through PMREM.
 *
 * three's RoomEnvironment is a bright white studio and turns obsidian into flat
 * grey. This is the opposite: a black box containing five light SHAPES.
 *
 * ON A GLOSSY FIGURE, THIS FUNCTION IS THE DRAWING. The materials only decide
 * how tightly each surface focuses what it finds here. If the character reads
 * wrong, change these five shapes before touching anything in Figure.tsx.
 *
 * Every panel is textured with `softbox()` rather than being flat-emissive. A
 * flat panel reflects as a constant-brightness bar with hard ends, which nothing
 * in the physical world does; a gradient reflects as a highlight that travels
 * and fades across a shoulder. Intensities are ~3x their old values to
 * compensate: a pow-1.4 softbox radiates roughly a fifth of a flat panel's total
 * energy, while its PEAK — which is what a sharp specular lobe actually samples
 * — stays at colour x intensity.
 */
export function buildStageEnvironment(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');

  const panel = (
    w: number, h: number, d: number,
    color: string, intensity: number,
    x: number, y: number, z: number,
    ry = 0, uPow = 1.4, vPow = 1.4
  ) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        map: softbox(uPow, vPow),
      })
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    return m;
  };

  /* Two tall vertical strips — the primary form-givers, and the pair that wrap
   * the shoulders and the head. Pulled forward in Z from where they were, so
   * they rake the FRONT planes of the figure the camera can actually see rather
   * than edge-lighting a back the camera never sees. */
  panel(0.12, 6, 3.0, '#FFFFFF', 14.0, -4.2, 2.4, 1.8, 0.34);
  panel(0.12, 6, 3.0, '#CFE6FF', 16.0, 4.2, 2.4, -1.4, -0.30);

  /* THE NEW ONE, AND THE IMPORTANT ONE. A broad soft source high and in FRONT —
   * the beauty dish. This is what lays the long highlight down the centre of the
   * chest, and what finally catches the neck: at roughness 0.045 the neck column
   * is a mirror, and with only side strips and a rear crown it had nothing to
   * reflect, so the head read as detached and floating above the collar. */
  panel(5.0, 0.12, 3.4, '#F2F6FF', 7.0, 0.2, 4.0, 3.0, 0, 2.0, 2.0);

  /* THE UPLIGHT, and it earns its place. Low and in front, throwing light UP
   * into the jaw, the underside of the chin and the neck column.
   *
   * Without it the head read as DETACHED — floating above the collar with a
   * black void between. That was never a gap in the geometry: the head loft
   * tapers to a point at y=0.554 and the collar tops out at 0.551, so they
   * meet. The jaw and neck were simply unlit, because every other source here
   * is at or above head height and a chin is a downward-facing surface.
   *
   * NEUTRAL, not warm. At '#FFD6A8' this is the only warm source in the
   * environment, and once the garment actually responds to the environment it
   * bronzed the entire figure and pushed the room sepia. A tuxedo is not brass. */
  panel(7, 0.10, 1.2, '#D6DEEA', 3.0, 0, -0.55, 2.5, 0, 1.2, 1.2);

  // A cool crown overhead and behind, so the top of the head is never lost.
  panel(4.5, 0.10, 1.0, '#DCEBFF', 3.2, 0, 4.4, -0.4, 0, 1.2, 1.2);

  return scene;
}

export function disposeNoirCache(): void {
  cache.forEach((m) => m.dispose());
  cache.clear();
}
