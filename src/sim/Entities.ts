import type { Kind, Outcome, WeaponKey } from '../core/types.ts';

export class Entity {
  active = false;
  kind: Kind = 'shard';
  z = 0;
  zPrev = 0;
  lane = 0;
  baseLane = 0;
  phase = 0;
  hp = 1;
  maxHp = 1;
  flash = 0;
  resolved = false;
  minClear = 9;
  /** Pattern record id, or -1 for loose spawns such as boss adds and drops. */
  pattern = -1;
  born = 0;

  reset(): void {
    this.active = false;
    this.resolved = false;
    this.flash = 0;
    this.minClear = 9;
    this.pattern = -1;
  }
}

export class Bolt {
  active = false;
  lane = 0;
  z = 0;
  speed = 0;
  weapon: WeaponKey = 'pulse';
  target: Entity | null = null;
  life = 0;
  hit = false;
}

export class EnemyBolt {
  active = false;
  lane = 0;
  z = 0;
  speed = 0;
  volley = -1;
  /** Seconds until the bolt exists. Lets sweeps ripple. */
  delay = 0;
  resolved = false;
}

export class PatternRecord {
  active = false;
  index = 0;
  difficulty = 0;
  remaining = 0;
  worst: Outcome | null = null;

  note(outcome: Outcome): void {
    const rank: Record<Outcome, number> = { clean: 0, destroyed: 1, near: 2, hit: 3 };
    if (this.worst === null || rank[outcome] > rank[this.worst]) this.worst = outcome;
  }
}
