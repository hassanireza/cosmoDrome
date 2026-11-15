import type { BossKey, BossMove, Kind, WeaponKey } from './types.ts';
import { hex } from './math.ts';
import type { RGB } from './math.ts';

/** World units are metres. +x right, +y up, +z away from the camera. */
export const WORLD = {
  ROAD_HALF: 4.4,
  PLAYER_HALF: 0.11,
  SPAWN_Z: 230,
  DESPAWN_Z: -16,
  CELL: 24,
  CELLS_AHEAD: 15,
  CELLS_BEHIND: 1,

  MIN_SPEED: 26,
  RAMP_SPEED: 40,
  RAMP_TAU: 7,
  SECTOR_BUMP: 3.6,
  MAX_SPEED: 104,
  BOSS_SPEED: 22,

  /** Lanes per second at full deflection. */
  LATERAL_MAX: 3.4,
  LATERAL_ACCEL: 26,
  /** Curve drift, lanes per second at full curvature and speed. */
  CENTRIFUGAL: 0.55,

  HOP_TIME: 0.56,
  HOP_HEIGHT: 2.1,
  HOP_COOLDOWN: 0.9,
  INVULN: 1.4,

  START_LIVES: 3,
  MAX_LIVES: 5,
  EXTRA_LIFE_SCORE: 5000,

  SECTOR_BASE: 12,
  SECTOR_GROWTH: 4,
  BOSS_EVERY: 5,
  BOSS_Z: 62,
  BOSS_INTRO: 2.8,
  BOSS_ENTRY: 2.2,

  POOL_ENTITIES: 110,
  POOL_BOLTS: 32,
  POOL_ENEMY_BOLTS: 40,
  POOL_PARTICLES: 480,
} as const;

export interface KindSpec {
  hp: number;
  /** Half width in lane units. */
  halfW: number;
  /** Half depth in metres. */
  depth: number;
  /** Visual height in metres. */
  height: number;
  solid: boolean;
  score: number;
}

export const KINDS: Record<Kind, KindSpec> = {
  shard: { hp: 2, halfW: 0.2, depth: 0.9, height: 1.6, solid: true, score: 25 },
  plinth: { hp: 1, halfW: 0.3, depth: 1.3, height: 0.7, solid: false, score: 15 },
  sentry: { hp: 2, halfW: 0.17, depth: 0.8, height: 3.0, solid: true, score: 45 },
  ruin: { hp: 3, halfW: 0.42, depth: 1.5, height: 3.4, solid: true, score: 60 },
  drone: { hp: 1, halfW: 0.15, depth: 0.7, height: 1.2, solid: true, score: 20 },
  mote: { hp: 1, halfW: 0.2, depth: 1.2, height: 0.8, solid: false, score: 30 },
  veil: { hp: 1, halfW: 0.22, depth: 1.2, height: 0.9, solid: false, score: 0 },
};

export interface WeaponSpec {
  key: WeaponKey;
  label: string;
  rate: number;
  dmg: number;
  speed: number;
  spread: number;
  bolts: number;
  heat: number;
  cool: number;
  homing: boolean;
  /** Bolt visual width in metres. */
  width: number;
}

export const WEAPONS: Record<WeaponKey, WeaponSpec> = {
  pulse: { key: 'pulse', label: 'pulse', rate: 0.16, dmg: 1, speed: 170, spread: 0, bolts: 1, heat: 0.1, cool: 0.55, homing: false, width: 0.14 },
  twin: { key: 'twin', label: 'twin', rate: 0.22, dmg: 1, speed: 160, spread: 0.07, bolts: 2, heat: 0.16, cool: 0.5, homing: false, width: 0.12 },
  fan: { key: 'fan', label: 'fan', rate: 0.32, dmg: 1, speed: 150, spread: 0.17, bolts: 3, heat: 0.22, cool: 0.45, homing: false, width: 0.12 },
  seeker: { key: 'seeker', label: 'seeker', rate: 0.62, dmg: 3, speed: 120, spread: 0, bolts: 1, heat: 0.34, cool: 0.4, homing: true, width: 0.24 },
};
export const WEAPON_ORDER: WeaponKey[] = ['pulse', 'twin', 'fan', 'seeker'];

export interface BossSpec {
  key: BossKey;
  name: string;
  tagline: string;
  baseHp: number;
  hpPerCycle: number;
  halfW: number;
  move: BossMove;
  moveSpeed: number;
  fireInterval: number;
  boltSpeed: number;
}

export const BOSSES: BossSpec[] = [
  { key: 'lintel', name: 'The Lintel', tagline: 'a slab that remembers being a doorway', baseHp: 26, hpPerCycle: 10, halfW: 0.5, move: 'weave', moveSpeed: 0.55, fireInterval: 2.3, boltSpeed: 46 },
  { key: 'needle', name: 'The Needle', tagline: 'it learns which way you lean', baseHp: 18, hpPerCycle: 8, halfW: 0.3, move: 'dart', moveSpeed: 1.4, fireInterval: 1.7, boltSpeed: 54 },
  { key: 'gnomon', name: 'The Gnomon', tagline: 'two shadows, one hour', baseHp: 30, hpPerCycle: 12, halfW: 0.46, move: 'hold', moveSpeed: 0.3, fireInterval: 2.0, boltSpeed: 48 },
  { key: 'choir', name: 'The Choir', tagline: 'many voices, one note', baseHp: 24, hpPerCycle: 9, halfW: 0.4, move: 'drift', moveSpeed: 0.4, fireInterval: 2.5, boltSpeed: 42 },
];

/** Brand colours (Abyssal Liturgy). */
export const BRAND = {
  void: hex('#08090b'),
  charcoal: hex('#0d1013'),
  deep: hex('#12161a'),
  bone: hex('#e6e3da'),
  fog: hex('#9aa3a8'),
  ash: hex('#565f64'),
  silver: hex('#7c8891'),
  bright: hex('#c9cfd2'),
  /** One muted warm accent, reserved for hostile light so threat reads without leaving the palette. */
  oxide: hex('#b2806d'),
} as const;

export interface Mood {
  name: string;
  top: RGB;
  mid: RGB;
  horizon: RGB;
  abyss: RGB;
  fog: RGB;
  light: RGB;
  slab: RGB;
  mono: RGB;
  halo: number;
}

const mood = (name: string, top: string, mid: string, horizon: string, abyss: string, fog: string, light: string, slab: string, mono: string, halo: number): Mood => ({
  name, top: hex(top), mid: hex(mid), horizon: hex(horizon), abyss: hex(abyss), fog: hex(fog),
  light: hex(light), slab: hex(slab), mono: hex(mono), halo,
});

export const MOODS: Mood[] = [
  mood('abyssal tide', '#08090b', '#0d1013', '#1b242b', '#06070a', '#10161b', '#c9cfd2', '#3a444b', '#222a30', 0.85),
  mood('slate tide', '#090b0a', '#0e1311', '#1f2c27', '#060908', '#111815', '#cfd4cc', '#3b4741', '#222b27', 0.9),
  mood('ash tide', '#0b0a09', '#14120f', '#2e2a25', '#080706', '#171512', '#e6e3da', '#4a443c', '#2b2722', 1.0),
  mood('tarnish tide', '#070a0b', '#0c1214', '#1d3033', '#05080a', '#0f1a1c', '#c4d6d6', '#34484b', '#1e2c2e', 0.95),
  mood('eclipse tide', '#050506', '#0a0b0d', '#171b20', '#040405', '#0a0c0f', '#f0eee6', '#2b3238', '#161a1e', 1.15),
];

export const PLAYER_Y = 0.9;
export const LIGHT_DIR: [number, number, number] = [-0.3, 0.3, 0.9];
