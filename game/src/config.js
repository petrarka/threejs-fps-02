// Shared match constants. This module is pure data: the simulation, the HUD
// and the deterministic shot director all read it, and nobody mutates it.
export const TICK = 1 / 60;
export const FOV_NORMAL = 74;
export const FOV_SCOPED = 32;
export const ROUNDS_FOR_MATCH = 8;

// Where the player stands at the top of every round, facing down mid.
export const SPAWN = Object.freeze({ x: 0, y: 0, z: 11.2, yaw: 0 });

// The two plant zones, west and east kiln pads.
export const SITES = Object.freeze([
  Object.freeze({ id: 'A', name: 'ASH KILN', x: -15, z: -9, radius: 3.35 }),
  Object.freeze({ id: 'B', name: 'CINDER KILN', x: 15, z: -9, radius: 3.35 }),
]);

// Nine named defenders; the kick-table on TAB names each one with his K/D/DMG.
export const GUARD_NAMES = Object.freeze([
  'ROOK', 'VANTA', 'SABLE', 'FLINT', 'MORRO', 'DREG', 'HUSH', 'BRINE', 'CROW',
]);

// The three AI crew mates: entry, planter, anchor.
export const MATE_NAMES = Object.freeze(['TALLY', 'MASON', 'BRACK']);

// Deterministic screenshot scenes understood by main.js's shot director.
export const SHOTS = Object.freeze([
  'start', 'play', 'plant', 'end', 'bots', 'buy', 'match', 'nade', 'radar',
]);

// mm:ss for the round clock, or fixed-width tenths for the bomb face.
export function clockText(seconds, tenths = false) {
  const clamped = Math.max(0, seconds);
  if (tenths) return clamped.toFixed(1).padStart(4, '0');
  const whole = Math.ceil(clamped);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
