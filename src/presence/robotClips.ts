/* ═══════════════════════════════════════════════════════════════════════════
   robotClips — the butler's motion, evaluated procedurally.

   WHY THERE IS NO .glb HERE
   A humanoid needs a sculpted mesh and skinned deformation. A ROBOT does not:
   it is a mechanical assembly, so it animates with a rigid joint hierarchy —
   shoulder → elbow → wrist rotations composed by the scene graph. That means
   no rigging pipeline, no skin weights, no baked animation tracks, and total
   control over what every act looks like.

   And a rigid character's motion is overwhelmingly HARMONIC — breathing, the
   oscillation of typing, a head scan, a bow. So each act is expressed as a base
   pose plus additive eased/sinusoidal layers: ~1 KB of maths instead of
   megabytes of keyframes, and it is parameterised by `intensity`, so a busier
   feed literally makes him type faster.

   CONVENTIONS (kept rigorously consistent — every act depends on them)
   · All rotations are XYZ Euler, radians, in the joint's LOCAL space.
   · spine/neck/head  +X = look/lean DOWN,      −X = up
   · shoulder         −X = swing arm FORWARD/up, +X = back
   · shoulder         ±Z = raise arm out sideways (abduction)
   · elbow            +X = bend the forearm up toward the chest
   · root             +Y = turn to HIS left, which is camera-LEFT (the cabinet)
   · `lift` is a vertical body offset in metres (breathing, bob, bow)

   `t` is SECONDS SINCE THE ACT BEGAN. Looping acts ignore where that started;
   transient acts (commending, alerting) use it to script a real timeline.

   Pure — no three.js, no React. Fully unit-testable.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Act } from './sceneDirector';

export type Euler3 = readonly [number, number, number];

export type JointName =
  | 'root' | 'spine' | 'neck' | 'head' | 'hat'
  | 'shoulderL' | 'elbowL' | 'wristL'
  | 'shoulderR' | 'elbowR' | 'wristR';

export const JOINT_NAMES: readonly JointName[] = [
  'root', 'spine', 'neck', 'head', 'hat',
  'shoulderL', 'elbowL', 'wristL',
  'shoulderR', 'elbowR', 'wristR',
];

/** Which accent colour the core, visor arcs and hat band carry. */
export type Tint = 'copper' | 'success' | 'error';

export interface Pose {
  joints: Record<JointName, Euler3>;
  /** Vertical body offset, metres. Breathing, bob, and the bow live here. */
  lift: number;
  /** Top-hat piston extension, metres. 0 = seated on his head. */
  hatLift: number;
  /** Chest core emissive drive, 0…1. How hard ASAP is working. */
  core: number;
  /** Visor arc aperture, 0…1. 0 = narrowed/focused, 1 = wide/alert. */
  aperture: number;
  /** Monocle scan-line progress, 0…1. 0 = the monocle is dark. */
  scan: number;
  /** Finger curl, 0 = open hand, 1 = closed grip. */
  gripL: number;
  gripR: number;
  tint: Tint;
}

/* ── Small maths helpers ──────────────────────────────────────────────────*/

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Normalised 0…1 progress across [from,to], clamped outside. */
export const seg = (t: number, from: number, to: number) =>
  to <= from ? (t >= to ? 1 : 0) : clamp01((t - from) / (to - from));

/** Smoothstep — the ease used for every scripted movement. */
export const ease = (k: number) => {
  const x = clamp01(k);
  return x * x * (3 - 2 * x);
};

/** A 0→1→0 ease, for movements that go out and come back. */
export const arc = (k: number) => {
  const x = clamp01(k);
  return ease(x < 0.5 ? x * 2 : (1 - x) * 2);
};

const sin = (t: number, hz: number, amp: number, phase = 0) =>
  Math.sin(t * hz * Math.PI * 2 + phase) * amp;

/** Every joint at rest. Acts start from this and add to it. */
function restJoints(): Record<JointName, Euler3> {
  return {
    root: [0, 0, 0],
    spine: [0, 0, 0],
    neck: [0, 0, 0],
    head: [0, 0, 0],
    hat: [0, 0, 0],
    // Arms hang at his sides, very slightly out from the body.
    shoulderL: [0, 0, 0.09],
    elbowL: [0.08, 0, 0],
    wristL: [0, 0, 0],
    shoulderR: [0, 0, -0.09],
    elbowR: [0.08, 0, 0],
    wristR: [0, 0, 0],
  };
}

const basePose = (over: Partial<Pose> = {}): Pose => ({
  joints: restJoints(),
  lift: 0,
  hatLift: 0,
  core: 0.5,
  aperture: 0.55,
  scan: 0,
  gripL: 0.15,
  gripR: 0.15,
  tint: 'copper',
  ...over,
});

/** His signature at-rest posture: left hand tucked behind the back.
 *  Applied by every act that isn't using that arm — it's the single detail
 *  that reads "butler" rather than "mannequin". */
function handBehindBack(j: Record<JointName, Euler3>) {
  j.shoulderL = [0.55, 0.25, 0.16];
  j.elbowL = [1.35, 0, 0];
  j.wristL = [0, 0.3, 0];
}

/* ── The acts ─────────────────────────────────────────────────────────────*/

/** Heels together, one hand behind the back, breathing, a slow head scan. */
function standby(t: number, i: number): Pose {
  const p = basePose({ core: 0.4 + i * 0.15, aperture: 0.55 });
  const j = p.joints;
  handBehindBack(j);

  // Breathing — slow, shallow, always present.
  p.lift = sin(t, 0.19, 0.008);
  j.spine = [sin(t, 0.19, 0.012) + 0.01, sin(t, 0.07, 0.02), 0];

  // A slow, deliberate scan of the room. Never darting.
  j.neck = [sin(t, 0.055, 0.05), sin(t, 0.041, 0.22), 0];
  j.head = [sin(t, 0.078, 0.03), sin(t, 0.033, 0.10), sin(t, 0.05, 0.02)];

  // Every ~11s he adjusts his right cuff — a life sign, not a loop tell.
  const cuff = arc(seg(t % 11, 8.4, 9.9));
  j.shoulderR = [-0.62 * cuff, 0.18 * cuff, -0.09 + 0.12 * cuff];
  j.elbowR = [0.08 + 1.5 * cuff, 0, 0];
  j.wristR = [0, -0.4 * cuff, 0];
  p.gripR = 0.15 + 0.5 * cuff;

  return p;
}

/** Leans into the desk, both hands typing. Speed scales with how busy ASAP is. */
function drafting(t: number, i: number): Pose {
  const p = basePose({ core: 0.75 + i * 0.25, aperture: 0.34 });
  const j = p.joints;

  const hz = 3.2 + i * 3.4; // busier feed ⇒ faster hands
  j.root = [0, -0.06, 0];
  j.spine = [0.20, 0.03, 0];
  p.lift = -0.035 + sin(t, 0.42, 0.004);

  // Both arms forward onto the desk.
  j.shoulderL = [-0.80, 0.16, 0.30];
  j.shoulderR = [-0.80, -0.16, -0.30];
  j.elbowL = [1.12, 0, 0];
  j.elbowR = [1.12, 0, 0];

  // Hands alternate, a half-cycle out of phase. This is the typing.
  j.wristL = [sin(t, hz, 0.16), 0, 0.05];
  j.wristR = [sin(t, hz, 0.16, Math.PI), 0, -0.05];
  p.gripL = 0.55 + sin(t, hz, 0.12);
  p.gripR = 0.55 + sin(t, hz, 0.12, Math.PI);

  // Head down at the keys, glancing up at the monitor every ~5s.
  const glance = arc(seg(t % 5, 3.1, 4.3));
  j.neck = [0.30 - 0.34 * glance, sin(t, 0.11, 0.04), 0];
  j.head = [0.10 - 0.16 * glance, 0, 0];

  return p;
}

/** Holds a document chest-high; the monocle scan-line sweeps it. */
function reviewing(t: number, i: number): Pose {
  const p = basePose({ core: 0.6 + i * 0.2, aperture: 0.40 });
  const j = p.joints;

  p.lift = sin(t, 0.24, 0.006);
  j.spine = [0.07, 0.05, 0];

  // Both hands hold the page up in front of him.
  j.shoulderL = [-0.92, 0.30, 0.26];
  j.shoulderR = [-0.92, -0.30, -0.26];
  j.elbowL = [1.62, 0, 0];
  j.elbowR = [1.62, 0, 0];
  j.wristL = [0.12, 0, 0.10];
  j.wristR = [0.12, 0, -0.10];
  p.gripL = 0.7;
  p.gripR = 0.7;

  // Reading: the head tracks left→right across the line, then flicks back.
  // A raw sawtooth ((t*0.55) % 1) would TELEPORT his head at the wrap, so the
  // carriage return is a fast but continuous ramp over the last 20% of the cycle.
  const cycle = (t * 0.55) % 1;
  const line = cycle < 0.8 ? cycle / 0.8 : 1 - (cycle - 0.8) / 0.2;
  j.neck = [0.24, 0.16 - line * 0.32, 0];
  j.head = [0.06, 0.05 - line * 0.10, 0];

  // The monocle sweep is locked to the reading line — it IS the reading.
  p.scan = line;

  return p;
}

/** Turns to camera and extends the document toward you. The "needs you" act. */
function presenting(t: number, i: number): Pose {
  const p = basePose({ core: 0.65 + i * 0.15, aperture: 0.72 });
  const j = p.joints;
  handBehindBack(j);

  // Squares up to the viewer. root Y ≈ 0 is what "facing camera" means.
  j.root = [0, 0, 0];
  p.lift = sin(t, 0.3, 0.006);
  j.spine = [0.10, 0, 0];

  // Right arm offers the document forward, with a gentle presenting emphasis.
  // Abducted outward as well as forward: a purely forward arm foreshortens to
  // nothing from the fixed camera, which made the offer unreadable head-on.
  const offer = 0.72 + sin(t, 0.34, 0.06);
  j.shoulderR = [-offer, -0.34, -0.30];
  j.elbowR = [0.62 + sin(t, 0.34, 0.05), 0, 0];
  j.wristR = [-0.28, -0.12, 0];
  p.gripR = 0.62;

  // A small, respectful bow of the head — he's asking, not demanding.
  j.neck = [0.16 + sin(t, 0.3, 0.02), 0, 0];
  j.head = [0.07, sin(t, 0.22, 0.03), 0];

  return p;
}

/** Handset to the visor, free hand gesturing. Working your pipeline. */
function dispatching(t: number, i: number): Pose {
  const p = basePose({ core: 0.7 + i * 0.2, aperture: 0.5 });
  const j = p.joints;

  p.lift = sin(t, 0.26, 0.007);
  j.root = [0, sin(t, 0.13, 0.06), 0];
  j.spine = [0.04, sin(t, 0.13, 0.03), 0];

  // Right hand holds the handset up beside his head.
  j.shoulderR = [-1.30, -0.22, -0.34];
  j.elbowR = [1.92, 0, 0];
  j.wristR = [0, -0.25, -0.15];
  p.gripR = 0.85;

  // Left hand gestures while he talks — the tell that he's mid-conversation.
  const g = sin(t, 0.55, 1);
  j.shoulderL = [-0.42 - g * 0.16, 0.22, 0.34 + g * 0.10];
  j.elbowL = [1.05 + g * 0.22, 0, 0];
  j.wristL = [g * 0.2, 0.18, 0];
  p.gripL = 0.3;

  j.neck = [0.06, sin(t, 0.19, 0.07), 0.05];
  j.head = [0.03, sin(t, 0.31, 0.04), 0.04];

  return p;
}

/** Turns to the cabinet (camera-left) and works a drawer. Writing to memory. */
function filing(t: number, i: number): Pose {
  const p = basePose({ core: 0.6 + i * 0.2, aperture: 0.45 });
  const j = p.joints;

  // Turn toward his left — that's where the filing cabinet stands.
  j.root = [0, 0.62, 0];
  p.lift = sin(t, 0.3, 0.006) - 0.01;
  j.spine = [0.12, 0.10, 0];

  // Right arm works the drawer: reach → pull → withdraw, on a ~2.6s cycle.
  // `reach` must fall back to 0 before the cycle wraps, otherwise the arm snaps
  // from fully extended to rest in a single frame at the modulo boundary.
  const cycle = (t % 2.6) / 2.6;
  const reach = ease(seg(cycle, 0, 0.3)) * (1 - ease(seg(cycle, 0.78, 1)));
  const pull = arc(seg(cycle, 0.3, 0.75));
  j.shoulderR = [-0.55 - reach * 0.25 + pull * 0.30, -0.18, -0.22];
  j.elbowR = [0.65 + reach * 0.35 - pull * 0.55, 0, 0];
  j.wristR = [0.1, -0.2, 0];
  p.gripR = 0.35 + reach * 0.55;

  handBehindBack(j);

  j.neck = [0.20 - pull * 0.08, 0.14, 0];
  j.head = [0.05, 0.06, 0];

  return p;
}

/** Tips the top hat and bows. A win landed. Scripted over ~2.6s. */
function commending(t: number): Pose {
  const p = basePose({ core: 0.95, aperture: 0.62, tint: 'success' });
  const j = p.joints;
  handBehindBack(j);

  j.root = [0, 0, 0];

  const raise = ease(seg(t, 0.00, 0.50)); // hand travels to the brim
  const lift = ease(seg(t, 0.35, 0.85));  // hat rises on its piston
  const bow = arc(seg(t, 0.50, 1.90));   // the bow itself
  const back = ease(seg(t, 1.85, 2.55));  // everything returns

  const up = raise * (1 - back);

  // Right hand to the brim.
  j.shoulderR = [-2.05 * up, -0.18 * up, -0.09 - 0.30 * up];
  j.elbowR = [0.08 + 1.55 * up, 0, 0];
  j.wristR = [-0.35 * up, 0, 0];
  p.gripR = 0.15 + 0.6 * up;

  // The hat lifts on a visible piston and tilts forward with the bow.
  p.hatLift = 0.085 * lift * (1 - back);
  j.hat = [0.30 * lift * (1 - back), 0, 0.12 * lift * (1 - back)];

  // The bow — from the waist, with the head following slightly further.
  j.spine = [0.30 * bow, 0, 0];
  j.neck = [0.22 * bow, 0, 0];
  j.head = [0.10 * bow, 0, 0];
  p.lift = -0.05 * bow;

  return p;
}

/** Straightens sharply, gloved hand raised. Something needs you NOW. */
function alerting(t: number): Pose {
  const p = basePose({ core: 0.9, aperture: 1, tint: 'error' });
  const j = p.joints;
  handBehindBack(j);

  const snap = ease(seg(t, 0, 0.22)); // the sharp straighten

  // Perfectly upright — the posture change alone signals the alarm.
  j.spine = [-0.06 * snap, 0, 0];
  p.lift = 0.02 * snap;

  // Right hand raised palm-out: "stop, look at this".
  j.shoulderR = [-1.22 * snap, -0.10 * snap, -0.09 - 0.42 * snap];
  j.elbowR = [0.08 + 1.18 * snap, 0, 0];
  j.wristR = [-0.55 * snap, 0, 0];
  p.gripR = 0.15 * (1 - snap); // open palm

  // A fine mechanical tremor — tension, not panic.
  const tremor = sin(t, 7.5, 0.006) * snap;
  j.neck = [-0.10 * snap + tremor, tremor * 0.5, 0];
  j.head = [-0.04 * snap, 0, tremor];

  // The core hammers rather than breathes.
  p.core = 0.55 + Math.abs(Math.sin(t * Math.PI * 2.6)) * 0.45;

  return p;
}

/* ── Voice acts ───────────────────────────────────────────────────────────
   These two are driven by the CONVERSATION, not by the feed, so neither takes
   `intensity` — how busy the CRM has been says nothing about how someone is
   being listened to. That is why they read `t` only. */

/** Turns to the camera and holds still. Someone is talking to him.
 *
 *  Stillness is the whole point: a listener who keeps fidgeting reads as
 *  impatient, and every other act in this file is already in motion. The only
 *  movement is a slow breath and a barely-there head tilt — the universal
 *  "go on, I'm with you" cue — plus a wide-open aperture doing the real work. */
function listening(t: number): Pose {
  const p = basePose({ core: 0.4, aperture: 1, tint: 'copper' });
  const j = p.joints;
  handBehindBack(j);

  const settle = ease(seg(t, 0, 0.5)); // ease in from whatever he was doing

  // Square to the camera, chin fractionally up — attention, not deference.
  j.spine = [-0.04 * settle, 0, 0];
  j.neck = [-0.09 * settle, 0, 0];
  // The tilt. Small enough to be felt rather than noticed.
  j.head = [-0.03 * settle, 0.05 * settle, 0.075 * settle];

  // Slow, deep breathing — slower than standby, because he is holding still.
  p.lift = sin(t, 0.28, 0.006) * settle;

  // The core idles low and steady. It must NOT look like he is thinking yet:
  // he is receiving. The glow at the screen edge carries "listening"; the
  // character carries "attending".
  p.core = 0.34 + sin(t, 0.28, 0.05);

  return p;
}

/** Addresses the camera and talks. The core carries the speech energy.
 *
 *  Speech cadence is deliberately irregular — two summed sines at
 *  non-harmonic rates — because an evenly pulsing light reads as a machine
 *  status LED, and this is supposed to read as someone mid-sentence. */
function speaking(t: number): Pose {
  const p = basePose({ core: 0.7, aperture: 0.72, tint: 'copper' });
  const j = p.joints;
  handBehindBack(j);

  const settle = ease(seg(t, 0, 0.35));

  // Upright and open, turned very slightly toward the viewer.
  j.spine = [-0.03 * settle, 0.03 * settle, 0];
  j.neck = [-0.05 * settle, 0, 0];

  // Micro-nods on the phrase, not on the syllable — the beat of speech.
  const phrase = sin(t, 0.85, 1);
  j.head = [0.028 * phrase * settle, 0.035 * sin(t, 0.45, 1) * settle, 0.02 * phrase * settle];

  // One hand comes out of the small-of-the-back and gestures loosely. Enough
  // to be alive; not enough to become a presentation.
  const g = settle * (0.55 + 0.45 * sin(t, 0.6, 1));
  j.shoulderR = [-0.42 * g, -0.06 * g, -0.09 - 0.16 * g];
  j.elbowR = [0.08 + 0.72 * g, 0, 0.05 * g];
  j.wristR = [-0.14 * g, 0.10 * sin(t, 1.1, 1) * g, 0];
  p.gripR = 0.12;

  p.lift = sin(t, 0.5, 0.004) * settle;

  // Two non-harmonic rates so the pulse never settles into a loop the eye can
  // predict — which is what makes it read as speech rather than as a heartbeat.
  p.core = 0.55 + 0.3 * Math.abs(Math.sin(t * Math.PI * 3.1)) * (0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * 1.7)));

  return p;
}

/** Powered down. Provably motionless — `t` is not read at all. */
function dormant(): Pose {
  const p = basePose({ core: 0.05, aperture: 0, tint: 'copper' });
  const j = p.joints;
  // Head forward 8°, shoulders settled. Unmistakably "off", not "asleep".
  j.spine = [0.10, 0, 0];
  j.neck = [0.14, 0, 0];
  j.head = [0.04, 0, 0];
  j.shoulderL = [0.06, 0, 0.13];
  j.shoulderR = [0.06, 0, -0.13];
  j.elbowL = [0.14, 0, 0];
  j.elbowR = [0.14, 0, 0];
  p.lift = -0.02;
  p.gripL = 0.25;
  p.gripR = 0.25;
  return p;
}

/* ── Public evaluator ─────────────────────────────────────────────────────*/

/**
 * The pose for `act`, `t` seconds after that act began.
 * `intensity` (0…1) scales the energy of the looping acts.
 */
export function evalAct(act: Act, t: number, intensity = 0): Pose {
  const i = clamp01(intensity);
  const time = Number.isFinite(t) && t > 0 ? t : 0;
  switch (act) {
    case 'dormant': return dormant();
    case 'drafting': return drafting(time, i);
    case 'reviewing': return reviewing(time, i);
    case 'presenting': return presenting(time, i);
    case 'dispatching': return dispatching(time, i);
    case 'filing': return filing(time, i);
    case 'commending': return commending(time);
    case 'alerting': return alerting(time);
    case 'listening': return listening(time);
    case 'speaking': return speaking(time);
    case 'standby':
    default: return standby(time, i);
  }
}

/**
 * Blend two poses. `k` = 0 returns `a`, 1 returns `b`.
 * This is what makes act changes read as deliberate rather than as a snap —
 * the component keeps the outgoing pose and eases into the incoming one.
 * Discrete fields (tint) switch at the halfway point.
 */
export function blendPose(a: Pose, b: Pose, k: number): Pose {
  const w = clamp01(k);
  // Short-circuit the endpoints. This is not just a micro-optimisation (a
  // cross-fade sits at w=1 for most of its life): the lerp `x+(y-x)*w` collapses
  // a signed -0 to +0, so blending at w=0 would not return `a` byte-for-byte.
  if (w === 0) return { ...a, joints: { ...a.joints } };
  if (w === 1) return { ...b, joints: { ...b.joints } };
  const mix = (x: number, y: number) => x + (y - x) * w;
  const joints = {} as Record<JointName, Euler3>;
  for (const name of JOINT_NAMES) {
    const ja = a.joints[name];
    const jb = b.joints[name];
    joints[name] = [mix(ja[0], jb[0]), mix(ja[1], jb[1]), mix(ja[2], jb[2])];
  }
  return {
    joints,
    lift: mix(a.lift, b.lift),
    hatLift: mix(a.hatLift, b.hatLift),
    core: mix(a.core, b.core),
    aperture: mix(a.aperture, b.aperture),
    scan: mix(a.scan, b.scan),
    gripL: mix(a.gripL, b.gripL),
    gripR: mix(a.gripR, b.gripR),
    tint: w < 0.5 ? a.tint : b.tint,
  };
}

/** How long a cross-fade into `act` should take, in seconds.
 *  An alarm snaps; everything else eases. */
export const fadeSeconds = (act: Act): number => (act === 'alerting' ? 0.14 : 0.4);
