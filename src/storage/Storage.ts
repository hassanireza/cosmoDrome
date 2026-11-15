import type { Settings, WeaponKey } from '../core/types.ts';
import { WEAPONS } from '../core/config.ts';

const P = 'cosmodrome_v2_';
const K = {
  best: P + 'best',
  scores: P + 'scores',
  settings: P + 'settings',
  skill: P + 'skill',
  weapon: P + 'weapon',
  runs: P + 'runs',
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage can be full or blocked; the game still works without it */
  }
}

export function defaultSettings(): Settings {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { sound: true, haptics: true, adaptive: true, tilt: false, quality: 'auto', reducedMotion: reduced };
}

/** Local persistence. Reads the v1 keys once so existing players keep their records. */
export class Storage {
  getSettings(): Settings {
    const base = defaultSettings();
    const raw = read(K.settings);
    if (!raw) {
      const legacyMute = read('cosmodrome_mute_v1');
      if (legacyMute === '1') base.sound = false;
      return base;
    }
    try {
      return { ...base, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      return base;
    }
  }

  setSettings(s: Settings): void {
    write(K.settings, JSON.stringify(s));
  }

  getBest(): number {
    const v = parseInt(read(K.best) ?? read('cosmodrome_best_v1') ?? '', 10);
    return Number.isFinite(v) ? v : 0;
  }

  setBest(v: number): void {
    write(K.best, String(Math.round(v)));
  }

  getScores(): number[] {
    const raw = read(K.scores) ?? read('cosmodrome_scores_v1');
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number').slice(0, 5) : [];
    } catch {
      return [];
    }
  }

  addScore(score: number): number[] {
    const list = [...this.getScores(), Math.round(score)].sort((a, b) => b - a).slice(0, 5);
    write(K.scores, JSON.stringify(list));
    return list;
  }

  getSkill(): { theta: number; sigma: number } | null {
    const raw = read(K.skill);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as { theta?: number; sigma?: number };
      if (typeof v.theta === 'number' && typeof v.sigma === 'number') return { theta: v.theta, sigma: v.sigma };
    } catch {
      /* fall through */
    }
    return null;
  }

  setSkill(v: { theta: number; sigma: number }): void {
    write(K.skill, JSON.stringify(v));
  }

  getWeapon(): WeaponKey {
    const w = read(K.weapon) as WeaponKey | null;
    return w && WEAPONS[w] ? w : 'pulse';
  }

  setWeapon(w: WeaponKey): void {
    write(K.weapon, w);
  }

  getRuns(): number {
    return parseInt(read(K.runs) ?? '0', 10) || 0;
  }

  bumpRuns(): number {
    const n = this.getRuns() + 1;
    write(K.runs, String(n));
    return n;
  }
}
