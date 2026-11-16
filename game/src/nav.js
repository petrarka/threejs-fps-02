// The yard's shared navigation layer: one rasterised walkability grid, an
// eight-way A* with a binary-heap open list, no diagonal corner cutting, and
// string-pulled waypoints. Guards and crew both route through this grid.
const CELL = 0.75;
const COLS = 64;
const ROWS = 44;
const ORIGIN_X = -24;
const ORIGIN_Z = -16.5;
const CLEARANCE = 0.31;

const at = (x, z) => z * COLS + x;
const clamp = (v, max) => Math.max(0, Math.min(max - 1, v));

export function toCell(x, z) {
  return [clamp(Math.floor((x - ORIGIN_X) / CELL), COLS), clamp(Math.floor((z - ORIGIN_Z) / CELL), ROWS)];
}

export function cellCenter(cx, cz) {
  return [ORIGIN_X + (cx + 0.5) * CELL, ORIGIN_Z + (cz + 0.5) * CELL];
}

// Octile distance: admissible for 8-way grids with sqrt2 diagonals.
function octile(ax, az, bx, bz) {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

export function createNav(world) {
  const blocked = new Uint8Array(COLS * ROWS);
  for (const box of world.colliders) {
    // Only obstacles that intersect a standing silhouette block a cell.
    if (box.max.y <= 0.56 || box.min.y > 1.7) continue;
    const minX = box.min.x - CLEARANCE;
    const maxX = box.max.x + CLEARANCE;
    const minZ = box.min.z - CLEARANCE;
    const maxZ = box.max.z + CLEARANCE;
    const [cx0, cz0] = toCell(minX, minZ);
    const [cx1, cz1] = toCell(maxX, maxZ);
    for (let cz = cz0; cz <= cz1; cz += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const [wx, wz] = cellCenter(cx, cz);
        if (wx >= minX && wx <= maxX && wz >= minZ && wz <= maxZ) blocked[at(cx, cz)] = 1;
      }
    }
  }

  function free(x, z) {
    const [cx, cz] = toCell(x, z);
    return !blocked[at(cx, cz)];
  }

  function lineFree(ax, az, bx, bz) {
    const span = Math.hypot(bx - ax, bz - az);
    const samples = Math.max(1, Math.ceil(span / (CELL * 0.4)));
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      if (!free(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  function nearestFree(x, z) {
    const [cx, cz] = toCell(x, z);
    if (!blocked[at(cx, cz)]) return [cx, cz];
    for (let ring = 1; ring < 8; ring += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= COLS || nz >= ROWS) continue;
          if (!blocked[at(nx, nz)]) return [nx, nz];
        }
      }
    }
    return null;
  }

  // Minimal binary heap keyed by f-score; keeps long yard routes cheap.
  function makeHeap() {
    const keys = [];
    const vals = [];
    return {
      size: () => keys.length,
      push(key, val) {
        keys.push(key);
        vals.push(val);
        let i = keys.length - 1;
        while (i > 0) {
          const parent = (i - 1) >> 1;
          if (vals[parent] <= vals[i]) break;
          [keys[parent], keys[i]] = [keys[i], keys[parent]];
          [vals[parent], vals[i]] = [vals[i], vals[parent]];
          i = parent;
        }
      },
      pop() {
        const top = keys[0];
        const lastKey = keys.pop();
        const lastVal = vals.pop();
        if (keys.length) {
          keys[0] = lastKey;
          vals[0] = lastVal;
          let i = 0;
          for (;;) {
            const left = i * 2 + 1;
            const right = left + 1;
            let small = i;
            if (left < keys.length && vals[left] < vals[small]) small = left;
            if (right < keys.length && vals[right] < vals[small]) small = right;
            if (small === i) break;
            [keys[small], keys[i]] = [keys[i], keys[small]];
            [vals[small], vals[i]] = [vals[i], vals[small]];
            i = small;
          }
        }
        return top;
      },
    };
  }

  function path(sx, sz, tx, tz) {
    const from = nearestFree(sx, sz);
    const goal = nearestFree(tx, tz);
    if (!from || !goal) return null;
    const startIdx = at(from[0], from[1]);
    const goalIdx = at(goal[0], goal[1]);
    if (startIdx === goalIdx) return [[tx, tz]];

    const gScore = new Float32Array(COLS * ROWS).fill(Infinity);
    const parent = new Int32Array(COLS * ROWS).fill(-1);
    const closed = new Uint8Array(COLS * ROWS);
    const open = makeHeap();
    gScore[startIdx] = 0;
    open.push(startIdx, octile(from[0], from[1], goal[0], goal[1]));

    while (open.size()) {
      const current = open.pop();
      if (closed[current]) continue;
      if (current === goalIdx) {
        const cells = [];
        for (let cursor = current; cursor !== -1; cursor = parent[cursor]) {
          cells.push(cellCenter(cursor % COLS, Math.floor(cursor / COLS)));
        }
        cells.reverse();
        cells[0] = [sx, sz];
        cells.push([tx, tz]);
        // String pulling: drop every waypoint visible from an earlier anchor.
        const route = [cells[0]];
        let anchor = 0;
        for (let i = 2; i < cells.length; i += 1) {
          if (!lineFree(cells[anchor][0], cells[anchor][1], cells[i][0], cells[i][1])) {
            route.push(cells[i - 1]);
            anchor = i - 1;
          }
        }
        route.push(cells[cells.length - 1]);
        return route;
      }
      closed[current] = 1;
      const cx = current % COLS;
      const cz = Math.floor(current / COLS);
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= COLS || nz >= ROWS) continue;
          const next = at(nx, nz);
          if (blocked[next] || closed[next]) continue;
          // No squeezing diagonally past a blocked orthogonal neighbour.
          if (dx && dz && (blocked[at(cx + dx, cz)] || blocked[at(cx, cz + dz)])) continue;
          const cost = gScore[current] + (dx && dz ? Math.SQRT2 : 1);
          if (cost >= gScore[next]) continue;
          gScore[next] = cost;
          parent[next] = current;
          open.push(next, cost + octile(nx, nz, goal[0], goal[1]));
        }
      }
    }
    return null;
  }

  return { blocked, free, lineFree, path, nearestFree };
}
