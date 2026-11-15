export type Kind = 'shard' | 'plinth' | 'sentry' | 'ruin' | 'drone' | 'mote' | 'veil';
export type Outcome = 'clean' | 'near' | 'destroyed' | 'hit';
export type WeaponKey = 'pulse' | 'twin' | 'fan' | 'seeker';
export type GameState = 'menu' | 'playing' | 'bossintro' | 'boss' | 'paused' | 'gameover';
export type BossKey = 'lintel' | 'needle' | 'gnomon' | 'choir';
export type BossMove = 'weave' | 'dart' | 'hold' | 'drift';
export type DirectorPhase = 'build' | 'peak' | 'fade' | 'relax';
export type BossAttack = 'aimed' | 'spread' | 'sweep' | 'pincer';

export type PatternId =
  | 'scatter' | 'gate' | 'slalom' | 'hopwall' | 'sentries'
  | 'comb' | 'funnel' | 'zipper' | 'breather';

export interface Spawn {
  kind: Kind;
  lane: number;
  /** Distance in metres behind the pattern origin (positive means farther away). */
  dz: number;
}

/** What the adaptive systems hand to the rest of the game. All fields are smooth. */
export interface DifficultyProfile {
  /** Scalar difficulty, roughly 0 (gentle) to 1.15 (punishing). */
  d: number;
  speedScale: number;
  /** Seconds of travel between patterns. */
  gapSeconds: number;
  maxTier: number;
  hostileFire: number;
  /** Lane units shaved off hitboxes in the player's favour. */
  forgiveness: number;
  telegraph: number;
  bossHp: number;
  pickupBias: number;
}

export type GameEvent =
  | { t: 'launch' }
  | { t: 'fire'; weapon: WeaponKey }
  | { t: 'hop' }
  | { t: 'pass' }
  | { t: 'graze'; combo: number }
  | { t: 'hit' }
  | { t: 'shield' }
  | { t: 'destroy'; big: boolean }
  | { t: 'pickup'; kind: 'mote' | 'veil' }
  | { t: 'round'; n: number }
  | { t: 'bossIntro' }
  | { t: 'telegraph' }
  | { t: 'bossHit' }
  | { t: 'bossDown' }
  | { t: 'life' }
  | { t: 'phase'; phase: DirectorPhase }
  | { t: 'gameover' };

export interface HudSnapshot {
  state: GameState;
  score: number;
  best: number;
  round: number;
  roundName: string;
  roundPct: number;
  lives: number;
  shield: boolean;
  combo: number;
  weapon: WeaponKey;
  heat: number;
  hopReady: boolean;
  bossName: string;
  bossPct: number;
  bossTagline: string;
  toast: string | null;
  toastNonce: number;
  finalScore: number;
  isNewBest: boolean;
  scores: number[];
  moment: string;
  tide: string;
  tideValue: number;
  intensity: number;
}

export interface Settings {
  sound: boolean;
  haptics: boolean;
  adaptive: boolean;
  tilt: boolean;
  quality: 'auto' | 'low' | 'high';
  reducedMotion: boolean;
}
