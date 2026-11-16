// The whole colour voice of Emberline: fired clay and ember light over
// blue-black night steel. HUD CSS mirrors these values in index.html.
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

export function swatch(name) {
  return PALETTE[name] || name;
}
