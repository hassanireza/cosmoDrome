import { PID, clamp, lerp, moveToward } from '../core/math.ts';
import type { DifficultyProfile, Outcome } from '../core/types.ts';
import { PlayerModel } from './PlayerModel.ts';

/** Success rate the controller steers toward. Roughly "win three of four": the flow channel. */
export const TARGET_SUCCESS = 0.78;

export function profileFor(d: number, assist: number): DifficultyProfile {
  const k = clamp(d / 1.15, 0, 1);
  return {
    d,
    speedScale: 0.9 + 0.3 * k,
    gapSeconds: lerp(2.5, 1.05, k),
    maxTier: d < 0.2 ? 1 : d < 0.45 ? 2 : d < 0.72 ? 3 : 4,
    hostileFire: lerp(0.8, 1.4, k),
    forgiveness: lerp(0.09, 0, clamp(d / 0.6, 0, 1)) + assist * 0.05,
    telegraph: lerp(1.15, 0.55, k),
    bossHp: lerp(0.8, 1.25, k),
    pickupBias: 1 + assist * 0.8,
  };
}

/**
 * Dynamic difficulty adjustment as a closed loop.
 *
 * d = baseline(round) + offset + pull toward measured skill
 *
 * - The baseline is the authored curve, so the game always progresses.
 * - `offset` is driven by a PID loop on (observed success rate - target), with a dead
 *   band so it does not hunt, a per step cap so it is never visible, and slow mean
 *   reversion so one bad minute is not remembered forever.
 * - Mercy and challenge nudges respond to the frustration and boredom indexes.
 * - Output is slew limited. Players should never feel a lurch.
 *
 * It can be switched off ("fixed tide") so the player stays in control of the contract.
 */
export class DynamicDifficulty {
  enabled = true;
  readonly model = new PlayerModel();
  offset = 0;
  d = 0.12;
  profile: DifficultyProfile = profileFor(0.12, 0);
  private readonly pid = new PID(0.55, 0.05, 0.12, 0.6);
  private mercy = 0;

  static baseline(round: number): number {
    return clamp(0.1 + 0.075 * Math.pow(Math.max(0, round), 0.92), 0.05, 1);
  }

  reset(prior?: { theta: number; sigma: number }): void {
    this.model.reset(prior);
    this.offset = 0;
    this.mercy = 0;
    this.pid.reset();
    const start = prior ? clamp(0.12 + (prior.theta - 0.2) * 0.4, 0.06, 0.5) : 0.12;
    this.d = start;
    this.profile = profileFor(this.d, 0);
  }

  onEncounter(outcome: Outcome, patternDifficulty: number): void {
    this.model.onEncounter(outcome, patternDifficulty);
    if (!this.enabled || this.model.encounters < 3) return;
    const err = this.model.pSuccess.value - TARGET_SUCCESS;
    if (Math.abs(err) < 0.04) return;
    const delta = clamp(this.pid.step(err), -0.04, 0.04);
    this.offset = clamp(this.offset + delta, -0.35, 0.25);
  }

  onDamage(): void {
    this.model.onDamage();
    if (!this.enabled) return;
    this.offset = clamp(this.offset - 0.05, -0.35, 0.25);
    this.mercy = 6;
  }

  update(dt: number, round: number, lives: number, lane: number, laneVel: number): void {
    this.model.tick(dt, lane, laneVel, lives);
    const base = DynamicDifficulty.baseline(round);
    const frustration = this.model.frustration();
    const boredom = this.model.boredom();

    let target = base;
    let assist = 0;
    if (this.enabled) {
      this.offset *= Math.exp(-dt / 90);
      if (frustration > 0.65) this.offset = clamp(this.offset - 0.03 * dt, -0.35, 0.25);
      if (boredom > 0.65) this.offset = clamp(this.offset + 0.02 * dt, -0.35, 0.25);
      if (this.mercy > 0) this.mercy -= dt;
      target = base + this.offset + 0.25 * (this.model.theta - base);
      assist = clamp(frustration - 0.3, 0, 1) + (this.mercy > 0 ? 0.3 : 0);
    }
    target = clamp(target, 0.02, 1.15);
    this.d = moveToward(this.d, target, 0.03 * dt);
    this.profile = profileFor(this.d, assist);
  }

  /** Short human label for the end screen and pause menu. */
  tideLabel(): string {
    if (!this.enabled) return 'fixed';
    if (this.offset < -0.12) return 'calm';
    if (this.offset < 0.08) return 'steady';
    if (this.offset < 0.18) return 'rising';
    return 'high';
  }
}
