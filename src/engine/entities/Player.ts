import type { WeaponKey } from '../types';
import { CFG } from '../config';

/** The player's starfighter: lane position, steering velocity, weapon heat, shields. */
export class Player {
  lane = 0;
  vel = 0;
  bank = 0;
  invuln = 0;
  boosting = 0;
  hopCooldown = 0;
  lives: number = CFG.START_LIVES;
  weapon: WeaponKey = 'laser';
  heat = 0;
  fireTimer = 0;

  reset(startWeapon: WeaponKey): void {
    this.lane = 0;
    this.vel = 0;
    this.bank = 0;
    this.invuln = 0;
    this.boosting = 0;
    this.hopCooldown = 0;
    this.lives = CFG.START_LIVES;
    this.weapon = startWeapon;
    this.heat = 0;
    this.fireTimer = 0;
  }
}
