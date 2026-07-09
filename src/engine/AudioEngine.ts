/** Synthesizes short chiptune style sound effects on the fly, no audio files. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean;

  constructor(initialMuted: boolean) {
    this.muted = initialMuted;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    return this.ctx;
  }

  resume(): void {
    const ac = this.ensure();
    if (ac && ac.state === 'suspended') ac.resume();
  }

  setMuted(value: boolean): void {
    this.muted = value;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol = 0.12, glideTo?: number): void {
    if (this.muted) return;
    const ac = this.ensure();
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), ac.currentTime + dur);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur + 0.02);
    } catch {
      /* ignore audio errors */
    }
  }

  private noiseBurst(dur: number, vol = 0.12): void {
    if (this.muted) return;
    const ac = this.ensure();
    if (!ac) return;
    try {
      const bufferSize = Math.floor(ac.sampleRate * dur);
      const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      src.connect(gain);
      gain.connect(ac.destination);
      src.start();
    } catch {
      /* ignore */
    }
  }

  sfxSkip(): void { this.tone(880, 0.09, 'triangle', 0.13, 1320); }
  sfxPass(): void { this.tone(520, 0.04, 'square', 0.05); }
  sfxGraze(): void { this.tone(180, 0.12, 'sawtooth', 0.1, 90); }
  sfxHit(): void { this.tone(160, 0.28, 'sawtooth', 0.16, 40); }
  sfxLife(): void {
    this.tone(523, 0.09, 'square', 0.12);
    setTimeout(() => this.tone(659, 0.09, 'square', 0.12), 90);
    setTimeout(() => this.tone(784, 0.14, 'square', 0.12), 180);
  }
  sfxSector(): void {
    this.tone(392, 0.1, 'triangle', 0.12);
    setTimeout(() => this.tone(523, 0.1, 'triangle', 0.12), 100);
    setTimeout(() => this.tone(659, 0.18, 'triangle', 0.13), 200);
  }
  sfxGameOver(): void { this.tone(220, 0.4, 'sawtooth', 0.15, 60); }
  sfxLaunch(): void { this.tone(330, 0.12, 'square', 0.1, 660); }
  sfxFireLaser(): void { this.tone(1100, 0.05, 'square', 0.05, 700); }
  sfxFireCannon(): void { this.tone(700, 0.06, 'sawtooth', 0.06, 380); }
  sfxFireMissile(): void { this.tone(220, 0.1, 'sawtooth', 0.09, 140); }
  sfxExplodeSmall(): void { this.noiseBurst(0.12, 0.1); this.tone(140, 0.1, 'square', 0.06, 50); }
  sfxExplodeBig(): void { this.noiseBurst(0.22, 0.16); this.tone(110, 0.18, 'sawtooth', 0.1, 35); }
}
