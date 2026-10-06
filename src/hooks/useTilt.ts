import { useRef, useCallback } from 'react';

/** 3D perspective tilt on pointer move (cloned from the Remi design system). */
export function useTilt(maxDeg = 5) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(800px) rotateX(${(-y * maxDeg).toFixed(1)}deg) rotateY(${(x * maxDeg).toFixed(1)}deg) translateZ(6px)`;
  }, [maxDeg]);

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = `transform 350ms var(--smooth)`;
    el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
    setTimeout(() => {
      if (el) el.style.transition = '';
    }, 350);
  }, []);

  return { ref, onMouseMove: onMove, onMouseLeave: onLeave };
}
