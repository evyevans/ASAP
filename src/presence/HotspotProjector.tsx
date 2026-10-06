/* ═══════════════════════════════════════════════════════════════════════════
   HotspotProjector — the half of the hotspot system that needs a camera.

   WHY IT IS ITS OWN FILE, AND THE BUNDLE BUG THAT FORCED IT
   This used to live in `Hotspots.tsx` beside `HotspotLayer`. That was fine while
   the only consumer was the 3D stage. It stopped being fine when Home's hero
   became a video: `CharacterPlate` imports `HotspotLayer`, so `Hotspots.tsx`
   became part of the EAGER graph — and it imported three.js and
   @react-three/fiber for this component.

   While nothing else used three, Rollup tree-shook it away and the cost was
   invisible. The moment the Chat tab's animated core genuinely used three,
   Rollup saw it referenced from both the eager (Home) and lazy (Chat) graphs
   and hoisted it into the shared chunk. The main bundle went 842 kB -> 1,665 kB
   and every tab started paying for a library one route uses.

   Splitting on the actual dependency boundary fixes it: `HotspotLayer` is plain
   DOM and stays eager, this is three-only and rides along with whatever mounts
   a Canvas. Keep it that way — importing this from anything outside a Canvas
   puts three.js back in the main bundle.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSafeFrame } from './useSafeFrame';
import { STAGE as SET } from './Stage';
import type { AnchorRefs, HotspotId } from './Hotspots';

/** Where each hotspot lives in the world. Derived from the same SET table the
 *  Office lays out from, so a prop and its button can never drift apart. */
const ANCHOR: Record<HotspotId, THREE.Vector3> = {
  tray: new THREE.Vector3(SET.tray.x + SET.desk.x, SET.desk.y + 0.10, SET.tray.z),
  phone: new THREE.Vector3(SET.phone.x + SET.desk.x, SET.desk.y + 0.12, SET.phone.z),
  monitor: new THREE.Vector3(SET.monitor.x + SET.desk.x, SET.desk.y + 0.62, SET.monitor.z),
  board: new THREE.Vector3(SET.board.x + 0.5, SET.board.y + 0.36, SET.room.backZ + 0.06),
  cabinet: new THREE.Vector3(SET.cabinet.x + 0.2, 1.02, SET.cabinet.z + 0.3),
};

/**
 * Lives INSIDE the Canvas. Writes a transform straight onto each hotspot's DOM
 * node every frame, so tracking the scene costs zero React re-renders.
 */
export function HotspotProjector({ anchors }: { anchors: React.MutableRefObject<AnchorRefs> }) {
  const { camera, size } = useThree();
  const v = useRef(new THREE.Vector3());

  const project = useCallback(() => {
    for (const id of Object.keys(ANCHOR) as HotspotId[]) {
      const el = anchors.current[id];
      if (!el) continue;
      v.current.copy(ANCHOR[id]).project(camera);
      const x = (v.current.x * 0.5 + 0.5) * size.width;
      const y = (-v.current.y * 0.5 + 0.5) * size.height;
      // translate(-50%,-50%) centres the button on the prop.
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      // Behind the camera, or outside the frame — hide rather than clamp.
      el.style.opacity = v.current.z > 1 ? '0' : '1';
      el.style.pointerEvents = v.current.z > 1 ? 'none' : 'auto';
    }
  }, [camera, size.width, size.height, anchors]);

  useEffect(project, [project]);
  useSafeFrame('Hotspots.projector', project);
  return null;
}
