/**
 * Small, dependency free math toolkit shared by every engine.
 * Everything here is pure so it can run under Node for tests.
 */

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (a === b ? 0 : clamp((v - a) / (b - a), 0, 1));
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Frame rate independent exponential smoothing toward a target. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Moves `current` toward `target` by at most `maxDelta`. */
export const moveToward = (current: number, target: number, maxDelta: number): number => {
  const d = target - current;
  return Math.abs(d) <= maxDelta ? target : current + Math.sign(d) * maxDelta;
};

/** 1 Euro filter (Casiez et al.): low latency, low jitter smoothing for pointer input. */
export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  minCutoff: number;
  beta: number;
  dCutoff: number;

  constructor(minCutoff = 1.4, beta = 0.012, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (TAU * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
  }

  filter(x: number, dt: number): number {
    if (this.xPrev === null || dt <= 0) {
      this.xPrev = x;
      return x;
    }
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = this.dxPrev + aD * (dx - this.dxPrev);
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = this.xPrev + a * (x - this.xPrev);
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }
}

/** PID controller with anti windup. */
export class PID {
  kp: number;
  ki: number;
  kd: number;
  private integral = 0;
  private prev = 0;
  private primed = false;
  private readonly iLimit: number;

  constructor(kp: number, ki: number, kd: number, iLimit = 1) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.iLimit = iLimit;
  }

  reset(): void {
    this.integral = 0;
    this.prev = 0;
    this.primed = false;
  }

  step(error: number, dt = 1): number {
    this.integral = clamp(this.integral + error * dt, -this.iLimit, this.iLimit);
    const d = this.primed ? (error - this.prev) / Math.max(dt, 1e-6) : 0;
    this.prev = error;
    this.primed = true;
    return this.kp * error + this.ki * this.integral + this.kd * d;
  }
}

/** Exponentially weighted moving average. */
export class Ewma {
  value: number;
  private readonly alpha: number;
  private seeded: boolean;

  constructor(alpha: number, initial = 0, seeded = true) {
    this.alpha = alpha;
    this.value = initial;
    this.seeded = seeded;
  }

  push(x: number): number {
    if (!this.seeded) {
      this.value = x;
      this.seeded = true;
    } else {
      this.value += this.alpha * (x - this.value);
    }
    return this.value;
  }
}

/* ---------------------------------------------------------------------------
   Matrices. Column major Float32Array(16), matching WebGL conventions.
   ------------------------------------------------------------------------- */

export type Mat4 = Float32Array;
export const mat4 = (): Mat4 => new Float32Array(16);

export function perspective(out: Mat4, fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

/** Right handed look at. `roll` rotates the up vector around the view axis. */
export function lookAt(
  out: Mat4,
  ex: number, ey: number, ez: number,
  tx: number, ty: number, tz: number,
  roll = 0,
): Mat4 {
  let zx = ex - tx, zy = ey - ty, zz = ez - tz;
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  const upx = Math.sin(roll), upy = Math.cos(roll);
  let xx = upy * zz;
  let xy = -upx * zz;
  let xz = upx * zy - upy * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
  return out;
}

export function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export type RGB = [number, number, number];

export const hex = (h: string): RGB => {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
};

export const mixRgb = (a: RGB, b: RGB, t: number, out: RGB = [0, 0, 0]): RGB => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
};
