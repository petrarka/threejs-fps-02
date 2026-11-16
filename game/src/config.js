// Shared, immutable match facts. Keeping these out of the simulation makes the
// map, HUD, radar and shot staging agree on names and positions.
export const FIXED_DT = 1 / 60;
export const BASE_FOV = 74;
export const SCOPE_FOV = 32;
export const ROUNDS_TO_WIN = 8;
export const PLAYER_SPAWN = Object.freeze({ x: 0, y: 0, z: 11.2, yaw: 0 });

export const SITES = Object.freeze([
  Object.freeze({ id: 'A', name: 'ASH KILN', x: -15, z: -9, radius: 3.35 }),
  Object.freeze({ id: 'B', name: 'CINDER KILN', x: 15, z: -9, radius: 3.35 }),
]);

export const GUARD_NAMES = Object.freeze([
  'ROOK', 'VANTA', 'SABLE', 'FLINT', 'MORRO', 'DREG', 'HUSH', 'BRINE', 'CROW',
]);

export const MATE_NAMES = Object.freeze(['TALLY', 'MASON', 'BRACK']);

export const SHOT_NAMES = Object.freeze([
  'start', 'play', 'plant', 'end', 'bots', 'buy', 'match', 'nade', 'radar',
]);

export function formatClock(seconds, tenths = false) {
  const safe = Math.max(0, seconds);
  if (tenths) return safe.toFixed(1).padStart(4, '0');
  const whole = Math.ceil(safe);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
