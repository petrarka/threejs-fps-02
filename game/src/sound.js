// A compact WebAudio instrument rack. No files, fetches or decoded assets: every
// report, impact, fuse and interface cue is synthesized after the first gesture.
let audio = null;
let bus = null;
let noiseBuffer = null;
let muted = false;
let noiseOffset = 0;
let masterLevel = 0.32;

function ensureContext() {
  if (audio) return audio;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  audio = new Context();
  bus = audio.createGain();
  bus.gain.value = muted ? 0 : masterLevel;
  const compressor = audio.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.ratio.value = 7;
  bus.connect(compressor);
  compressor.connect(audio.destination);

  const length = audio.sampleRate;
  noiseBuffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  let seed = 0x41c6ce57;
  for (let i = 0; i < length; i += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 2147483648) - 1;
  }
  return audio;
}

function unlock() {
  const context = ensureContext();
  if (context && context.state === 'suspended') context.resume().catch(() => {});
}
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('keydown', unlock, { passive: true });

function tone(frequency, duration, options = {}) {
  if (!audio || audio.state !== 'running') return;
  const at = audio.currentTime + (options.delay || 0);
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = options.type || 'sine';
  oscillator.frequency.setValueAtTime(Math.max(20, frequency), at);
  if (options.to) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), at + duration);
  gain.gain.setValueAtTime(options.gain || 0.12, at);
  gain.gain.exponentialRampToValueAtTime(0.0008, at + duration);
  oscillator.connect(gain);
  gain.connect(bus);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

function noise(duration, options = {}) {
  if (!audio || audio.state !== 'running' || !noiseBuffer) return;
  const at = audio.currentTime + (options.delay || 0);
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = audio.createBiquadFilter();
  filter.type = options.filter || 'lowpass';
  filter.frequency.setValueAtTime(options.cutoff || 1500, at);
  if (options.to) filter.frequency.exponentialRampToValueAtTime(options.to, at + duration);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(options.gain || 0.2, at);
  gain.gain.exponentialRampToValueAtTime(0.0008, at + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(bus);
  source.start(at, (noiseOffset++ % 17) * 0.031);
  source.stop(at + duration + 0.01);
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
    [740, 590, 440].forEach((frequency, i) => tone(frequency, 0.15, { type: 'triangle', gain: 0.08, delay: i * 0.1 }));
  },
  round(won) {
    const notes = won ? [392, 523, 659, 784] : [392, 330, 262];
    notes.forEach((frequency, i) => tone(frequency, 0.18, { type: 'triangle', gain: 0.08, delay: i * 0.105 }));
  },
  purchase(ok = true) {
    tone(ok ? 920 : 150, 0.055, { type: 'square', gain: 0.06 });
    if (ok) tone(1240, 0.07, { type: 'triangle', gain: 0.05, delay: 0.055 });
  },
  toggleMute() {
    muted = !muted;
    if (bus) bus.gain.setTargetAtTime(muted ? 0 : masterLevel, audio.currentTime, 0.015);
    return muted;
  },
};
