import type { BossDef } from '../types';
import { CFG } from '../config';

/** A live boss encounter instance, built from a BossDef archetype. */
export class Boss {
  def: BossDef;
  hp: number;
  maxHp: number;
  lane = 0;
  z: number;
  entryTimer = CFG.BOSS_ENTRY_TIME;
  phase = 0;
  fireTimer = 1.0;
  podLeftHp: number;
  podRightHp: number;
  addsSpawned = 0;
  defeated = false;
  flashTimer = 0;
  screenX = CFG.W / 2;
  screenY = CFG.HORIZON_Y + 40;
  scale = 0.3;
  dartTarget = 0;

  constructor(def: BossDef, hp: number) {
    this.def = def;
    this.hp = hp;
    this.maxHp = hp;
    this.z = CFG.Z_SPAWN * 0.6;
    this.podLeftHp = Math.ceil(hp * 0.35);
    this.podRightHp = Math.ceil(hp * 0.35);
  }
}
