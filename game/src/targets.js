// targets.js — the registry of everything a bullet can hurt. Every fighter
// (you, your three mates, nine guards) registers a capsule here: a head
// sphere on top of a body cylinder. raycast() tests a ray against all of
// them; hitscan() combines that with the world so a wall still wins if it's
// closer than the guard behind it.

export class Targets {
  constructor(world) {
    this.world = world;
    this.list = [];
    this._nextId = 1;
  }

  // entity: {name, team, pos:{x,y,z} (feet), radius, height, alive, stats}
  register(entity) {
    entity.hitId = this._nextId++;
    this.list.push(entity);
    return entity;
  }

  alive(team) {
    return this.list.filter((e) => e.alive && (!team || e.team === team));
  }

  reset() {
    this.list.length = 0;
  }

  // ray vs head sphere; returns t or -1
  _sphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
    const lx = cx - ox, ly = cy - oy, lz = cz - oz;
    const tca = lx * dx + ly * dy + lz * dz;
    if (tca < 0) return -1;
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    const r2 = r * r;
    if (d2 > r2) return -1;
    const thc = Math.sqrt(r2 - d2);
    const t = tca - thc;
    return t > 0.0001 && t < maxT ? t : -1;
  }

  // ray vs vertical cylinder around (px,pz) from y0..y1; returns t or -1
  _cylinder(ox, oy, oz, dx, dy, dz, px, y0, y1, pz, r, maxT) {
    const a = dx * dx + dz * dz;
    if (a < 1e-9) return -1;
    const fx = ox - px, fz = oz - pz;
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
      if (t > 0.0001 && t < maxT) {
        const y = oy + dy * t;
        if (y >= y0 && y <= y1) return t;
      }
    }
    return -1;
  }

  // nearest entity hit along the ray (ignores same team + the shooter)
  raycast(ox, oy, oz, dx, dy, dz, maxT, { team = null, exclude = null } = {}) {
    let best = null;
    for (const e of this.list) {
      if (!e.alive || e === exclude || (team && e.team === team)) continue;
      const headY = e.pos.y + e.height - 0.18;
      const th = this._sphere(ox, oy, oz, dx, dy, dz, e.pos.x, headY, e.pos.z, 0.22, maxT);
      if (th > 0 && (!best || th < best.t)) {
        best = { t: th, entity: e, part: 'head' };
        continue;
      }
      const tb = this._cylinder(ox, oy, oz, dx, dy, dz, e.pos.x, e.pos.y + 0.1, e.pos.y + e.height - 0.3, e.pos.z, e.radius, maxT);
      if (tb > 0 && (!best || tb < best.t)) best = { t: tb, entity: e, part: 'body' };
    }
    if (best) {
      best.x = ox + dx * best.t;
      best.y = oy + dy * best.t;
      best.z = oz + dz * best.t;
    }
    return best;
  }

  // a true hitscan: walls and bodies compete, nearest wins
  hitscan(ox, oy, oz, dx, dy, dz, maxT, opts = {}) {
    const wall = this.world.raycast(ox, oy, oz, dx, dy, dz, maxT);
    const limit = wall ? wall.t : maxT;
    const body = this.raycast(ox, oy, oz, dx, dy, dz, limit, opts);
    if (body) return { kind: 'entity', ...body };
    if (wall) return { kind: 'wall', t: wall.t, x: wall.x, y: wall.y, z: wall.z, nx: wall.nx, ny: wall.ny, nz: wall.nz };
    return null;
  }

  // straight-line visibility between two eyes (for bot vision checks)
  canSee(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.001) return true;
    const wall = this.world.raycast(x0, y0, z0, dx / d, dy / d, dz / d, d - 0.05);
    return !wall;
  }
}
