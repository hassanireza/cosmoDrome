import { fbm1, noise1 } from '../core/rng.ts';
import { WORLD } from '../core/config.ts';

/**
 * Procedural causeway. Everything is a pure function of the distance travelled and a
 * seed, so the same seed always produces the same road, and nothing needs to be stored.
 */
export class Track {
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /** Lateral offset of the centreline in metres at absolute distance `s`. */
  offsetAt(s: number): number {
    const ramp = Math.min(1, s / 260);
    return ramp * (34 * fbm1(s * 0.0034, this.seed, 3) + 9 * noise1(s * 0.011, this.seed + 7));
  }

  heightAt(s: number): number {
    const ramp = Math.min(1, s / 400);
    return ramp * 6 * noise1(s * 0.0022, this.seed + 21);
  }

  /** Offset of the road `z` metres ahead of a player standing at distance `d`. */
  rel(d: number, z: number): number {
    return this.offsetAt(d + z) - this.offsetAt(d);
  }

  relY(d: number, z: number): number {
    return this.heightAt(d + z) - this.heightAt(d);
  }

  /** Second derivative of the offset: how sharply the road bends here. */
  curvatureAt(s: number): number {
    const h = 6;
    return (this.offsetAt(s + h) - 2 * this.offsetAt(s) + this.offsetAt(s - h)) / (h * h);
  }

  /** Lane units per second the road pushes a ship outward at the given speed. */
  drift(d: number, speed: number): number {
    return -this.curvatureAt(d + 4) * speed * 1.5;
  }

  laneX(d: number, lane: number, z: number): number {
    return this.rel(d, z) + lane * WORLD.ROAD_HALF;
  }
}
