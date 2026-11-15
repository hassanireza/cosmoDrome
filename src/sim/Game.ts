import { WORLD, KINDS, WEAPONS, WEAPON_ORDER, BOSSES, MOODS, BRAND } from '../core/config.ts';
import type { Mood } from '../core/config.ts';
import { clamp, damp, lerp, mixRgb, moveToward } from '../core/math.ts';
import { mulberry32 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';
import type { GameEvent, GameState, HudSnapshot, Kind, Outcome, Settings, WeaponKey } from '../core/types.ts';
import { DynamicDifficulty } from '../ai/DynamicDifficulty.ts';
import { Director } from '../ai/Director.ts';
import { Spawner } from '../ai/Spawner.ts';
import { BossBrain } from '../ai/BossBrain.ts';
import type { VolleyPlan } from '../ai/BossBrain.ts';
import { bossLaneValue } from '../ai/PlayerModel.ts';
import { Rewards } from '../ai/Rewards.ts';
import type { InputState } from '../input/InputState.ts';
import { Storage } from '../storage/Storage.ts';
import { Boss } from './Boss.ts';
import { Bolt, EnemyBolt, Entity, PatternRecord } from './Entities.ts';
import { Particles } from './Particles.ts';
import { Track } from './Track.ts';

export interface PlayerState {
  lane: number;
  vel: number;
  bank: number;
  y: number;
  hopT: number;
  hopCd: number;
  invuln: number;
  weapon: WeaponKey;
  heat: number;
  overheated: boolean;
  fireT: number;
  visible: boolean;
}

interface Volley {
  plan: VolleyPlan;
  remaining: number;
  hits: number;
  near: number;
}

type Listener = (e: GameEvent) => void;

const clampLane = (l: number): number => clamp(l, -0.95, 0.95);

/**
 * The simulation. It owns every system (track, spawner, director, difficulty, boss
 * brain, rewards) and nothing about rendering or the DOM, so it runs under Node for
 * tests and drives the WebGL renderer and the React HUD through plain data.
 */
export class Game {
  readonly storage = new Storage();
  settings: Settings;
  readonly input: InputState;

  rng: Rng;
  track: Track;
  readonly dda = new DynamicDifficulty();
  readonly director: Director;
  readonly spawner: Spawner;
  readonly rewards: Rewards;
  readonly brain: BossBrain;
  readonly particles: Particles;

  state: GameState = 'menu';
  private statePrePause: GameState = 'playing';

  time = 0;
  t = 0;
  distance = 0;
  speed = 24;
  score = 0;
  lives: number = WORLD.START_LIVES;
  shield = false;
  round = 0;
  roundProgress = 0;
  roundQuota: number = WORLD.SECTOR_BASE;
  penalty = 1;

  readonly player: PlayerState = {
    lane: 0, vel: 0, bank: 0, y: 0, hopT: -1, hopCd: 0, invuln: 0,
    weapon: 'pulse', heat: 0, overheated: false, fireT: 0, visible: true,
  };

  readonly entities: Entity[] = Array.from({ length: WORLD.POOL_ENTITIES }, () => new Entity());
  readonly bolts: Bolt[] = Array.from({ length: WORLD.POOL_BOLTS }, () => new Bolt());
  readonly enemyBolts: EnemyBolt[] = Array.from({ length: WORLD.POOL_ENEMY_BOLTS }, () => new EnemyBolt());
  private readonly patterns: PatternRecord[] = Array.from({ length: 48 }, () => new PatternRecord());
  private nextPatternDist = 0;

  boss: Boss | null = null;
  private bossCycle = 0;
  private bossIntroT = 0;
  private volleys = new Map<number, Volley>();
  private volleySeq = 0;

  mood: Mood;
  private moodTarget: Mood;
  readonly shake = { v: 0 };
  flash = 0;
  hitstop = 0;
  fovKick = 0;
  /** Seconds the last pickup glow should linger, drives a subtle halo response. */
  glowPulse = 0;

  private toast: string | null = null;
  private toastNonce = 0;
  private listeners = new Set<Listener>();
  private nextLifeScore: number = WORLD.EXTRA_LIFE_SCORE;
  private isNewBest = false;
  private moment = '';
  private stats = { near: 0, kills: 0, bosses: 0, hops: 0 };
  private scoresCache: number[] = [];
  private bestCache = 0;
  private trailClock = 0;

  constructor(input: InputState, seed = (Math.random() * 2 ** 31) | 0) {
    this.input = input;
    this.rng = mulberry32(seed);
    this.track = new Track(seed);
    this.director = new Director(this.rng);
    this.spawner = new Spawner(this.rng);
    this.rewards = new Rewards(this.rng);
    this.brain = new BossBrain(this.rng);
    this.particles = new Particles(this.rng);
    this.settings = this.storage.getSettings();
    this.dda.enabled = this.settings.adaptive;
    this.player.weapon = this.storage.getWeapon();
    this.mood = { ...MOODS[0] };
    this.moodTarget = MOODS[0];
    this.bestCache = this.storage.getBest();
    this.scoresCache = this.storage.getScores();
  }

  // -- public API -----------------------------------------------------------

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: GameEvent): void {
    this.listeners.forEach((l) => l(e));
  }

  private say(message: string): void {
    this.toast = message;
    this.toastNonce++;
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.dda.enabled = s.adaptive;
    this.storage.setSettings(s);
  }

  startRun(seed?: number): void {
    if (seed !== undefined) {
      this.rng = mulberry32(seed);
      this.track = new Track(seed);
    }
    const prior = this.storage.getSkill();
    this.storage.bumpRuns();
    this.dda.enabled = this.settings.adaptive;
    this.dda.reset(prior ?? undefined);
    this.director.reset();
    this.rewards.reset();

    this.t = 0;
    this.distance = 0;
    this.speed = WORLD.MIN_SPEED;
    this.score = 0;
    this.lives = WORLD.START_LIVES;
    this.shield = false;
    this.round = 0;
    this.roundProgress = 0;
    this.roundQuota = WORLD.SECTOR_BASE;
    this.penalty = 0.8;
    this.nextLifeScore = WORLD.EXTRA_LIFE_SCORE;
    this.isNewBest = false;
    this.moment = '';
    this.stats = { near: 0, kills: 0, bosses: 0, hops: 0 };
    this.bossCycle = 0;
    this.boss = null;
    this.volleys.clear();
    this.hitstop = 0;
    this.flash = 0;
    this.shake.v = 0;
    this.moodTarget = MOODS[0];

    const p = this.player;
    p.lane = 0; p.vel = 0; p.bank = 0; p.y = 0; p.hopT = -1; p.hopCd = 0; p.invuln = 1.2;
    p.heat = 0; p.overheated = false; p.fireT = 0.2; p.visible = true;

    this.entities.forEach((e) => e.reset());
    this.bolts.forEach((b) => { b.active = false; });
    this.enemyBolts.forEach((b) => { b.active = false; });
    this.patterns.forEach((r) => { r.active = false; });
    this.particles.clear();

    this.nextPatternDist = 110;
    this.spawner.reset(this.nextPatternDist);
    this.state = 'playing';
    this.say('hold the line');
    this.emit({ t: 'launch' });
  }

  toMenu(): void {
    this.state = 'menu';
    this.boss = null;
    this.player.visible = true;
    this.player.y = 0;
    this.player.hopT = -1;
    this.entities.forEach((e) => e.reset());
    this.bolts.forEach((b) => { b.active = false; });
    this.enemyBolts.forEach((b) => { b.active = false; });
    this.moodTarget = MOODS[0];
    this.scoresCache = this.storage.getScores();
  }

  togglePause(): void {
    if (this.state === 'playing' || this.state === 'boss' || this.state === 'bossintro') {
      this.statePrePause = this.state;
      this.state = 'paused';
    } else if (this.state === 'paused') {
      this.state = this.statePrePause;
    }
  }

  setWeapon(key: WeaponKey): void {
    if (!WEAPONS[key] || this.player.weapon === key) return;
    this.player.weapon = key;
    this.player.heat = Math.max(0, this.player.heat - 0.1);
    this.player.fireT = 0;
    this.storage.setWeapon(key);
    this.say(WEAPONS[key].label);
  }

  cycleWeapon(): void {
    const i = WEAPON_ORDER.indexOf(this.player.weapon);
    this.setWeapon(WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length]);
  }

  /** Frame entry point. Splits long frames so swept collision stays honest on slow devices. */
  update(realDt: number): void {
    let dt = clamp(realDt, 0, 0.1);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      dt *= 0.15;
    }
    const n = Math.max(1, Math.ceil(dt / (1 / 45)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.step(h);
  }

  // -- stepping -------------------------------------------------------------

  private step(dt: number): void {
    if (this.state === 'paused') return;
    this.time += dt;

    if (this.state === 'menu' || this.state === 'gameover') this.stepAttract(dt);
    else if (this.state === 'bossintro') this.stepBossIntro(dt);
    else this.stepRun(dt);

    this.mood = this.blendMood(dt);
    this.particles.update(dt, this.speed);
    const calm = this.settings.reducedMotion ? 3 : 1;
    this.shake.v = Math.max(0, this.shake.v - dt * 30 * calm);
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.fovKick = damp(this.fovKick, 0, 5, dt);
    this.glowPulse = Math.max(0, this.glowPulse - dt);
  }

  private blendMood(dt: number): Mood {
    const a = this.mood;
    const b = this.moodTarget;
    const k = 1 - Math.exp(-0.55 * dt);
    const m = (x: Mood['top'], y: Mood['top']): Mood['top'] => mixRgb(x, y, k, [0, 0, 0]);
    return {
      name: b.name,
      top: m(a.top, b.top), mid: m(a.mid, b.mid), horizon: m(a.horizon, b.horizon), abyss: m(a.abyss, b.abyss),
      fog: m(a.fog, b.fog), light: m(a.light, b.light), slab: m(a.slab, b.slab), mono: m(a.mono, b.mono),
      halo: lerp(a.halo, b.halo, k),
    };
  }

  private stepAttract(dt: number): void {
    this.speed = damp(this.speed, 24, 1.5, dt);
    this.distance += this.speed * dt;
    const p = this.player;
    p.lane = Math.sin(this.time * 0.45) * 0.55;
    p.vel = Math.cos(this.time * 0.45) * 0.25;
    p.bank = damp(p.bank, p.vel, 4, dt);
    p.y = 0;
    this.emitTrail(dt);
  }

  private stepBossIntro(dt: number): void {
    this.speed = damp(this.speed, WORLD.BOSS_SPEED, 1.2, dt);
    this.distance += this.speed * dt;
    this.updatePlayer(dt);
    this.updateEntities(dt);
    this.updateEnemyBolts(dt);
    this.emitTrail(dt);
    this.bossIntroT -= dt;
    if (this.bossIntroT <= 0) this.spawnBoss();
  }

  private currentSpeed(): number {
    if (this.state === 'boss') return WORLD.BOSS_SPEED;
    const ramp = lerp(WORLD.MIN_SPEED, WORLD.RAMP_SPEED, 1 - Math.exp(-this.t / WORLD.RAMP_TAU));
    const base = Math.min(WORLD.MAX_SPEED, ramp + this.round * WORLD.SECTOR_BUMP);
    const relief = this.director.phase === 'relax' ? 0.95 : 1;
    return base * this.dda.profile.speedScale * this.penalty * relief;
  }

  private stepRun(dt: number): void {
    this.t += dt;
    this.penalty = damp(this.penalty, 1, 1.1, dt);
    this.speed = damp(this.speed, this.currentSpeed(), 4, dt);
    this.distance += this.speed * dt;
    this.score += this.speed * dt * 0.2;

    this.updatePlayer(dt);
    this.updateWeapon(dt);
    this.updateBolts(dt);
    this.updateEntities(dt);
    this.updateEnemyBolts(dt);
    if (this.state === 'playing') this.updateSpawner();
    else if (this.state === 'boss') this.updateBoss(dt);
    this.emitTrail(dt);

    const phase = this.director.update(dt, {
      threat: this.computeThreat(),
      bossActive: this.state === 'boss',
      d: this.dda.d,
      frustration: this.dda.model.frustration(),
      boredom: this.dda.model.boredom(),
    });
    if (phase) this.emit({ t: 'phase', phase });
    this.dda.update(dt, this.round, this.lives, this.player.lane, this.player.vel);
    this.rewards.tick(dt);

    const p = this.player;
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.hopCd > 0) p.hopCd = Math.max(0, p.hopCd - dt);
    if (this.score >= this.nextLifeScore && this.lives < WORLD.MAX_LIVES) {
      this.lives++;
      this.nextLifeScore += WORLD.EXTRA_LIFE_SCORE;
      this.say('extra hull');
      this.emit({ t: 'life' });
    }
  }

  private computeThreat(): number {
    let t = 0;
    for (const e of this.entities) {
      if (!e.active || e.resolved) continue;
      const k = KINDS[e.kind];
      if (!k.solid) continue;
      if (e.z > 0 && e.z < 70) t += (1 - e.z / 70) * (e.kind === 'ruin' ? 1.4 : 1);
    }
    for (const b of this.enemyBolts) if (b.active && !b.resolved) t += 1.2;
    return t / 5;
  }

  // -- player ---------------------------------------------------------------

  private updatePlayer(dt: number): void {
    const p = this.player;
    const inp = this.input;
    const drift = this.track.drift(this.distance, this.speed);

    let desired: number;
    if (inp.pointerActive) desired = clamp((inp.targetLane - p.lane) * 14, -WORLD.LATERAL_MAX, WORLD.LATERAL_MAX);
    else desired = inp.axis * WORLD.LATERAL_MAX;
    p.vel = moveToward(p.vel, desired, WORLD.LATERAL_ACCEL * dt);
    p.lane += (p.vel + drift) * dt;
    if (p.lane > 1) { p.lane = 1; if (p.vel > 0) p.vel = 0; }
    if (p.lane < -1) { p.lane = -1; if (p.vel < 0) p.vel = 0; }
    p.bank = damp(p.bank, clamp(p.vel / WORLD.LATERAL_MAX, -1, 1), 9, dt);

    if (inp.hopQueued) {
      inp.hopQueued = false;
      if ((this.state === 'playing' || this.state === 'boss') && p.hopCd <= 0 && p.hopT < 0) {
        p.hopT = 0;
        p.hopCd = WORLD.HOP_COOLDOWN;
        this.stats.hops++;
        this.fovKick = 1;
        this.emit({ t: 'hop' });
      }
    }
    if (p.hopT >= 0) {
      p.hopT += dt;
      const u = p.hopT / WORLD.HOP_TIME;
      if (u >= 1) { p.hopT = -1; p.y = 0; }
      else p.y = 4 * WORLD.HOP_HEIGHT * u * (1 - u);
    }
  }

  private emitTrail(dt: number): void {
    const p = this.player;
    if (!p.visible) return;
    this.trailClock += dt;
    const interval = 0.022;
    while (this.trailClock > interval) {
      this.trailClock -= interval;
      const x = this.track.laneX(this.distance, p.lane, 0) + (this.rng.next() - 0.5) * 0.3;
      const c = this.rng.chance(0.3) ? BRAND.bright : BRAND.silver;
      this.particles.puff(x, 0.75 + p.y + (this.rng.next() - 0.5) * 0.1, -1.1, (this.rng.next() - 0.5) * 0.5, 0.1, -3.5, 0.5, 0.16, c, 0.8);
    }
  }

  // -- weapons --------------------------------------------------------------

  private updateWeapon(dt: number): void {
    const p = this.player;
    const w = WEAPONS[p.weapon];
    p.heat = Math.max(0, p.heat - w.cool * dt);
    if (p.overheated && p.heat < 0.4) p.overheated = false;
    p.fireT -= dt;
    if (p.fireT > 0 || p.overheated) return;
    if (this.state === 'bossintro') return;
    p.fireT = w.rate;

    const lanes: number[] = w.bolts === 1 ? [p.lane] : w.bolts === 2 ? [p.lane - w.spread, p.lane + w.spread] : [p.lane - w.spread, p.lane, p.lane + w.spread];
    for (const l of lanes) {
      const b = this.bolts.find((x) => !x.active);
      if (!b) break;
      b.active = true;
      b.hit = false;
      b.lane = clamp(l, -1, 1);
      b.z = 2;
      b.speed = w.speed;
      b.weapon = p.weapon;
      b.life = 2.4;
      b.target = w.homing ? this.findTarget() : null;
    }
    p.heat = Math.min(1, p.heat + w.heat);
    if (p.heat >= 1) p.overheated = true;
    this.emit({ t: 'fire', weapon: p.weapon });
  }

  private findTarget(): Entity | null {
    let best: Entity | null = null;
    let bz = Infinity;
    for (const e of this.entities) {
      if (!e.active || e.resolved || !KINDS[e.kind].solid) continue;
      if (e.z > 8 && e.z < bz) { bz = e.z; best = e; }
    }
    return best;
  }

  private updateBolts(dt: number): void {
    const boss = this.boss;
    for (const b of this.bolts) {
      if (!b.active) continue;
      const w = WEAPONS[b.weapon];
      b.life -= dt;
      if (w.homing) {
        if (!b.target || !b.target.active || b.target.resolved) b.target = this.findTarget();
        if (b.target) b.lane += (b.target.lane - b.lane) * Math.min(1, dt * 5);
        else if (boss && this.state === 'boss') b.lane += (boss.lane - b.lane) * Math.min(1, dt * 3);
      }
      const z0 = b.z;
      b.z += b.speed * dt;

      let consumed = false;
      if (boss && !boss.defeated && boss.entry <= 0) {
        if (z0 <= boss.z + 2.5 && b.z >= boss.z - 2.5 && Math.abs(boss.lane - b.lane) < boss.spec.halfW + 0.07) {
          this.damageBoss(w.dmg);
          consumed = true;
        }
      }
      if (!consumed) {
        for (const e of this.entities) {
          if (!e.active || e.resolved) continue;
          const spec = KINDS[e.kind];
          if (!spec.solid) continue;
          if (b.z < e.z - spec.depth - 1.2 || z0 > e.z + spec.depth + 1.2) continue;
          if (Math.abs(e.lane - b.lane) < spec.halfW + 0.08) {
            this.damageEntity(e, w.dmg);
            consumed = true;
            break;
          }
        }
      }
      if (consumed) {
        b.hit = true;
        this.dda.model.onShot(true);
        b.active = false;
      } else if (b.z > WORLD.SPAWN_Z + 10 || b.life <= 0) {
        this.dda.model.onShot(false);
        b.active = false;
      }
    }
  }

  // -- entities -------------------------------------------------------------

  private freeEntity(): Entity | null {
    return this.entities.find((e) => !e.active) ?? null;
  }

  private place(kind: Kind, lane: number, z: number, pattern: number): Entity | null {
    const e = this.freeEntity();
    if (!e) return null;
    const spec = KINDS[kind];
    e.active = true;
    e.resolved = false;
    e.kind = kind;
    e.z = z;
    e.zPrev = z;
    e.lane = lane;
    e.baseLane = lane;
    e.phase = this.rng.range(0, Math.PI * 2);
    e.maxHp = spec.hp;
    e.hp = spec.hp;
    e.flash = 0;
    e.minClear = 9;
    e.pattern = pattern;
    e.born = this.time;
    return e;
  }

  private updateSpawner(): void {
    while (this.distance + WORLD.SPAWN_Z >= this.nextPatternDist) {
      const free = this.entities.filter((e) => !e.active).length;
      const rec = this.patterns.find((r) => !r.active);
      const prof = this.dda.profile;
      const plan = this.spawner.plan({
        d: prof.d,
        speed: Math.max(this.speed, WORLD.MIN_SPEED),
        maxTier: prof.maxTier,
        phase: this.director.phase,
        needsVeil: !this.shield && this.dda.model.frustration() > 0.4,
        originZ: this.nextPatternDist,
      });
      if (!rec || free < plan.spawns.length + 2) return;

      rec.active = true;
      rec.index = plan.index;
      rec.difficulty = plan.difficulty;
      rec.worst = null;
      rec.remaining = 0;
      const recId = this.patterns.indexOf(rec);
      for (const s of plan.spawns) {
        const counts = s.kind !== 'mote' && s.kind !== 'veil';
        const e = this.place(s.kind, s.lane, this.nextPatternDist + s.dz - this.distance, counts ? recId : -1);
        if (e && counts) rec.remaining++;
      }
      if (rec.remaining === 0) rec.active = false;

      const gapM = Math.max(36, this.speed * prof.gapSeconds * this.director.gapScale());
      this.nextPatternDist += plan.length + gapM;
    }
  }

  private updateEntities(dt: number): void {
    const p = this.player;
    for (const e of this.entities) {
      if (!e.active) continue;
      e.zPrev = e.z;
      e.z -= this.speed * dt;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
      if (e.kind === 'sentry') e.lane = clampLane(e.baseLane + Math.sin(this.t * 1.5 + e.phase) * 0.34);
      else if (e.kind === 'drone') e.lane = clampLane(e.baseLane + Math.sin(this.t * 2.2 + e.phase) * 0.2);

      const spec = KINDS[e.kind];
      if (!e.resolved && this.state !== 'bossintro') {
        if (e.z <= spec.depth && e.zPrev >= -spec.depth) {
          const grace = e.kind === 'mote' || e.kind === 'veil' ? -0.12 : this.dda.profile.forgiveness;
          const clear = Math.abs(e.lane - p.lane) - (spec.halfW + WORLD.PLAYER_HALF - grace);
          e.minClear = Math.min(e.minClear, clear);
          if (clear < 0) this.contact(e);
        }
        if (!e.resolved && e.z < -spec.depth) this.passEntity(e);
      }
      if (e.z < WORLD.DESPAWN_Z) {
        if (!e.resolved) this.settle(e, 'clean', false);
        e.active = false;
      }
    }
  }

  private contact(e: Entity): void {
    const p = this.player;
    const spec = KINDS[e.kind];
    const x = this.track.laneX(this.distance, e.lane, e.z);
    e.resolved = true;

    if (e.kind === 'mote') {
      this.score += spec.score * this.rewards.combo;
      this.rewards.chain(0);
      e.active = false;
      this.particles.burst(x, 1, e.z, 8, 4, 0.5, 0.18, BRAND.bone, 0, 1.4);
      this.glowPulse = 0.4;
      this.emit({ t: 'pickup', kind: 'mote' });
      return;
    }
    if (e.kind === 'veil') {
      this.shield = true;
      e.active = false;
      this.particles.burst(x, 1, e.z, 14, 5, 0.7, 0.2, BRAND.bright, 0, 1.6);
      this.say('veil');
      this.glowPulse = 0.6;
      this.emit({ t: 'pickup', kind: 'veil' });
      return;
    }
    if (e.kind === 'plinth') {
      if (p.y > spec.height * 0.95) {
        const pts = this.rewards.chain(40);
        this.score += pts;
        this.stats.near++;
        this.particles.burst(x, 0.8, e.z, 8, 3.5, 0.5, 0.15, BRAND.bright, 0, 1.2);
        this.emit({ t: 'graze', combo: this.rewards.combo });
        this.settle(e, 'near', true);
      } else {
        this.penalty = Math.min(this.penalty, 0.86);
        this.rewards.onHit();
        this.particles.burst(x, 0.5, e.z, 6, 3, 0.4, 0.14, BRAND.ash, 4, 0.2);
        this.shake.v = Math.max(this.shake.v, 2.5);
        this.emit({ t: 'shield' });
        this.settle(e, 'hit', true);
      }
      return;
    }
    if (p.invuln > 0) {
      this.score += 10;
      this.settle(e, 'clean', true);
      return;
    }
    this.damagePlayer(x, e.z);
    this.settle(e, 'hit', true);
  }

  private passEntity(e: Entity): void {
    e.resolved = true;
    const spec = KINDS[e.kind];
    if (e.kind === 'mote' || e.kind === 'veil') return;
    const x = this.track.laneX(this.distance, e.lane, e.z);
    const near = e.minClear < 0.09;
    if (near && spec.solid) {
      const pts = this.rewards.chain(40);
      this.score += pts;
      this.stats.near++;
      this.particles.burst(x, 1.2, 0, 6, 3.5, 0.45, 0.14, BRAND.bright, 0, 1.3);
      this.emit({ t: 'graze', combo: this.rewards.combo });
      this.settle(e, 'near', true);
    } else {
      this.score += 15;
      this.emit({ t: 'pass' });
      this.settle(e, 'clean', true);
    }
  }

  /** Books an outcome against the pattern the entity belongs to and advances the round. */
  private settle(e: Entity, outcome: Outcome, progresses: boolean): void {
    if (e.kind === 'mote' || e.kind === 'veil') return;
    if (progresses && this.state === 'playing') {
      this.roundProgress++;
      this.checkRound();
    }
    if (e.pattern < 0) return;
    const rec = this.patterns[e.pattern];
    if (!rec.active) return;
    rec.note(outcome);
    rec.remaining--;
    e.pattern = -1;
    if (rec.remaining <= 0) {
      const result = rec.worst ?? 'clean';
      this.dda.onEncounter(result, rec.difficulty);
      this.spawner.report(rec.index, result);
      rec.active = false;
    }
  }

  private damageEntity(e: Entity, dmg: number): void {
    e.hp -= dmg;
    e.flash = 0.12;
    const x = this.track.laneX(this.distance, e.lane, e.z);
    this.particles.burst(x, 1.2, e.z, 3, 4, 0.3, 0.12, BRAND.bone, 0, 1);
    if (e.hp > 0) return;

    const spec = KINDS[e.kind];
    e.resolved = true;
    e.active = false;
    this.stats.kills++;
    this.score += spec.score;
    this.particles.burst(x, 1.4, e.z, 16, 7, 0.8, 0.22, BRAND.bone, 2, 1.4);
    this.particles.burst(x, 1.4, e.z, 8, 4, 1.0, 0.3, BRAND.fog, 0, 0.4);
    this.emit({ t: 'destroy', big: e.kind === 'ruin' });
    this.settle(e, 'destroyed', true);

    const drop = this.rewards.rollDrop({ hasShield: this.shield, frustration: this.dda.model.frustration(), bias: this.dda.profile.pickupBias });
    if (drop) this.place(drop, e.lane, Math.max(e.z, 10), -1);
  }

  private checkRound(): void {
    if (this.roundProgress < this.roundQuota) return;
    this.round++;
    this.roundProgress = 0;
    this.roundQuota = WORLD.SECTOR_BASE + WORLD.SECTOR_GROWTH * this.round;
    this.score += 250;
    this.penalty = Math.min(this.penalty, 0.85);
    this.moodTarget = MOODS[this.round % MOODS.length];
    this.say(`round ${this.round + 1}`);
    this.emit({ t: 'round', n: this.round + 1 });
    if (this.round % WORLD.BOSS_EVERY === 0) this.startBossIntro();
  }

  // -- damage ---------------------------------------------------------------

  private damagePlayer(x: number, z: number): void {
    const p = this.player;
    if (p.invuln > 0) return;
    this.dda.model.onDamage();
    this.rewards.onHit();
    if (this.shield) {
      this.shield = false;
      p.invuln = 0.9;
      this.flash = 0.5;
      this.shake.v = 6;
      this.particles.burst(x, 1, z, 24, 7, 0.8, 0.2, BRAND.bright, 0, 1.6);
      this.say('veil broken');
      this.emit({ t: 'shield' });
      return;
    }
    this.dda.onDamage();
    this.director.damage();
    this.lives = Math.max(0, this.lives - 1);
    this.penalty = 0.6;
    this.flash = 1;
    this.shake.v = 14;
    this.hitstop = 0.09;
    this.particles.burst(x, 1, z, 26, 8, 0.9, 0.24, BRAND.oxide, 3, 1.5);
    this.emit({ t: 'hit' });
    if (this.lives <= 0) {
      this.gameOver();
      return;
    }
    p.invuln = WORLD.INVULN;
    this.say('hull breach');
  }

  private gameOver(): void {
    this.state = 'gameover';
    this.player.visible = false;
    const px = this.track.laneX(this.distance, this.player.lane, 0);
    this.particles.burst(px, 1, 0, 60, 10, 1.4, 0.3, BRAND.bone, 2, 1.6);
    this.particles.burst(px, 1, 0, 30, 6, 1.8, 0.4, BRAND.oxide, 0, 1.2);
    this.emit({ t: 'gameover' });

    const final = Math.round(this.score);
    this.isNewBest = final > this.storage.getBest();
    if (this.isNewBest) this.storage.setBest(final);
    this.scoresCache = this.storage.addScore(final);
    this.bestCache = this.storage.getBest();
    const m = this.dda.model;
    this.storage.setSkill({ theta: m.theta, sigma: m.sigma });
    this.moment = this.pickMoment();
  }

  /** Peak-end rule: end the run by naming the best thing that happened in it. */
  private pickMoment(): string {
    const s = this.stats;
    const candidates: Array<[number, string]> = [
      [this.rewards.bestCombo >= 4 ? this.rewards.bestCombo * 2 : 0, `a chain of ${this.rewards.bestCombo}`],
      [s.bosses > 0 ? 20 : 0, s.bosses === 1 ? 'one colossus brought down' : `${s.bosses} colossi brought down`],
      [s.near >= 5 ? s.near : 0, `${s.near} breaths from the stone`],
      [s.kills >= 12 ? s.kills / 2 : 0, `${s.kills} shapes broken`],
      [this.round >= 2 ? this.round * 3 : 0, `reached round ${this.round + 1}`],
    ];
    candidates.sort((a, b) => b[0] - a[0]);
    return candidates[0][0] > 0 ? candidates[0][1] : 'the first of many drifts';
  }

  // -- boss -----------------------------------------------------------------

  private startBossIntro(): void {
    this.state = 'bossintro';
    this.bossIntroT = WORLD.BOSS_INTRO;
    for (const e of this.entities) {
      if (e.active && e.z > 30) {
        const x = this.track.laneX(this.distance, e.lane, e.z);
        this.particles.burst(x, 1.2, e.z, 4, 2, 1, 0.3, BRAND.fog, 0, 0.5);
        e.active = false;
        if (e.pattern >= 0) this.patterns[e.pattern].active = false;
      }
    }
    this.emit({ t: 'bossIntro' });
  }

  private spawnBoss(): void {
    const spec = BOSSES[this.bossCycle % BOSSES.length];
    const cycles = Math.floor(this.bossCycle / BOSSES.length);
    const hp = Math.max(10, Math.round((spec.baseHp + cycles * spec.hpPerCycle) * 3.2 * this.dda.profile.bossHp));
    this.boss = new Boss(spec, hp);
    this.state = 'boss';
  }

  private updateBoss(dt: number): void {
    const b = this.boss;
    if (!b) return;
    b.t += dt;
    if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);

    if (b.entry > 0) {
      b.entry -= dt;
      const k = 1 - Math.max(0, b.entry) / WORLD.BOSS_ENTRY;
      b.z = lerp(190, WORLD.BOSS_Z, 1 - Math.pow(1 - k, 3));
      return;
    }
    b.z = WORLD.BOSS_Z;

    const s = b.spec;
    switch (s.move) {
      case 'weave': b.lane = Math.sin(b.t * s.moveSpeed) * 0.6; break;
      case 'dart':
        if (Math.floor(b.t * s.moveSpeed) !== Math.floor((b.t - dt) * s.moveSpeed)) b.dartTarget = (this.rng.next() * 2 - 1) * 0.8;
        b.lane = damp(b.lane, b.dartTarget, 5, dt);
        break;
      case 'hold': b.lane = Math.sin(b.t * s.moveSpeed) * 0.15; break;
      case 'drift': b.lane = Math.sin(b.t * s.moveSpeed) * 0.45; break;
    }

    const pct = b.hp / b.maxHp;
    const phase: 1 | 2 | 3 = pct > 0.66 ? 1 : pct > 0.33 ? 2 : 3;
    if (phase !== b.phaseNo) {
      b.phaseNo = phase;
      this.say(phase === 2 ? 'it quickens' : 'it unravels');
      this.shake.v = Math.max(this.shake.v, 8);
    }

    b.sampleT -= dt;
    if (b.sampleT <= 0) {
      b.sampleT = 0.4;
      this.brain.observe(this.player.lane, 1);
    }

    const prof = this.dda.profile;
    if (b.state === 'idle') {
      b.timer -= dt;
      if (b.timer <= 0) {
        b.plan = this.brain.plan({ playerLane: this.player.lane, telegraph: prof.telegraph, phase: b.phaseNo, hostile: prof.hostileFire, lateral: WORLD.LATERAL_MAX });
        b.state = 'telegraph';
        b.timer = b.plan.telegraph;
        this.emit({ t: 'telegraph' });
      }
    } else {
      b.timer -= dt;
      if (b.timer <= 0 && b.plan) {
        this.fireVolley(b, b.plan);
        b.state = 'idle';
        b.timer = (s.fireInterval / prof.hostileFire) * (b.phaseNo === 3 ? 0.8 : 1);
      }
    }

    if (s.key === 'choir' && b.phaseNo >= 2) {
      b.addsT -= dt;
      if (b.addsT <= 0) {
        b.addsT = 6;
        const e = this.place('drone', clampLane(b.lane + (this.rng.next() - 0.5) * 0.8), WORLD.BOSS_Z + 40, -1);
        if (e) e.maxHp = e.hp = 1;
      }
    }
  }

  private fireVolley(b: Boss, plan: VolleyPlan): void {
    const id = ++this.volleySeq;
    this.volleys.set(id, { plan, remaining: 0, hits: 0, near: 0 });
    const v = this.volleys.get(id)!;
    const speed = b.spec.boltSpeed * Math.sqrt(this.dda.profile.hostileFire);
    plan.lanes.forEach((laneIdx, i) => {
      const eb = this.enemyBolts.find((x) => !x.active);
      if (!eb) return;
      eb.active = true;
      eb.resolved = false;
      eb.lane = bossLaneValue(laneIdx);
      eb.z = b.z;
      eb.speed = speed;
      eb.volley = id;
      eb.delay = plan.delays[i] ?? 0;
      v.remaining++;
    });
    if (v.remaining === 0) this.volleys.delete(id);
  }

  private updateEnemyBolts(dt: number): void {
    const p = this.player;
    for (const eb of this.enemyBolts) {
      if (!eb.active) continue;
      if (eb.delay > 0) {
        eb.delay -= dt;
        continue;
      }
      eb.z -= eb.speed * dt;
      if (eb.z > 0.6) continue;

      const clear = Math.abs(eb.lane - p.lane) - (0.1 + WORLD.PLAYER_HALF - this.dda.profile.forgiveness);
      const v = this.volleys.get(eb.volley);
      const x = this.track.laneX(this.distance, eb.lane, 0);
      eb.active = false;
      eb.resolved = true;
      this.brain.observe(p.lane, 2);
      if (clear < 0 && p.invuln <= 0) {
        this.damagePlayer(x, 0);
        if (v) v.hits++;
      } else if (clear < 0.1) {
        if (v) v.near++;
        const pts = this.rewards.chain(30);
        this.score += pts;
        this.stats.near++;
        this.emit({ t: 'graze', combo: this.rewards.combo });
      }
      if (v) {
        v.remaining--;
        if (v.remaining <= 0) {
          this.brain.resolve(v.plan, v.hits > 0 ? 'hit' : v.near > 0 ? 'near' : 'dodge');
          this.dda.onEncounter(v.hits > 0 ? 'hit' : v.near > 0 ? 'near' : 'clean', 0.35 + 0.1 * (this.boss?.phaseNo ?? 1));
          this.volleys.delete(eb.volley);
        }
      }
    }
  }

  private damageBoss(dmg: number): void {
    const b = this.boss;
    if (!b || b.defeated) return;
    b.hp = Math.max(0, b.hp - dmg);
    b.flash = 0.1;
    const x = this.track.laneX(this.distance, b.lane, b.z);
    this.particles.burst(x, 3, b.z - 2, 4, 6, 0.4, 0.2, BRAND.bone, 0, 1.2);
    this.emit({ t: 'bossHit' });
    if (b.hp > 0) return;

    b.defeated = true;
    this.stats.bosses++;
    this.particles.burst(x, 3, b.z, 70, 14, 1.6, 0.4, BRAND.bone, 1, 1.6);
    this.particles.burst(x, 3, b.z, 40, 9, 2.0, 0.5, BRAND.fog, 0, 0.6);
    this.score += 1500;
    this.bossCycle++;
    this.shake.v = 20;
    this.hitstop = 0.22;
    this.flash = 0.8;
    this.say(`${b.spec.name.toLowerCase()} falls`);
    this.emit({ t: 'bossDown' });
    this.boss = null;
    this.enemyBolts.forEach((e) => { e.active = false; });
    this.volleys.clear();
    this.state = 'playing';
    this.penalty = 0.9;
    this.nextPatternDist = this.distance + 120;
    this.spawner.reset(this.nextPatternDist);
    this.director.reset();
  }

  // -- snapshot -------------------------------------------------------------

  snapshot(): HudSnapshot {
    const b = this.boss;
    const spec = b?.spec ?? BOSSES[this.bossCycle % BOSSES.length];
    const best = Math.max(this.bestCache, Math.round(this.score));
    const m = this.dda;
    return {
      state: this.state,
      score: Math.round(this.score),
      best,
      round: this.round + 1,
      roundName: MOODS[this.round % MOODS.length].name,
      roundPct: this.roundQuota > 0 ? clamp(this.roundProgress / this.roundQuota, 0, 1) : 0,
      lives: this.lives,
      shield: this.shield,
      combo: this.rewards.combo,
      weapon: this.player.weapon,
      heat: this.player.heat,
      hopReady: this.player.hopCd <= 0,
      bossName: b ? b.spec.name : spec.name,
      bossPct: b ? clamp(b.hp / b.maxHp, 0, 1) : 0,
      bossTagline: spec.tagline,
      toast: this.toast,
      toastNonce: this.toastNonce,
      finalScore: Math.round(this.score),
      isNewBest: this.isNewBest,
      scores: this.scoresCache,
      moment: this.moment,
      tide: m.tideLabel(),
      tideValue: clamp(m.d / 1.15, 0, 1),
      intensity: this.director.intensity,
    };
  }
}
