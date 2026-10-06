/* ═══════════════════════════════════════════════════════════════════════════
   AiCore — the animated ball, and the face of the voice agent.

   THE REF-NOT-PROP RULE
   `phase` arrives as a prop but is immediately parked in a ref, and the render
   loop reads the ref. If the loop read the prop directly, every phase change
   would re-render the <Canvas> subtree; r3f tears down and rebuilds GL
   resources when that happens badly enough, and a voice turn changes phase four
   times in a few seconds. Uniform writes from inside useFrame cost nothing and
   never touch React.

   WHY IT NEVER SNAPS
   Profiles are eased toward with `approach`, not assigned. The difference is
   visible: assigning makes the ball jolt the instant you press the mic, which
   reads as a glitch rather than as attention.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createBlobMaterial, profileFor, approach, wrapHue, HUE_CYCLE_SECONDS,
} from './blobMaterial';
import { readVoiceLevel, perceptualLevel } from '../voice/voiceLevel';

/** How quickly the ball settles into a new phase, in seconds. Slow enough to
 *  read as intent, fast enough that pressing the mic feels acknowledged. */
const EASE_TAU = 0.28;

function CoreMesh({ phaseRef }: { phaseRef: React.MutableRefObject<string> }) {
  const group = useRef<THREE.Group>(null);
  const material = useMemo(() => createBlobMaterial(), []);
  const hue = useRef(0.06);
  const spin = useRef(0);

  // Materials hold GPU resources; StrictMode double-mounts in dev, so without
  // this the first material leaks on every hot reload.
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_state, rawDelta) => {
    // A backgrounded tab hands back one enormous delta on return. Clamping
    // stops the ball from teleporting through a third of its hue cycle.
    const dt = Math.min(Math.max(rawDelta, 0), 0.1);
    const p = profileFor(phaseRef.current);
    const u = material.uniforms;

    // Hue: monotonic, never state-dependent. The screen edges own state colour.
    hue.current = wrapHue(hue.current + dt / HUE_CYCLE_SECONDS);
    u.uHue.value = hue.current;

    /* Mic amplitude, read straight from the module-scope box rather than passed
       down as a prop. `voiceLevel` exists precisely so a 60Hz value never
       becomes React state — and it self-expires, so a turn that dies mid
       sentence leaves the ball calm instead of frozen mid-shout. */
    const level = perceptualLevel(readVoiceLevel().rms);
    u.uTime.value += dt * (1 + level * 0.6);
    u.uSpeed.value = approach(u.uSpeed.value, p.speed, dt, EASE_TAU);
    u.uNoise.value = approach(u.uNoise.value, p.noise * (1 + level * 0.35), dt, EASE_TAU);
    u.uIntensity.value = approach(u.uIntensity.value, p.intensity, dt, EASE_TAU);

    if (group.current) {
      spin.current += dt * 0.18 * p.motion;
      group.current.rotation.y = spin.current;
      group.current.rotation.x = Math.sin(spin.current * 2.4) * 0.09;
      group.current.position.y = Math.sin(spin.current * 5.5) * 0.06 * p.motion;
    }
  });

  return (
    <group ref={group}>
      <mesh material={material}>
        {/* Detail 24 on an icosahedron is ~15k triangles. The vertex shader
            displaces per-vertex, so anything coarser shows facets in the
            silhouette as it churns. */}
        <icosahedronGeometry args={[1, 24]} />
      </mesh>
    </group>
  );
}

export interface AiCoreProps {
  /** A VoicePhase from agent/agentState. Unknown values fall back to idle. */
  phase: string;
  className?: string;
}

export function AiCore({ phase, className }: AiCoreProps) {
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  return (
    <div className={className} aria-hidden>
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        // Fixed DPR. r3f's dynamic scaling reacts to frame time, and on a
        // deliberately heavy shader that produces a visible resolution pump.
        dpr={Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, 2)}
      >
        <ambientLight intensity={0.6} />
        <CoreMesh phaseRef={phaseRef} />
      </Canvas>
    </div>
  );
}
