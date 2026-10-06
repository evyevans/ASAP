import { useEffect, useRef, useState } from 'react';

/** Ease-out-cubic count-up animation (cloned from the Remi design system). */
export function useCountUp(target: number, duration = 900, decimals = 0) {
  const [val, setVal] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (target === undefined || target === null) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(parseFloat((e * target).toFixed(decimals)));
      if (p < 1) {
        raf.current = requestAnimationFrame(tick);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, decimals]);

  return val;
}
