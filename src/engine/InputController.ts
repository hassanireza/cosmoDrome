import type { InputState } from './types';

export interface InputHandlers {
  onHop: () => void;
  onCycleWeapon: () => void;
  onSelectWeaponIndex: (index: number) => void;
  onTogglePause: () => void;
  onConfirm: () => void;
  onHidden: () => void;
}

// Tilt past this many degrees from the calibrated center reaches full
// steering input. Smaller = twitchier, larger = needs a bigger tilt.
const TILT_FULL_DEG = 16;
// Tiny tilts (hand tremor, desk vibration) are ignored below this.
const TILT_DEADZONE_DEG = 1.5;

/**
 * Owns the live InputState object and wires keyboard/touch/tilt listeners
 * to it, plus a small set of edge-triggered action callbacks (hop, pause,
 * etc). The engine reads `state` every simulation tick; InputController
 * never touches the simulation directly.
 */
export class InputController {
  readonly state: InputState = { left: false, right: false, thrust: false, brake: false, tilt: 0 };
  private handlers: InputHandlers;
  private bound = false;
  private keydown = (e: KeyboardEvent) => this.onKeyDown(e);
  private keyup = (e: KeyboardEvent) => this.onKeyUp(e);
  private visibility = () => this.onVisibility();
  private orientation = (e: DeviceOrientationEvent) => this.onOrientation(e);

  private tiltActive = false;
  private tiltCenter: number | null = null;

  constructor(handlers: InputHandlers) {
    this.handlers = handlers;
  }

  attach(): void {
    if (this.bound) return;
    this.bound = true;
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    document.addEventListener('visibilitychange', this.visibility);
  }

  detach(): void {
    if (!this.bound) return;
    this.bound = false;
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    document.removeEventListener('visibilitychange', this.visibility);
    this.disableTilt();
  }

  /** True on devices that expose orientation events at all (most phones/tablets). */
  static tiltSupported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /**
   * Turns on tilt steering. On iOS 13+ this must run from a user gesture
   * (a tap) because it prompts for a motion/orientation permission; other
   * platforms grant access without a prompt. Resolves to whether tilt is
   * active afterward, so the caller can reflect it in the UI.
   */
  async enableTilt(): Promise<boolean> {
    if (!InputController.tiltSupported()) return false;
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    try {
      if (typeof DOE.requestPermission === 'function') {
        const result = await DOE.requestPermission();
        if (result !== 'granted') return false;
      }
    } catch {
      return false;
    }
    this.tiltCenter = null;
    this.tiltActive = true;
    window.addEventListener('deviceorientation', this.orientation);
    return true;
  }

  disableTilt(): void {
    if (!this.tiltActive) return;
    this.tiltActive = false;
    this.tiltCenter = null;
    this.state.tilt = 0;
    window.removeEventListener('deviceorientation', this.orientation);
  }

  isTiltActive(): boolean {
    return this.tiltActive;
  }

  private onOrientation(e: DeviceOrientationEvent): void {
    if (e.gamma === null) return;
    // Calibrate on the first reading so however the player is naturally
    // holding the phone becomes "straight ahead", same idea as Doodle
    // Jump's tilt controls: relative tilt from a comfortable rest angle.
    if (this.tiltCenter === null) this.tiltCenter = e.gamma;
    let delta = e.gamma - this.tiltCenter;
    if (Math.abs(delta) < TILT_DEADZONE_DEG) delta = 0;
    const normalized = Math.max(-1, Math.min(1, delta / TILT_FULL_DEG));
    this.state.tilt = normalized;
  }

  private onVisibility(): void {
    if (document.hidden) this.handlers.onHidden();
  }

  private onKeyDown(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': this.state.left = true; e.preventDefault(); break;
      case 'ArrowRight': case 'KeyD': this.state.right = true; e.preventDefault(); break;
      case 'ArrowUp': case 'KeyW': this.state.thrust = true; e.preventDefault(); break;
      case 'ArrowDown': case 'KeyS': this.state.brake = true; e.preventDefault(); break;
      case 'Space': e.preventDefault(); this.handlers.onHop(); break;
      case 'KeyQ': e.preventDefault(); this.handlers.onCycleWeapon(); break;
      case 'KeyP': case 'Escape': this.handlers.onTogglePause(); break;
      case 'Enter': this.handlers.onConfirm(); break;
      case 'Digit1': this.handlers.onSelectWeaponIndex(0); break;
      case 'Digit2': this.handlers.onSelectWeaponIndex(1); break;
      case 'Digit3': this.handlers.onSelectWeaponIndex(2); break;
      case 'Digit4': this.handlers.onSelectWeaponIndex(3); break;
      default: break;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': this.state.left = false; break;
      case 'ArrowRight': case 'KeyD': this.state.right = false; break;
      case 'ArrowUp': case 'KeyW': this.state.thrust = false; break;
      case 'ArrowDown': case 'KeyS': this.state.brake = false; break;
      default: break;
    }
  }

  setLeft(v: boolean): void { this.state.left = v; }
  setRight(v: boolean): void { this.state.right = v; }
  setThrust(v: boolean): void { this.state.thrust = v; }
  setBrake(v: boolean): void { this.state.brake = v; }
}
