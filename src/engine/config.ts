import type { BossDef, ObstacleType, Palette, WeaponDef, WeaponKey } from './types';

export const CFG = {
  W: 480,
  H: 720,
  HORIZON_Y: 150,
  // Was 660, leaving a 60px dead strip below the ship once the old
  // overlapping weapon dock (which used to sit in that strip) was
  // removed. Pushed down near the canvas edge to close that gap.
  PLANE_Y: 706,
  ROAD_HALF_NEAR: 168,
  FOCAL: 300,
  Z_SPAWN: 3000,
  CURVE_AMP: 130,

  MIN_SPEED: 480,
  // Quick initial ramp only: gets the ship up to a comfortable cruising
  // speed in the first few seconds. Long term speed growth comes from
  // SECTOR_SPEED_BUMP below, so progression stays readable sector to
  // sector instead of flatlining once the early ramp saturates.
  SPEED_RAMP_TARGET: 760,
  SPEED_TAU: 6,
  // Hard cap on total speed (ramp + sector bumps). Keeps the late game
  // fast and clearly faster than sector 1, without becoming unplayable.
  MAX_SPEED: 2500,
  SECTOR_SPEED_BUMP: 95,

  // Snappier accel/decel than before so touch input reads as immediate
  // (roughly a 0.2s ramp to full lateral speed instead of 0.4s).
  STEER_ACCEL: 11,
  STEER_DECEL: 13,
  STEER_MAXSPEED: 2.6,
  CENTRIFUGAL: 0.6,

  CURVE_MIN_HOLD: 2.6,
  CURVE_MAX_HOLD: 5.6,
  CURVE_SMOOTH: 0.55,
  CURVE_STRAIGHT_CHANCE: 0.2,

  COLLIDE_Z: 46,
  PASS_Z: -50,
  DESPAWN_Z: -140,
  POOL_SIZE: 40,
  PARTICLE_POOL: 140,
  BOLT_POOL: 24,
  ENEMY_BOLT_POOL: 16,

  SPAWN_SLOW: 1.05,
  SPAWN_FAST: 0.36,
  SPAWN_RAMP: 120,

  SECTOR_BASE: 14,
  SECTOR_GROWTH: 5,

  EXTRA_LIFE_SCORE: 4000,
  START_LIVES: 3,
  MAX_LIVES: 6,

  BOOST_WINDOW: 0.42,
  HOP_COOLDOWN: 0.9,
  INVULN_TIME: 1.3,

  IDLE_SPEED: 260,

  BOSS_EVERY: 5,
  BOSS_INTRO_TIME: 2.4,
  BOSS_ENTRY_TIME: 1.6,
  BOSS_Z: 260,
  BOSS_DEFEAT_SCORE: 1200,
  BOSS_BOLT_SPEED: 720,
  BOSS_HIT_RADIUS: 0.34,
} as const;

export const WEAPONS: Record<WeaponKey, WeaponDef> = {
  laser: {
    key: 'laser', label: 'pulse laser', rate: 0.16, dmg: 1, speed: 1900, spread: 0,
    bolts: 1, color: '#5dd9e8', glow: 'rgba(93,217,232,0.9)', heatPerShot: 0.1, cool: 0.55, kind: 'bolt',
  },
  twin: {
    key: 'twin', label: 'twin cannon', rate: 0.22, dmg: 1, speed: 1750, spread: 0,
    bolts: 2, color: '#ff8c3d', glow: 'rgba(255,140,61,0.9)', heatPerShot: 0.16, cool: 0.5, kind: 'bolt',
  },
  spread: {
    key: 'spread', label: 'spread blaster', rate: 0.32, dmg: 1, speed: 1500, spread: 0.16,
    bolts: 3, color: '#ffd166', glow: 'rgba(255,209,102,0.9)', heatPerShot: 0.22, cool: 0.45, kind: 'bolt',
  },
  missile: {
    key: 'missile', label: 'homing missile', rate: 0.62, dmg: 3, speed: 1100, spread: 0,
    bolts: 1, color: '#ff4d5e', glow: 'rgba(255,77,94,0.95)', heatPerShot: 0.34, cool: 0.4, kind: 'missile',
  },
};

export const WEAPON_ORDER: WeaponKey[] = ['laser', 'twin', 'spread', 'missile'];

export const PALETTES: Palette[] = [
  { name: 'indigo void', top: '#05060c', mid: '#161229', bottom: '#03030a', bandDark: '#10101f', bandLight: '#181830', rail: '#5dd9e8', glow: 'rgba(93,217,232,0.3)', nebula: 'rgba(93,120,232,0.10)' },
  { name: 'crimson nebula', top: '#0e0508', mid: '#2a0f1d', bottom: '#05030a', bandDark: '#1e0a15', bandLight: '#2c1020', rail: '#ff8c3d', glow: 'rgba(255,140,61,0.3)', nebula: 'rgba(232,93,120,0.10)' },
  { name: 'emerald drift', top: '#03100a', mid: '#0d2c20', bottom: '#020a06', bandDark: '#082118', bandLight: '#0f3325', rail: '#5dffb0', glow: 'rgba(93,255,176,0.32)', nebula: 'rgba(93,232,160,0.09)' },
  { name: 'amber dust', top: '#120c04', mid: '#2c1f0a', bottom: '#080502', bandDark: '#1f1607', bandLight: '#30210c', rail: '#ffd166', glow: 'rgba(255,209,102,0.3)', nebula: 'rgba(232,180,93,0.09)' },
  { name: 'violet storm', top: '#0c0612', mid: '#28102e', bottom: '#06030a', bandDark: '#1c0a20', bandLight: '#2c1132', rail: '#ff4d5e', glow: 'rgba(255,77,94,0.32)', nebula: 'rgba(180,93,232,0.10)' },
];

export const BOSS_DEFS: BossDef[] = [
  {
    key: 'hulk', name: 'Render Hulk', tagline: 'a slow, armored bulk freighter turned raider',
    baseHp: 26, hpPerCycle: 10, radius: 56, color: '#8a3b2e', accent: '#ff8c3d',
    moveType: 'weave', moveSpeed: 0.55, fireType: 'spreadVolley', fireInterval: 1.9, boltSpeed: 0.85,
  },
  {
    key: 'striker', name: 'Vanguard Striker', tagline: 'a fast interceptor that hunts your lane',
    baseHp: 18, hpPerCycle: 8, radius: 38, color: '#5a3a8a', accent: '#b9a6e0',
    moveType: 'dart', moveSpeed: 1.6, fireType: 'aimedSingle', fireInterval: 0.55, boltSpeed: 1.15,
  },
  {
    key: 'sentinel', name: 'Twin Sentinel', tagline: 'two linked turret pods guarding a shared core',
    baseHp: 30, hpPerCycle: 12, radius: 50, color: '#2e6a6e', accent: '#5dd9e8',
    moveType: 'hold', moveSpeed: 0.3, fireType: 'alternating', fireInterval: 0.8, boltSpeed: 1,
  },
  {
    key: 'swarm', name: 'Swarm Mother', tagline: 'a drone carrier that breeds chaos',
    baseHp: 24, hpPerCycle: 9, radius: 48, color: '#6e2e4a', accent: '#ff4d5e',
    moveType: 'drift', moveSpeed: 0.4, fireType: 'trackingBeam', fireInterval: 2.4, boltSpeed: 0.7,
  },
];

export const HP_BY_TYPE: Record<ObstacleType, number> = {
  asteroid: 2,
  stone: 1,
  scout: 2,
  wreck: 3,
};

export const VISUAL_RADIUS: Record<ObstacleType, number> = {
  asteroid: 32,
  stone: 13,
  scout: 23,
  wreck: 44,
};
