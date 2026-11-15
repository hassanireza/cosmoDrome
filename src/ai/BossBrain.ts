import { clamp } from '../core/math.ts';
import type { Rng } from '../core/rng.ts';
import type { BossAttack } from '../core/types.ts';
import { Exp3, RegretMatcher } from './bandits.ts';
import { BOSS_LANES, bossLaneValue, laneToBossIndex } from './PlayerModel.ts';

export const ATTACKS: BossAttack[] = ['aimed', 'spread', 'sweep', 'pincer'];

export interface VolleyPlan {
  attack: BossAttack;
  arm: number;
  armP: number;
  armsAllowed: number;
  center: number;
  /** Boss lane indexes that will be struck. */
  lanes: number[];
  /** Seconds after the fire moment for each lane, so sweeps ripple. */
  delays: number[];
  /** How long the strike is shown before it lands. A Stackelberg commitment. */
  telegraph: number;
}

export interface PlanContext {
  playerLane: number;
  telegraph: number;
  phase: 1 | 2 | 3;
  hostile: number;
  lateral: number;
}

const kernel = (a: number, j: number): number => {
  const d = Math.abs(a - j);
  return d === 0 ? 1 : d === 1 ? 0.5 : 0;
};

/**
 * Boss decision making: three game theory tools working together.
 *
 * 1. Matching pennies via regret matching. Where to strike is a zero sum guessing game:
 *    the boss wins when it covers the lane the player picks. Regret matching learns a
 *    best response to the player's real habits, while the exploration term (trembling
 *    hand) and the no-regret guarantee keep the boss from being trivially exploitable.
 * 2. Exp3 chooses *which attack shape* to use. It is an adversarial bandit, so it makes
 *    no assumption that the player is stationary. Its reward is engagement (a near miss
 *    is best) rather than damage, so the boss is tuned to make good moments, not to win.
 * 3. Stackelberg commitment. The boss announces its strike before it lands, so the
 *    player gets to best respond. A fairness check guarantees a reachable safe lane.
 */
export class BossBrain {
  readonly rm = new RegretMatcher(BOSS_LANES);
  readonly exp3 = new Exp3(ATTACKS.length, 0.18);
  samples = 0;
  private readonly rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  /** Feed the player's current lane. Called a few times per second during a fight. */
  observe(lane: number, weight = 1): void {
    const j = laneToBossIndex(lane);
    const u = new Float64Array(BOSS_LANES);
    for (let a = 0; a < BOSS_LANES; a++) u[a] = kernel(a, j);
    this.rm.update(u, weight);
    this.samples++;
  }

  private allowedArms(phase: 1 | 2 | 3): number[] {
    return phase === 1 ? [0, 1] : phase === 2 ? [0, 1, 2] : [0, 1, 2, 3];
  }

  static cover(attack: BossAttack, center: number, phase: 1 | 2 | 3): { lanes: number[]; delays: number[] } {
    let lanes: number[] = [];
    let delays: number[] = [];
    switch (attack) {
      case 'aimed':
        lanes = phase >= 3 ? [center - 1, center, center + 1] : [center];
        break;
      case 'spread':
        lanes = [center - 2, center, center + 2];
        break;
      case 'sweep': {
        const dir = center < 4 ? 1 : -1;
        lanes = [center, center + dir, center + 2 * dir, center + 3 * dir];
        delays = lanes.map((_, i) => i * 0.14);
        break;
      }
      case 'pincer':
        lanes = [0, 1, 7, 8];
        if (phase >= 3) lanes.push(center);
        break;
    }
    const seen = new Set<number>();
    const outLanes: number[] = [];
    const outDelays: number[] = [];
    lanes.forEach((l, i) => {
      if (l < 0 || l >= BOSS_LANES || seen.has(l)) return;
      seen.add(l);
      outLanes.push(l);
      outDelays.push(delays[i] ?? 0);
    });
    return { lanes: outLanes, delays: outDelays };
  }

  /** True when at least three lanes are free and one of them can be reached in time. */
  static isFair(lanes: number[], playerLane: number, telegraph: number, lateral: number): boolean {
    const hit = new Set(lanes);
    let free = 0;
    let reachable = false;
    const range = lateral * telegraph * 0.85 + 0.12;
    for (let i = 0; i < BOSS_LANES; i++) {
      if (hit.has(i)) continue;
      free++;
      if (Math.abs(bossLaneValue(i) - playerLane) <= range) reachable = true;
    }
    return free >= 3 && reachable;
  }

  plan(ctx: PlanContext): VolleyPlan {
    const allowed = this.allowedArms(ctx.phase);
    const { arm, p } = this.exp3.sample(allowed, this.rng);
    const attack = ATTACKS[arm];
    const center = this.rm.sample(this.rng, 0.12);
    let { lanes, delays } = BossBrain.cover(attack, center, ctx.phase);

    // Fairness: peel off the lane nearest the player until a safe, reachable lane exists.
    const pIdx = laneToBossIndex(ctx.playerLane);
    while (lanes.length > 1 && !BossBrain.isFair(lanes, ctx.playerLane, ctx.telegraph, ctx.lateral)) {
      let drop = 0;
      let best = Infinity;
      lanes.forEach((l, i) => {
        const dist = Math.abs(l - pIdx);
        if (dist < best) {
          best = dist;
          drop = i;
        }
      });
      lanes = lanes.filter((_, i) => i !== drop);
      delays = delays.filter((_, i) => i !== drop);
    }
    return { attack, arm, armP: p, armsAllowed: allowed.length, center, lanes, delays, telegraph: ctx.telegraph };
  }

  /** Engagement reward: a near miss is the best outcome, a clean dodge the dullest. */
  resolve(plan: VolleyPlan, outcome: 'hit' | 'near' | 'dodge'): void {
    const reward = outcome === 'near' ? 1 : outcome === 'hit' ? 0.7 : 0.3;
    this.exp3.update(plan.arm, clamp(reward, 0, 1), plan.armP, plan.armsAllowed);
  }
}
