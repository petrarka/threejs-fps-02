// One deterministic navigation grid for guards and crew. Geometry is baked once;
// routes use eight-way A*, forbid diagonal corner cutting and are string-pulled.
const CELL = 0.75;
const WIDTH = 64;
const DEPTH = 44;
const ORIGIN_X = -24;
const ORIGIN_Z = -16.5;
const CLEARANCE = 0.31;

const indexOf = (x, z) => z * WIDTH + x;
const clampCell = (value, maximum) => Math.max(0, Math.min(maximum - 1, value));

export function toCell(x, z) {
  return [
    clampCell(Math.floor((x - ORIGIN_X) / CELL), WIDTH),
    clampCell(Math.floor((z - ORIGIN_Z) / CELL), DEPTH),
  ];
}

export function cellPosition(x, z) {
  return [ORIGIN_X + (x + 0.5) * CELL, ORIGIN_Z + (z + 0.5) * CELL];
}

function heuristic(ax, az, bx, bz) {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  return Math.max(dx, dz) + Math.SQRT2 * Math.min(dx, dz) - Math.min(dx, dz);
}

export function createNav(world) {
  const blocked = new Uint8Array(WIDTH * DEPTH);
  for (const solid of world.colliders) {
    if (solid.max.y <= 0.56 || solid.min.y > 1.7) continue;
    const minX = solid.min.x - CLEARANCE;
    const maxX = solid.max.x + CLEARANCE;
    const minZ = solid.min.z - CLEARANCE;
    const maxZ = solid.max.z + CLEARANCE;
    const [x0, z0] = toCell(minX, minZ);
    const [x1, z1] = toCell(maxX, maxZ);
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const [wx, wz] = cellPosition(x, z);
        if (wx >= minX && wx <= maxX && wz >= minZ && wz <= maxZ) blocked[indexOf(x, z)] = 1;
      }
    }
  }

  function free(x, z) {
    const [cx, cz] = toCell(x, z);
    return !blocked[indexOf(cx, cz)];
  }

  function lineFree(ax, az, bx, bz) {
    const distance = Math.hypot(bx - ax, bz - az);
    const count = Math.max(1, Math.ceil(distance / (CELL * 0.4)));
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      if (!free(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  function nearestFree(x, z) {
    const [cx, cz] = toCell(x, z);
    if (!blocked[indexOf(cx, cz)]) return [cx, cz];
    for (let radius = 1; radius < 8; radius += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= WIDTH || nz >= DEPTH) continue;
          if (!blocked[indexOf(nx, nz)]) return [nx, nz];
        }
      }
    }
    return null;
  }

  function path(sx, sz, tx, tz) {
    const startCell = nearestFree(sx, sz);
    const goalCell = nearestFree(tx, tz);
    if (!startCell || !goalCell) return null;
    const [scx, scz] = startCell;
    const [gcx, gcz] = goalCell;
    const start = indexOf(scx, scz);
    const goal = indexOf(gcx, gcz);
    if (start === goal) return [[tx, tz]];

    const cost = new Float32Array(WIDTH * DEPTH).fill(Infinity);
    const estimate = new Float32Array(WIDTH * DEPTH).fill(Infinity);
    const parent = new Int32Array(WIDTH * DEPTH).fill(-1);
    const closed = new Uint8Array(WIDTH * DEPTH);
    const open = [start];
    cost[start] = 0;
    estimate[start] = heuristic(scx, scz, gcx, gcz);

    while (open.length) {
      let bestAt = 0;
      for (let i = 1; i < open.length; i += 1) {
        const a = open[i];
        const b = open[bestAt];
        if (estimate[a] < estimate[b] || (estimate[a] === estimate[b] && a < b)) bestAt = i;
      }
      const current = open[bestAt];
      open[bestAt] = open[open.length - 1];
      open.pop();
      if (closed[current]) continue;
      if (current === goal) {
        const cells = [];
        let cursor = current;
        while (cursor !== -1) {
          cells.push(cellPosition(cursor % WIDTH, Math.floor(cursor / WIDTH)));
          cursor = parent[cursor];
        }
        cells.reverse();
        cells[0] = [sx, sz];
        cells.push([tx, tz]);
        const smooth = [cells[0]];
        let anchor = 0;
        for (let i = 2; i < cells.length; i += 1) {
          if (!lineFree(cells[anchor][0], cells[anchor][1], cells[i][0], cells[i][1])) {
            smooth.push(cells[i - 1]);
            anchor = i - 1;
          }
        }
        smooth.push(cells[cells.length - 1]);
        return smooth;
      }
      closed[current] = 1;
      const cx = current % WIDTH;
      const cz = Math.floor(current / WIDTH);
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= WIDTH || nz >= DEPTH) continue;
          const next = indexOf(nx, nz);
          if (blocked[next] || closed[next]) continue;
          if (dx && dz && (blocked[indexOf(cx + dx, cz)] || blocked[indexOf(cx, cz + dz)])) continue;
          const nextCost = cost[current] + (dx && dz ? Math.SQRT2 : 1);
          if (nextCost >= cost[next]) continue;
          cost[next] = nextCost;
          parent[next] = current;
          estimate[next] = nextCost + heuristic(nx, nz, gcx, gcz);
          open.push(next);
        }
      }
    }
    return null;
  }

  return { blocked, free, lineFree, path, nearestFree };
}
