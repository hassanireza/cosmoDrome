import { WEAPONS } from './config';
import type { WeaponKey } from './types';

/** LocalStorage-backed persistence for best score, top scores, mute, and last weapon. */
export class StorageService {
  private static readonly KEY_BEST = 'cosmodrome_best_v1';
  private static readonly KEY_SCORES = 'cosmodrome_scores_v1';
  private static readonly KEY_MUTE = 'cosmodrome_mute_v1';
  private static readonly KEY_WEAPON = 'cosmodrome_weapon_v1';

  getBest(): number {
    try {
      return parseInt(localStorage.getItem(StorageService.KEY_BEST) ?? '', 10) || 0;
    } catch {
      return 0;
    }
  }

  setBest(value: number): void {
    try {
      localStorage.setItem(StorageService.KEY_BEST, String(Math.round(value)));
    } catch {
      /* ignore */
    }
  }

  getScores(): number[] {
    try {
      const raw = localStorage.getItem(StorageService.KEY_SCORES);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  addScore(score: number): number[] {
    const list = this.getScores();
    list.push(Math.round(score));
    list.sort((a, b) => b - a);
    const top5 = list.slice(0, 5);
    try {
      localStorage.setItem(StorageService.KEY_SCORES, JSON.stringify(top5));
    } catch {
      /* ignore */
    }
    return top5;
  }

  getMute(): boolean {
    try {
      return localStorage.getItem(StorageService.KEY_MUTE) === '1';
    } catch {
      return false;
    }
  }

  setMute(value: boolean): void {
    try {
      localStorage.setItem(StorageService.KEY_MUTE, value ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  getWeapon(): WeaponKey {
    try {
      const w = localStorage.getItem(StorageService.KEY_WEAPON) as WeaponKey | null;
      return w && WEAPONS[w] ? w : 'laser';
    } catch {
      return 'laser';
    }
  }

  setWeapon(weapon: WeaponKey): void {
    try {
      localStorage.setItem(StorageService.KEY_WEAPON, weapon);
    } catch {
      /* ignore */
    }
  }
}
