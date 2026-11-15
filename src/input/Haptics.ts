import type { GameEvent } from '../core/types.ts';

/** Vibration cues. Android and desktop Chrome honour them; iOS Safari does not expose the API. */
export class Haptics {
  enabled = true;
  private readonly ok = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  private buzz(p: number | number[]): void {
    if (this.enabled && this.ok) navigator.vibrate(p);
  }

  handle(e: GameEvent): void {
    switch (e.t) {
      case 'hit': this.buzz([40, 30, 60]); break;
      case 'shield': this.buzz(25); break;
      case 'graze': this.buzz(8); break;
      case 'hop': this.buzz(6); break;
      case 'destroy': this.buzz(e.big ? 30 : 10); break;
      case 'pickup': this.buzz(12); break;
      case 'round': this.buzz([14, 40, 14]); break;
      case 'bossIntro': this.buzz([30, 60, 30, 60, 90]); break;
      case 'bossDown': this.buzz([20, 30, 20, 30, 120]); break;
      case 'gameover': this.buzz([90, 40, 160]); break;
      default: break;
    }
  }
}
