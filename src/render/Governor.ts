import { clamp } from '../core/math.ts';

/**
 * Frame budget governor. A slow feedback loop on frame time that trades render
 * resolution for steady frame rate: phones keep 60 fps, strong devices stay sharp.
 * Steps are small and rate limited, because changing resolution reallocates targets.
 */
export class Governor {
  scale: number;
  private avg = 16.7;
  private cooldown = 3;
  private slow = 0;
  private fast = 0;
  private readonly min: number;
  private readonly max: number;

  constructor(start: number, min = 0.5, max = 1) {
    this.scale = start;
    this.min = min;
    this.max = max;
  }

  /** Returns a new scale when it changes, otherwise null. */
  sample(frameMs: number, dt: number): number | null {
    this.avg += 0.08 * (clamp(frameMs, 4, 100) - this.avg);
    this.cooldown -= dt;
    if (this.cooldown > 0) return null;
    if (this.avg > 21) { this.slow += dt; this.fast = 0; }
    else if (this.avg < 13.5) { this.fast += dt; this.slow = 0; }
    else { this.slow = 0; this.fast = 0; }

    if (this.slow > 1.2 && this.scale > this.min) {
      this.scale = Math.max(this.min, this.scale - 0.1);
      this.cooldown = 2.5;
      this.slow = 0;
      return this.scale;
    }
    if (this.fast > 6 && this.scale < this.max) {
      this.scale = Math.min(this.max, this.scale + 0.05);
      this.cooldown = 4;
      this.fast = 0;
      return this.scale;
    }
    return null;
  }
}
