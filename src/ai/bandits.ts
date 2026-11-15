import type { Rng } from '../core/rng.ts';

/** UCB1 (Auer et al.): optimism under uncertainty for stochastic arms. */
export class UCB1 {
  readonly counts: Float64Array;
  readonly values: Float64Array;
  private total = 0;
  private readonly c: number;

  constructor(arms: number, c = 0.8) {
    this.counts = new Float64Array(arms);
    this.values = new Float64Array(arms);
    this.c = c;
  }

  select(allowed: readonly number[], rng: Rng): number {
    let best = allowed[0];
    let bestScore = -Infinity;
    for (const i of allowed) {
      const n = this.counts[i];
      const score = n === 0 ? 10 + rng.next() : this.values[i] + this.c * Math.sqrt(Math.log(Math.max(2, this.total)) / n);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  update(arm: number, reward: number): void {
    this.counts[arm] += 1;
    this.total += 1;
    this.values[arm] += (reward - this.values[arm]) / this.counts[arm];
  }
}

/** Exp3 (Auer et al. 2002): adversarial bandit, no stationarity assumption. */
export class Exp3 {
  readonly weights: Float64Array;
  private readonly gamma: number;

  constructor(arms: number, gamma = 0.15) {
    this.weights = new Float64Array(arms).fill(1);
    this.gamma = gamma;
  }

  probabilities(allowed: readonly number[]): Float64Array {
    const k = allowed.length;
    const p = new Float64Array(this.weights.length);
    let sum = 0;
    for (const i of allowed) sum += this.weights[i];
    for (const i of allowed) p[i] = (1 - this.gamma) * (this.weights[i] / sum) + this.gamma / k;
    return p;
  }

  sample(allowed: readonly number[], rng: Rng): { arm: number; p: number } {
    const p = this.probabilities(allowed);
    let r = rng.next();
    for (const i of allowed) {
      r -= p[i];
      if (r <= 0) return { arm: i, p: p[i] };
    }
    const last = allowed[allowed.length - 1];
    return { arm: last, p: p[last] };
  }

  /** Reward must be in [0, 1]. `p` is the probability the arm was drawn with. */
  update(arm: number, reward: number, p: number, armsAllowed: number): void {
    const est = reward / Math.max(p, 1e-6);
    this.weights[arm] *= Math.exp((this.gamma * est) / armsAllowed);
    // keep weights numerically tame
    let max = 0;
    for (const w of this.weights) if (w > max) max = w;
    if (max > 1e6) for (let i = 0; i < this.weights.length; i++) this.weights[i] /= max;
  }
}

/**
 * Regret matching+ (Hart and Mas-Colell; Tammelin's floor). The average strategy
 * converges to a Nash equilibrium in zero sum games; the current strategy is a
 * no-regret response to whatever the opponent actually does.
 */
export class RegretMatcher {
  readonly n: number;
  readonly regret: Float64Array;
  readonly strategySum: Float64Array;

  constructor(n: number) {
    this.n = n;
    this.regret = new Float64Array(n);
    this.strategySum = new Float64Array(n);
  }

  /** Current mixed strategy, optionally blended with uniform (trembling hand). */
  strategy(explore = 0): Float64Array {
    let pos = 0;
    for (let i = 0; i < this.n; i++) pos += this.regret[i];
    const out = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const base = pos > 1e-9 ? this.regret[i] / pos : 1 / this.n;
      out[i] = (1 - explore) * base + explore / this.n;
    }
    return out;
  }

  /**
   * Full information update. `utilities[a]` is what action `a` would have earned this
   * round. Regret is measured against the value of the strategy actually played.
   */
  update(utilities: ArrayLike<number>, weight = 1): void {
    const s = this.strategy(0);
    let value = 0;
    for (let i = 0; i < this.n; i++) value += s[i] * utilities[i];
    for (let i = 0; i < this.n; i++) {
      this.regret[i] = Math.max(0, this.regret[i] + weight * (utilities[i] - value));
      this.strategySum[i] += s[i];
    }
  }

  averageStrategy(): Float64Array {
    let sum = 0;
    for (const v of this.strategySum) sum += v;
    const out = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) out[i] = sum > 0 ? this.strategySum[i] / sum : 1 / this.n;
    return out;
  }

  sample(rng: Rng, explore = 0): number {
    const s = this.strategy(explore);
    let r = rng.next();
    for (let i = 0; i < this.n; i++) {
      r -= s[i];
      if (r <= 0) return i;
    }
    return this.n - 1;
  }
}
