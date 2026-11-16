// config.js — every tuning number for Emberline in one honest list:
// match rules, economy, the three weapons + FIREPOT, bot skill, and the cast.
// Nothing here reads the DOM or three.js; safe to import anywhere.

export const MATCH = {
  roundsToWin: 8,
  roundTime: 100,        // seconds of live play before time-expiry loss
  buyTime: 9,            // seconds of buy menu between rounds
  boardTime: 5,          // seconds the round board stays up
  plantTime: 4,          // hold-to-plant channel
  defuseTime: 5,         // guard defuse channel
  fuseTime: 35,          // planted Ember fuse
  startMoney: 800,
  maxMoney: 9000,
};

export const ECON = {
  kill: 300,
  roundWin: 2500,
  roundLoss: 1500,
  plantBonus: 400,       // crew-wide bonus when the Ember goes in
  items: [
    { key: '1', id: 'vest', name: 'Kiln Vest',   price: 650, desc: 'soaks 40% of body hits' },
    { key: '2', id: 'helm', name: 'Lamp Helm',   price: 350, desc: 'soaks half a headshot' },
    { key: '3', id: 'ammo', name: 'Ash Ammo',    price: 200, desc: 'refill every reserve' },
    { key: '4', id: 'he',   name: 'FIREPOT HE',  price: 300, desc: 'kilnwash burst, area denial' },
    { key: '5', id: 'stim', name: 'Ember Stim',  price: 400, desc: '+60 hull over 2s (X to use)' },
    { key: '6', id: 'coil', name: 'COIL-9 SMG',  price: 1400, desc: 'fast, honest, loud' },
    { key: '7', id: 'long', name: 'Longsight',   price: 2400, desc: 'scoped rifle, RMB to aim' },
  ],
};

// Fixed recoil patterns: [pitchUp, yawRight] in degrees, one entry per shot.
// A pattern is the weapon's fingerprint — learnable, not random.
function coilPattern() {
  const p = [];
  for (let i = 0; i < 32; i++) {
    const pitch = 0.5 + Math.min(i, 10) * 0.045;
    const yaw = i < 5 ? (i % 2 ? 0.06 : -0.04) : Math.sin(i * 1.7) * 0.34;
    p.push([pitch, yaw]);
  }
  return p;
}
function sparkPattern() {
  const p = [];
  for (let i = 0; i < 12; i++) p.push([0.85 + i * 0.02, (i % 2 ? 1 : -1) * 0.09]);
  return p;
}
function longPattern() {
  const p = [];
  for (let i = 0; i < 5; i++) p.push([3.1, (i % 2 ? 1 : -1) * 0.3]);
  return p;
}

export const WEAPONS = {
  spark: {
    id: 'spark', name: 'SPARK-6', slot: 1,
    damage: 25, headMult: 4, rpm: 330, auto: false,
    mag: 12, reserve: 48, reload: 1.4,
    spread: { base: 0.35, move: 1.1, heatPerShot: 0.5, heatMax: 2.6, coolPerSec: 2.4 },
    kick: 0.55, pattern: sparkPattern(),
    falloff: { start: 18, end: 42, min: 0.55 },
    noise: 46, price: 0,
  },
  coil: {
    id: 'coil', name: 'COIL-9', slot: 2,
    damage: 22, headMult: 4, rpm: 720, auto: true,
    mag: 32, reserve: 96, reload: 1.9,
    spread: { base: 0.55, move: 1.5, heatPerShot: 0.42, heatMax: 3.4, coolPerSec: 3.2 },
    kick: 0.4, pattern: coilPattern(),
    falloff: { start: 16, end: 40, min: 0.5 },
    noise: 52, price: 1400,
  },
  long: {
    id: 'long', name: 'LONGSIGHT', slot: 3,
    damage: 86, headMult: 4, rpm: 46, auto: false,
    mag: 5, reserve: 20, reload: 2.6,
    spread: { base: 2.6, scoped: 0.06, move: 2.2, heatPerShot: 1.2, heatMax: 3, coolPerSec: 1.6 },
    kick: 1.6, pattern: longPattern(),
    falloff: { start: 60, end: 110, min: 0.8 },
    noise: 62, price: 2400,
    scope: { fovIn: 32, fovOut: 74, sens: 0.38, sway: 0.35 },
  },
};

export const FIREPOT = {
  price: 300,
  throwSpeed: 16,
  fuse: 1.8,
  bounceDamping: 0.42,
  blastRadius: 7.5,
  maxDamage: 110,
  washDuration: 6,      // burning kilnwash patch
  washDps: 9,
  washRadius: 3.4,
};

export const PLAYER = {
  hp: 100,
  height: 1.8,
  eye: 1.62,
  radius: 0.42,
  speed: 5.4,
  quietSpeed: 2.7,      // shift-walk: quiet
  accel: 40,
  friction: 10,
  jump: 4.6,
  stepNoise: 14,        // loudness radius of a full-speed footstep
  quietNoise: 3,
  fov: 74,
};

export const BOT = {
  hp: 100,
  height: 1.8,
  eye: 1.58,
  radius: 0.42,
  speed: 4.6,
  visionDist: 42,
  visionFov: 110,       // degrees
  reactionMin: 0.28,
  reactionMax: 0.6,
  aimErrorBase: 2.6,    // degrees of cone error at engagement start
  aimErrorMin: 0.55,    // settles to this after tracking
  burstLen: [3, 6],
  burstGap: [0.5, 1.1],
  repathSec: 0.9,
  guardDamageScale: 0.82, // guards shoot to suppress, not to delete
};

export const HEARING = {
  memory: 6,            // seconds a noise lingers in a guard's mind
  wallMuffle: 0.5,      // each wall crossed halves the loudness
  investigateMin: 0.22, // loudness threshold that triggers investigation
  shotBase: 50,         // fallback gunshot loudness radius
};

// The cast. Guards hold posts; mates have jobs.
export const GUARD_NAMES = ['Rusk', 'Cinder', 'Hallow', 'Pike', 'Marrow', 'Tarn', 'Vetch', 'Glow', 'Ashby'];
export const MATE_NAMES = ['Tally', 'Mason', 'Brack'];

export const SITES = [
  { id: 'A', cx: -22, cz: -14, half: 4.5 },
  { id: 'B', cx: 22, cz: -14, half: 4.5 },
];

export const SPAWNS = {
  crew: [ { x: -2, z: 19.4 }, { x: -5, z: 20 }, { x: 1, z: 20.2 }, { x: 4.5, z: 19.6 } ],
  guards: [
    { x: -20, z: -19 }, { x: -14, z: -19.5 }, { x: -8, z: -19 }, { x: -2, z: -19.6 }, { x: 3, z: -19 },
    { x: 9, z: -19.4 }, { x: 15, z: -19 }, { x: 20, z: -19.5 }, { x: 25, z: -18.8 },
  ],
};

// mulberry32 — small seeded RNG so ?seed=1 renders the same fight every time
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
