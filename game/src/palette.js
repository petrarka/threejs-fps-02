// The look plan in one place: a dusk kiln-yard in terracotta and cold concrete.
// Six of these feed the CSS custom properties in index.html; the rest are world-only
// shades (ground, brick, sand, night). The lighting derives every other tone the game
// needs, so no colour outside this table appears anywhere in the code.
export const PALETTE = {
  canvas: '#15171d',   // night floor / deepest shadow
  surface: '#2b2c34',  // poured-concrete walls
  hairline: '#4c4a56', // trim, crate straps, panel borders
  ink: '#f3e8d6',      // warm paper light / text
  muted: '#9a958e',    // cool haze / secondary text
  accent: '#f2883a',   // ember orange: site pads, lamps, markers
  ground: '#232227',   // playable ground plates
  brick: '#8a4a34',    // terracotta brick volumes
  sand: '#c2a071',     // dust, clay crates
  night: '#191a22',    // ceiling plane / sky slab
  dusk: '#2b2733',     // warm dusk haze: scene background and far fog
};