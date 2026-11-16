// Match constants shared by simulation, HUD and the deterministic shot director.
// Everything here is data; no module that imports config ever mutates it.
export const TICK = 1 / 60;
export const FOV_NORMAL = 74;
export const FOV_SCOPED = 32;
export const ROUNDS_FOR_MATCH = 8;
export const SPAWN = Object.freeze({ x: 0, y: 0, z: 11.2, yaw: 0 });

export const SITES = Object.freeze([
  Object.freeze({ id: 'A', name: 'ASH KILN', x: -15, z: -9, radius: 3.35 }),
  Object.freeze({ id: 'B', name: 'CINDER KILN', x: 15, z: -9, radius: 3.35 }),
]);

export const GUARD_NAMES = Object.freeze([
  'ROOK', 'VANTA', 'SABLE', 'FLINT', 'MORRO', 'DREG', 'HUSH', 'BRINE', 'CROW',
]);

export const MATE_NAMES = Object.freeze(['TALLY', 'MASON', 'BRACK']);

export const SHOTS = Object.freeze([
  'start', 'play', 'plant', 'end', 'bots', 'buy', 'match', 'nade', 'radar',
]);

export function clockText(seconds, tenths = false) {
  const clamped = Math.max(0, seconds);
  if (tenths) return clamped.toFixed(1).padStart(4, '0');
  const whole = Math.ceil(clamped);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
