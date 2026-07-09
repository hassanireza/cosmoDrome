import { Physics as P } from './Physics';
import { CFG, WEAPONS, WEAPON_ORDER, PALETTES, BOSS_DEFS, HP_BY_TYPE, VISUAL_RADIUS } from './config';
import type { GameStateKey, HudSnapshot, InputState, ObstacleType, WeaponKey } from './types';
import { Obstacle } from './entities/Obstacle';
import { Particle } from './entities/Particle';
import { Bolt, EnemyBolt } from './entities/Bolt';
import { Boss } from './entities/Boss';
import { Player } from './entities/Player';
import { StorageService } from './StorageService';
import { AudioEngine } from './AudioEngine';
import { InputController } from './InputController';
import { Renderer } from './Renderer';

export interface WorldState {
  t: number;
  distance: number;
  curveCur: number;
  curveTarget: number;
  curveTimer: number;
  sector: number;
  sectorProgress: number;
  sectorQuota: number;
  spawnTimer: number;
  speedPenalty: number;
  inputMul: number;
  score: number;
  combo: number;
  comboTimer: number;
  shake: number;
  paletteIndex: number;
  nextLifeScore: number;
  rotAccum: number;
  bossCycle: number;
  bossIntroTimer: number;
}

interface Star { x: number; y: number; layer: number; seed: number }
interface Nebula { x: number; y: number; r: number; seed: number; driftX: number }
interface DistantPlanet { x: number; y: number; r: number }

const STATE = {
  START: 'start', PLAYING: 'playing', BOSSINTRO: 'bossintro',
  BOSS: 'boss', PAUSED: 'paused', GAMEOVER: 'gameover',
} as const;

type ToastListener = (message: string) => void;
type ComboListener = (combo: number) => void;

/**
 * GameEngine owns the entire simulation: world state, entity pools, physics
 * update, and canvas rendering (delegated to Renderer). React never reaches
 * into engine internals directly; it subscribes to `snapshot()` pushed once
 * per rendered frame via `onHud`, and calls the public action methods
 * (start, togglePause, setWeapon, hop...) in response to user interaction.
 */
export class GameEngine {
  readonly canvas: HTMLCanvasElement;
  readonly bgCanvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D;
  private bgCtx: CanvasRenderingContext2D | null = null;
  private bgW = 0;
  private bgH = 0;

  readonly storage = new StorageService();
  readonly audio: AudioEngine;
  readonly input: InputController;
  private renderer: Renderer;

  private state: GameStateKey = STATE.START;
  private statePrePause: GameStateKey = STATE.PLAYING;

  readonly player = new Player();
  readonly world: WorldState;
  boss: Boss | null = null;

  readonly obstacles: Obstacle[];
  readonly particles: Particle[];
  readonly bolts: Bolt[];
  readonly enemyBolts: EnemyBolt[];
  readonly stars: Star[];
  readonly nebulae: Nebula[];
  readonly distantPlanet: DistantPlanet = { x: CFG.W * 0.78, y: 70, r: 46 };

  private rafHandle = 0;
  private resizeTimer = 0;
  private lastTime: number | null = null;
  private acc = 0;
  private readonly STEP = 1 / 60;

  private hudListener: ((snapshot: HudSnapshot) => void) | null = null;
  private toastListeners = new Set<ToastListener>();
  private comboListeners = new Set<ComboListener>();
  private currentToast: string | null = null;
  private toastNonce = 0;

  constructor(canvas: HTMLCanvasElement, bgCanvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    this.bgCanvas = bgCanvas;
    this.ctx = this.setupCanvas(canvas, CFG.W, CFG.H);
    if (bgCanvas) this.setupAmbientCanvas(bgCanvas);

    this.audio = new AudioEngine(this.storage.getMute());
    this.player.weapon = this.storage.getWeapon();

    this.world = {
      t: 0, distance: 0, curveCur: 0, curveTarget: 0, curveTimer: 1.5,
      sector: 0, sectorProgress: 0, sectorQuota: P.sectorQuota(0, CFG.SECTOR_BASE, CFG.SECTOR_GROWTH),
      spawnTimer: 1.0, speedPenalty: 1, inputMul: 1, score: 0, combo: 1, comboTimer: 0,
      shake: 0, paletteIndex: 0, nextLifeScore: CFG.EXTRA_LIFE_SCORE, rotAccum: 0,
      bossCycle: 0, bossIntroTimer: 0,
    };

    this.obstacles = Array.from({ length: CFG.POOL_SIZE }, () => new Obstacle());
    this.particles = Array.from({ length: CFG.PARTICLE_POOL }, () => new Particle());
    this.bolts = Array.from({ length: CFG.BOLT_POOL }, () => new Bolt());
    this.enemyBolts = Array.from({ length: CFG.ENEMY_BOLT_POOL }, () => new EnemyBolt());
    this.stars = this.makeStars(70);
    this.nebulae = this.makeNebulae(3);

    this.renderer = new Renderer(this.ctx, this);

    this.input = new InputController({
      onHop: () => this.tryHop(),
      onCycleWeapon: () => { if (this.state === STATE.PLAYING || this.state === STATE.BOSS) this.cycleWeapon(); },
      onSelectWeaponIndex: (i) => {
        if (this.state !== STATE.PLAYING && this.state !== STATE.BOSS) return;
        const key = WEAPON_ORDER[i];
        if (key) { this.setWeapon(key); this.emitToast(WEAPONS[key].label); }
      },
      onTogglePause: () => {
        const pausable: GameStateKey[] = [STATE.PLAYING, STATE.PAUSED, STATE.BOSS, STATE.BOSSINTRO];
        if (pausable.includes(this.state)) this.togglePause();
      },
      onConfirm: () => {
        if (this.state === STATE.START || this.state === STATE.GAMEOVER) this.startGame();
        else if (this.state === STATE.PAUSED) this.togglePause();
      },
      onHidden: () => { if (this.state === STATE.PLAYING) this.togglePause(); },
    });
  }

  // -- setup -----------------------------------------------------------
  private setupCanvas(canvas: HTMLCanvasElement, logicalW: number, logicalH: number): CanvasRenderingContext2D {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(logicalW * dpr);
    canvas.height = Math.round(logicalH * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  private setupAmbientCanvas(canvas: HTMLCanvasElement): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth || 480;
    const h = window.innerHeight || 800;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bgCtx = ctx;
    this.bgW = w;
    this.bgH = h;
  }

  handleResize(): void {
    if (!this.bgCanvas) return;
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      if (this.bgCanvas) this.setupAmbientCanvas(this.bgCanvas);
    }, 120);
  }

  private makeStars(n: number): Star[] {
    return Array.from({ length: n }, () => ({
      x: Math.random() * CFG.W,
      y: CFG.HORIZON_Y - Math.random() * 40,
      layer: 1 + Math.floor(Math.random() * 3),
      seed: Math.random() * 10,
    }));
  }

  private makeNebulae(n: number): Nebula[] {
    return Array.from({ length: n }, () => ({
      x: Math.random() * CFG.W,
      y: 30 + Math.random() * (CFG.HORIZON_Y - 40),
      r: 60 + Math.random() * 90,
      seed: Math.random() * 10,
      driftX: (Math.random() - 0.5) * 4,
    }));
  }

  // -- lifecycle ---------------------------------------------------------
  private boundResize = () => this.handleResize();

  start(): void {
    this.input.attach();
    window.addEventListener('resize', this.boundResize);
    this.rafHandle = window.requestAnimationFrame((ts) => this.loop(ts));
    this.pushHud();
  }

  destroy(): void {
    window.cancelAnimationFrame(this.rafHandle);
    window.clearTimeout(this.resizeTimer);
    window.removeEventListener('resize', this.boundResize);
    this.input.detach();
  }

  onHud(listener: (snapshot: HudSnapshot) => void): void {
    this.hudListener = listener;
  }

  onToast(listener: ToastListener): () => void {
    this.toastListeners.add(listener);
    return () => this.toastListeners.delete(listener);
  }

  onCombo(listener: ComboListener): () => void {
    this.comboListeners.add(listener);
    return () => this.comboListeners.delete(listener);
  }

  private emitToast(message: string): void {
    this.currentToast = message;
    this.toastNonce++;
    this.toastListeners.forEach((l) => l(message));
  }

  private showCombo(): void {
    this.comboListeners.forEach((l) => l(this.world.combo));
  }

  getState(): GameStateKey { return this.state; }

  // -- game lifecycle ------------------------------------------------------
  private resetWorld(): void {
    this.player.reset(this.player.weapon);
    const w = this.world;
    w.t = 0; w.distance = 0; w.curveCur = 0; w.curveTarget = 0; w.curveTimer = 1.5;
    w.sector = 0; w.sectorProgress = 0; w.sectorQuota = P.sectorQuota(0, CFG.SECTOR_BASE, CFG.SECTOR_GROWTH);
    w.spawnTimer = 1.0; w.speedPenalty = 1; w.inputMul = 1;
    w.score = 0; w.combo = 1; w.comboTimer = 0;
    w.shake = 0; w.paletteIndex = 0; w.nextLifeScore = CFG.EXTRA_LIFE_SCORE;
    w.rotAccum = 0; w.bossCycle = 0; w.bossIntroTimer = 0;
    this.boss = null;

    this.obstacles.forEach((o) => o.reset());
    this.particles.forEach((p) => { p.active = false; });
    this.bolts.forEach((b) => { b.active = false; });
    this.enemyBolts.forEach((b) => { b.active = false; });
  }

  startGame(): void {
    this.audio.resume();
    this.audio.sfxLaunch();
    this.resetWorld();
    this.state = STATE.PLAYING;
  }

  togglePause(): void {
    if (this.state === STATE.PLAYING || this.state === STATE.BOSS || this.state === STATE.BOSSINTRO) {
      this.statePrePause = this.state;
      this.state = STATE.PAUSED;
    } else if (this.state === STATE.PAUSED) {
      this.state = this.statePrePause;
    }
  }

  private gameOver(): void {
    this.state = STATE.GAMEOVER;
    this.audio.sfxGameOver();
    const best = this.storage.getBest();
    if (this.world.score > best) this.storage.setBest(this.world.score);
    this.storage.addScore(this.world.score);
  }

  // -- weapons -------------------------------------------------------------
  setWeapon(key: WeaponKey): void {
    if (!WEAPONS[key]) return;
    this.player.weapon = key;
    this.player.heat = 0;
    this.player.fireTimer = 0;
    this.storage.setWeapon(key);
  }

  cycleWeapon(): void {
    const idx = WEAPON_ORDER.indexOf(this.player.weapon);
    const next = WEAPON_ORDER[(idx + 1) % WEAPON_ORDER.length];
    this.setWeapon(next);
    this.emitToast(WEAPONS[next].label);
  }

  toggleMute(): boolean {
    const next = !this.audio.isMuted();
    this.audio.setMuted(next);
    this.storage.setMute(next);
    return next;
  }

  tryHop(): void {
    if (this.state !== STATE.PLAYING && this.state !== STATE.BOSS) return;
    if (this.player.hopCooldown > 0) return;
    this.player.boosting = CFG.BOOST_WINDOW;
    this.player.hopCooldown = CFG.HOP_COOLDOWN;
  }

  // -- main loop -------------------------------------------------------------
  private loop(ts: number): void {
    if (this.lastTime === null) this.lastTime = ts;
    let dt = (ts - this.lastTime) / 1000;
    this.lastTime = ts;
    if (dt > 0.05 || dt < 0) dt = 1 / 60;
    this.acc += dt;
    let iterations = 0;
    while (this.acc >= this.STEP && iterations < 8) {
      this.update(this.STEP);
      this.acc -= this.STEP;
      iterations++;
    }
    this.renderer.render();
    this.renderer.renderAmbientBg(this.bgCtx, this.bgW, this.bgH, ts);
    this.pushHud();
    this.rafHandle = window.requestAnimationFrame((next) => this.loop(next));
  }

  private update(dt: number): void {
    if (this.state === STATE.BOSSINTRO) { this.updateBossIntro(dt); return; }
    if (this.state === STATE.BOSS) { this.updateBossFight(dt); return; }
    if (this.state !== STATE.PLAYING) { this.updateIdle(dt); return; }

    const w = this.world;
    w.t += dt;
    w.inputMul = P.approach(w.inputMul, this.targetInputMul(), dt, 3.2);
    w.speedPenalty = P.approach(w.speedPenalty, 1, dt, 1.1);

    const speed = this.currentSpeed();
    w.distance += speed * dt;
    w.score += speed * dt * 0.035;
    w.rotAccum += dt * (0.4 + speed / CFG.MAX_SPEED);

    w.curveTimer -= dt;
    if (w.curveTimer <= 0) {
      w.curveTarget = Math.random() < CFG.CURVE_STRAIGHT_CHANCE ? 0 : (Math.random() * 2 - 1) * (0.55 + Math.random() * 0.45);
      w.curveTimer = CFG.CURVE_MIN_HOLD + Math.random() * (CFG.CURVE_MAX_HOLD - CFG.CURVE_MIN_HOLD);
    }
    w.curveCur = P.updateCurveOffset(w.curveCur, w.curveTarget, dt, CFG.CURVE_SMOOTH);

    this.updatePlayer(dt, speed);
    this.updateWeapon(dt);
    this.updateBolts(dt);
    this.updateObstacles(dt, speed);
    this.updateParticles(dt);
    this.updateSpawner(dt);
    this.updateStars(dt, speed);

    if (this.player.invuln > 0) this.player.invuln = Math.max(0, this.player.invuln - dt);
    if (this.player.boosting > 0) this.player.boosting = Math.max(0, this.player.boosting - dt);
    if (this.player.hopCooldown > 0) this.player.hopCooldown = Math.max(0, this.player.hopCooldown - dt);
    w.shake = Math.max(0, w.shake - dt * 38);
    if (w.comboTimer > 0) { w.comboTimer -= dt; if (w.comboTimer <= 0) w.combo = 1; }

    this.maybeAwardExtraLife();
  }

  private updateIdle(dt: number): void {
    const w = this.world;
    w.curveTimer -= dt;
    if (w.curveTimer <= 0) {
      w.curveTarget = (Math.random() * 2 - 1) * 0.5;
      w.curveTimer = CFG.CURVE_MIN_HOLD + Math.random() * (CFG.CURVE_MAX_HOLD - CFG.CURVE_MIN_HOLD);
    }
    w.curveCur = P.updateCurveOffset(w.curveCur, w.curveTarget, dt, CFG.CURVE_SMOOTH);
    w.distance += CFG.IDLE_SPEED * dt;
    this.updateStars(dt, CFG.IDLE_SPEED);
    w.rotAccum += dt * 0.4;
  }

  private targetInputMul(): number {
    if (this.input.state.thrust) return 1.16;
    if (this.input.state.brake) return 0.74;
    return 1;
  }

  private currentSpeed(): number {
    const base = P.speedAtTime(this.world.t, CFG.MIN_SPEED, CFG.MAX_SPEED, CFG.SPEED_TAU) + this.world.sector * CFG.SECTOR_SPEED_BUMP;
    return base * this.world.inputMul * this.world.speedPenalty;
  }

  private updatePlayer(dt: number, speed: number): void {
    const input: InputState = this.input.state;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const pl = this.player;
    pl.vel = P.steerVelocity(dir, pl.vel, dt, CFG.STEER_ACCEL, CFG.STEER_DECEL, CFG.STEER_MAXSPEED);
    const drift = this.world.curveCur * CFG.CENTRIFUGAL * (speed / CFG.MAX_SPEED);
    pl.lane += (pl.vel + drift) * dt;

    if (pl.lane > 1) {
      pl.lane = 1;
      pl.vel = dir > 0 ? 0 : pl.vel;
      this.world.speedPenalty = Math.min(this.world.speedPenalty, 0.92);
    }
    if (pl.lane < -1) {
      pl.lane = -1;
      pl.vel = dir < 0 ? 0 : pl.vel;
      this.world.speedPenalty = Math.min(this.world.speedPenalty, 0.92);
    }
    pl.lane = P.clampLane(pl.lane);
    pl.bank = P.approach(pl.bank, P.clamp(pl.vel * 0.3, -1, 1), dt, 10);
  }

  playerScreenX(): number {
    return P.laneToX(this.player.lane, CFG.W / 2, CFG.ROAD_HALF_NEAR, this.world.curveCur, 1, CFG.CURVE_AMP);
  }

  // -- spawning -------------------------------------------------------------
  private typeWeights(sector: number): Record<ObstacleType, number> {
    const w: Record<ObstacleType, number> = { asteroid: 5, stone: 4, scout: 0, wreck: 0 };
    if (sector >= 1) w.scout = 2;
    if (sector >= 2) w.scout = 3;
    if (sector >= 3) w.wreck = 2;
    if (sector >= 4) { w.asteroid = 4; w.wreck = 3; w.scout = 4; }
    return w;
  }

  private pickType(weights: Record<ObstacleType, number>): ObstacleType {
    const total = weights.asteroid + weights.stone + weights.scout + weights.wreck;
    let r = Math.random() * total;
    if ((r -= weights.asteroid) < 0) return 'asteroid';
    if ((r -= weights.stone) < 0) return 'stone';
    if ((r -= weights.scout) < 0) return 'scout';
    return 'wreck';
  }

  private freeObstacleSlot(): Obstacle | null {
    return this.obstacles.find((o) => !o.active) ?? null;
  }

  private spawnObstacle(): void {
    const slot = this.freeObstacleSlot();
    if (!slot) return;
    const lane = P.pickSpawnLane(Math.random, 0.82);
    const type = this.pickType(this.typeWeights(this.world.sector));
    slot.active = true;
    slot.resolved = false;
    slot.destroyed = false;
    slot.type = type;
    slot.z = CFG.Z_SPAWN;
    slot.lane = lane;
    slot.baseLane = lane;
    slot.phase = Math.random() * Math.PI * 2;
    slot.scale = 0.02;
    slot.maxHp = HP_BY_TYPE[type] || 1;
    slot.hp = slot.maxHp;
    slot.flashTimer = 0;
  }

  private updateSpawner(dt: number): void {
    const w = this.world;
    w.spawnTimer -= dt;
    if (w.spawnTimer <= 0) {
      this.spawnObstacle();
      let interval = P.spawnInterval(w.t, CFG.SPAWN_SLOW, CFG.SPAWN_FAST, CFG.SPAWN_RAMP);
      interval *= 0.85 + Math.random() * 0.3;
      w.spawnTimer = interval;
    }
  }

  // -- particles -------------------------------------------------------------
  private freeParticleSlot(): Particle | null {
    return this.particles.find((p) => !p.active) ?? null;
  }

  burst(x: number, y: number, color: string, count: number, speed: number, life: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.freeParticleSlot();
      if (!p) return;
      const ang = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      p.active = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp;
      p.life = p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.color = color;
      p.size = 1.5 + Math.random() * 2.2;
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
  }

  // -- weapons / firing -------------------------------------------------------
  private freeBoltSlot(): Bolt | null {
    return this.bolts.find((b) => !b.active) ?? null;
  }

  private findMissileTarget(): Obstacle | null {
    let best: Obstacle | null = null;
    let bestZ = Infinity;
    for (const o of this.obstacles) {
      if (!o.active || o.destroyed || o.type === 'stone') continue;
      if (o.z > 0 && o.z < bestZ) { bestZ = o.z; best = o; }
    }
    return best;
  }

  private fireWeapon(): void {
    const def = WEAPONS[this.player.weapon];
    if (!def) return;
    let lanes: number[] = [];
    if (def.bolts === 1) lanes = [this.player.lane];
    else if (def.bolts === 2) lanes = [this.player.lane - 0.07, this.player.lane + 0.07];
    else lanes = [this.player.lane - def.spread, this.player.lane, this.player.lane + def.spread];

    for (const laneValue of lanes) {
      const slot = this.freeBoltSlot();
      if (!slot) break;
      slot.active = true;
      slot.lane = P.clampLane(laneValue);
      slot.z = 4;
      slot.vz = def.speed;
      slot.weaponKey = this.player.weapon;
      slot.life = 2.2;
      slot.target = def.kind === 'missile' ? this.findMissileTarget() : null;
    }

    this.player.heat = Math.min(1, this.player.heat + def.heatPerShot);
    if (this.player.weapon === 'missile') this.audio.sfxFireMissile();
    else if (this.player.weapon === 'laser') this.audio.sfxFireLaser();
    else this.audio.sfxFireCannon();
  }

  private updateWeapon(dt: number): void {
    const def = WEAPONS[this.player.weapon];
    if (!def) return;
    this.player.fireTimer -= dt;
    if (this.player.fireTimer <= 0 && this.player.heat < 1) {
      this.fireWeapon();
      this.player.fireTimer = def.rate;
    }
    this.player.heat = Math.max(0, this.player.heat - def.cool * dt);
  }

  private updateBolts(dt: number): void {
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      const def = WEAPONS[b.weaponKey] || WEAPONS.laser;

      if (def.kind === 'missile' && b.target && b.target.active && !b.target.destroyed) {
        const diff = b.target.lane - b.lane;
        b.lane = P.clampLane(b.lane + diff * Math.min(1, dt * 4));
      }

      b.z += b.vz * dt;

      let hitSomething = false;
      for (const o of this.obstacles) {
        if (!o.active || o.destroyed || o.type === 'stone') continue;
        if (Math.abs(o.z - b.z) > 70) continue;
        const laneDist = Math.abs(o.lane - b.lane);
        if (laneDist < 0.22) {
          this.damageObstacle(o, def.dmg, b);
          hitSomething = true;
          break;
        }
      }

      if (hitSomething || b.z > CFG.Z_SPAWN * 1.05 || b.life <= 0) b.active = false;
    }
  }

  private damageObstacle(o: Obstacle, dmg: number, bolt: Bolt): void {
    o.hp -= dmg;
    o.flashTimer = 0.08;
    this.burst(o.screenX, o.screenY, WEAPONS[bolt.weaponKey].color, 4, 70, 0.25);
    this.audio.sfxExplodeSmall();
    if (o.hp <= 0) this.destroyObstacle(o);
  }

  private destroyObstacle(o: Obstacle): void {
    o.destroyed = true;
    o.resolved = true;
    o.active = false;
    const pts = o.type === 'wreck' ? 60 : o.type === 'scout' ? 45 : 25;
    this.world.score += pts;
    this.audio.sfxExplodeBig();
    this.burst(o.screenX, o.screenY, '#ffd166', 18, 150, 0.6);
    this.burst(o.screenX, o.screenY, '#ff8c3d', 10, 100, 0.45);
    this.emitToast(o.type === 'scout' ? 'raider destroyed' : 'target destroyed');
  }

  // -- obstacle updates and collision -------------------------------------------
  private updateObstacles(dt: number, speed: number): void {
    for (const o of this.obstacles) {
      if (!o.active) continue;
      o.z -= speed * dt;
      if (o.flashTimer > 0) o.flashTimer = Math.max(0, o.flashTimer - dt);

      if (o.type === 'scout') {
        o.lane = P.clampLane(o.baseLane + Math.sin(this.world.t * 1.5 + o.phase) * 0.34);
      }

      const scale = P.projectScale(Math.max(o.z, 0), CFG.FOCAL);
      o.scale = scale;
      o.screenX = P.laneToX(o.lane, CFG.W / 2, CFG.ROAD_HALF_NEAR, this.world.curveCur, scale, CFG.CURVE_AMP);
      o.screenY = CFG.HORIZON_Y + scale * (CFG.PLANE_Y - CFG.HORIZON_Y);

      if (!o.resolved && o.z <= CFG.COLLIDE_Z) {
        const px = this.playerScreenX();
        const obstacleRadius = VISUAL_RADIUS[o.type] * Math.max(scale, 0.2);
        const playerRadius = 15;
        const dist = Math.abs(o.screenX - px);
        const hit = dist < (playerRadius + obstacleRadius) * 0.76;
        if (hit) this.resolveHit(o);
        else if (o.z <= CFG.PASS_Z) this.resolvePass(o);
      }

      if (o.z < CFG.DESPAWN_Z) o.active = false;
    }
  }

  private resolveHit(o: Obstacle): void {
    o.resolved = true;
    if (o.type === 'stone') {
      if (this.player.boosting > 0) this.skipStone(o);
      else this.grazeStone(o);
      return;
    }
    if (this.player.invuln > 0) {
      this.world.sectorProgress++;
      this.world.score += 10;
      this.checkSectorComplete();
      return;
    }
    this.loseLife(o);
  }

  private resolvePass(o: Obstacle): void {
    o.resolved = true;
    this.world.sectorProgress++;
    this.world.score += 15;
    this.audio.sfxPass();
    this.checkSectorComplete();
  }

  private skipStone(o: Obstacle): void {
    const w = this.world;
    w.combo = Math.min(5, w.combo + 1);
    w.comboTimer = 2.2;
    w.score += 40 * w.combo;
    w.sectorProgress++;
    this.audio.sfxSkip();
    this.showCombo();
    this.burst(o.screenX, o.screenY, '#5dffb0', 10, 90, 0.5);
    this.checkSectorComplete();
  }

  private grazeStone(o: Obstacle): void {
    this.world.combo = 1;
    this.world.speedPenalty = Math.min(this.world.speedPenalty, 0.88);
    this.audio.sfxGraze();
    this.burst(o.screenX, o.screenY, '#9b9484', 6, 60, 0.4);
  }

  private loseLife(o: Obstacle): void {
    this.player.lives = Math.max(0, this.player.lives - 1);
    this.world.combo = 1;
    this.burst(o.screenX, o.screenY, '#ff4d5e', 16, 140, 0.6);
    this.world.shake = 16;
    this.audio.sfxHit();
    if (this.player.lives <= 0) { this.gameOver(); return; }
    this.player.invuln = CFG.INVULN_TIME;
    this.world.speedPenalty = 0.55;
    this.emitToast('hull breach');
  }

  private checkSectorComplete(): void {
    const w = this.world;
    if (w.sectorProgress >= w.sectorQuota) {
      w.sector++;
      w.sectorProgress = 0;
      w.sectorQuota = P.sectorQuota(w.sector, CFG.SECTOR_BASE, CFG.SECTOR_GROWTH);
      w.score += 250;
      w.speedPenalty = Math.min(w.speedPenalty, 0.82);
      w.paletteIndex = w.sector % PALETTES.length;
      this.audio.sfxSector();

      if (w.sector > 0 && w.sector % CFG.BOSS_EVERY === 0) {
        this.emitToast(`sector ${w.sector + 1} clear`);
        this.startBossIntro();
        return;
      }
      this.emitToast(`sector ${w.sector + 1} clear`);
    }
  }

  // -- boss encounters -------------------------------------------------------
  private startBossIntro(): void {
    this.state = STATE.BOSSINTRO;
    this.world.bossIntroTimer = CFG.BOSS_INTRO_TIME;
    this.audio.sfxSector();
  }

  private spawnBoss(): void {
    const def = BOSS_DEFS[this.world.bossCycle % BOSS_DEFS.length];
    const cycleNum = Math.floor(this.world.bossCycle / BOSS_DEFS.length);
    const hp = def.baseHp + cycleNum * def.hpPerCycle;
    this.boss = new Boss(def, hp);
    this.state = STATE.BOSS;
  }

  private damageBoss(dmg: number, hitX: number, hitY: number): void {
    const boss = this.boss;
    if (!boss || boss.defeated) return;
    boss.hp = Math.max(0, boss.hp - dmg);
    boss.flashTimer = 0.08;
    this.burst(hitX, hitY, '#ffd166', 5, 90, 0.3);
    this.audio.sfxExplodeSmall();
    if (boss.hp <= 0) this.defeatBoss();
  }

  private defeatBoss(): void {
    const boss = this.boss;
    if (!boss) return;
    boss.defeated = true;
    this.audio.sfxExplodeBig();
    this.burst(boss.screenX, boss.screenY, '#ffd166', 30, 200, 0.9);
    this.burst(boss.screenX, boss.screenY, '#ff8c3d', 20, 150, 0.7);
    this.burst(boss.screenX, boss.screenY, '#ff4d5e', 16, 120, 0.6);
    this.world.score += CFG.BOSS_DEFEAT_SCORE;
    this.world.bossCycle++;
    this.world.shake = 26;
    this.emitToast(`${boss.def.name} destroyed`);
    this.boss = null;
    this.state = STATE.PLAYING;
    this.world.speedPenalty = Math.min(this.world.speedPenalty, 0.9);
  }

  private updateBossIntro(dt: number): void {
    this.updateIdle(dt);
    this.world.bossIntroTimer -= dt;
    if (this.world.bossIntroTimer <= 0) this.spawnBoss();
  }

  private bossMove(dt: number): void {
    const boss = this.boss!;
    const def = boss.def;
    boss.phase += dt;
    switch (def.moveType) {
      case 'weave':
        boss.lane = Math.sin(boss.phase * def.moveSpeed) * 0.6;
        break;
      case 'dart':
        if (Math.floor(boss.phase * def.moveSpeed) !== Math.floor((boss.phase - dt) * def.moveSpeed)) {
          boss.dartTarget = (Math.random() * 2 - 1) * 0.8;
        }
        boss.lane = P.approach(boss.lane, boss.dartTarget, dt, 5);
        break;
      case 'hold':
        boss.lane = Math.sin(boss.phase * def.moveSpeed) * 0.15;
        break;
      case 'drift':
        boss.lane = Math.sin(boss.phase * def.moveSpeed) * 0.45;
        break;
      default:
        boss.lane = 0;
    }
    boss.lane = P.clampLane(boss.lane);
  }

  private freeEnemyBoltSlot(): EnemyBolt | null {
    return this.enemyBolts.find((b) => !b.active) ?? null;
  }

  private fireEnemyBolt(lane: number, speedMul = 1, color?: string): void {
    const boss = this.boss!;
    const slot = this.freeEnemyBoltSlot();
    if (!slot) return;
    slot.active = true;
    slot.lane = P.clampLane(lane);
    slot.z = CFG.BOSS_Z;
    slot.vz = -CFG.BOSS_BOLT_SPEED * speedMul;
    slot.life = 4;
    slot.color = color || boss.def.accent;
  }

  private bossFire(dt: number): void {
    const boss = this.boss!;
    const def = boss.def;
    boss.fireTimer -= dt;
    if (boss.fireTimer > 0) return;
    boss.fireTimer = def.fireInterval;

    switch (def.fireType) {
      case 'spreadVolley':
        this.fireEnemyBolt(boss.lane - 0.4, def.boltSpeed);
        this.fireEnemyBolt(boss.lane, def.boltSpeed);
        this.fireEnemyBolt(boss.lane + 0.4, def.boltSpeed);
        this.audio.sfxFireCannon();
        break;
      case 'aimedSingle': {
        const lead = P.clamp(boss.lane + (this.player.lane - boss.lane) * 0.7 + this.player.vel * 0.12, -1, 1);
        this.fireEnemyBolt(lead, def.boltSpeed);
        this.audio.sfxFireLaser();
        break;
      }
      case 'alternating': {
        const leftAlive = boss.podLeftHp > 0;
        const rightAlive = boss.podRightHp > 0;
        if (leftAlive) this.fireEnemyBolt(boss.lane - 0.3, def.boltSpeed);
        if (rightAlive) this.fireEnemyBolt(boss.lane + 0.3, def.boltSpeed);
        if (!leftAlive && !rightAlive) this.fireEnemyBolt(boss.lane, def.boltSpeed * 1.2);
        this.audio.sfxFireCannon();
        break;
      }
      case 'trackingBeam':
        this.fireEnemyBolt(this.player.lane, def.boltSpeed, '#ff4d5e');
        if (boss.addsSpawned < 3 + Math.floor(this.world.bossCycle / BOSS_DEFS.length)) {
          this.spawnBossAdd();
          boss.addsSpawned++;
        }
        this.audio.sfxFireMissile();
        break;
      default:
        break;
    }
  }

  private spawnBossAdd(): void {
    const boss = this.boss!;
    const slot = this.freeObstacleSlot();
    if (!slot) return;
    slot.active = true; slot.resolved = false; slot.destroyed = false;
    slot.type = 'scout';
    slot.z = CFG.BOSS_Z + 200;
    slot.lane = boss.lane + (Math.random() * 2 - 1) * 0.5;
    slot.baseLane = slot.lane;
    slot.phase = Math.random() * Math.PI * 2;
    slot.scale = 0.1;
    slot.maxHp = 1; slot.hp = 1;
    slot.flashTimer = 0;
  }

  private updateEnemyBolts(dt: number): void {
    for (const b of this.enemyBolts) {
      if (!b.active) continue;
      b.z -= Math.abs(b.vz) * dt;
      b.life -= dt;

      if (b.z <= CFG.COLLIDE_Z) {
        const scale = P.projectScale(Math.max(b.z, 0), CFG.FOCAL);
        const bx = P.laneToX(b.lane, CFG.W / 2, CFG.ROAD_HALF_NEAR, this.world.curveCur, scale, CFG.CURVE_AMP);
        const px = this.playerScreenX();
        if (Math.abs(bx - px) < 30 && this.player.invuln <= 0) this.loseLifeFromBoss();
        b.active = false;
        continue;
      }
      if (b.life <= 0 || b.z < CFG.DESPAWN_Z) b.active = false;
    }
  }

  private loseLifeFromBoss(): void {
    this.player.lives = Math.max(0, this.player.lives - 1);
    this.world.combo = 1;
    this.burst(this.playerScreenX(), CFG.PLANE_Y - 28, '#ff4d5e', 16, 140, 0.6);
    this.world.shake = 16;
    this.audio.sfxHit();
    if (this.player.lives <= 0) { this.gameOver(); return; }
    this.player.invuln = CFG.INVULN_TIME;
    this.emitToast('shields hit');
  }

  private updateBossFight(dt: number): void {
    const boss = this.boss;
    if (!boss) return;
    this.world.t += dt;
    this.world.rotAccum += dt * 0.5;
    this.updatePlayer(dt, this.currentSpeed());
    this.updateWeapon(dt);
    this.updateStars(dt, CFG.IDLE_SPEED);

    if (boss.entryTimer > 0) {
      boss.entryTimer -= dt;
      boss.z = P.lerp(CFG.Z_SPAWN * 0.6, CFG.BOSS_Z, 1 - Math.max(0, boss.entryTimer) / CFG.BOSS_ENTRY_TIME);
    } else {
      boss.z = CFG.BOSS_Z;
      this.bossMove(dt);
      this.bossFire(dt);
    }

    const scale = P.projectScale(Math.max(boss.z, 0), CFG.FOCAL);
    boss.scale = scale;
    boss.screenX = P.laneToX(boss.lane, CFG.W / 2, CFG.ROAD_HALF_NEAR, this.world.curveCur, scale, CFG.CURVE_AMP);
    boss.screenY = CFG.HORIZON_Y + scale * (CFG.PLANE_Y - CFG.HORIZON_Y);
    if (boss.flashTimer > 0) boss.flashTimer = Math.max(0, boss.flashTimer - dt);

    this.updatePlayerBoltsVsBoss(dt);
    this.updateEnemyBolts(dt);
    this.updateObstacles(dt, CFG.IDLE_SPEED * 0.6);
    this.updateParticles(dt);

    if (this.player.invuln > 0) this.player.invuln = Math.max(0, this.player.invuln - dt);
    if (this.player.boosting > 0) this.player.boosting = Math.max(0, this.player.boosting - dt);
    if (this.player.hopCooldown > 0) this.player.hopCooldown = Math.max(0, this.player.hopCooldown - dt);
    this.world.shake = Math.max(0, this.world.shake - dt * 38);
  }

  private updatePlayerBoltsVsBoss(dt: number): void {
    const boss = this.boss;
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.z += b.vz * dt;
      b.life -= dt;

      if (boss && !boss.defeated && Math.abs(b.z - boss.z) < 70) {
        const laneDist = Math.abs(boss.lane - b.lane);
        if (laneDist < CFG.BOSS_HIT_RADIUS) {
          const def = WEAPONS[b.weaponKey] || WEAPONS.laser;
          this.applyBossDamage(def.dmg, b.lane, boss.screenX, boss.screenY);
          b.active = false;
          continue;
        }
      }
      if (b.z > CFG.Z_SPAWN * 1.05 || b.life <= 0) b.active = false;
    }
  }

  private applyBossDamage(dmg: number, hitLane: number, hx: number, hy: number): void {
    const boss = this.boss!;
    if (boss.def.key === 'sentinel' && (boss.podLeftHp > 0 || boss.podRightHp > 0)) {
      if (hitLane <= boss.lane && boss.podLeftHp > 0) boss.podLeftHp = Math.max(0, boss.podLeftHp - dmg);
      else if (boss.podRightHp > 0) boss.podRightHp = Math.max(0, boss.podRightHp - dmg);
      else if (boss.podLeftHp > 0) boss.podLeftHp = Math.max(0, boss.podLeftHp - dmg);
      this.damageBoss(dmg, hx, hy);
      return;
    }
    this.damageBoss(dmg, hx, hy);
  }

  private maybeAwardExtraLife(): void {
    if (this.world.score >= this.world.nextLifeScore && this.player.lives < CFG.MAX_LIVES) {
      this.player.lives++;
      this.world.nextLifeScore += CFG.EXTRA_LIFE_SCORE;
      this.audio.sfxLife();
      this.emitToast('extra ship earned');
    }
  }

  private updateStars(dt: number, speed: number): void {
    const speedFactor = speed / CFG.MAX_SPEED;
    for (const s of this.stars) {
      s.y += (20 + s.layer * 60) * speedFactor * dt + s.layer * 8 * dt;
      if (s.y > CFG.H + 10) {
        s.y = CFG.HORIZON_Y - Math.random() * 30;
        s.x = Math.random() * CFG.W;
      }
    }
    for (const n of this.nebulae) {
      n.x += n.driftX * dt;
      if (n.x < -n.r) n.x = CFG.W + n.r;
      if (n.x > CFG.W + n.r) n.x = -n.r;
    }
  }

  // -- HUD snapshot -------------------------------------------------------
  private pushHud(): void {
    if (!this.hudListener) return;
    const best = Math.max(this.storage.getBest(), Math.round(this.world.score));
    const bossDef = this.boss?.def ?? BOSS_DEFS[this.world.bossCycle % BOSS_DEFS.length];
    const snapshot: HudSnapshot = {
      state: this.state,
      score: Math.round(this.world.score),
      best,
      lives: this.player.lives,
      sector: this.world.sector,
      sectorPct: this.world.sectorQuota > 0 ? P.clamp(this.world.sectorProgress / this.world.sectorQuota, 0, 1) : 0,
      combo: this.world.combo,
      comboVisible: this.world.comboTimer > 0,
      weapon: this.player.weapon,
      weaponHeatPct: this.player.heat,
      bossVisible: this.boss !== null,
      bossName: this.boss ? this.boss.def.name.toLowerCase() : '',
      bossHpPct: this.boss && this.boss.maxHp > 0 ? P.clamp(this.boss.hp / this.boss.maxHp, 0, 1) : 0,
      bossIntroName: bossDef.name,
      bossIntroTagline: bossDef.tagline,
      finalScore: Math.round(this.world.score),
      isNewBest: this.world.score > this.storage.getBest(),
      scoreList: this.storage.getScores(),
      toastMessage: this.currentToast,
      toastNonce: this.toastNonce,
      muted: this.audio.isMuted(),
    };
    this.hudListener(snapshot);
  }
}
