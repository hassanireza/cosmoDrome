/**
 * Physics
 * -------
 * Pure math used by the Cosmodrome engine. No DOM, no canvas, no side
 * effects. Every function is deterministic given its inputs (aside from
 * the injectable RNG in pickSpawnLane), which is what keeps the engine
 * unit testable and keeps rendering fully decoupled from simulation.
 */
export class Physics {
  static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /** Exponential approach toward a target value, used for damping and smoothing. */
  static approach(current: number, target: number, dt: number, rate: number): number {
    const t = 1 - Math.exp(-rate * dt);
    return Physics.lerp(current, target, Physics.clamp(t, 0, 1));
  }

  /** Eases a value from 0 toward 1 over time using a half life style curve. */
  static easeToward(t: number, tau: number): number {
    if (tau <= 0) return 1;
    return 1 - Math.exp(-t / tau);
  }

  /** Speed ramps from minSpeed to maxSpeed over elapsed time, bounded by tau. */
  static speedAtTime(t: number, minSpeed: number, maxSpeed: number, tau: number): number {
    const k = Physics.easeToward(Math.max(0, t), tau);
    return minSpeed + (maxSpeed - minSpeed) * k;
  }

  /**
   * Pseudo 3D perspective projection: returns a scale factor in (0, 1],
   * where 1 means "at the player's plane" and values shrink smoothly
   * toward 0 as z grows toward the horizon.
   */
  static projectScale(z: number, focal: number): number {
    const safeZ = Math.max(0, z);
    const safeFocal = Math.max(1, focal);
    return safeFocal / (safeZ + safeFocal);
  }

  /**
   * Converts a normalized lane position (-1 left .. 1 right) plus the
   * track's current curve offset into a screen space x coordinate.
   */
  static laneToX(
    lane: number,
    centerX: number,
    halfWidth: number,
    curveOffset: number,
    scale: number,
    curveAmplitude: number,
  ): number {
    const center = centerX + curveOffset * (1 - scale) * curveAmplitude;
    return center + lane * halfWidth * scale;
  }

  /** Simple 1D interval overlap test, used for lateral collision checks. */
  static overlap1D(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
    return aMin < bMax && bMin < aMax;
  }

  /** Smoothly moves a curve value toward a target. */
  static updateCurveOffset(current: number, target: number, dt: number, smoothing: number): number {
    return Physics.approach(current, target, dt, smoothing);
  }

  /** How many clean overtakes are required to clear sector `index` (0 based). */
  static sectorQuota(index: number, base: number, growth: number): number {
    return Math.round(base + index * growth);
  }

  /** Picks a random lane within a safe inset of the corridor using an injectable RNG. */
  static pickSpawnLane(rng: () => number, inset = 0.85): number {
    return (rng() * 2 - 1) * inset;
  }

  static clampLane(lane: number): number {
    return Physics.clamp(lane, -1, 1);
  }

  /** Maps elapsed seconds to a spawn interval, shrinking from slow to fast. */
  static spawnInterval(t: number, slow: number, fast: number, rampSeconds: number): number {
    const k = Physics.clamp(t / Math.max(1, rampSeconds), 0, 1);
    return Physics.lerp(slow, fast, k);
  }

  /**
   * Steering velocity model: direct acceleration and deceleration (not an
   * exponential approach) so input feels immediate at low dt, while still
   * ramping instead of snapping instantly to max speed.
   */
  static steerVelocity(
    input: number,
    vel: number,
    dt: number,
    accel: number,
    decel: number,
    maxSpeed: number,
  ): number {
    let v = vel;
    if (input !== 0) {
      v += input * accel * dt;
      v = Physics.clamp(v, -maxSpeed, maxSpeed);
    } else if (v !== 0) {
      const sign = v > 0 ? 1 : -1;
      const mag = Math.abs(v) - decel * dt;
      v = mag > 0 ? sign * mag : 0;
    }
    return v;
  }

  private static colorCache = new Map<string, [number, number, number]>();

  static hexToRgb(hex: string): [number, number, number] {
    const cached = Physics.colorCache.get(hex);
    if (cached) return cached;
    const h = hex.replace('#', '');
    const value: [number, number, number] = [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
    Physics.colorCache.set(hex, value);
    return value;
  }

  static mixColor(hexA: string, hexB: string, t: number): string {
    const a = Physics.hexToRgb(hexA);
    const b = Physics.hexToRgb(hexB);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }
}
