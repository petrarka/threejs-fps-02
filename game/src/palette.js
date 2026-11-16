// Emberline's color language in one place: ember orange and fired clay over a
// blue-black night yard. The stylesheet in index.html mirrors these values, so
// changing a swatch here and there keeps the 3D world and the DOM in tune.
export const PALETTE = Object.freeze({
  night: '#10141b',
  dusk: '#252936',
  ground: '#292a30',
  concrete: '#4b4c52',
  steel: '#686973',
  clay: '#a95636',
  brick: '#743d31',
  sand: '#c39b6b',
  paper: '#f5ead8',
  muted: '#aaa6a0',
  ember: '#ff8a3d',
  coal: '#181b22',
  friendly: '#7fd0c8',
  danger: '#ee5f46',
});

// Small convenience for places that accept either a palette key or a raw CSS
// color: named keys resolve, anything else passes straight through.
export function swatch(name) {
  return PALETTE[name] || name;
}
