import type { GameEvent } from '../core/types.ts';
import { mulberry32 } from '../core/rng.ts';

/** Minor pentatonic degrees in semitones above the root. */
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19];
const ROOTS = [110, 98, 123.47, 87.31, 103.83];

/** First order Markov chain over scale degrees: stepwise motion is likely, leaps are rare. */
function nextDegree(cur: number, r: number): number {
  const w = SCALE.map((_, i) => Math.exp(-Math.abs(i - cur) * 0.9));
  const total = w.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x <= 0) return i;
  }
  return cur;
}

/**
 * Procedural audio, no sample files. A drone bed and a sparse bell line are the score;
 * the director's intensity opens a filter, thickens the bells and brings in a low pulse.
 * Reverb is a generated noise impulse, so everything sits in one dark, wet room.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private pulseGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private timer = 0;
  private step = 0;
  private degree = 3;
  private nextTime = 0;
  private root = ROOTS[0];
  private intensity = 0;
  private muted = false;
  private playing = false;
  private readonly rng = mulberry32(77);

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** Must be called from a user gesture on iOS. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
  }

  private build(): void {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    this.master = master;

    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    conv.connect(wet).connect(master);
    const wetIn = ctx.createGain();
    wetIn.connect(conv);
    this.reverbIn = wetIn;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 0.6;
    const dg = ctx.createGain();
    dg.gain.value = 0.0;
    filter.connect(dg);
    dg.connect(master);
    dg.connect(wetIn);
    this.droneFilter = filter;
    this.droneGain = dg;
    for (const [mult, detune, type] of [[1, -6, 'sawtooth'], [1.5, 5, 'triangle'], [0.5, 0, 'sine']] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = this.root * mult;
      o.detune.value = detune;
      o.connect(filter);
      o.start();
      this.droneOscs.push(o);
    }
    const pg = ctx.createGain();
    pg.gain.value = 0;
    pg.connect(master);
    this.pulseGain = pg;
  }

  /** Begin or end the score. Drone fades rather than cuts. */
  setPlaying(on: boolean): void {
    if (!this.ctx || on === this.playing) return;
    this.playing = on;
    const t = this.ctx.currentTime;
    this.droneGain?.gain.setTargetAtTime(on ? 0.1 : 0.045, t, 1.2);
    if (on && !this.timer) {
      this.nextTime = t + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 120);
    }
  }

  setIntensity(i: number): void {
    this.intensity = i;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneFilter?.frequency.setTargetAtTime(320 + i * 1500, t, 0.6);
    this.pulseGain?.gain.setTargetAtTime(i > 0.55 ? 0.1 : 0, t, 0.3);
  }

  setRound(n: number): void {
    this.root = ROOTS[n % ROOTS.length];
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneOscs.forEach((o, i) => o.frequency.setTargetAtTime(this.root * [1, 1.5, 0.5][i], t, 1.5));
  }

  dispose(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    void this.ctx?.close();
    this.ctx = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const beat = 60 / (62 + this.intensity * 26) / 2;
    while (this.nextTime < ctx.currentTime + 0.35) {
      const density = 0.28 + this.intensity * 0.5;
      if (this.rng.chance(density)) {
        this.degree = nextDegree(this.degree, this.rng.next());
        this.bell(this.root * 2 * Math.pow(2, SCALE[this.degree] / 12), this.nextTime, 0.05 + this.rng.next() * 0.03);
      }
      if (this.step % 4 === 0 && this.intensity > 0.55 && this.pulseGain) this.thump(this.nextTime);
      this.step++;
      this.nextTime += beat;
    }
  }

  private bell(freq: number, t: number, vol: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    for (const [m, v, d] of [[1, 1, 2.2], [2.76, 0.3, 1.2], [5.4, 0.12, 0.6]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * m;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g);
      g.connect(this.master);
      const s = this.reverbIn;
      if (s) g.connect(s);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  private thump(t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.pulseGain) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(this.pulseGain);
    o.start(t);
    o.stop(t + 0.25);
  }

  // -- effects -----------------------------------------------------------

  private blip(freq: number, to: number, dur: number, vol: number, type: OscillatorType = 'sine', wet = true): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    const s = this.reverbIn;
    if (wet && s) g.connect(s);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, cutoff: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    const s = this.reverbIn;
    if (s) g.connect(s);
    src.start();
  }

  handle(e: GameEvent): void {
    if (!this.ctx) return;
    switch (e.t) {
      case 'launch': this.blip(160, 520, 0.6, 0.12); break;
      case 'fire': this.blip(e.weapon === 'seeker' ? 260 : 720, e.weapon === 'seeker' ? 150 : 520, 0.06, 0.018, 'triangle', false); break;
      case 'hop': this.blip(300, 700, 0.18, 0.06); break;
      case 'pass': break;
      case 'graze': this.blip(880 * (1 + Math.min(e.combo, 8) * 0.06), 1400, 0.2, 0.05); break;
      case 'hit': this.noise(0.5, 0.35, 900); this.blip(120, 40, 0.5, 0.2, 'sawtooth'); break;
      case 'shield': this.noise(0.25, 0.18, 2600); this.blip(500, 200, 0.3, 0.07, 'triangle'); break;
      case 'destroy': this.noise(e.big ? 0.55 : 0.3, e.big ? 0.3 : 0.18, 1400); break;
      case 'pickup': this.blip(1200, 1800, 0.35, 0.05); break;
      case 'round': this.blip(392, 392, 0.9, 0.06); window.setTimeout(() => this.blip(587, 587, 1.1, 0.06), 160); break;
      case 'bossIntro': this.blip(55, 40, 2.2, 0.3, 'sawtooth'); break;
      case 'telegraph': this.blip(220, 330, 0.5, 0.04, 'sine'); break;
      case 'bossHit': this.noise(0.1, 0.1, 1800); break;
      case 'bossDown': this.noise(1.4, 0.4, 700); this.blip(80, 30, 1.6, 0.25, 'sawtooth'); break;
      case 'life': this.blip(660, 990, 0.6, 0.06); break;
      case 'gameover': this.noise(1.2, 0.3, 500); this.blip(110, 30, 1.8, 0.2, 'sawtooth'); break;
      case 'phase': break;
    }
  }
}
