import type { Rng } from '../core/rng.ts';
import type { DirectorPhase, Outcome, PatternId, Spawn } from '../core/types.ts';
import { WORLD } from '../core/config.ts';
import { UCB1 } from './bandits.ts';
import { PATTERNS } from './Patterns.ts';
import type { PatternDef } from './Patterns.ts';
import { freshReach, propagate } from './Feasibility.ts';
import type { Block, FeasibilityParams, Row } from './Feasibility.ts';

export interface PlannedPattern {
  id: PatternId;
  index: number;
  spawns: Spawn[];
  /** Distance from origin to the last spawn, in metres. */
  length: number;
  /** Rating handed to the Elo update when this pattern resolves. */
  difficulty: number;
  slack: number;
}

export interface PlanRequest {
  d: number;
  speed: number;
  maxTier: number;
  phase: DirectorPhase;
  needsVeil: boolean;
  /** Distance coordinate where the pattern starts. */
  originZ: number;
}

const OUTCOME_REWARD: Record<Outcome, number> = { near: 1, destroyed: 0.9, clean: 0.7, hit: 0.2 };

/**
 * Chooses and validates the next pattern.
 *
 * Selection is a UCB1 bandit over pattern archetypes whose reward is "did this make a
 * good moment" (near misses and kills pay more than a bland pass or a hit), filtered
 * by the director's phase and the difficulty tier. Every candidate is then proven
 * solvable by the feasibility DP, which also carries the reachable lane set from one
 * pattern into the next, so the whole stream of patterns is solvable end to end.
 */
export class Spawner {
  private readonly ucb = new UCB1(PATTERNS.length, 0.7);
  private reach = freshReach();
  private hopZ = -Infinity;
  private cursorZ = 0;
  private readonly recent: number[] = [];
  private readonly rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  reset(startZ = 0): void {
    this.reach = freshReach();
    this.hopZ = -Infinity;
    this.cursorZ = startZ;
    this.recent.length = 0;
  }

  report(index: number, outcome: Outcome): void {
    this.ucb.update(index, OUTCOME_REWARD[outcome]);
  }

  private candidates(req: PlanRequest): number[] {
    const out: number[] = [];
    const lo = req.phase === 'peak' ? Math.max(1, req.maxTier - 1) : req.phase === 'build' ? 1 : 0;
    const hi = req.phase === 'relax' ? Math.min(1, req.maxTier) : req.phase === 'fade' ? Math.min(2, req.maxTier) : req.maxTier;
    PATTERNS.forEach((p, i) => {
      if (p.tier >= lo && p.tier <= hi) out.push(i);
    });
    if (out.length === 0) out.push(1);
    return out;
  }

  static blocksFor(spawns: Spawn[], originZ: number): Row[] {
    const rows = new Map<number, Block[]>();
    for (const s of spawns) {
      const key = Math.round((originZ + s.dz) * 2) / 2;
      const list = rows.get(key) ?? [];
      list.push({ kind: s.kind, lane: s.lane, sway: s.kind === 'sentry' ? 0.34 : 0 });
      rows.set(key, list);
    }
    return [...rows.entries()].map(([z, blocks]) => ({ z, blocks }));
  }

  plan(req: PlanRequest): PlannedPattern {
    const params: FeasibilityParams = {
      speed: req.speed * 1.15,
      lateral: WORLD.LATERAL_MAX * 0.8,
      playerHalf: WORLD.PLAYER_HALF,
      margin: req.d < 0.5 ? 0.05 : 0.03,
      hopCooldown: WORLD.HOP_COOLDOWN,
    };
    const minSlack = req.d < 0.5 ? 3 : req.d < 0.8 ? 2 : 1;
    const allowed = this.candidates(req);
    const ctx = { rng: this.rng, d: req.d, speed: req.speed, needsVeil: req.needsVeil };

    // Relief phases lean on breathers so rest actually happens.
    const preferBreather = (req.phase === 'relax' && this.rng.chance(0.6)) || (req.needsVeil && req.phase !== 'peak' && this.rng.chance(0.5));

    for (let attempt = 0; attempt < 6; attempt++) {
      let idx: number;
      if (preferBreather && attempt === 0) idx = PATTERNS.findIndex((p) => p.id === 'breather');
      else {
        const fresh = allowed.filter((i) => !this.recent.includes(i));
        idx = this.ucb.select(fresh.length ? fresh : allowed, this.rng);
      }
      const def: PatternDef = PATTERNS[idx];
      const spawns = def.build(ctx).sort((a, b) => a.dz - b.dz);
      const rows = Spawner.blocksFor(spawns, req.originZ);
      const res = propagate(this.reach, rows, this.cursorZ, params, this.hopZ);
      if (res.ok && res.slack >= minSlack) return this.commit(idx, def, spawns, req, res.reach, res.hopZ, res.slack);
    }

    // Guaranteed fallback: a breather has nothing to hit.
    const idx = PATTERNS.findIndex((p) => p.id === 'breather');
    const def = PATTERNS[idx];
    const spawns = def.build(ctx).sort((a, b) => a.dz - b.dz);
    return this.commit(idx, def, spawns, req, freshReach(), -Infinity, 21);
  }

  private commit(idx: number, def: PatternDef, spawns: Spawn[], req: PlanRequest, reach: Uint8Array, hopZ: number, slack: number): PlannedPattern {
    this.reach = reach;
    this.hopZ = hopZ;
    const length = spawns.length ? spawns[spawns.length - 1].dz : 0;
    this.cursorZ = req.originZ + length;
    this.recent.push(idx);
    if (this.recent.length > 2) this.recent.shift();
    return { id: def.id, index: idx, spawns, length, difficulty: def.difficulty + 0.3 * req.d, slack };
  }
}
