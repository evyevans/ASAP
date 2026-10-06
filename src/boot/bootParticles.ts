/* Rasterizes BOOT_WORD into particle targets and renders the four phases.
 * Pure canvas; no DOM node per particle — everything lives in a flat array
 * and is redrawn each frame by the component's rAF loop with
 * (phase, phaseProgress). Particle count is capped by the sampling `step`
 * below, not by a hard limit, so it scales down gracefully on small canvases. */

export type BootPhase = 'disintegrate' | 'reassemble' | 'ignite' | 'reveal';

interface Particle {
  /** Target (formed word) position. */
  tx: number;
  ty: number;
  /** Scattered (disintegrated) position. */
  sx: number;
  sy: number;
}

const DEFAULT_COLOR = '#EBEAE4';
const DEFAULT_GLOW = '#E8733A';

export class BootParticles {
  private particles: Particle[] = [];
  private w = 0;
  private h = 0;
  private color = DEFAULT_COLOR;
  private glow = DEFAULT_GLOW;

  /** Rasterizes `word` offscreen and samples the opaque pixels into particles. */
  init(canvas: HTMLCanvasElement, word: string): void {
    const dpr = window.devicePixelRatio || 1;
    this.w = canvas.clientWidth * dpr;
    this.h = canvas.clientHeight * dpr;
    canvas.width = this.w;
    canvas.height = this.h;

    const styles = getComputedStyle(document.documentElement);
    this.color = styles.getPropertyValue('--color-text-primary').trim() || DEFAULT_COLOR;
    this.glow =
      styles.getPropertyValue('--brand-400').trim() ||
      styles.getPropertyValue('--color-accent').trim() ||
      DEFAULT_GLOW;

    const off = document.createElement('canvas');
    off.width = this.w;
    off.height = this.h;
    const octx = off.getContext('2d');
    if (!octx || this.w === 0 || this.h === 0) {
      this.particles = [];
      return;
    }

    const fontPx = Math.min(this.w * 0.28, this.h * 0.5);
    octx.font = `900 ${fontPx}px Inter, sans-serif`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillStyle = '#fff';
    octx.fillText(word, this.w / 2, this.h / 2);
    const img = octx.getImageData(0, 0, this.w, this.h).data;

    const step = Math.max(2, Math.round(this.w / 220)); // caps particle count (~few k)
    const particles: Particle[] = [];
    for (let y = 0; y < this.h; y += step) {
      for (let x = 0; x < this.w; x += step) {
        const alpha = img[(y * this.w + x) * 4 + 3];
        if (alpha > 128) {
          const ang = Math.random() * Math.PI * 2;
          const dist = (0.35 + Math.random() * 0.65) * this.w * 0.45;
          particles.push({ tx: x, ty: y, sx: x + Math.cos(ang) * dist, sy: y + Math.sin(ang) * dist });
        }
      }
    }
    this.particles = particles;
  }

  /** t = progress 0..1 within the given phase. */
  render(ctx: CanvasRenderingContext2D, phase: BootPhase, t: number): void {
    ctx.clearRect(0, 0, this.w, this.h);
    const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
    const size = Math.max(1.5, this.w / 640);

    if (phase === 'reveal') ctx.globalAlpha = 1 - t;

    for (const p of this.particles) {
      let x = p.tx;
      let y = p.ty;
      if (phase === 'disintegrate') {
        const k = easeOut(t);
        x = p.tx + (p.sx - p.tx) * k;
        y = p.ty + (p.sy - p.ty) * k;
      } else if (phase === 'reassemble') {
        const k = easeOut(t);
        x = p.sx + (p.tx - p.sx) * k;
        y = p.sy + (p.ty - p.sy) * k;
      }

      if (phase === 'ignite') {
        ctx.shadowColor = this.glow;
        ctx.shadowBlur = 14 * easeOut(t);
        ctx.fillStyle = this.glow;
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = this.color;
      }
      ctx.fillRect(x, y, size, size);
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}
