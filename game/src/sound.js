// A small WebAudio instrument rack. No files, fetches or decoded assets: every
// report, impact, fuse tick and interface cue is synthesized on the fly after
// the first user gesture unlocks the context.
let ctx = null;
let bus = null;
let noiseBuf = null;
let noiseCursor = 0;
let muted = false;
const MASTER = 0.32;

function ensure() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  bus = ctx.createGain();
  bus.gain.value = muted ? 0 : MASTER;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -16;
  limiter.ratio.value = 7;
  bus.connect(limiter);
  limiter.connect(ctx.destination);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  let state = 0x41c6ce57;
  for (let i = 0; i < data.length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    data[i] = ((state >>> 0) / 2147483648) - 1;
  }
  return ctx;
}

function unlock() {
  const audio = ensure();
  if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
}
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('keydown', unlock, { passive: true });

function tone(freq, duration, opts = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const at = ctx.currentTime + (opts.delay || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type || 'sine';
  osc.frequency.setValueAtTime(Math.max(20, freq), at);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), at + duration);
  gain.gain.setValueAtTime(opts.gain || 0.12, at);
  gain.gain.exponentialRampToValueAtTime(0.0008, at + duration);
  osc.connect(gain);
  gain.connect(bus);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

function noise(duration, opts = {}) {
  if (!ctx || ctx.state !== 'running' || !noiseBuf) return;
  const at = ctx.currentTime + (opts.delay || 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filter || 'lowpass';
  filter.frequency.setValueAtTime(opts.cutoff || 1500, at);
  if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, at + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(opts.gain || 0.2, at);
  gain.gain.exponentialRampToValueAtTime(0.0008, at + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(bus);
  src.start(at, (noiseCursor++ % 17) * 0.031);
  src.stop(at + duration + 0.01);
}

export const sound = {
  shot(kind = 'sidearm', distant = false) {
    const scale = distant ? 0.42 : 1;
    if (kind === 'longsight') {
      noise(0.19, { gain: 0.4 * scale, cutoff: 1800, to: 180 });
      tone(105, 0.2, { type: 'square', gain: 0.16 * scale, to: 42 });
    } else if (kind === 'coil') {
      noise(0.065, { gain: 0.24 * scale, cutoff: 2400, to: 650 });
      tone(190, 0.055, { type: 'square', gain: 0.09 * scale, to: 95 });
    } else {
      noise(0.09, { gain: 0.28 * scale, cutoff: 2100, to: 500 });
      tone(240, 0.075, { type: 'triangle', gain: 0.1 * scale, to: 100 });
    }
  },
  hit(kill = false) {
    tone(kill ? 940 : 680, 0.055, { type: 'square', gain: 0.08 });
    if (kill) tone(1320, 0.1, { type: 'triangle', gain: 0.07, delay: 0.045 });
  },
  hurt() {
    noise(0.12, { gain: 0.12, cutoff: 500 });
    tone(95, 0.16, { type: 'sawtooth', gain: 0.08, to: 58 });
  },
  reload() {
    noise(0.035, { gain: 0.06, cutoff: 3300 });
    tone(360, 0.04, { type: 'square', gain: 0.035, delay: 0.11 });
  },
  step() {
    noise(0.045, { gain: 0.035, cutoff: 520 });
  },
  throwPot() {
    noise(0.1, { gain: 0.07, cutoff: 900 });
    tone(180, 0.08, { type: 'triangle', gain: 0.04, to: 120 });
  },
  explosion() {
    noise(0.72, { gain: 0.55, cutoff: 950, to: 90 });
    tone(78, 0.65, { type: 'sine', gain: 0.34, to: 28 });
  },
  plant() {
    tone(420, 0.09, { type: 'square', gain: 0.09 });
    tone(630, 0.09, { type: 'square', gain: 0.09, delay: 0.11 });
    tone(840, 0.16, { type: 'square', gain: 0.08, delay: 0.22 });
  },
  beep(urgent = false) {
    tone(urgent ? 1450 : 1080, 0.045, { type: 'square', gain: 0.055 });
  },
  defused() {
    [740, 590, 440].forEach((freq, i) => tone(freq, 0.15, { type: 'triangle', gain: 0.08, delay: i * 0.1 }));
  },
  round(won) {
    const notes = won ? [392, 523, 659, 784] : [392, 330, 262];
    notes.forEach((freq, i) => tone(freq, 0.18, { type: 'triangle', gain: 0.08, delay: i * 0.105 }));
  },
  purchase(ok = true) {
    tone(ok ? 920 : 150, 0.055, { type: 'square', gain: 0.06 });
    if (ok) tone(1240, 0.07, { type: 'triangle', gain: 0.05, delay: 0.055 });
  },
  toggleMute() {
    muted = !muted;
    if (bus) bus.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.015);
    return muted;
  },
};
