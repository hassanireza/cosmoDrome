export type ObstacleType = 'asteroid' | 'stone' | 'scout' | 'wreck';

export type WeaponKind = 'bolt' | 'missile';

export type WeaponKey = 'laser' | 'twin' | 'spread' | 'missile';

export interface WeaponDef {
  key: WeaponKey;
  label: string;
  rate: number;
  dmg: number;
  speed: number;
  spread: number;
  bolts: number;
  color: string;
  glow: string;
  heatPerShot: number;
  cool: number;
  kind: WeaponKind;
}

export interface Palette {
  name: string;
  top: string;
  mid: string;
  bottom: string;
  bandDark: string;
  bandLight: string;
  rail: string;
  glow: string;
  nebula: string;
}

export type BossMoveType = 'weave' | 'dart' | 'hold' | 'drift';
export type BossFireType = 'spreadVolley' | 'aimedSingle' | 'alternating' | 'trackingBeam';
export type BossKey = 'hulk' | 'striker' | 'sentinel' | 'swarm';

export interface BossDef {
  key: BossKey;
  name: string;
  tagline: string;
  baseHp: number;
  hpPerCycle: number;
  radius: number;
  color: string;
  accent: string;
  moveType: BossMoveType;
  moveSpeed: number;
  fireType: BossFireType;
  fireInterval: number;
  boltSpeed: number;
}

export type GameStateKey = 'start' | 'playing' | 'bossintro' | 'boss' | 'paused' | 'gameover';

export interface InputState {
  left: boolean;
  right: boolean;
  thrust: boolean;
  brake: boolean;
}

/** Snapshot of everything the React HUD layer needs, pushed once per frame. */
export interface HudSnapshot {
  state: GameStateKey;
  score: number;
  best: number;
  lives: number;
  sector: number;
  sectorPct: number;
  combo: number;
  comboVisible: boolean;
  weapon: WeaponKey;
  weaponHeatPct: number;
  bossVisible: boolean;
  bossName: string;
  bossHpPct: number;
  bossIntroName: string;
  bossIntroTagline: string;
  finalScore: number;
  isNewBest: boolean;
  scoreList: number[];
  toastMessage: string | null;
  toastNonce: number;
  muted: boolean;
}
