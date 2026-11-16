// sound.js — every sound in Emberline is synthesized in WebAudio at runtime:
// gunshots (noise burst + body thump), hits, plant beeps, the fuse ticking,
// defuse chords, round stingers, buy-menu ticks. No audio files anywhere.

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this._noise = null;
  }

  // Browsers only hand us an AudioContext after a gesture; call on click.
  unlock() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.2;
      this._noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this._noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.enabled = true;
    } catch {
      this.enabled = false;
    }
  }

  _env(gain, t0, peak, decay) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
  }

  _burst({ dur = 0.2, peak = 0.5, freq = 1800, q = 0.6, type = 'bandpass', at = 0 }) {
    if (!this.enabled) return;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g, t0, peak, dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  _tone({ freq = 440, end = null, dur = 0.15, peak = 0.3, type = 'square', at = 0 }) {
    if (!this.enabled) return;
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, peak, dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // distance 0..1 already muffled by hearing.js — quiet and dull when far
  shot(kind, dist01 = 0) {
    const far = 1 - Math.min(dist01, 1);
    const lp = 700 + far * 3400;
    if (kind === 'long') {
      this._burst({ dur: 0.34, peak: 0.65 * far + 0.1, freq: lp, q: 0.4 });
      this._tone({ freq: 130, end: 42, dur: 0.3, peak: 0.5 * far + 0.08, type: 'sine' });
    } else if (kind === 'coil') {
      this._burst({ dur: 0.12, peak: 0.45 * far + 0.07, freq: lp * 1.2, q: 0.7 });
      this._tone({ freq: 190, end: 70, dur: 0.09, peak: 0.3 * far + 0.05, type: 'triangle' });
    } else {
      this._burst({ dur: 0.16, peak: 0.5 * far + 0.08, freq: lp, q: 0.6 });
      this._tone({ freq: 160, end: 60, dur: 0.12, peak: 0.34 * far + 0.05, type: 'triangle' });
    }
  }

  dryFire() { this._tone({ freq: 900, end: 500, dur: 0.05, peak: 0.12 }); }
  reload() {
    this._tone({ freq: 500, end: 300, dur: 0.06, peak: 0.16, type: 'square' });
    this._tone({ freq: 700, end: 900, dur: 0.07, peak: 0.16, type: 'square', at: 0.35 });
  }
  hit(head = false) {
    if (head) this._tone({ freq: 1400, end: 2100, dur: 0.09, peak: 0.3, type: 'square' });
    else this._tone({ freq: 800, end: 500, dur: 0.06, peak: 0.22, type: 'square' });
  }
  hurt() {
    this._tone({ freq: 220, end: 110, dur: 0.18, peak: 0.4, type: 'sawtooth' });
    this._burst({ dur: 0.12, peak: 0.2, freq: 500, q: 1 });
  }
  footstep(quiet = false) {
    this._burst({ dur: 0.05, peak: quiet ? 0.03 : 0.08, freq: 300, q: 1.2, type: 'lowpass' });
  }
  bounce() { this._tone({ freq: 300, end: 160, dur: 0.08, peak: 0.2, type: 'triangle' }); }
  explosion(dist01 = 0) {
    const far = 1 - Math.min(dist01, 1);
    this._burst({ dur: 0.8, peak: 0.9 * far + 0.1, freq: 200 + far * 700, q: 0.3, type: 'lowpass' });
    this._tone({ freq: 90, end: 26, dur: 0.9, peak: 0.8 * far + 0.1, type: 'sine' });
  }
  plantBeep() { this._tone({ freq: 1200, dur: 0.05, peak: 0.14, type: 'sine' }); }
  fuseTick(urgent = false) {
    this._tone({ freq: urgent ? 1600 : 1050, dur: 0.04, peak: urgent ? 0.2 : 0.12, type: 'sine' });
  }
  planted() {
    this._tone({ freq: 660, dur: 0.12, peak: 0.3, type: 'square' });
    this._tone({ freq: 880, dur: 0.16, peak: 0.3, type: 'square', at: 0.14 });
  }
  defused() {
    this._tone({ freq: 520, dur: 0.14, peak: 0.3, type: 'triangle' });
    this._tone({ freq: 780, dur: 0.2, peak: 0.3, type: 'triangle', at: 0.15 });
  }
  stim() { this._tone({ freq: 400, end: 900, dur: 0.4, peak: 0.2, type: 'sine' }); }
  buy() {
    this._tone({ freq: 980, dur: 0.05, peak: 0.18, type: 'square' });
    this._tone({ freq: 1470, dur: 0.08, peak: 0.18, type: 'square', at: 0.06 });
  }
  deny() { this._tone({ freq: 240, end: 170, dur: 0.14, peak: 0.2, type: 'square' }); }
  uiTick() { this._tone({ freq: 700, dur: 0.03, peak: 0.1, type: 'square' }); }
  roundWin() {
    this._tone({ freq: 392, dur: 0.16, peak: 0.32, type: 'triangle' });
    this._tone({ freq: 523, dur: 0.16, peak: 0.32, type: 'triangle', at: 0.16 });
    this._tone({ freq: 784, dur: 0.34, peak: 0.34, type: 'triangle', at: 0.32 });
  }
  roundLose() {
    this._tone({ freq: 392, dur: 0.2, peak: 0.3, type: 'triangle' });
    this._tone({ freq: 311, dur: 0.24, peak: 0.3, type: 'triangle', at: 0.18 });
    this._tone({ freq: 233, dur: 0.42, peak: 0.3, type: 'triangle', at: 0.4 });
  }
  matchWin() {
    [392, 523, 659, 784, 1046].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.22, peak: 0.32, type: 'triangle', at: i * 0.16 }));
  }
  matchLose() {
    [330, 294, 262, 220].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.3, peak: 0.3, type: 'triangle', at: i * 0.2 }));
  }
}
