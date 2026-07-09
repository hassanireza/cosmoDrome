import type { InputState } from './types';

export interface InputHandlers {
  onHop: () => void;
  onCycleWeapon: () => void;
  onSelectWeaponIndex: (index: number) => void;
  onTogglePause: () => void;
  onConfirm: () => void;
  onHidden: () => void;
}

/**
 * Owns the live InputState object and wires keyboard/touch listeners to it,
 * plus a small set of edge-triggered action callbacks (hop, pause, etc).
 * The engine reads `state` every simulation tick; InputController never
 * touches the simulation directly.
 */
export class InputController {
  readonly state: InputState = { left: false, right: false, thrust: false, brake: false };
  private handlers: InputHandlers;
  private bound = false;
  private keydown = (e: KeyboardEvent) => this.onKeyDown(e);
  private keyup = (e: KeyboardEvent) => this.onKeyUp(e);
  private visibility = () => this.onVisibility();

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
