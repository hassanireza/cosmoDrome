import { clamp, damp } from '../core/math.ts';
import type { Rng } from '../core/rng.ts';
import type { DirectorPhase } from '../core/types.ts';

export interface DirectorContext {
  /** 0..1 measure of how much danger is currently in front of the player. */
  threat: number;
  bossActive: boolean;
  d: number;
  frustration: number;
  boredom: number;
}

/**
 * Pacing director in the spirit of Left 4 Dead's AI Director: a four phase intensity
 * machine (build, peak, fade, relax) that owns *when* pressure arrives while the
 * difficulty engine owns *how hard* it is. Relief is designed, not accidental, because
 * the peak-end rule says players remember the peaks and how a stretch ends.
 */
export class Director {
  phase: DirectorPhase = 'relax';
  phaseT = 0;
  intensity = 0;
  private holdFor = 3;
  private readonly rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  reset(): void {
    this.phase = 'relax';
    this.phaseT = 0;
    this.intensity = 0;
    this.holdFor = 3.5;
  }

  /** Called when the player takes damage. A spike keeps peaks honest. */
  damage(): void {
    this.intensity = clamp(this.intensity + 0.3, 0, 1);
  }

  /** Returns the new phase when it changes, otherwise null. */
  update(dt: number, ctx: DirectorContext): DirectorPhase | null {
    this.phaseT += dt;
    const floor = ctx.bossActive ? 0.5 : 0;
    const target = Math.max(floor, clamp(ctx.threat, 0, 1));
    this.intensity = clamp(damp(this.intensity, target, target > this.intensity ? 2.2 : 0.6, dt), 0, 1);

    const before = this.phase;
    switch (this.phase) {
      case 'build': {
        const peakAt = clamp(0.62 - 0.1 * ctx.boredom + 0.1 * ctx.frustration, 0.45, 0.8);
        const maxBuild = 28 - 12 * clamp(ctx.d, 0, 1);
        if (this.intensity >= peakAt || this.phaseT > maxBuild) this.go('peak', this.rng.range(4.5, 7.5));
        break;
      }
      case 'peak':
        if (this.phaseT >= this.holdFor || ctx.frustration > 0.8) this.go('fade', 0);
        break;
      case 'fade':
        if ((this.intensity < 0.3 && this.phaseT > 2) || this.phaseT > 8) {
          this.go('relax', this.rng.range(3.5, 6) + 3 * ctx.frustration);
        }
        break;
      case 'relax':
        if (this.phaseT >= this.holdFor) this.go('build', 0);
        break;
    }
    return this.phase !== before ? this.phase : null;
  }

  private go(next: DirectorPhase, hold: number): void {
    this.phase = next;
    this.phaseT = 0;
    this.holdFor = hold;
  }

  /** Multiplier on the gap between patterns. Above 1 means more breathing room. */
  gapScale(): number {
    switch (this.phase) {
      case 'build': return 1;
      case 'peak': return 0.78;
      case 'fade': return 1.5;
      case 'relax': return 2.1;
    }
  }
}
