import { Physics as P } from './Physics';
import { CFG, PALETTES, WEAPONS, VISUAL_RADIUS } from './config';
import type { Palette, ObstacleType } from './types';
import type { Obstacle } from './entities/Obstacle';
import type { GameEngine } from './GameEngine';

/**
 * Renderer draws the current frame of a GameEngine onto its canvas context.
 * It never mutates simulation state (aside from the read-only rendering
 * side effect of spawning cosmetic particles for dead sentinel pods).
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private engine: GameEngine;

  constructor(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    this.ctx = ctx;
    this.engine = engine;
  }

  private palette(): Palette {
    return PALETTES[this.engine.world.paletteIndex % PALETTES.length];
  }

  render(): void {
    const ctx = this.ctx;
    const pal = this.palette();
    ctx.save();
    if (this.engine.world.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.engine.world.shake, (Math.random() - 0.5) * this.engine.world.shake);
    }
    this.drawBackground(pal);
    this.drawNebulae(pal);
    this.drawStars();
    this.drawCorridor(pal);
    this.drawObstacles();
    this.drawBoss();
    this.drawBolts();
    this.drawEnemyBolts();
    this.drawPlayer();
    this.drawParticles();
    ctx.restore();
  }

  renderAmbientBg(bgCtx: CanvasRenderingContext2D | null, w: number, h: number, ts: number): void {
    if (!bgCtx) return;
    const c = bgCtx;
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#05060c';
    c.fillRect(0, 0, w, h);
    const n = 90;
    for (let i = 0; i < n; i++) {
      const seed = i * 97.13;
      const x = (Math.sin(seed) * 0.5 + 0.5) * w;
      const baseY = (Math.cos(seed * 1.7) * 0.5 + 0.5) * h;
      const drift = (ts * 0.00002 * (1 + (i % 5))) % h;
      const y = (baseY + drift) % h;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(ts * 0.0006 + seed));
      c.globalAlpha = tw * 0.6;
      c.fillStyle = '#e8ecf2';
      const size = 1 + (i % 3);
      c.fillRect(x, y, size, size);
    }
    c.globalAlpha = 1;
  }

  private drawBackground(pal: Palette): void {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, CFG.H);
    grad.addColorStop(0, pal.top);
    grad.addColorStop(0.45, pal.mid);
    grad.addColorStop(1, pal.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    const dp = this.engine.distantPlanet;
    const pg = ctx.createRadialGradient(dp.x - dp.r * 0.3, dp.y - dp.r * 0.3, dp.r * 0.1, dp.x, dp.y, dp.r);
    pg.addColorStop(0, pal.rail);
    pg.addColorStop(0.55, pal.glow.replace(/[\d.]+\)$/, '0.7)'));
    pg.addColorStop(1, 'rgba(5,6,8,0.95)');
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(dp.x, dp.y, dp.r, 0, Math.PI * 2);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.restore();

    const hg = ctx.createRadialGradient(CFG.W / 2, CFG.HORIZON_Y, 10, CFG.W / 2, CFG.HORIZON_Y, 220);
    hg.addColorStop(0, pal.glow);
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
  }

  private drawNebulae(pal: Palette): void {
    const ctx = this.ctx;
    for (const n of this.engine.nebulae) {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, pal.nebula);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawStars(): void {
    const ctx = this.ctx;
    for (const s of this.engine.stars) {
      const tw = 0.5 + 0.5 * Math.sin(this.engine.world.t * 2 + s.seed);
      ctx.globalAlpha = 0.25 + tw * 0.5;
      ctx.fillStyle = '#e8ecf2';
      const size = s.layer * 0.7;
      ctx.fillRect(s.x, s.y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  private drawCorridor(pal: Palette): void {
    const ctx = this.ctx;
    const steps = 28;
    const world = this.engine.world;
    const phase = world.distance * 0.012;
    const cx = CFG.W / 2;
    const railLeft: [number, number][] = [];
    const railRight: [number, number][] = [];

    for (let i = steps; i >= 1; i--) {
      const s0 = i / steps;
      const s1 = (i - 1) / steps;
      const scale0 = Math.max(0.035, Math.pow(s0, 1.7));
      const scale1 = Math.max(0.035, Math.pow(s1, 1.7));
      const y0 = CFG.HORIZON_Y + scale0 * (CFG.PLANE_Y - CFG.HORIZON_Y);
      const y1 = CFG.HORIZON_Y + scale1 * (CFG.PLANE_Y - CFG.HORIZON_Y);
      const lx0 = P.laneToX(-1, cx, CFG.ROAD_HALF_NEAR, world.curveCur, scale0, CFG.CURVE_AMP);
      const rx0 = P.laneToX(1, cx, CFG.ROAD_HALF_NEAR, world.curveCur, scale0, CFG.CURVE_AMP);
      const lx1 = P.laneToX(-1, cx, CFG.ROAD_HALF_NEAR, world.curveCur, scale1, CFG.CURVE_AMP);
      const rx1 = P.laneToX(1, cx, CFG.ROAD_HALF_NEAR, world.curveCur, scale1, CFG.CURVE_AMP);

      const wave = 0.5 + 0.5 * Math.sin((i + phase) * Math.PI);
      ctx.fillStyle = P.mixColor(pal.bandDark, pal.bandLight, wave);
      ctx.beginPath();
      ctx.moveTo(lx0, y0);
      ctx.lineTo(rx0, y0);
      ctx.lineTo(rx1, y1);
      ctx.lineTo(lx1, y1);
      ctx.closePath();
      ctx.fill();

      if (i === steps) { railLeft.push([lx0, y0]); railRight.push([rx0, y0]); }
      railLeft.push([lx1, y1]);
      railRight.push([rx1, y1]);
    }

    this.drawRail(railLeft, pal.rail);
    this.drawRail(railRight, pal.rail);
  }

  private drawRail(points: [number, number][], color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]);
    });
    ctx.stroke();
    ctx.restore();
  }

  private drawObstacles(): void {
    const active = this.engine.obstacles.filter((o) => o.active);
    active.sort((a, b) => b.z - a.z);
    for (const o of active) this.drawObstacle(o);
  }

  private drawObstacle(o: Obstacle): void {
    const ctx = this.ctx;
    const x = o.screenX;
    const y = o.screenY;
    const scale = Math.max(o.scale, 0.04);
    ctx.save();
    ctx.translate(x, y);
    if (o.flashTimer > 0) ctx.filter = 'brightness(2.1)';
    if (o.type === 'asteroid') this.drawAsteroid(scale, o.phase);
    else if (o.type === 'wreck') this.drawWreck(scale, o);
    else if (o.type === 'stone') this.drawStone(scale, o);
    else this.drawScout(scale, o);
    ctx.filter = 'none';
    if (o.maxHp > 1 && o.hp < o.maxHp && o.hp > 0) this.drawHpPip(scale, o);
    ctx.restore();
  }

  private drawHpPip(scale: number, o: Obstacle): void {
    const ctx = this.ctx;
    const r = VISUAL_RADIUS[o.type] * scale;
    const w = r * 1.4;
    const h = 3;
    const pct = o.hp / o.maxHp;
    ctx.save();
    ctx.translate(-w / 2, -r - 10);
    ctx.fillStyle = 'rgba(5,6,8,0.6)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = pct > 0.5 ? '#5dffb0' : '#ff4d5e';
    ctx.fillRect(0, 0, w * pct, h);
    ctx.restore();
  }

  private drawAsteroid(scale: number, phase: number): void {
    const ctx = this.ctx;
    const world = this.engine.world;
    const r = VISUAL_RADIUS.asteroid * scale;
    const pts = 9;
    ctx.save();
    ctx.rotate(world.rotAccum * 0.6 + phase);

    const verts: [number, number][] = [];
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const jitter = 0.68 + 0.32 * Math.sin(i * 12.9 + phase * 3.1);
      verts.push([Math.cos(a) * r * jitter, Math.sin(a) * r * jitter]);
    }
    ctx.beginPath();
    verts.forEach((v, i) => { if (i === 0) ctx.moveTo(v[0], v[1]); else ctx.lineTo(v[0], v[1]); });
    ctx.closePath();
    const rg = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
    rg.addColorStop(0, '#7a7488');
    rg.addColorStop(0.55, '#5b5468');
    rg.addColorStop(1, '#332e40');
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.strokeStyle = '#1f1c2a';
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.stroke();

    const craterSeeds: [number, number, number][] = [[0.18, -0.1, 0.22], [-0.32, 0.18, 0.16], [0.05, 0.35, 0.13]];
    for (const cs of craterSeeds) {
      ctx.beginPath();
      ctx.arc(cs[0] * r, cs[1] * r, cs[2] * r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,18,28,0.45)';
      ctx.fill();
    }
    ctx.restore();
  }

  private drawWreck(scale: number, o: Obstacle): void {
    const ctx = this.ctx;
    const world = this.engine.world;
    const r = VISUAL_RADIUS.wreck * scale;
    ctx.save();
    ctx.rotate(world.rotAccum * 0.35 + o.phase);

    ctx.beginPath();
    ctx.moveTo(-r * 0.9, -r * 0.5);
    ctx.lineTo(r * 0.5, -r * 0.75);
    ctx.lineTo(r * 0.95, 0.1 * r);
    ctx.lineTo(r * 0.25, r * 0.85);
    ctx.lineTo(-r * 0.65, r * 0.6);
    ctx.lineTo(-r * 1.05, -r * 0.05);
    ctx.closePath();
    const wg = ctx.createLinearGradient(-r, -r, r, r);
    wg.addColorStop(0, '#5a3a40');
    wg.addColorStop(0.5, '#3d262c');
    wg.addColorStop(1, '#23151a');
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.strokeStyle = '#160d10';
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.6); ctx.lineTo(-r * 0.1, r * 0.7);
    ctx.moveTo(r * 0.15, -r * 0.65); ctx.lineTo(r * 0.35, r * 0.5);
    ctx.stroke();

    const flick = 0.4 + 0.6 * Math.max(0, Math.sin(world.t * 9 + o.phase * 5));
    ctx.beginPath();
    ctx.arc(r * 0.3, -r * 0.1, r * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,77,94,${flick.toFixed(2)})`;
    ctx.fill();

    ctx.restore();
  }

  private drawStone(scale: number, o: Obstacle): void {
    const ctx = this.ctx;
    const world = this.engine.world;
    const player = this.engine.player;
    const r = VISUAL_RADIUS.stone * scale;
    const jumpable = player.boosting > 0 && o.z > 0 && o.z < 180;
    if (jumpable) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 6 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const sg = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    sg.addColorStop(0, '#c9c0a8');
    sg.addColorStop(0.6, '#9b9484');
    sg.addColorStop(1, '#5e5848');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = sg;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(93,217,232,0.35)';
    ctx.lineWidth = Math.max(1, r * 0.22);
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.3);
    ctx.lineTo(r, -r * 0.4);
    ctx.stroke();
    ctx.restore();

    const ga = world.rotAccum * 1.6 + o.phase;
    ctx.beginPath();
    ctx.arc(Math.cos(ga) * r * 0.4, Math.sin(ga) * r * 0.4, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }

  private drawScout(scale: number, o: Obstacle): void {
    const ctx = this.ctx;
    const world = this.engine.world;
    const r = VISUAL_RADIUS.scout * scale;
    ctx.save();

    const flick = 0.55 + 0.45 * Math.sin(world.t * 26 + o.phase);
    const eg = ctx.createRadialGradient(0, r * 0.8, 0, 0, r * 0.8, r * 0.55);
    eg.addColorStop(0, `rgba(255,140,61,${(0.85 * flick).toFixed(2)})`);
    eg.addColorStop(1, 'rgba(255,140,61,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(0, r * 0.78, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-r * 0.18, -r * 0.1);
    ctx.lineTo(-r * 1.05, r * 0.55);
    ctx.lineTo(-r * 0.7, r * 0.7);
    ctx.lineTo(-r * 0.1, r * 0.25);
    ctx.closePath();
    ctx.moveTo(r * 0.18, -r * 0.1);
    ctx.lineTo(r * 1.05, r * 0.55);
    ctx.lineTo(r * 0.7, r * 0.7);
    ctx.lineTo(r * 0.1, r * 0.25);
    ctx.closePath();
    ctx.fillStyle = '#8a3b2e';
    ctx.fill();
    ctx.strokeStyle = '#3d1813';
    ctx.lineWidth = Math.max(1, scale);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.42, r * 0.55);
    ctx.lineTo(0, r * 0.3);
    ctx.lineTo(-r * 0.42, r * 0.55);
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, -r, 0, r * 0.5);
    fg.addColorStop(0, '#e2596b');
    fg.addColorStop(1, '#8a2e3a');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = '#2a0f14';
    ctx.lineWidth = Math.max(1, scale);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, -r * 0.2, r * 0.16, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1a0e10';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-r * 0.04, -r * 0.26, r * 0.06, r * 0.09, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(93,217,232,0.7)';
    ctx.fill();

    ctx.restore();
  }

  private drawBoss(): void {
    const boss = this.engine.boss;
    if (!boss) return;
    const ctx = this.ctx;
    const scale = Math.max(boss.scale, 0.08);
    ctx.save();
    ctx.translate(boss.screenX, boss.screenY);
    if (boss.flashTimer > 0) ctx.filter = 'brightness(2.2)';

    switch (boss.def.key) {
      case 'hulk': this.drawBossHulk(scale); break;
      case 'striker': this.drawBossStriker(scale); break;
      case 'sentinel': this.drawBossSentinel(scale); break;
      case 'swarm': this.drawBossSwarm(scale); break;
      default: this.drawBossHulk(scale);
    }
    ctx.filter = 'none';
    ctx.restore();
  }

  private drawBossHulk(scale: number): void {
    const ctx = this.ctx;
    const boss = this.engine.boss!;
    const world = this.engine.world;
    const r = boss.def.radius * scale;
    ctx.save();
    ctx.rotate(Math.sin(boss.phase * 0.5) * 0.05);

    const flick = 0.6 + 0.4 * Math.sin(world.t * 14);
    [-r * 0.55, r * 0.55].forEach((ex) => {
      const fg = ctx.createRadialGradient(ex, r * 0.85, 0, ex, r * 0.85, r * 0.3);
      fg.addColorStop(0, `rgba(255,140,61,${(0.8 * flick).toFixed(2)})`);
      fg.addColorStop(1, 'rgba(255,140,61,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(ex, r * 0.85, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.beginPath();
    ctx.moveTo(-r * 0.95, -r * 0.3);
    ctx.lineTo(-r * 0.6, -r * 0.75);
    ctx.lineTo(r * 0.6, -r * 0.75);
    ctx.lineTo(r * 0.95, -r * 0.3);
    ctx.lineTo(r * 0.85, r * 0.7);
    ctx.lineTo(-r * 0.85, r * 0.7);
    ctx.closePath();
    const hg = ctx.createLinearGradient(0, -r, 0, r);
    hg.addColorStop(0, '#a85a45');
    hg.addColorStop(0.55, '#8a3b2e');
    hg.addColorStop(1, '#4f1f17');
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = '#2a0f0a';
    ctx.lineWidth = Math.max(1.5, 2.4 * scale);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.32, -r * 0.6);
      ctx.lineTo(i * r * 0.32, r * 0.55);
      ctx.stroke();
    }

    const eyeGlow = 0.6 + 0.4 * Math.sin(world.t * 5);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.4, r * 0.22, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1a0e0a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -r * 0.4, r * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,77,94,${eyeGlow.toFixed(2)})`;
    ctx.fill();

    ctx.restore();
  }

  private drawBossStriker(scale: number): void {
    const ctx = this.ctx;
    const boss = this.engine.boss!;
    const world = this.engine.world;
    const r = boss.def.radius * scale;
    ctx.save();
    ctx.rotate(P.clamp(boss.lane * 0.15, -0.3, 0.3));

    const flick = 0.6 + 0.4 * Math.sin(world.t * 20);
    const eg = ctx.createRadialGradient(0, r * 0.85, 0, 0, r * 0.85, r * 0.4);
    eg.addColorStop(0, `rgba(185,166,224,${(0.85 * flick).toFixed(2)})`);
    eg.addColorStop(1, 'rgba(185,166,224,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(0, r * 0.85, r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.9, r * 0.45);
    ctx.lineTo(r * 0.3, r * 0.3);
    ctx.lineTo(0, r * 0.6);
    ctx.lineTo(-r * 0.3, r * 0.3);
    ctx.lineTo(-r * 0.9, r * 0.45);
    ctx.closePath();
    const sg = ctx.createLinearGradient(0, -r, 0, r * 0.6);
    sg.addColorStop(0, '#c3aee0');
    sg.addColorStop(0.55, '#5a3a8a');
    sg.addColorStop(1, '#2a1850');
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.strokeStyle = '#160c30';
    ctx.lineWidth = Math.max(1.2, 2 * scale);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, -r * 0.25, r * 0.1, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(93,217,232,0.85)';
    ctx.fill();

    ctx.restore();
  }

  private drawBossSentinel(scale: number): void {
    const ctx = this.ctx;
    const boss = this.engine.boss!;
    const world = this.engine.world;
    const r = boss.def.radius * scale;
    ctx.save();

    ctx.strokeStyle = '#1c2128';
    ctx.lineWidth = Math.max(2, 4 * scale);
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, 0); ctx.lineTo(-r * 0.3, 0);
    ctx.moveTo(r * 0.3, 0); ctx.lineTo(r * 0.95, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
    const cg = ctx.createRadialGradient(-r * 0.1, -r * 0.1, 0, 0, 0, r * 0.42);
    cg.addColorStop(0, '#7fd9de');
    cg.addColorStop(1, '#1c4a4e');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = '#0c2426';
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.stroke();
    const coreGlow = 0.5 + 0.5 * Math.sin(world.t * 6);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(93,217,232,${coreGlow.toFixed(2)})`;
    ctx.fill();

    this.drawSentinelPod(-r * 0.95, r, boss.podLeftHp > 0);
    this.drawSentinelPod(r * 0.95, r, boss.podRightHp > 0);

    ctx.restore();
  }

  private drawSentinelPod(cx: number, r: number, alive: boolean): void {
    const ctx = this.ctx;
    const boss = this.engine.boss!;
    const world = this.engine.world;
    ctx.save();
    ctx.translate(cx, 0);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    const pg = ctx.createRadialGradient(-r * 0.08, -r * 0.08, 0, 0, 0, r * 0.3);
    if (alive) { pg.addColorStop(0, '#7fd9de'); pg.addColorStop(1, '#1c4a4e'); }
    else { pg.addColorStop(0, '#555'); pg.addColorStop(1, '#222'); }
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = alive ? '#0c2426' : '#000';
    ctx.lineWidth = Math.max(1.2, r * 0.04);
    ctx.stroke();
    if (alive) {
      const g = 0.5 + 0.5 * Math.sin(world.t * 9 + cx);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,77,94,${g.toFixed(2)})`;
      ctx.fill();
    } else if (Math.random() < 0.3) {
      this.engine.burst(boss.screenX + cx, boss.screenY, '#888', 1, 40, 0.3);
    }
    ctx.restore();
  }

  private drawBossSwarm(scale: number): void {
    const ctx = this.ctx;
    const boss = this.engine.boss!;
    const world = this.engine.world;
    const r = boss.def.radius * scale;
    ctx.save();
    ctx.rotate(Math.sin(boss.phase * 0.3) * 0.08);

    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.55, 0, 0, Math.PI * 2);
    const bg = ctx.createRadialGradient(-r * 0.2, -r * 0.15, 0, 0, 0, r);
    bg.addColorStop(0, '#b85a7a');
    bg.addColorStop(0.6, '#6e2e4a');
    bg.addColorStop(1, '#33152a');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = '#1a0a16';
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(i * r * 0.3, 0, r * 0.12, r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let p = -1; p <= 1; p += 2) {
      const pulse = 0.5 + 0.5 * Math.sin(world.t * 4 + p);
      ctx.beginPath();
      ctx.arc(p * r * 0.55, r * 0.35, r * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,77,94,${(0.4 + 0.4 * pulse).toFixed(2)})`;
      ctx.fill();
    }

    ctx.restore();
  }

  private drawEnemyBolts(): void {
    const ctx = this.ctx;
    const world = this.engine.world;
    for (const b of this.engine.enemyBolts) {
      if (!b.active) continue;
      const scale = P.projectScale(Math.max(b.z, 0), CFG.FOCAL);
      const x = P.laneToX(b.lane, CFG.W / 2, CFG.ROAD_HALF_NEAR, world.curveCur, scale, CFG.CURVE_AMP);
      const y = CFG.HORIZON_Y + scale * (CFG.PLANE_Y - CFG.HORIZON_Y);
      const len = 16 * Math.max(scale, 0.3);
      const w = 4 * Math.max(scale, 0.35);
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 10 * Math.max(scale, 0.4);
      const grad = ctx.createLinearGradient(0, -len, 0, len * 0.4);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.4, b.color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-w / 2, -len * 0.4, w, len + len * 0.4);
      ctx.restore();
    }
  }

  private drawBolts(): void {
    const ctx = this.ctx;
    const world = this.engine.world;
    for (const b of this.engine.bolts) {
      if (!b.active) continue;
      const def = WEAPONS[b.weaponKey] || WEAPONS.laser;
      const scale = P.projectScale(Math.max(b.z, 0), CFG.FOCAL);
      const x = P.laneToX(b.lane, CFG.W / 2, CFG.ROAD_HALF_NEAR, world.curveCur, scale, CFG.CURVE_AMP);
      const y = CFG.HORIZON_Y + scale * (CFG.PLANE_Y - CFG.HORIZON_Y);
      const len = (def.kind === 'missile' ? 22 : 16) * Math.max(scale, 0.25);
      const w = (def.kind === 'missile' ? 5 : 3) * Math.max(scale, 0.3);

      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = def.glow;
      ctx.shadowBlur = 10 * Math.max(scale, 0.4);
      if (def.kind === 'missile') {
        ctx.fillStyle = '#cfd4dc';
        ctx.beginPath();
        ctx.moveTo(0, -len);
        ctx.lineTo(w, len * 0.3);
        ctx.lineTo(0, len * 0.55);
        ctx.lineTo(-w, len * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = def.glow;
        ctx.beginPath();
        ctx.moveTo(-w * 0.6, len * 0.3);
        ctx.lineTo(w * 0.6, len * 0.3);
        ctx.lineTo(0, len * 0.3 + 10 * scale);
        ctx.closePath();
        ctx.fill();
      } else {
        const grad = ctx.createLinearGradient(0, -len, 0, len * 0.4);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.4, def.color);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-w / 2, -len, w, len + len * 0.4);
      }
      ctx.restore();
    }
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    const player = this.engine.player;
    const world = this.engine.world;
    const input = this.engine.input.state;
    const x = this.engine.playerScreenX();
    const y = CFG.PLANE_Y - 28;
    const blinkOff = player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0;
    if (blinkOff) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.bank * 0.28);

    if (player.invuln > 0) {
      ctx.beginPath();
      ctx.arc(0, 2, 30, 0, Math.PI * 2);
      ctx.strokeStyle = '#5dd9e8';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(world.t * 18);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (player.boosting > 0) {
      ctx.beginPath();
      ctx.arc(0, 4, 26, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const flameLen = 12 + (input.thrust ? 9 : 0) + Math.sin(world.t * 40) * 2.5;
    [-9, 9].forEach((ex) => {
      ctx.beginPath();
      ctx.moveTo(ex - 3.4, 15);
      ctx.lineTo(ex, 15 + flameLen);
      ctx.lineTo(ex + 3.4, 15);
      ctx.closePath();
      const fg = ctx.createLinearGradient(0, 15, 0, 15 + flameLen);
      fg.addColorStop(0, 'rgba(93,217,232,0.95)');
      fg.addColorStop(1, 'rgba(93,217,232,0)');
      ctx.fillStyle = fg;
      ctx.fill();
    });

    this.drawWingPair(1, '#3a4252');
    this.drawWingPair(-1, '#454e60');

    ctx.beginPath();
    ctx.moveTo(0, -23);
    ctx.lineTo(6, -10);
    ctx.lineTo(7, 13);
    ctx.lineTo(3, 19);
    ctx.lineTo(-3, 19);
    ctx.lineTo(-7, 13);
    ctx.lineTo(-6, -10);
    ctx.closePath();
    const hg = ctx.createLinearGradient(-7, -23, 7, 19);
    hg.addColorStop(0, '#cfd4dc');
    hg.addColorStop(0.5, '#9aa3b4');
    hg.addColorStop(1, '#5c6478');
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = '#1c2128';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -23);
    ctx.lineTo(4, -13);
    ctx.lineTo(-4, -13);
    ctx.closePath();
    ctx.fillStyle = '#ff8c3d';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, -2, 3.6, 6.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#11151c';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-0.8, -4.5, 1.6, 2.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(93,217,232,0.8)';
    ctx.fill();

    ctx.restore();
  }

  private drawWingPair(vDir: number, color: string): void {
    const ctx = this.ctx;
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(side * 5, -4);
      ctx.lineTo(side * 26, vDir * 12 - 2);
      ctx.lineTo(side * 29, vDir * 14);
      ctx.lineTo(side * 28, vDir * 17);
      ctx.lineTo(side * 7, vDir * 6 + 6);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#161a22';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.rect(side * 27 - 1.4, vDir * 14 - 1.4, 2.8, 6 * vDir);
      ctx.fillStyle = '#1c2128';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(side * 28.4, vDir * (14 + 6), 1.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,77,94,0.85)';
      ctx.fill();
      ctx.restore();
    });
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.engine.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// Re-export for type-only usages elsewhere.
export type { ObstacleType };
