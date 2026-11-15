import type { Kind } from '../core/types.ts';
import { KINDS } from '../core/config.ts';

/**
 * Fairness oracle. Patterns are validated by forward dynamic programming over a
 * lane grid: if no reachable lane survives a row, the pattern is rejected before it
 * is ever spawned. This is backward induction in spirit (Zermelo): the designer
 * proves a safe line exists instead of hoping the player finds one.
 */

export const GRID = 21;
export const CELL_STEP = 2 / (GRID - 1);

export const cellLane = (i: number): number => -1 + i * CELL_STEP;

export interface Block {
  kind: Kind;
  lane: number;
  sway: number;
}

export interface Row {
  z: number;
  blocks: Block[];
}

export interface FeasibilityParams {
  /** Forward speed in m/s. Use a pessimistic (high) value. */
  speed: number;
  /** Lateral lanes per second. Use a pessimistic (low) value. */
  lateral: number;
  playerHalf: number;
  margin: number;
  hopCooldown: number;
}

export interface FeasibilityResult {
  ok: boolean;
  /** Smallest number of safe cells at any row. Larger means a more forgiving pattern. */
  slack: number;
  reach: Uint8Array;
  hopZ: number;
}

export function freshReach(): Uint8Array {
  return new Uint8Array(GRID).fill(1);
}

function dilate(src: Uint8Array, steps: number): Uint8Array {
  if (steps <= 0) return src.slice();
  const out = new Uint8Array(GRID);
  for (let i = 0; i < GRID; i++) {
    if (!src[i]) continue;
    const lo = Math.max(0, i - steps);
    const hi = Math.min(GRID - 1, i + steps);
    for (let j = lo; j <= hi; j++) out[j] = 1;
  }
  return out;
}

export function propagate(
  seed: Uint8Array,
  rows: Row[],
  startZ: number,
  p: FeasibilityParams,
  hopZ = -Infinity,
): FeasibilityResult {
  let reach: Uint8Array = seed.slice();
  let prevZ = startZ;
  let slack = GRID;
  let lastHop = hopZ;
  const sorted = rows.slice().sort((a, b) => a.z - b.z);

  for (const row of sorted) {
    const dt = Math.max(0, row.z - prevZ) / p.speed;
    reach = dilate(reach, Math.floor((p.lateral * dt) / CELL_STEP));
    prevZ = row.z;

    const canHop = row.z - lastHop >= p.speed * (p.hopCooldown + 0.15);
    let usedHop = false;
    let count = 0;
    const blocked = new Uint8Array(GRID);
    for (const b of row.blocks) {
      const spec = KINDS[b.kind];
      if (b.kind === 'mote' || b.kind === 'veil') continue;
      if (b.kind === 'plinth') {
        if (canHop) {
          usedHop = true;
          continue;
        }
      }
      const half = spec.halfW + p.playerHalf + p.margin + b.sway;
      for (let i = 0; i < GRID; i++) {
        if (Math.abs(cellLane(i) - b.lane) < half) blocked[i] = 1;
      }
    }
    if (usedHop) lastHop = row.z;
    for (let i = 0; i < GRID; i++) {
      if (blocked[i]) reach[i] = 0;
      if (reach[i]) count++;
    }
    slack = Math.min(slack, count);
    if (count === 0) return { ok: false, slack: 0, reach, hopZ: lastHop };
  }
  return { ok: true, slack, reach, hopZ: lastHop };
}

/** A* style helper for the attract mode autopilot: pick the lane with the best clearance. */
export function bestLane(current: number, blocks: Block[], lookahead: number): number {
  let best = current;
  let bestScore = -Infinity;
  for (let i = 0; i < GRID; i++) {
    const lane = cellLane(i);
    let clearance = 1;
    for (const b of blocks) {
      if (b.kind === 'mote' || b.kind === 'veil') continue;
      const half = KINDS[b.kind].halfW + b.sway + 0.12;
      clearance = Math.min(clearance, Math.abs(lane - b.lane) - half);
    }
    const score = Math.min(clearance, 0.6) * lookahead - Math.abs(lane - current) * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = lane;
    }
  }
  return best;
}
