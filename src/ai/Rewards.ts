import type { Rng } from '../core/rng.ts';

export type Drop = 'mote' | 'veil' | null;

/**
 * Reward schedule, built from the behavioural half of the Gambit notes:
 * - near misses are paid, so risk is rewarded (prospect theory, near-miss effect)
 * - combos decay one step at a time instead of resetting (loss aversion softened)
 * - drops follow a variable ratio schedule with a pity timer, so luck cannot starve a player
 */
export class Rewards {
  combo = 1;
  bestCombo = 1;
  private comboTimer = 0;
  private decayClock = 0;
  private pity = 0;
  private readonly rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  reset(): void {
    this.combo = 1;
    this.bestCombo = 1;
    this.comboTimer = 0;
    this.decayClock = 0;
    this.pity = 0;
  }

  /** Called for a near miss or a successful hop. Returns the bonus points. */
  chain(base: number): number {
    this.combo = Math.min(8, this.combo + 1);
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboTimer = 3;
    this.decayClock = 0;
    return base * this.combo;
  }

  onHit(): void {
    this.combo = Math.max(1, Math.floor(this.combo / 2));
    this.comboTimer = 0;
  }

  tick(dt: number): void {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      return;
    }
    if (this.combo > 1) {
      this.decayClock += dt;
      if (this.decayClock >= 2.5) {
        this.combo -= 1;
        this.decayClock = 0;
      }
    }
  }

  rollDrop(ctx: { hasShield: boolean; frustration: number; bias: number }): Drop {
    this.pity += 1;
    const chance = (0.1 + this.pity * 0.035) * ctx.bias;
    if (!this.rng.chance(Math.min(0.85, chance))) return null;
    this.pity = 0;
    if (!ctx.hasShield && this.rng.chance(0.25 + ctx.frustration * 0.5)) return 'veil';
    return 'mote';
  }
}
