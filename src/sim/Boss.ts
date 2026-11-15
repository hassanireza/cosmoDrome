import type { BossSpec } from '../core/config.ts';
import { WORLD } from '../core/config.ts';
import type { VolleyPlan } from '../ai/BossBrain.ts';

export type BossPhaseState = 'idle' | 'telegraph';

export class Boss {
  readonly spec: BossSpec;
  hp: number;
  readonly maxHp: number;
  lane = 0;
  z = 190;
  entry = WORLD.BOSS_ENTRY;
  t = 0;
  flash = 0;
  phaseNo: 1 | 2 | 3 = 1;
  state: BossPhaseState = 'idle';
  timer = 1.4;
  sampleT = 0.4;
  addsT = 5;
  dartTarget = 0;
  plan: VolleyPlan | null = null;
  defeated = false;

  constructor(spec: BossSpec, hp: number) {
    this.spec = spec;
    this.hp = hp;
    this.maxHp = hp;
  }
}
