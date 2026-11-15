// Shared yard navigation: one baked A* grid both crews walk on. A cell is blocked
// when a collider tall enough to stop a body overlaps it (inflated by the body
// radius), so the same boxes that stop bullets stop routes. Pure functions over a
// Uint8 grid — deterministic, no clock, no rng.
const CELL = 0.8;
const GRID_X = 60;           // -24 … +24
const GRID_Z = 40;           // -16 … +16
const GRID_X0 = -24;
const GRID_Z0 = -16;
const BODY_RADIUS = 0.3;

export function cellIndex(cx, cz) {
  return cz * GRID_X + cx;
}

export function worldToCell(x, z) {
  return [
    Math.max(0, Math.min(GRID_X - 1, Math.floor((x - GRID_X0) / CELL))),
    Math.max(0, Math.min(GRID_Z - 1, Math.floor((z - GRID_Z0) / CELL))),
  ];
}

export function cellCenter(cx, cz) {
  return [GRID_X0 + (cx + 0.5) * CELL, GRID_Z0 + (cz + 0.5) * CELL];
}

export function buildGrid(colliders) {
  const blocked = new Uint8Array(GRID_X * GRID_Z);
  const min = { x: 0, z: 0 };
  const max = { x: 0, z: 0 };
  for (const box of colliders) {
    if (box.max.y - box.min.y < 0.5) continue;   // plates and pads walk over
    min.x = box.min.x - BODY_RADIUS;
    min.z = box.min.z - BODY_RADIUS;
    max.x = box.max.x + BODY_RADIUS;
    max.z = box.max.z + BODY_RADIUS;
    const [c0x, c0z] = worldToCell(min.x, min.z);
    const [c1x, c1z] = worldToCell(max.x, max.z);
    for (let cz = c0z; cz <= c1z; cz += 1) {
      for (let cx = c0x; cx <= c1x; cx += 1) {
        const [wx, wz] = cellCenter(cx, cz);
        if (wx >= min.x && wx <= max.x && wz >= min.z && wz <= max.z) blocked[cellIndex(cx, cz)] = 1;
      }
    }
  }
  return blocked;
}

// Bresenham over the grid: true when a straight segment stays in free cells.
export function gridLineFree(blocked, x0, z0, x1, z1) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (CELL * 0.5)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const [cx, cz] = worldToCell(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    if (blocked[cellIndex(cx, cz)]) return false;
  }
  return true;
}

// A* over the 8-neighbour grid with octile heuristic. Deterministic: ties break on
// the lower h, then the lower cell index. Returns a list of [x, z] world waypoints
// (cell centres), or null when no route exists.
export function findPath(blocked, sx, sz, tx, tz) {
  const [scx, scz] = worldToCell(sx, sz);
  const [tcx, tcz] = worldToCell(tx, tz);
  if (blocked[cellIndex(tcx, tcz)]) return null;
  const start = cellIndex(scx, scz);
  const goal = cellIndex(tcx, tcz);
  if (start === goal) return [[tx, tz]];
  const g = new Float64Array(GRID_X * GRID_Z).fill(Infinity);
  const from = new Int32Array(GRID_X * GRID_Z).fill(-1);
  const closed = new Uint8Array(GRID_X * GRID_Z);
  const open = [start];
  g[start] = 0;
  const hx = Math.abs(tcx - scx);
  const hz = Math.abs(tcz - scz);
  const hScore = new Float64Array(GRID_X * GRID_Z).fill(-1);
  hScore[start] = Math.max(hx, hz) + 0.4142 * Math.min(hx, hz);
  let guard = 0;
  while (open.length && guard < 6000) {
    guard += 1;
    let bi = 0;
    let bf = Infinity;
    let bh = Infinity;
    for (let i = 0; i < open.length; i += 1) {
      const n = open[i];
      const f = g[n] + hScore[n];
      if (f < bf - 1e-9 || (Math.abs(f - bf) <= 1e-9 && hScore[n] < bh)) {
        bf = f;
        bh = hScore[n];
        bi = i;
      }
    }
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) {
      const path = [];
      let n = cur;
      while (n !== -1) {
        const cx = n % GRID_X;
        const cz = Math.floor(n / GRID_X);
        path.push(cellCenter(cx, cz));
        n = from[n];
      }
      path.reverse();
      path.push([tx, tz]);
      return smoothPath(blocked, path);
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ccx = cur % GRID_X;
    const ccz = Math.floor(cur / GRID_X);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        const nx = ccx + dx;
        const nz = ccz + dz;
        if (nx < 0 || nz < 0 || nx >= GRID_X || nz >= GRID_Z) continue;
        const ni = cellIndex(nx, nz);
        if (blocked[ni] || closed[ni]) continue;
        // No corner cutting: a diagonal needs both orthogonal neighbours free.
        if (dx !== 0 && dz !== 0) {
          if (blocked[cellIndex(ccx + dx, ccz)] || blocked[cellIndex(ccx, ccz + dz)]) continue;
        }
        const cost = g[cur] + ((dx !== 0 && dz !== 0) ? 1.4142 : 1);
        if (cost < g[ni] - 1e-9) {
          g[ni] = cost;
          from[ni] = cur;
          const ddx = Math.abs(tcx - nx);
          const ddz = Math.abs(tcz - nz);
          hScore[ni] = Math.max(ddx, ddz) + 0.4142 * Math.min(ddx, ddz);
          open.push(ni);
        }
      }
    }
  }
  return null;
}

// Greedy string-pulling: drop any waypoint a straight, walkable line can skip.
export function smoothPath(blocked, path) {
  if (path.length <= 2) return path;
  const out = [path[0]];
  let anchor = 0;
  for (let i = 2; i < path.length; i += 1) {
    if (!gridLineFree(blocked, path[anchor][0], path[anchor][1], path[i][0], path[i][1])) {
      out.push(path[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

// The whole kit as one object, so a crew module owns a nav without re-deriving it.
export function createNav(world) {
  const blocked = buildGrid(world.colliders);
  return {
    blocked,
    findPath: (sx, sz, tx, tz) => findPath(blocked, sx, sz, tx, tz),
    lineFree: (x0, z0, x1, z1) => gridLineFree(blocked, x0, z0, x1, z1),
    cellFree(x, z) {
      const [cx, cz] = worldToCell(x, z);
      return !blocked[cellIndex(cx, cz)];
    },
  };
}
