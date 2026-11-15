import { OneEuroFilter, clamp } from '../core/math.ts';
import type { InputState } from './InputState.ts';

export interface InputHooks {
  getLane(): number;
  onPause(): void;
  onConfirm(): void;
  onCycleWeapon(): void;
  onSelectWeapon(index: number): void;
}

const SWIPE_MIN_PX = 56;
const SWIPE_MAX_MS = 260;
const TILT_FULL_DEG = 16;
const TILT_DEAD_DEG = 1.5;

/**
 * Touch first input.
 *
 * - Drag anywhere to steer. The control is relative: the ship does not jump to your
 *   finger, it follows the distance you drag from where you touched. Pointer x is run
 *   through a 1 Euro filter for low lag and low jitter.
 * - Swipe up, or tap with a second finger, to hop.
 * - Keyboard and optional tilt are fallbacks that write to the same state.
 * Elements marked data-ui (buttons, dock) are ignored by the gesture layer.
 */
export class InputController {
  private readonly state: InputState;
  private readonly el: HTMLElement;
  private readonly hooks: InputHooks;
  private primary = -1;
  private startX = 0;
  private startY = 0;
  private startLane = 0;
  private startT = 0;
  private lastT = 0;
  private swiped = false;
  private readonly filter = new OneEuroFilter(1.6, 0.02, 1);
  private keys = { l: false, r: false };
  private tiltOn = false;
  private tiltCenter: number | null = null;
  private tiltAxis = 0;

  constructor(el: HTMLElement, state: InputState, hooks: InputHooks) {
    this.el = el;
    this.state = state;
    this.hooks = hooks;
  }

  attach(): void {
    const e = this.el;
    e.addEventListener('pointerdown', this.down);
    e.addEventListener('pointermove', this.move);
    e.addEventListener('pointerup', this.up);
    e.addEventListener('pointercancel', this.up);
    e.addEventListener('contextmenu', this.noMenu);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.blur);
    document.addEventListener('gesturestart', this.noMenu as EventListener);
  }

  detach(): void {
    const e = this.el;
    e.removeEventListener('pointerdown', this.down);
    e.removeEventListener('pointermove', this.move);
    e.removeEventListener('pointerup', this.up);
    e.removeEventListener('pointercancel', this.up);
    e.removeEventListener('contextmenu', this.noMenu);
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('gesturestart', this.noMenu as EventListener);
    this.setTilt(false);
  }

  private noMenu = (ev: Event): void => ev.preventDefault();

  private isUi(ev: Event): boolean {
    return (ev.target as HTMLElement | null)?.closest?.('[data-ui]') != null;
  }

  private down = (ev: PointerEvent): void => {
    if (this.isUi(ev)) return;
    if (this.primary !== -1 && ev.pointerId !== this.primary) {
      this.state.hopQueued = true;
      return;
    }
    ev.preventDefault();
    this.primary = ev.pointerId;
    try { this.el.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
    this.startX = ev.clientX;
    this.startY = ev.clientY;
    this.startT = this.lastT = ev.timeStamp;
    this.startLane = this.hooks.getLane();
    this.swiped = false;
    this.filter.reset();
    this.filter.filter(ev.clientX, 1 / 60);
    this.state.pointerActive = true;
    this.state.targetLane = this.startLane;
  };

  private move = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.primary) return;
    ev.preventDefault();
    const dt = Math.max(0.004, (ev.timeStamp - this.lastT) / 1000);
    this.lastT = ev.timeStamp;
    const x = this.filter.filter(ev.clientX, dt);
    const width = this.el.clientWidth || window.innerWidth;
    this.state.targetLane = clamp(this.startLane + (x - this.startX) / (width * 0.22), -1.05, 1.05);
    if (!this.swiped && this.startY - ev.clientY > SWIPE_MIN_PX && ev.timeStamp - this.startT < SWIPE_MAX_MS) {
      this.swiped = true;
      this.state.hopQueued = true;
    }
    // Re-anchor so a long drag never needs more than one thumb travel.
    if (ev.timeStamp - this.startT > SWIPE_MAX_MS) {
      this.startT = ev.timeStamp;
      this.startY = ev.clientY;
    }
  };

  private up = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.primary) return;
    this.primary = -1;
    this.state.pointerActive = false;
  };

  private blur = (): void => {
    this.primary = -1;
    this.state.pointerActive = false;
    this.keys.l = this.keys.r = false;
    this.syncAxis();
  };

  private syncAxis(): void {
    const digital = (this.keys.r ? 1 : 0) - (this.keys.l ? 1 : 0);
    this.state.axis = digital !== 0 ? digital : this.tiltAxis;
  }

  private keydown = (ev: KeyboardEvent): void => {
    switch (ev.code) {
      case 'ArrowLeft': case 'KeyA': this.keys.l = true; ev.preventDefault(); break;
      case 'ArrowRight': case 'KeyD': this.keys.r = true; ev.preventDefault(); break;
      case 'Space': case 'ArrowUp': case 'KeyW': if (!ev.repeat) this.state.hopQueued = true; ev.preventDefault(); break;
      case 'KeyQ': if (!ev.repeat) this.hooks.onCycleWeapon(); break;
      case 'KeyP': case 'Escape': if (!ev.repeat) this.hooks.onPause(); break;
      case 'Enter': if (!ev.repeat) this.hooks.onConfirm(); break;
      case 'Digit1': this.hooks.onSelectWeapon(0); break;
      case 'Digit2': this.hooks.onSelectWeapon(1); break;
      case 'Digit3': this.hooks.onSelectWeapon(2); break;
      case 'Digit4': this.hooks.onSelectWeapon(3); break;
      default: return;
    }
    this.syncAxis();
  };

  private keyup = (ev: KeyboardEvent): void => {
    if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') this.keys.l = false;
    if (ev.code === 'ArrowRight' || ev.code === 'KeyD') this.keys.r = false;
    this.syncAxis();
  };

  static tiltSupported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /** On iOS this must be called from a tap so the motion permission prompt can show. */
  async setTilt(on: boolean): Promise<boolean> {
    if (!on) {
      if (this.tiltOn) window.removeEventListener('deviceorientation', this.orient);
      this.tiltOn = false;
      this.tiltAxis = 0;
      this.syncAxis();
      return false;
    }
    if (!InputController.tiltSupported()) return false;
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if (typeof DOE.requestPermission === 'function' && (await DOE.requestPermission()) !== 'granted') return false;
    } catch {
      return false;
    }
    this.tiltCenter = null;
    this.tiltOn = true;
    window.addEventListener('deviceorientation', this.orient);
    return true;
  }

  private orient = (ev: DeviceOrientationEvent): void => {
    if (ev.gamma === null) return;
    if (this.tiltCenter === null) this.tiltCenter = ev.gamma;
    let d = ev.gamma - this.tiltCenter;
    if (Math.abs(d) < TILT_DEAD_DEG) d = 0;
    this.tiltAxis = clamp(d / TILT_FULL_DEG, -1, 1);
    this.syncAxis();
  };
}
