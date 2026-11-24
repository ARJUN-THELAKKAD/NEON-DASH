import { StorageManager } from './StorageManager';

/**
 * Procedural Web Audio Synthesizer & Synthwave Music Engine for NEON DASH.
 * Produces zero-latency SFX and an adaptive synthwave soundtrack without external asset files.
 */
class NeonAudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted: boolean = StorageManager.getMuted();
  private musicRunning = false;
  private musicDucked = false;
  private schedulerTimer: number | null = null;
  private currentStep = 0;
  private nextNoteTime = 0;
  private tempoBpm = 124;

  // Synthwave 4-bar chord progression (Am -> F -> C -> G)
  private readonly bassNotes = [
    55.0, 55.0, 110.0, 55.0, 55.0, 55.0, 110.0, 55.0, // A1/A2
    43.65, 43.65, 87.31, 43.65, 43.65, 43.65, 87.31, 43.65, // F1/F2
    65.41, 65.41, 130.81, 65.41, 65.41, 65.41, 130.81, 65.41, // C2/C3
    49.0, 49.0, 98.0, 49.0, 49.0, 49.0, 98.0, 61.74, // G1/G2
  ];

  private readonly arpNotes = [
    440.0, 523.25, 659.25, 880.0, 659.25, 523.25, 440.0, 523.25,
    349.23, 440.0, 523.25, 698.46, 523.25, 440.0, 349.23, 440.0,
    523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 523.25, 659.25,
    392.0, 493.88, 587.33, 783.99, 587.33, 493.88, 392.0, 493.88,
  ];

  private readonly coinScale = [587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];

  public isMuted(): boolean {
    return this.muted;
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.masterGain.gain.value = this.muted ? 0 : 0.72;
      this.musicGain.gain.value = 0.28;
      this.sfxGain.gain.value = 0.7;

      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.createNoiseBuffer();
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // Auto-play policy may defer until next gesture
      });
    }
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.6;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public setMuted(muted: boolean): boolean {
    this.muted = muted;
    StorageManager.setMuted(muted);
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.72, now, 0.03);
    }
    return this.muted;
  }

  public toggleMute(): boolean {
    this.unlock();
    const next = this.setMuted(!this.muted);
    if (!next) {
      this.playButton();
    }
    return next;
  }

  public setMusicIntensity(speedNorm: number): void {
    // Smoothly ramp music BPM from 124 to 146 as speed increases
    this.tempoBpm = 124 + Math.max(0, Math.min(1, speedNorm)) * 22;
  }

  public setMusicDucked(ducked: boolean): void {
    this.musicDucked = ducked;
    if (this.ctx && this.musicGain) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setTargetAtTime(ducked ? 0.1 : 0.28, now, 0.08);
    }
  }

  public startMusic(): void {
    this.unlock();
    if (this.musicRunning || !this.ctx) return;

    this.musicRunning = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
    }
    this.schedulerTimer = window.setInterval(() => this.scheduleMusicSteps(), 28);
  }

  public stopMusic(): void {
    this.musicRunning = false;
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private scheduleMusicSteps(): void {
    if (!this.musicRunning || !this.ctx || !this.musicGain) return;
    if (this.ctx.state !== 'running') return;

    const lookahead = 0.12;
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.triggerMusicStep(this.currentStep, this.nextNoteTime);
      const secondsPer16th = 60 / this.tempoBpm / 4;
      this.nextNoteTime += secondsPer16th;
      this.currentStep = (this.currentStep + 1) % 32;
    }
  }

  private triggerMusicStep(step: number, time: number): void {
    if (!this.ctx || !this.musicGain) return;

    // 4-on-the-floor kick drum (every quarter note: 0, 4, 8, 12...)
    if (step % 4 === 0) {
      this.playKick(time);
    }

    // Crisp synth snare on beats 2 & 4 (step 4, 12, 20, 28)
    if (step % 8 === 4 && !this.musicDucked) {
      this.playSnare(time);
    }

    // Off-beat closed hi-hat
    if (step % 2 === 1 && !this.musicDucked) {
      this.playHiHat(time, step % 4 === 2 ? 0.08 : 0.045);
    }

    // Driving 8th-note synthwave sawtooth bass
    if (step % 2 === 0) {
      const bassIndex = (step / 2) % this.bassNotes.length;
      const freq = this.bassNotes[bassIndex];
      this.playBassNote(freq, time, 0.18);
    }

    // Neon arpeggio shimmer
    const arpFreq = this.arpNotes[step % this.arpNotes.length];
    if (!this.musicDucked || step % 4 === 0) {
      this.playArpNote(arpFreq, time, 0.11);
    }
  }

  private playKick(time: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.11);

    gain.gain.setValueAtTime(0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.17);
  }

  private playSnare(time: number): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    noise.start(time);
    noise.stop(time + 0.14);
  }

  private playHiHat(time: number, vol: number): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6800, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    noise.start(time);
    noise.stop(time + 0.05);
  }

  private playBassNote(freq: number, time: number, dur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(520, time);
    filter.frequency.exponentialRampToValueAtTime(160, time + dur);

    gain.gain.setValueAtTime(0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playArpNote(freq: number, time: number, dur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, time);

    gain.gain.setValueAtTime(0.09, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  // ---- SOUND EFFECTS ----

  public playButton(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.055);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playLaneSwitch(direction: -1 | 1): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const startFreq = direction < 0 ? 310 : 350;
    const endFreq = direction < 0 ? 230 : 470;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.065);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playJump(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc2.type = 'sine';

    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.16);
    osc2.frequency.setValueAtTime(380, now);
    osc2.frequency.exponentialRampToValueAtTime(920, now + 0.14);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.2);
    osc2.stop(now + 0.2);
  }

  public playSlide(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(115, now + 0.16);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.16);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playCoin(streak = 0): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    const noteFreq = this.coinScale[streak % this.coinScale.length];

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(noteFreq, now);
    osc2.frequency.setValueAtTime(noteFreq * 1.5, now + 0.035);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(now);
    osc2.start(now + 0.03);
    osc1.stop(now + 0.19);
    osc2.stop(now + 0.19);
  }

  public playPowerUp(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5];

    chord.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.045;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  public playShieldBreak(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(840, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.28);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  public playNearMiss(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1480, now + 0.09);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playCollision(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    // Low impact boom
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.38);

    oscGain.gain.setValueAtTime(0.45, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.44);

    // Metallic crash noise burst
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2400, now);
      filter.frequency.exponentialRampToValueAtTime(260, now + 0.35);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.38, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
      noise.start(now);
      noise.stop(now + 0.38);
    }
  }

  public playPurchase(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 739.99, 880.0, 1174.66];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.05;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.24, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }
}

export const AudioManager = new NeonAudioManager();
