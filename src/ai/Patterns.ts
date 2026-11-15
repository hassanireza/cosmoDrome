import type { Rng } from '../core/rng.ts';
import type { Kind, PatternId, Spawn } from '../core/types.ts';

export interface PatternContext {
  rng: Rng;
  d: number;
  speed: number;
  needsVeil: boolean;
}

export interface PatternDef {
  id: PatternId;
  /** 0 breather, 1 gentle, 2 moderate, 3 hard, 4 expert. */
  tier: number;
  /** Rating on the same scale as player skill, used by the Elo update. */
  difficulty: number;
  build(ctx: PatternContext): Spawn[];
}

const S = (kind: Kind, lane: number, dz: number): Spawn => ({ kind, lane, dz });
const clampLane = (l: number): number => Math.max(-0.92, Math.min(0.92, l));

const scatter: PatternDef = {
  id: 'scatter', tier: 1, difficulty: 0.12,
  build({ rng, d }) {
    const n = 2 + Math.floor(d * 3) + rng.int(0, 1);
    const out: Spawn[] = [];
    for (let i = 0; i < n; i++) {
      const r = rng.next();
      const kind: Kind = r < 0.6 ? 'shard' : r < 0.85 ? 'plinth' : d > 0.35 ? 'ruin' : 'shard';
      out.push(S(kind, clampLane(rng.range(-0.85, 0.85)), i * rng.range(22, 32)));
    }
    return out;
  },
};

const gate: PatternDef = {
  id: 'gate', tier: 1, difficulty: 0.25,
  build({ rng, d }) {
    const cols = [-0.8, -0.4, 0, 0.4, 0.8];
    const wide = d < 0.5;
    const g = rng.int(0, wide ? 3 : 4);
    const gaps = new Set<number>(wide ? [g, g + 1] : [g]);
    const rows = d > 0.6 ? 2 : 1;
    const out: Spawn[] = [];
    for (let r = 0; r < rows; r++) {
      const shift = r === 1 ? (g < 2 ? 1 : -1) : 0;
      cols.forEach((c, i) => {
        const gapIdx = new Set<number>([...gaps].map((x) => Math.max(0, Math.min(4, x + shift))));
        if (!gapIdx.has(i)) out.push(S('shard', c, r * 26));
      });
    }
    return out;
  },
};

const slalom: PatternDef = {
  id: 'slalom', tier: 2, difficulty: 0.4,
  build({ rng, d }) {
    const rows = 4 + Math.floor(d * 3);
    let side = rng.sign();
    const out: Spawn[] = [];
    for (let i = 0; i < rows; i++) {
      out.push(S('shard', side * 0.42, i * 19));
      out.push(S('shard', side * 0.86, i * 19));
      side = (side * -1) as 1 | -1;
    }
    return out;
  },
};

const hopwall: PatternDef = {
  id: 'hopwall', tier: 2, difficulty: 0.5,
  build({ rng, speed }) {
    const walls = rng.int(2, 3);
    const spacing = Math.max(28, speed * 1.25);
    const out: Spawn[] = [];
    for (let w = 0; w < walls; w++) {
      for (let l = -0.9; l <= 0.91; l += 0.3) out.push(S('plinth', l, w * spacing));
      out.push(S('mote', 0, w * spacing + spacing * 0.5));
    }
    return out;
  },
};

const sentries: PatternDef = {
  id: 'sentries', tier: 2, difficulty: 0.55,
  build({ rng }) {
    const out: Spawn[] = [];
    const s = rng.sign();
    out.push(S('sentry', -0.5 * s, 0));
    out.push(S('sentry', 0.5 * s, 18));
    out.push(S('shard', 0, 36));
    out.push(S('sentry', -0.4 * s, 54));
    return out;
  },
};

const comb: PatternDef = {
  id: 'comb', tier: 3, difficulty: 0.66,
  build({ rng }) {
    const rows = 3;
    let c = rng.sign() * 0.45;
    const out: Spawn[] = [];
    for (let r = 0; r < rows; r++) {
      const left = c - 0.78;
      const right = c + 0.78;
      if (left >= -1) out.push(S('ruin', left, r * 24));
      if (right <= 1) out.push(S('ruin', right, r * 24));
      c = -c;
    }
    return out;
  },
};

const funnel: PatternDef = {
  id: 'funnel', tier: 3, difficulty: 0.75,
  build({ rng }) {
    const centre = rng.range(-0.25, 0.25);
    const out: Spawn[] = [];
    for (let i = 0; i < 4; i++) {
      const half = 0.95 - 0.15 * i;
      out.push(S('shard', clampLane(centre - half), i * 16));
      out.push(S('shard', clampLane(centre + half), i * 16));
    }
    return out;
  },
};

const zipper: PatternDef = {
  id: 'zipper', tier: 4, difficulty: 0.9,
  build({ rng }) {
    let side = rng.sign();
    const out: Spawn[] = [];
    for (let i = 0; i < 5; i++) {
      out.push(S('sentry', side * 0.55, i * 15));
      out.push(S('shard', side * 0.92, i * 15));
      side = (side * -1) as 1 | -1;
    }
    return out;
  },
};

const breather: PatternDef = {
  id: 'breather', tier: 0, difficulty: 0.02,
  build({ rng, needsVeil }) {
    const out: Spawn[] = [];
    const phase = rng.range(0, 6.28);
    for (let i = 0; i < 6; i++) out.push(S('mote', clampLane(Math.sin(phase + i * 0.9) * 0.7), i * 14));
    if (needsVeil) out.push(S('veil', clampLane(Math.sin(phase + 6 * 0.9) * 0.7), 6 * 14));
    return out;
  },
};

export const PATTERNS: PatternDef[] = [scatter, gate, slalom, hopwall, sentries, comb, funnel, zipper, breather];
export const PATTERN_INDEX: Record<PatternId, number> = Object.fromEntries(PATTERNS.map((p, i) => [p.id, i])) as Record<PatternId, number>;
