import { WORLD } from '../core/config.ts';
import type { RGB } from '../core/math.ts';
import type { Rng } from '../core/rng.ts';

export class Particle {
  active = false;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  life = 0;
  maxLife = 1;
  size = 0.2;
  r = 1;
  g = 1;
  b = 1;
  gravity = 0;
  glow = 1;
}

/** Pooled world space particles. Positions share the player's frame, so they scroll with the road. */
export class Particles {
  readonly pool: Particle[] = Array.from({ length: WORLD.POOL_PARTICLES }, () => new Particle());
  private cursor = 0;
  private readonly rng: Rng;
  budget = 1;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }

  private slot(): Particle {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[(this.cursor + i) % this.pool.length];
      if (!p.active) {
        this.cursor = (this.cursor + i + 1) % this.pool.length;
        return p;
      }
    }
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    return p;
  }

  burst(x: number, y: number, z: number, count: number, speed: number, life: number, size: number, c: RGB, gravity = 0, glow = 1): void {
    const n = Math.max(1, Math.round(count * this.budget));
    for (let i = 0; i < n; i++) {
      const p = this.slot();
      const a = this.rng.next() * Math.PI * 2;
      const b = (this.rng.next() - 0.35) * Math.PI;
      const sp = speed * (0.35 + this.rng.next() * 0.65);
      p.active = true;
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * Math.cos(b) * sp;
      p.vy = Math.sin(b) * sp;
      p.vz = Math.sin(a) * Math.cos(b) * sp;
      p.life = p.maxLife = life * (0.6 + this.rng.next() * 0.8);
      p.size = size * (0.6 + this.rng.next() * 0.8);
      p.r = c[0]; p.g = c[1]; p.b = c[2];
      p.gravity = gravity;
      p.glow = glow;
    }
  }

  /** A single soft mote, used for the engine trail and ambient dust. */
  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, c: RGB, glow = 1): void {
    const p = this.slot();
    p.active = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = p.maxLife = life;
    p.size = size;
    p.r = c[0]; p.g = c[1]; p.b = c[2];
    p.gravity = 0;
    p.glow = glow;
  }

  update(dt: number, scroll: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      const drag = Math.exp(-1.6 * dt);
      p.vx *= drag; p.vy *= drag; p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt - scroll * dt;
    }
  }
}
