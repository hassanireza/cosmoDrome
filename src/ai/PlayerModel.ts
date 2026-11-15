import { Ewma, clamp, sigmoid } from '../core/math.ts';
import type { Outcome } from '../core/types.ts';

export const BOSS_LANES = 9;
export const bossLaneValue = (i: number): number => -0.8 + i * 0.2;
export const laneToBossIndex = (lane: number): number => Math.max(0, Math.min(BOSS_LANES - 1, Math.round((lane + 0.8) / 0.2)));

export interface SkillPrior {
  theta: number;
  sigma: number;
}

const OUTCOME_SCORE: Record<Outcome, number> = { hit: 0, clean: 0.85, near: 1, destroyed: 0.95 };

/**
 * Telemetry and skill estimate for the person holding the phone.
 *
 * Skill is an Elo style rating (theta) with an uncertainty (sigma), so a new player
 * is learned quickly and a known player is not whipsawed by one bad pattern.
 * Everything else is a cheap rolling statistic read by the difficulty and boss engines.
 */
export class PlayerModel {
  theta = 0.2;
  sigma = 0.35;
  readonly pSuccess = new Ewma(0.18, 0.8);
  readonly nearRate = new Ewma(0.12, 0.15);
  readonly accuracy = new Ewma(0.02, 0.5);
  jitter = 0;
  hitsRecent = 0;
  timeSinceHit = 0;
  encounters = 0;
  lowLives = false;
  /** Decayed lane occupancy over the boss grid. Dirichlet smoothed on read. */
  readonly laneHist = new Float64Array(BOSS_LANES);
  private lastVelSign = 0;
  private reversalClock = 0;

  reset(prior?: SkillPrior): void {
    this.theta = prior ? clamp(prior.theta, 0, 1.4) : 0.2;
    this.sigma = prior ? clamp(prior.sigma + 0.08, 0.1, 0.4) : 0.35;
    this.pSuccess.value = 0.8;
    this.nearRate.value = 0.15;
    this.accuracy.value = 0.5;
    this.jitter = 0;
    this.hitsRecent = 0;
    this.timeSinceHit = 0;
    this.encounters = 0;
    this.lowLives = false;
    this.laneHist.fill(0);
    this.lastVelSign = 0;
    this.reversalClock = 0;
  }

  onEncounter(outcome: Outcome, difficulty: number): void {
    this.encounters++;
    const score = OUTCOME_SCORE[outcome];
    const expected = sigmoid(4 * (this.theta - difficulty));
    const k = 0.1 + 0.35 * this.sigma;
    this.theta = clamp(this.theta + k * (score - expected) * 0.6, 0, 1.4);
    this.sigma = Math.max(0.06, this.sigma * 0.965);
    this.pSuccess.push(outcome === 'hit' ? 0 : 1);
    this.nearRate.push(outcome === 'near' ? 1 : 0);
  }

  onShot(hit: boolean): void {
    this.accuracy.push(hit ? 1 : 0);
  }

  onDamage(): void {
    this.hitsRecent += 1;
    this.timeSinceHit = 0;
  }

  tick(dt: number, lane: number, laneVel: number, lives: number): void {
    this.timeSinceHit += dt;
    this.hitsRecent = Math.max(0, this.hitsRecent - dt * 0.08);
    this.lowLives = lives <= 1;

    for (let i = 0; i < BOSS_LANES; i++) this.laneHist[i] *= Math.exp(-dt * 0.35);
    this.laneHist[laneToBossIndex(lane)] += dt;

    // Panic is rapid direction reversals at speed.
    const s = Math.abs(laneVel) > 0.5 ? Math.sign(laneVel) : 0;
    this.reversalClock += dt;
    if (s !== 0 && this.lastVelSign !== 0 && s !== this.lastVelSign) this.jitter = Math.min(1, this.jitter + 0.25);
    if (s !== 0) this.lastVelSign = s;
    this.jitter = Math.max(0, this.jitter - dt * 0.35);
  }

  /** Smoothed probability the player will be in each boss lane. */
  laneDistribution(): Float64Array {
    const out = new Float64Array(BOSS_LANES);
    let sum = 0;
    for (let i = 0; i < BOSS_LANES; i++) {
      out[i] = this.laneHist[i] + 0.15;
      sum += out[i];
    }
    for (let i = 0; i < BOSS_LANES; i++) out[i] /= sum;
    return out;
  }

  frustration(): number {
    const f =
      0.5 * Math.min(1, this.hitsRecent / 2) +
      0.35 * clamp((0.72 - this.pSuccess.value) / 0.3, 0, 1) +
      0.15 * clamp(this.jitter, 0, 1) +
      (this.lowLives ? 0.15 : 0);
    return clamp(f, 0, 1);
  }

  boredom(): number {
    if (this.encounters < 6) return 0;
    const b =
      0.5 * clamp((this.pSuccess.value - 0.9) / 0.1, 0, 1) +
      0.3 * clamp(this.timeSinceHit / 45, 0, 1) +
      0.2 * clamp(1 - this.nearRate.value / 0.25, 0, 1);
    return clamp(b, 0, 1);
  }
}
