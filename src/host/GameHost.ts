import type { HudSnapshot, Settings } from '../core/types.ts';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { Haptics } from '../input/Haptics.ts';
import { InputController } from '../input/InputController.ts';
import { createInputState } from '../input/InputState.ts';
import { WEAPON_ORDER } from '../core/config.ts';
import { Renderer } from '../render/Renderer.ts';
import { Governor } from '../render/Governor.ts';
import { buildScene } from '../render/SceneBuilder.ts';
import { Game } from '../sim/Game.ts';

/**
 * Glue between the browser and the engines: owns the canvas, the frame loop, input,
 * audio and haptics. React only mounts it and listens to `onSnapshot`.
 */
export class GameHost {
  readonly game: Game;
  readonly renderer: Renderer;
  readonly audio = new AudioEngine();
  readonly haptics = new Haptics();
  private readonly input: InputController;
  private readonly governor: Governor;
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private last = 0;
  private lastHud = 0;
  private listener: ((s: HudSnapshot) => void) | null = null;
  private unsub: (() => void) | null = null;
  private audioState = '';
  private lastRound = -1;
  private tiltRequested = false;

  constructor(canvas: HTMLCanvasElement, stage: HTMLElement) {
    this.canvas = canvas;
    this.stage = stage;
    const inputState = createInputState();
    const params = new URLSearchParams(location.search);
    const seed = params.has('seed') ? parseInt(params.get('seed') ?? '', 10) || undefined : undefined;
    this.game = new Game(inputState, seed);
    this.renderer = new Renderer(canvas);

    const s = this.game.settings;
    const dpr = window.devicePixelRatio || 1;
    const start = s.quality === 'low' ? 0.6 : s.quality === 'high' ? 1 : dpr >= 3 ? 0.7 : 0.85;
    this.governor = new Governor(start, s.quality === 'high' ? 0.9 : 0.5, s.quality === 'low' ? 0.6 : 1);
    this.renderer.scale = start;

    this.input = new InputController(stage, inputState, {
      getLane: () => this.game.player.lane,
      onPause: () => this.game.togglePause(),
      onConfirm: () => {
        if (this.game.state === 'menu' || this.game.state === 'gameover') this.startRun();
        else if (this.game.state === 'paused') this.game.togglePause();
      },
      onCycleWeapon: () => { if (this.game.state === 'playing' || this.game.state === 'boss') this.game.cycleWeapon(); },
      onSelectWeapon: (i) => { const k = WEAPON_ORDER[i]; if (k) this.game.setWeapon(k); },
    });

    this.unsub = this.game.on((e) => {
      this.haptics.handle(e);
      this.audio.handle(e);
      if (e.t === 'round') this.audio.setRound(e.n - 1);
    });
    this.haptics.enabled = s.haptics;
    this.audio.setMuted(!s.sound);
    this.renderer.onRestore = () => this.resize();
  }

  start(): void {
    this.input.attach();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.stage);
    this.resize();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.input.detach();
    this.unsub?.();
    this.audio.dispose();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  onSnapshot(cb: (s: HudSnapshot) => void): void {
    this.listener = cb;
    cb(this.game.snapshot());
  }

  /** Must run inside a user gesture so iOS lets audio and motion start. */
  startRun(): void {
    this.audio.unlock();
    if (this.game.settings.tilt && !this.tiltRequested) {
      this.tiltRequested = true;
      void this.input.setTilt(true);
    }
    this.game.startRun();
  }

  applySettings(s: Settings): void {
    this.game.applySettings(s);
    this.haptics.enabled = s.haptics;
    this.audio.setMuted(!s.sound);
    if (s.tilt) { this.audio.unlock(); void this.input.setTilt(true); this.tiltRequested = true; }
    else { void this.input.setTilt(false); this.tiltRequested = false; }
  }

  tiltSupported(): boolean {
    return InputController.tiltSupported();
  }

  private onVisibility = (): void => {
    if (document.hidden && (this.game.state === 'playing' || this.game.state === 'boss')) this.game.togglePause();
  };

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if (w < 2 || h < 2) return;
    this.renderer.resize(w * dpr, h * dpr);
  }

  private loop = (ts: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (this.last === 0) this.last = ts;
    const dtMs = ts - this.last;
    const dt = Math.min(dtMs / 1000, 0.1);
    this.last = ts;

    const g = this.game;
    g.update(dt);
    const reduced = g.settings.reducedMotion;
    g.particles.budget = this.governor.scale < 0.65 ? 0.6 : 1;
    const frame = buildScene(g, this.renderer, reduced);
    this.renderer.render(frame);

    const next = this.governor.sample(dtMs, dt);
    if (next !== null && g.settings.quality === 'auto') this.renderer.setScale(next);

    const playing = g.state === 'playing' || g.state === 'boss' || g.state === 'bossintro';
    const key = playing ? 'on' : 'off';
    if (key !== this.audioState) {
      this.audioState = key;
      this.audio.setPlaying(playing);
    }
    this.audio.setIntensity(playing ? g.director.intensity : 0.1);
    if (g.round !== this.lastRound) {
      this.lastRound = g.round;
      this.audio.setRound(g.round);
    }

    if (ts - this.lastHud > 80 && this.listener) {
      this.lastHud = ts;
      this.listener(g.snapshot());
    }
  };

  /** Debug hook for tests and the console. */
  expose(): void {
    (window as unknown as { __cosmodrome: GameHost }).__cosmodrome = this;
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }
}
