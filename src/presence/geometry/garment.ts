/* ═══════════════════════════════════════════════════════════════════════════
   garment — the tuxedo, actually tailored.

   Every shape here is a LOFT, not a lathe, and that is the whole point. A lathe
   gave a barrel with a normal map pretending to be cloth. A loft lets each
   cross-section differ, so the jacket can be broad at the chest and nipped at
   the waist, deeper in front than behind, boxier where the chest is structured
   and rounder at the waist, with a hem that flares and a sleeve that pinches at
   the elbow and gathers below it.

   All measurements are in the figure's local space and are matched to the
   existing `P` proportions table, because robotClips.ts's poses were authored
   against those numbers and must keep working untouched.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { buildLoft, subdivideSections, type SectionSpec, type LoftResult } from './loft';

/** Wrap a pure loft result into a renderable geometry. */
export function toBufferGeometry(loft: LoftResult): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(loft.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(loft.normals, 3));
  g.setIndex(new THREE.BufferAttribute(loft.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** Smootherstep — cloth gathers and releases, it does not ramp linearly. */
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/* ── The jacket ───────────────────────────────────────────────────────────
   Key sections only; `subdivideSections` fills between them.

   `frontScale > 1` pushes the chest forward of the back — a torso is not
   symmetric front-to-back, and this single parameter is the most "human" thing
   here. `power` rises toward the chest so the structured part of the jacket
   reads boxier than the soft waist. */
export function jacketSections(): SectionSpec[] {
  /* Half-widths are deliberately kept BELOW the shoulder socket at x=0.206
   * (P.shoulderX). The first attempt ran to 0.229 at the shoulder, which is
   * wider than the arm attachment — so the sleeves were swallowed by the torso
   * and the figure read as a hunched blob. The jacket must be widest at the
   * shoulder line but still narrower than where the arms emerge. */
  /* THE SHOULDER SHELF, and why the previous numbers made an urn.
   *
   * The old table ramped smoothly 0.192 -> 0.202 -> 0.194 -> 0.176 -> 0.104
   * across y 0.330..0.512. Every step is a gentle change, so the loft produced
   * one continuous curve from the hem to the collar with no corner anywhere in
   * it — a vase. Rendered matte that was invisible; rendered in lacquer it read
   * unmistakably as a coffee carafe with a ball balanced on top.
   *
   * A tailored shoulder is not a curve. It is a nearly HORIZONTAL shelf running
   * from the collar out to the sleeve head, and then a hard break downward. The
   * corner is the whole silhouette — it is what says "jacket" instead of "urn",
   * and it is what the eye reads as a person before it reads anything else.
   *
   * So: hold ~0.217 flat across y 0.396..0.450 (the shelf), then collapse to
   * the collar in 0.06 rather than easing into it.
   *
   * 0.217 sits just ABOVE P.shoulderX = 0.206, which is deliberate and is the
   * opposite of the old constraint. The sleeve head is 0.086 half-width centred
   * on 0.206, spanning 0.120..0.292 — so its outer half still protrudes 0.075
   * past the jacket while its inner half tucks under the shelf, which is exactly
   * how a set-in sleeve is built. The earlier failure at 0.229 was not caused by
   * exceeding 0.206; it was that 0.229 swallowed the sleeve's protrusion too. */
  const keys: SectionSpec[] = [
    { y: -0.360, width: 0.170, depth: 0.106, power: 2.30, frontScale: 1.00 }, // hem, slight flare
    { y: -0.250, width: 0.154, depth: 0.097, power: 2.20, frontScale: 0.99 },
    { y: -0.110, width: 0.144, depth: 0.091, power: 2.10, frontScale: 0.97 }, // waist, nipped
    { y:  0.050, width: 0.168, depth: 0.106, power: 2.25, frontScale: 1.03 },
    { y:  0.200, width: 0.192, depth: 0.118, power: 2.40, frontScale: 1.06 }, // chest, forward
    { y:  0.330, width: 0.222, depth: 0.124, power: 2.45, frontScale: 1.05 },
    { y:  0.396, width: 0.238, depth: 0.126, power: 2.50, frontScale: 1.01 }, // shelf begins
    { y:  0.428, width: 0.241, depth: 0.125, power: 2.50, frontScale: 1.00 }, // FLAT
    { y:  0.450, width: 0.237, depth: 0.123, power: 2.48, frontScale: 0.99 }, // FLAT
    { y:  0.468, width: 0.202, depth: 0.113, power: 2.40, frontScale: 0.98 }, // the break
    { y:  0.490, width: 0.144, depth: 0.094, power: 2.35, frontScale: 0.98 },
    /* STOPS HERE. The first attempt ran the jacket up to y=0.572 tapering to a
     * 0.066 spike — but the head's underside is at y=0.554, so the torso cone
     * speared into the skull and the figure read as a chess pawn with no neck.
     * A jacket ends at the collar; the neck column and wing collar take over. */
    { y:  0.512, width: 0.101, depth: 0.075, power: 2.30, frontScale: 0.98 },
  ];
  return subdivideSections(keys, 3, ease);
}

export function buildJacket(segments: number): LoftResult {
  return buildLoft(jacketSections(), { segments, capStart: true, capEnd: true });
}

/* ── Sleeves ──────────────────────────────────────────────────────────────
   Lofted DOWN from the joint (−Y), matching the rig, so the geometry rotates
   with the existing shoulder/elbow nodes and needs no new rigging.

   The elbow crease is real geometry: the upper sleeve narrows into the joint,
   and the forearm bulges just below it where cloth gathers. Because the forearm
   is a child of the elbow node, that gathering swings correctly as the arm
   bends. */
export function upperSleeveSections(len: number): SectionSpec[] {
  return subdivideSections([
    { y:  0.030, width: 0.086, depth: 0.082, power: 2.5 },   // sleeve head, over the shoulder
    { y: -0.040, width: 0.079, depth: 0.076, power: 2.3 },
    { y: -0.140, width: 0.068, depth: 0.066, power: 2.2 },
    { y: -len * 0.86, width: 0.059, depth: 0.057, power: 2.1 },
    { y: -len, width: 0.054, depth: 0.052, power: 2.0 },     // into the elbow
  ], 3, ease);
}

export function foreSleeveSections(len: number): SectionSpec[] {
  return subdivideSections([
    { y:  0.010, width: 0.055, depth: 0.053, power: 2.0 },
    { y: -0.030, width: 0.061, depth: 0.059, power: 2.1 },   // gather below the elbow
    { y: -0.075, width: 0.052, depth: 0.050, power: 2.0 },
    { y: -len * 0.72, width: 0.045, depth: 0.043, power: 2.0 },
    { y: -len + 0.010, width: 0.040, depth: 0.038, power: 2.0 },
    { y: -len, width: 0.039, depth: 0.037, power: 2.0 },     // cuff
  ], 3, ease);
}

export const buildUpperSleeve = (len: number, segments: number) =>
  buildLoft(upperSleeveSections(len), { segments });

export const buildForeSleeve = (len: number, segments: number) =>
  buildLoft(foreSleeveSections(len), { segments });

/* ── Peak lapel, with a roll ──────────────────────────────────────────────
   Also a loft. Each section is a thin, wide slab of cloth; `rotate` increases
   down its length so the lapel TURNS OVER instead of lying flat on the chest.
   That turn is what catches the kicker light and separates satin from a painted
   black rectangle — the detail the reference has and a flat plate cannot fake. */
export function lapelSections(): SectionSpec[] {
  return subdivideSections([
    // y, half-width across the lapel, half-thickness of the cloth
    { y:  0.330, width: 0.032, depth: 0.0075, power: 2.0, offsetX: 0.055, offsetZ: 0.127, rotate: -0.06 },
    { y:  0.290, width: 0.054, depth: 0.0080, power: 2.0, offsetX: 0.064, offsetZ: 0.130, rotate:  0.10 }, // the peak
    { y:  0.215, width: 0.043, depth: 0.0080, power: 2.0, offsetX: 0.052, offsetZ: 0.130, rotate:  0.26 },
    { y:  0.120, width: 0.035, depth: 0.0075, power: 2.0, offsetX: 0.041, offsetZ: 0.126, rotate:  0.36 },
    { y:  0.010, width: 0.029, depth: 0.0070, power: 2.0, offsetX: 0.031, offsetZ: 0.114, rotate:  0.42 },
    { y: -0.090, width: 0.021, depth: 0.0060, power: 2.0, offsetX: 0.023, offsetZ: 0.102, rotate:  0.46 },
  ], 3, ease);
}

export const buildLapel = (segments: number) =>
  buildLoft(lapelSections(), { segments: Math.max(8, Math.round(segments * 0.4)) });

/* ── Trousers ─────────────────────────────────────────────────────────────*/
export function trouserSections(): SectionSpec[] {
  return subdivideSections([
    { y:  0.000, width: 0.092, depth: 0.086, power: 2.2 },
    { y: -0.260, width: 0.083, depth: 0.079, power: 2.1 },
    { y: -0.560, width: 0.068, depth: 0.065, power: 2.0 },
    { y: -0.780, width: 0.062, depth: 0.059, power: 2.0 },
    { y: -0.880, width: 0.059, depth: 0.056, power: 2.0 }, // slight break over the shoe
  ], 3, ease);
}

export const buildTrouser = (segments: number) =>
  buildLoft(trouserSections(), { segments });

/* ── Neck ────────────────────────────────────────────────────────────────
   There was no neck at all — the jacket simply narrowed until the head sat on
   the point of it. A real column here is what makes the head look attached
   rather than balanced on top. Runs from inside the jacket opening up past the
   head's underside so the junction is never visible. */
/* Widened from 0.058/0.046. At the old width this was a 0.10-wide stalk under a
 * 0.32-wide head — the proportion alone made the head look stuck on rather than
 * attached, before lighting entered into it. A neck is roughly a third of the
 * head's width, and it FLARES into the trapezius at its base rather than
 * meeting the shoulders at a constant diameter. */
export function neckSections(): SectionSpec[] {
  return subdivideSections([
    { y: 0.410, width: 0.094, depth: 0.086, power: 2.3 }, // flares into the shoulders
    { y: 0.470, width: 0.074, depth: 0.069, power: 2.2 },
    { y: 0.520, width: 0.066, depth: 0.062, power: 2.1 },
    { y: 0.570, width: 0.062, depth: 0.058, power: 2.0 },
    { y: 0.610, width: 0.058, depth: 0.054, power: 2.0 }, // up inside the skull
  ], 2, ease);
}

export const buildNeck = (segments: number) =>
  buildLoft(neckSections(), { segments });

/* ── Shoulder yoke ────────────────────────────────────────────────────────
   Replaces the sphere that used to be stuck on the side of the torso. A real
   shoulder is a curve running from the neck out to the sleeve head, so this
   lofts ALONG X rather than Y and is rotated into place by the caller. */
export function shoulderYokeSections(): SectionSpec[] {
  return subdivideSections([
    { y: 0.000, width: 0.062, depth: 0.060, power: 2.4 },
    { y: 0.045, width: 0.070, depth: 0.067, power: 2.5 },
    { y: 0.090, width: 0.066, depth: 0.063, power: 2.4 },
    { y: 0.125, width: 0.052, depth: 0.050, power: 2.2 },
  ], 2, ease);
}

export const buildShoulderYoke = (segments: number) =>
  buildLoft(shoulderYokeSections(), { segments });
