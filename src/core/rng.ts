/** Seeded randomness. Deterministic runs make tests and bug reports reproducible. */

export interface Rng {
  next(): number;
  range(lo: number, hi: number): number;
  int(lo: number, hiInclusive: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  sign(): 1 | -1;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

/** Integer hash to [0, 1). Stateless, so scenery can be a pure function of a cell index. */
export function hash1(i: number, seed = 0): number {
  let h = (i | 0) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i, seed) * 2 - 1;
  const b = hash1(i + 1, seed) * 2 - 1;
  return a + (b - a) * u;
}

export function fbm1(x: number, seed = 0, octaves = 3): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise1(x * f, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** Daily seed, same for everyone on a given UTC day. */
export function dailySeed(date = new Date()): number {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}
