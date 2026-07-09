import type { WeaponKey } from '../types';
import type { Obstacle } from './Obstacle';

/** A player-fired projectile. Missiles carry a soft-homing target reference. */
export class Bolt {
  active = false;
  lane = 0;
  z = 0;
  vz = 0;
  weaponKey: WeaponKey = 'laser';
  target: Obstacle | null = null;
  life = 3;
}

/** An enemy (boss) projectile traveling toward the player. */
export class EnemyBolt {
  active = false;
  lane = 0;
  z = 0;
  vz = 0;
  life = 4;
  color = '#ff4d5e';
}
