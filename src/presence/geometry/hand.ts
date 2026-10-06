/* ═══════════════════════════════════════════════════════════════════════════
   hand — knuckles instead of rounded boxes.

   The hands were three `RoundedBoxGeometry` stubs. They are small on screen,
   but the reference raises a hand to the head, so in `commending` and
   `presenting` the hand is right next to the most detailed thing in the frame
   and reads as a mitten.

   Lofted segments give tapered fingers with a knuckle bulge at each joint. Still
   driven by the existing `gripRef`, so nothing about the animation changes.
   ═══════════════════════════════════════════════════════════════════════════ */

import { buildLoft, subdivideSections, type SectionSpec, type LoftResult } from './loft';

/** A finger bone: wider at the knuckle, tapering to the joint above it. */
export function phalanxSections(
  length: number,
  baseRadius: number,
  tipRadius: number
): SectionSpec[] {
  return subdivideSections([
    // The knuckle bulge sits slightly ABOVE the joint origin, which is what
    // makes a curled finger read as knuckles rather than a smooth tube.
    { y:  0.004, width: baseRadius * 1.18, depth: baseRadius * 1.10, power: 2.3 },
    { y: -length * 0.18, width: baseRadius, depth: baseRadius * 0.94, power: 2.2 },
    { y: -length * 0.70, width: (baseRadius + tipRadius) * 0.5, depth: (baseRadius + tipRadius) * 0.47, power: 2.1 },
    { y: -length, width: tipRadius, depth: tipRadius * 0.94, power: 2.0 },
  ], 2, (t) => t);
}

export const buildPhalanx = (
  length: number, baseRadius: number, tipRadius: number, segments: number
): LoftResult => buildLoft(phalanxSections(length, baseRadius, tipRadius), { segments });

/** The palm: a flattened, slightly wedge-shaped block, not a cube. */
export function palmSections(): SectionSpec[] {
  return subdivideSections([
    { y:  0.000, width: 0.030, depth: 0.017, power: 2.6 },   // wrist
    { y: -0.028, width: 0.034, depth: 0.019, power: 2.8 },
    { y: -0.060, width: 0.036, depth: 0.018, power: 3.0 },   // across the knuckles
    { y: -0.076, width: 0.033, depth: 0.016, power: 2.8 },
  ], 2, (t) => t);
}

export const buildPalm = (segments: number) =>
  buildLoft(palmSections(), { segments });

/** Per-finger geometry: length, base and tip radius, and lateral offset. */
export interface FingerSpec {
  offsetX: number;
  length: number;
  base: number;
  tip: number;
}

/** Index, middle, ring — the three that read at this scale. */
export const FINGERS: readonly FingerSpec[] = [
  { offsetX: -0.019, length: 0.040, base: 0.0082, tip: 0.0064 },
  { offsetX:  0.000, length: 0.044, base: 0.0086, tip: 0.0066 },
  { offsetX:  0.019, length: 0.038, base: 0.0080, tip: 0.0062 },
];

export const THUMB: FingerSpec = { offsetX: 0.030, length: 0.038, base: 0.0098, tip: 0.0076 };
