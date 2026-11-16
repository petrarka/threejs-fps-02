// hearing.js — the noise bus every guard listens to. A noise is a point, a
// radius and an age. How loud it is at a given ear depends on distance AND on
// walls: an ear-to-source raycast counts crossed walls and each one halves the
// loudness, so a kiln between you and a guard honestly muffles the shot.
import { HEARING } from './config.js';

export class Hearing {
  // wallsFn(ox,oy,oz, tx,ty,tz) -> number of wall crossings between the points
  constructor(wallsFn) {
    this.wallsFn = wallsFn;
    this.noises = [];
    this.now = 0;
  }

  update(dt) {
    this.now += dt;
    while (this.noises.length && this.now - this.noises[0].t > HEARING.memory) this.noises.shift();
  }

  reset() {
    this.noises.length = 0;
    this.now = 0;
  }

  // radius in metres; kind is informational ('shot','step','boom','plant',...)
  emit(x, y, z, radius, kind) {
    this.noises.push({ x, y, z, radius, kind, t: this.now });
  }

  // 0..1 how loud a noise is at the ear: distance falloff then wall muffling
  loudness(noise, ex, ey, ez) {
    const dx = noise.x - ex, dy = noise.y - ey, dz = noise.z - ez;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d >= noise.radius) return 0;
    let l = 1 - d / noise.radius;
    const walls = this.wallsFn(noise.x, noise.y, noise.z, ex, ey, ez);
    l *= Math.pow(HEARING.wallMuffle, walls);
    return l;
  }

  // the loudest noise this ear can hear right now (fresh first), or null
  loudestFor(ex, ey, ez) {
    let best = null;
    let bestL = 0;
    for (let i = this.noises.length - 1; i >= 0; i--) {
      const n = this.noises[i];
      const age = this.now - n.t;
      if (age > 2.5) continue; // only fresh noises pull attention
      const l = this.loudness(n, ex, ey, ez);
      if (l > bestL) { bestL = l; best = n; }
    }
    return best ? { noise: best, loudness: bestL } : null;
  }
}
