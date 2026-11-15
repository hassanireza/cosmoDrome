import { BRAND, KINDS, LIGHT_DIR, WEAPONS, WORLD, PLAYER_Y } from '../core/config.ts';
import { clamp, lerp, lookAt, mat4, perspective, smoothstep } from '../core/math.ts';
import type { Mat4, RGB } from '../core/math.ts';
import { hash1 } from '../core/rng.ts';
import type { Game } from '../sim/Game.ts';
import { bossLaneValue } from '../ai/PlayerModel.ts';
import { MESH } from './meshes.ts';
import type { FrameParams, Renderer } from './Renderer.ts';

const HALF = WORLD.ROAD_HALF;
const TAN_H = 0.4;
const view = mat4();
const proj = mat4();

const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** Turns simulation state into instance data and camera parameters. Pure with respect to the sim. */
export function buildScene(game: Game, r: Renderer, reduced: boolean): FrameParams {
  const D = game.distance;
  const tr = game.track;
  const m = game.mood;
  const p = game.player;
  const t = game.time;
  const shipX = p.lane * HALF;

  // camera
  const ahead = tr.rel(D, 40);
  const shk = reduced ? 0.1 : 1;
  const sx = (Math.sin(t * 61) + Math.sin(t * 43)) * 0.5 * game.shake.v * 0.03 * shk;
  const sy = (Math.sin(t * 53) + Math.sin(t * 37)) * 0.5 * game.shake.v * 0.03 * shk;
  const camX = shipX * 0.62 + sx;
  const camY = 4.6 + p.y * 0.3 + sy;
  const camZ = -11.5;
  const tx = shipX * 0.3 + ahead * 0.55;
  const ty = 3.4 + tr.relY(D, 40) * 0.4;
  const roll = (-p.bank * 0.035 - ahead * 0.0012) * shk;
  lookAt(view, camX, camY, camZ, tx, ty, 22, roll);
  const aspect = Math.max(0.4, r.aspect);
  const fovY = 2 * Math.atan(TAN_H / aspect) * (1 + game.fovKick * 0.05);
  perspective(proj, fovY, aspect, 0.5, 420);

  r.begin();
  const slab = m.slab;
  const mono = m.mono;
  const light = m.light;

  // causeway
  const base = Math.floor(D / WORLD.CELL);
  for (let i = -WORLD.CELLS_BEHIND; i <= WORLD.CELLS_AHEAD; i++) {
    const cell = base + i;
    const zc = cell * WORLD.CELL + WORLD.CELL / 2 - D;
    const x = tr.rel(D, zc);
    const y = tr.relY(D, zc);
    const head = Math.atan2(tr.rel(D, zc + 4) - tr.rel(D, zc - 4), 8);
    const h1 = hash1(cell, tr.seed);
    const tint = 0.88 + h1 * 0.2;
    // stepped slab: a faint staircase rhythm so the road reads as built, not poured
    const step = Math.floor(cell / 3) % 2 === 0 ? 0 : -0.18;
    r.add(MESH.CUBE, x, y - 0.4 + step, zc, head, HALF * 2 + 1.2, 0.8, WORLD.CELL - 0.9, 0, slab[0] * tint, slab[1] * tint, slab[2] * tint, 0);
    const edge = 0.35 + 0.25 * game.glowPulse;
    for (const s of [-1, 1]) {
      const ex = x + Math.cos(head) * s * (HALF + 0.55);
      const ez = zc - Math.sin(head) * s * (HALF + 0.55);
      r.add(MESH.CUBE, ex, y + 0.02 + step, ez, head, 0.1, 0.1, WORLD.CELL - 1.2, 0, light[0], light[1], light[2], edge);
    }
    // lane guides, a quiet dashed line
    for (const lane of [-0.5, 0.5]) {
      const lx = x + Math.cos(head) * lane * HALF;
      const lz = zc - Math.sin(head) * lane * HALF;
      r.add(MESH.CUBE, lx, y + 0.02 + step, lz, head, 0.05, 0.05, 4, 0, light[0], light[1], light[2], 0.12);
    }

    // monolith on one side
    if (h1 > 0.3) {
      const side = hash1(cell, 11) < 0.5 ? -1 : 1;
      const off = HALF + 5 + hash1(cell, 12) * 22;
      const hgt = 6 + hash1(cell, 13) * 34;
      const wid = 2.5 + hash1(cell, 14) * 6;
      const k = 0.7 + hash1(cell, 15) * 0.6;
      r.add(MESH.CUBE, x + side * off, y + hgt / 2 - 12, zc, head + (hash1(cell, 16) - 0.5) * 0.3, wid, hgt + 12, wid * 0.8, 0, mono[0] * k, mono[1] * k, mono[2] * k, 0);
      if (hash1(cell, 17) > 0.7) {
        r.add(MESH.PYRAMID, x + side * off, y + hgt - 6 + wid * 0.9, zc, t * 0.05, wid * 1.1, wid * 1.8, wid * 1.1, 0, mono[0] * 1.3, mono[1] * 1.3, mono[2] * 1.3, 0.04);
      }
    }
    // floating shards
    const n = 1 + Math.floor(hash1(cell, 21) * 3);
    for (let s = 0; s < n; s++) {
      const side = hash1(cell, 30 + s) < 0.5 ? -1 : 1;
      const px = x + side * (11 + hash1(cell, 40 + s) * 30);
      const py = y + 2 + hash1(cell, 50 + s) * 16 + Math.sin(t * 0.4 + cell + s) * 0.6;
      const sz = 0.9 + hash1(cell, 60 + s) * 2.6;
      r.add(MESH.OCTA, px, py, zc + (hash1(cell, 70 + s) - 0.5) * WORLD.CELL, t * 0.12 + cell, sz, sz * 1.5, sz, 0, mono[0] * 1.5, mono[1] * 1.5, mono[2] * 1.5, 0.02);
    }
    // liturgical gates
    if (cell % 7 === 0) {
      const gx = x;
      r.add(MESH.ARCH, gx, y, zc, head, HALF * 2 + 6, HALF * 2 + 10, 2.2, 0, slab[0] * 1.15, slab[1] * 1.15, slab[2] * 1.15, 0.04);
    }
    // far staircases
    if (cell % 9 === 4) {
      const side = hash1(cell, 80) < 0.5 ? -1 : 1;
      for (let s = 0; s < 7; s++) {
        r.add(MESH.CUBE, x + side * (40 + s * 3.2), y + s * 2.6 - 6, zc, 0, 3.4, 2.6, 8, 0, mono[0] * 1.2, mono[1] * 1.2, mono[2] * 1.2, 0);
      }
    }
  }

  // threats and pickups
  for (const e of game.entities) {
    if (!e.active) continue;
    const spec = KINDS[e.kind];
    const x = tr.laneX(D, e.lane, e.z);
    const y = tr.relY(D, e.z);
    const f = e.flash > 0 ? 0.8 : 0;
    const spin = t * 0.7 + e.phase;
    switch (e.kind) {
      case 'shard': {
        const k = 2.1 * (0.8 + 0.2 * (e.hp / e.maxHp));
        r.add(MESH.OCTA, x, y + 1.5 + Math.sin(t * 1.2 + e.phase) * 0.15, e.z, spin, k, k * 1.4, k, 0, 0.78, 0.82, 0.84, 0.32, f);
        break;
      }
      case 'plinth':
        r.add(MESH.CUBE, x, y + 0.35, e.z, 0, 2.7, 0.7, 2.7, 0, 0.5, 0.54, 0.56, 0.12, f);
        r.add(MESH.CUBE, x, y + 0.72, e.z, 0, 2.2, 0.06, 2.2, 0, light[0], light[1], light[2], 0.6);
        break;
      case 'sentry':
        r.add(MESH.PYRAMID, x, y + 1.7, e.z, spin * 0.3, 1.4, 3.6, 1.4, 0, 0.62, 0.66, 0.7, 0.2, f);
        r.add(MESH.OCTA, x, y + 3.5, e.z, spin, 0.55, 0.55, 0.55, 0, BRAND.oxide[0], BRAND.oxide[1], BRAND.oxide[2], 1.3);
        break;
      case 'ruin': {
        const c = 0.58;
        r.add(MESH.CUBE, x - 1.35, y + 1.7, e.z, 0.1, 0.8, 3.4, 1.3, 0, c, c + 0.02, c + 0.04, 0, f);
        r.add(MESH.CUBE, x + 1.35, y + 1.2, e.z, -0.08, 0.8, 2.4, 1.3, 0, c, c + 0.02, c + 0.04, 0, f);
        r.add(MESH.CUBE, x - 0.4, y + 3.55, e.z, 0.05, 2.6, 0.55, 1.3, 0.06, c * 1.1, c * 1.1, c * 1.15, 0, f);
        r.add(MESH.CUBE, x, y + 0.9, e.z, 0, 0.1, 0.1, 1.5, 0, light[0], light[1], light[2], 0.3);
        break;
      }
      case 'drone':
        r.add(MESH.OCTA, x, y + 1.3, e.z, spin * 2, 0.9, 0.9, 0.9, 0, BRAND.oxide[0], BRAND.oxide[1], BRAND.oxide[2], 1.0, f);
        break;
      case 'mote':
        r.add(MESH.OCTA, x, y + 1.0 + Math.sin(t * 2 + e.phase) * 0.2, e.z, spin * 2, 0.55, 0.8, 0.55, 0, BRAND.bone[0], BRAND.bone[1], BRAND.bone[2], 1.1);
        break;
      case 'veil':
        r.add(MESH.CYL, x, y + 1.1, e.z, 0, 1.3, 0.07, 1.3, spin, BRAND.bright[0], BRAND.bright[1], BRAND.bright[2], 1.2, 0, 1.2);
        r.add(MESH.OCTA, x, y + 1.1, e.z, spin * 3, 0.45, 0.45, 0.45, 0, BRAND.bone[0], BRAND.bone[1], BRAND.bone[2], 1.4);
        break;
    }
    void spec;
  }

  // player bolts
  for (const b of game.bolts) {
    if (!b.active) continue;
    const w = WEAPONS[b.weapon];
    const x = tr.laneX(D, b.lane, b.z);
    const c = w.homing ? BRAND.bright : BRAND.bone;
    if (w.homing) r.add(MESH.OCTA, x, PLAYER_Y + tr.relY(D, b.z), b.z, t * 8, w.width * 2.2, w.width * 2.2, w.width * 5, 0, c[0], c[1], c[2], 1.5);
    else r.add(MESH.CUBE, x, PLAYER_Y + tr.relY(D, b.z), b.z, 0, w.width, w.width, 2.2, 0, c[0], c[1], c[2], 1.6);
  }

  // hostile bolts
  for (const b of game.enemyBolts) {
    if (!b.active || b.delay > 0) continue;
    const x = tr.laneX(D, b.lane, b.z);
    const o = BRAND.oxide;
    r.add(MESH.PYRAMID, x, 1.1 + tr.relY(D, b.z), b.z, t * 6, 0.6, 2.4, 0.6, 0, o[0], o[1], o[2], 1.6, 0, -Math.PI / 2);
  }

  // boss and its telegraph
  const boss = game.boss;
  if (boss) buildBoss(game, r, boss);

  // the ship
  if (p.visible && !(p.invuln > 0 && Math.floor(t * 14) % 2 === 0 && game.state !== 'menu')) {
    const yaw = -p.vel * 0.06;
    const rl = -p.bank * 0.55;
    const y = PLAYER_Y + p.y + Math.sin(t * 2.1) * 0.05;
    const pitch = p.hopT >= 0 ? -0.25 + (p.hopT / WORLD.HOP_TIME) * 0.5 : 0;
    r.add(MESH.OCTA, shipX, y, 0, yaw, 0.7, 0.5, 2.6, rl, 0.9, 0.89, 0.85, 0.12, 0, pitch);
    for (const s of [-1, 1]) {
      r.add(MESH.CUBE, shipX + Math.cos(rl) * s * 0.7, y - 0.05 + Math.sin(rl) * s * 0.7, -0.35, yaw + s * 0.25, 1.1, 0.07, 0.9, rl, 0.62, 0.66, 0.7, 0.05, 0, pitch);
    }
    r.add(MESH.PYRAMID, shipX, y + 0.38, -0.5, yaw, 0.12, 0.65, 0.7, rl, 0.75, 0.78, 0.8, 0.05, 0, pitch);
    r.add(MESH.OCTA, shipX, y + 0.04, 0.55, yaw, 0.28, 0.28, 0.28, 0, light[0], light[1], light[2], 1.6);
    if (game.shield) {
      for (let i = 0; i < 3; i++) {
        r.add(MESH.CYL, shipX, y, 0, 0, 3, 0.04, 3, t * 1.2 + i * 1.05, BRAND.bright[0], BRAND.bright[1], BRAND.bright[2], 0.9, 0, 1.2 + i * 0.5);
      }
    }
  }

  // particles
  for (const q of game.particles.pool) {
    if (!q.active) continue;
    const a = q.life / q.maxLife;
    r.particle(q.x, q.y, q.z, q.size * (0.4 + 0.6 * a), q.r * q.glow, q.g * q.glow, q.b * q.glow, a);
  }

  // ambient speed streaks: thin lines that sell velocity without noise
  const speedK = clamp((game.speed - 24) / 80, 0, 1);
  if (speedK > 0.05) {
    for (let i = 0; i < 10; i++) {
      const hz = (hash1(i, 90) * 140 + (t * game.speed * 0.9 + i * 31)) % 140;
      const z = 140 - hz;
      const side = hash1(i, 91) < 0.5 ? -1 : 1;
      const sxp = tr.rel(D, z) + side * (HALF + 1 + hash1(i, 92) * 9);
      r.add(MESH.CUBE, sxp, 0.3 + hash1(i, 93) * 2.2, z, 0, 0.04, 0.04, 2 + speedK * 6, 0, light[0], light[1], light[2], 0.3 * speedK);
    }
  }

  // sky anchors, projected from world directions so the halo parallaxes with the camera
  const proj3 = (wx: number, wy: number, wz: number): [number, number] => {
    const vp = viewProjPoint(view, proj, wx, wy, wz);
    return vp;
  };
  const ld = LIGHT_DIR;
  const ll = Math.hypot(ld[0], ld[1], ld[2]);
  const halo = proj3(camX + (ld[0] / ll) * 800, camY + (ld[1] / ll) * 800, camZ + (ld[2] / ll) * 800);
  const hz = proj3(camX + (tx - camX) * 40, camY, camZ + 4000);
  const fadeIn = smoothstep(0, 1.0, game.time);

  return {
    view, proj, cam: [camX, camY, camZ], time: t, scroll: D,
    stress: game.director.intensity,
    top: m.top, mid: m.mid, horizon: m.horizon, abyss: m.abyss, fog: m.fog, light: m.light,
    halo: m.halo * (1 + game.glowPulse * 0.4),
    haloUV: [clamp(halo[0], -0.5, 1.5), clamp(halo[1], -0.5, 1.5)],
    horizonY: clamp(hz[1], 0.15, 0.85),
    flash: reduced ? game.flash * 0.3 : game.flash,
    grain: reduced ? 0.035 : 0.06,
    bloom: 0.9 + game.glowPulse * 0.5,
    fade: lerp(0, 1, fadeIn),
  };
}

function viewProjPoint(v: Mat4, p: Mat4, x: number, y: number, z: number): [number, number] {
  const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
  const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
  const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
  const cx = p[0] * vx;
  const cy = p[5] * vy;
  const cw = -vz;
  if (cw < 1e-3) return [0.5, 0.5];
  return [(cx / cw) * 0.5 + 0.5, (cy / cw) * 0.5 + 0.5];
}

function buildBoss(game: Game, r: Renderer, boss: NonNullable<Game['boss']>): void {
  const D = game.distance;
  const tr = game.track;
  const t = game.time;
  const x = tr.laneX(D, boss.lane, boss.z);
  const y = tr.relY(D, boss.z) + 4;
  const z = boss.z;
  const f = boss.flash > 0 ? 0.8 : 0;
  const light = game.mood.light;
  const body = scale(game.mood.mono, 1.7);
  const hpK = boss.hp / boss.maxHp;
  const o = BRAND.oxide;

  switch (boss.spec.key) {
    case 'lintel':
      r.add(MESH.CUBE, x, y + 3.2, z, 0, 7.2, 1.7, 2.4, 0, body[0], body[1], body[2], 0.02, f);
      for (const s of [-1, 1]) r.add(MESH.CUBE, x + s * 3.3, y, z, 0, 1.4, 6, 2, 0, body[0], body[1], body[2], 0.02, f);
      r.add(MESH.CUBE, x, y + 2.3, z - 1.3, 0, 6.4, 0.14, 0.1, 0, light[0], light[1], light[2], 1.2 + (1 - hpK));
      break;
    case 'needle':
      r.add(MESH.PYRAMID, x, y + 1, z, t * 0.8, 2.6, 9, 2.6, 0, body[0], body[1], body[2], 0.03, f);
      r.add(MESH.OCTA, x, y - 3.8, z, t * 2, 1.2, 1.2, 1.2, 0, o[0], o[1], o[2], 1.4);
      r.add(MESH.CYL, x, y + 0.5, z, 0, 5, 0.08, 5, t, light[0], light[1], light[2], 0.8, 0, 1.2);
      break;
    case 'gnomon':
      for (const s of [-1, 1]) {
        r.add(MESH.CYL, x + s * 3, y + 0.5, z, 0, 1.9, 7.5, 1.9, 0, body[0], body[1], body[2], 0.03, f);
        r.add(MESH.OCTA, x + s * 3, y + 4.6, z - 1, t * 1.5, 0.8, 0.8, 0.8, 0, o[0], o[1], o[2], 1.3);
      }
      r.add(MESH.OCTA, x, y + 1.5, z, t * 0.9, 2.4, 3.4, 2.4, 0, light[0], light[1], light[2], 0.9 + (1 - hpK) * 0.6, f);
      break;
    case 'choir':
      r.add(MESH.OCTA, x, y + 1.5, z, t * 0.5, 3.2, 4.2, 3.2, 0, body[0], body[1], body[2], 0.05, f);
      for (let i = 0; i < 6; i++) {
        const a = t * 0.9 + (i / 6) * Math.PI * 2;
        r.add(MESH.OCTA, x + Math.cos(a) * 4.6, y + 1.5 + Math.sin(a * 1.3) * 1.2, z + Math.sin(a) * 2, a * 2, 0.9, 1.3, 0.9, 0, light[0], light[1], light[2], 1.0);
      }
      break;
  }

  // telegraph: the strike is drawn on the road before it lands
  if (boss.state === 'telegraph' && boss.plan) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 18);
    const segs = 7;
    for (const idx of boss.plan.lanes) {
      const lane = bossLaneValue(idx);
      for (let s = 0; s < segs; s++) {
        const zz = lerp(4, boss.z, (s + 0.5) / segs);
        r.add(MESH.CUBE, tr.laneX(D, lane, zz), tr.relY(D, zz) + 0.06, zz, 0, 0.8, 0.05, (boss.z - 4) / segs - 0.6, 0, o[0], o[1], o[2], 0.9 * pulse);
      }
    }
  }
}
