import type { ObstacleType } from '../types';

/** A single asteroid, hop stone, raider scout, or wreck fragment. Pooled and reused. */
export class Obstacle {
  active = false;
  type: ObstacleType = 'asteroid';
  z = 0;
  lane = 0;
  baseLane = 0;
  phase = 0;
  resolved = false;
  scale = 0;
  screenX = 0;
  screenY = 0;
  hp = 1;
  maxHp = 1;
  flashTimer = 0;
  destroyed = false;

  reset(): void {
    this.active = false;
    this.resolved = false;
    this.destroyed = false;
    this.flashTimer = 0;
  }
}
