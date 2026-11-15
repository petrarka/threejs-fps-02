// sound.js — WebAudio synth cues. The context is lazy: no AudioContext exists until the
// first real user gesture, so headless shot renders and the pre-lock screen stay silent and
// never throw. Everything degrades to a no-op where audio is unavailable. The noise buffer
// is filled by a fixed-seed generator, so the build stays fully deterministic.

let ctx = null;
let master = null;
let unlocked = false;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

// Browsers gate an AudioContext behind a gesture; arm it on the first one.
function unlock() {
  if (unlocked) return;
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
}
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('keydown', unlock, { passive: true });

function tone(freq, dur, type, gain, slideTo) {
  const c = ensure();
  if (!c || c.state !== 'running') return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain || 0.2, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Deterministic white-noise-ish sample in [-1, 1], from a fixed-seed xorshift.
let noiseState = 0x9e3779b9;
function noiseSample() {
  noiseState ^= noiseState << 13;
  noiseState ^= noiseState >>> 17;
  noiseState ^= noiseState << 5;
  return ((noiseState >>> 0) / 4294967296) * 2 - 1;
}

function noise(dur, gain, cutoff) {
  const c = ensure();
  if (!c || c.state !== 'running') return;
  const t0 = c.currentTime;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = noiseSample() * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = cutoff || 1800;
  const g = c.createGain();
  g.gain.setValueAtTime(gain || 0.3, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(master);
  src.start(t0);
}

export function shoot() {
  noise(0.09, 0.28, 2400);
  tone(220, 0.08, 'square', 0.10, 90);
}

export function hit(killed) {
  if (killed) {
    tone(660, 0.06, 'square', 0.14);
    tone(880, 0.09, 'square', 0.12);
  } else {
    tone(520, 0.05, 'square', 0.10);
  }
}

export function hurt() {
  tone(160, 0.14, 'sawtooth', 0.16, 90);
}

export function explosion() {
  noise(0.7, 0.5, 320);
  tone(70, 0.6, 'sine', 0.35, 38);
}

export function tick() {
  tone(1200, 0.04, 'square', 0.07);
}

export function armed() {
  tone(440, 0.08, 'square', 0.12);
  tone(660, 0.12, 'square', 0.12);
}

export function defused() {
  tone(880, 0.08, 'sine', 0.14);
  tone(660, 0.10, 'sine', 0.12);
  tone(440, 0.16, 'sine', 0.12);
}

export function step() {
  noise(0.05, 0.08, 700);
}

export function roundEnd(won) {
  if (won) {
    tone(523, 0.10, 'square', 0.12);
    setTimeout(() => tone(659, 0.10, 'square', 0.12), 110);
    setTimeout(() => tone(784, 0.18, 'square', 0.12), 220);
  } else {
    tone(392, 0.14, 'square', 0.12);
    setTimeout(() => tone(311, 0.24, 'square', 0.12), 150);
  }
}

export function buy() {
  tone(980, 0.04, 'square', 0.10);
  setTimeout(() => tone(1320, 0.06, 'square', 0.08), 50);
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.35;
  return muted;
}

export function nadeThrow() {
  noise(0.12, 0.10, 900);
}