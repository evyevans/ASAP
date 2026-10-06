/* ═══════════════════════════════════════════════════════════════════════════
   Postprocessing — three.js's own EffectComposer, bridged into r3f.

   WHY NOT @react-three/postprocessing
   Two reasons, both concrete. First, this repo is on Vite 8, where barrel
   imports from the drei/postprocessing family have already broken the build
   once (and only `vite build` catches it — `tsc` passes happily). Second,
   everything needed already ships inside the `three` package we depend on, so
   the whole pipeline costs zero new dependencies and zero new failure modes.

   WHAT EACH PASS BUYS
   · GTAO   — contact occlusion. THE realism pass: it's what makes the butler
              sit IN the room rather than float on top of it. Also the most
              expensive, so only the cinematic tier pays for it.
   · Bokeh  — shallow depth of field. Holds focus on him and lets the far wall
              fall away, which is what reads as "camera" instead of "viewport".
   · Bloom  — a TIGHT threshold, so only the reactor core, the screens and the
              lamp filament bloom. A low threshold here would fog the whole
              image and instantly look amateur.
   · Output — ACES filmic tone mapping + sRGB conversion, in the correct order.
   · SMAA   — antialiasing after tone mapping, where it belongs.

   Taking `priority: 1` in useFrame hands us the render loop; r3f then stops
   issuing its own render call, so the scene is drawn exactly once per frame.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { QualitySettings } from './quality';

export function Postprocessing({ quality }: { quality: QualitySettings }) {
  const { gl, scene, camera, size } = useThree();

  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));

    if (quality.gtao) {
      const gtao = new GTAOPass(scene, camera, size.width, size.height);
      gtao.output = GTAOPass.OUTPUT.Default;
      // Tuned for a room-scale set: a short radius keeps the occlusion in the
      // creases (under the desk lip, inside the tray, at the panel gaps) rather
      // than smearing a grey haze across open floor.
      gtao.updateGtaoMaterial({
        radius: 0.22,
        distanceExponent: 1.0,
        thickness: 1.0,
        scale: 1.0,
        samples: 16,
      });
      c.addPass(gtao);
    }

    if (quality.dof) {
      // Focus distance is the camera→butler distance; see SET.butler in Office.
      c.addPass(new BokehPass(scene, camera, { focus: 3.75, aperture: 0.00055, maxblur: 0.011 }));
    }

    if (quality.bloom) {
      c.addPass(new UnrealBloomPass(
        new THREE.Vector2(size.width, size.height),
        0.42,  // strength — restrained on purpose
        0.55,  // radius
        0.92   // threshold: only genuinely emissive surfaces qualify
      ));
    }

    c.addPass(new OutputPass());
    c.addPass(new SMAAPass());
    return c;
    // Rebuilt only when the pass SET changes — resizes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, quality.gtao, quality.dof, quality.bloom]);

  useEffect(() => {
    composer.setSize(size.width, size.height);
    composer.setPixelRatio(gl.getPixelRatio());
  }, [composer, size.width, size.height, gl]);

  // Free every render target when the pass set changes or the scene unmounts.
  useEffect(() => () => {
    composer.passes.forEach((p) => (p as { dispose?: () => void }).dispose?.());
    composer.dispose();
  }, [composer]);

  useFrame((_, delta) => {
    // delta is clamped: a backgrounded tab can return a multi-second delta,
    // which makes time-based passes lurch on the first frame back.
    composer.render(Math.min(delta, 0.1));
  }, 1);

  return null;
}
