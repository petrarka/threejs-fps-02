// nav.js — the shared walkability grid and A* pathfinder every bot in the
// yard uses (guards and crew mates alike). Binary-heap open set, octile
// heuristic, no corner cutting, then string pulling over a line-of-sight
// function so paths hug the lanes instead of stair-stepping.

class MinHeap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  push(item, key) {
    const items = this.items, keys = this.keys;
    let i = items.length;
    items.push(item); keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= keys[i]) break;
      [items[p], items[i]] = [items[i], items[p]];
      [keys[p], keys[i]] = [keys[i], keys[p]];
      i = p;
    }
  }
  pop() {
    const items = this.items, keys = this.keys;
    const top = items[0];
    const lastItem = items.pop(), lastKey = keys.pop();
    if (items.length) {
      items[0] = lastItem; keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < items.length && keys[l] < keys[m]) m = l;
        if (r < items.length && keys[r] < keys[m]) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        [keys[m], keys[i]] = [keys[i], keys[m]];
        i = m;
      }
    }
    return top;
  }
}

export class NavGrid {
  // opts: minX,minZ,maxX,maxZ in metres; cell size; blocked(x,z)->bool at cell
  // centre; los(x0,z0,x1,z1)->bool for string pulling (entity-aware not needed)
  constructor({ minX, minZ, maxX, maxZ, cell = 1, blocked, los }) {
    this.minX = minX; this.minZ = minZ;
    this.cell = cell;
    this.cols = Math.max(2, Math.floor((maxX - minX) / cell));
    this.rows = Math.max(2, Math.floor((maxZ - minZ) / cell));
    this.los = los;
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = minX + (c + 0.5) * cell;
        const z = minZ + (r + 0.5) * cell;
        this.blocked[r * this.cols + c] = blocked(x, z) ? 1 : 0;
      }
    }
    // scratch buffers reused between queries (no per-call allocation storms)
    this._g = new Float32Array(n);
    this._f = new Float32Array(n);
    this._came = new Int32Array(n);
    this._state = new Uint8Array(n); // 0 unseen, 1 open, 2 closed
    this._heap = new MinHeap();
  }

  idx(c, r) { return r * this.cols + c; }
  cellX(c) { return this.minX + (c + 0.5) * this.cell; }
  cellZ(r) { return this.minZ + (r + 0.5) * this.cell; }
  colOf(x) { return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cell))); }
  rowOf(z) { return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / this.cell))); }

  isWalkable(x, z) { return !this.blocked[this.idx(this.colOf(x), this.rowOf(z))]; }

  // spiral out from the wanted cell until a free one turns up
  nearestWalkable(x, z) {
    let c0 = this.colOf(x), r0 = this.rowOf(z);
    if (!this.blocked[this.idx(c0, r0)]) return { x, z };
    for (let ring = 1; ring < Math.max(this.cols, this.rows); ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = c0 + dc, r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          if (!this.blocked[this.idx(c, r)]) return { x: this.cellX(c), z: this.cellZ(r) };
        }
      }
    }
    return null;
  }

  findPath(sx, sz, tx, tz) {
    const start = this.nearestWalkable(sx, sz);
    const goal = this.nearestWalkable(tx, tz);
    if (!start || !goal) return null;
    const sc = this.colOf(start.x), sr = this.rowOf(start.z);
    const gc = this.colOf(goal.x), gr = this.rowOf(goal.z);
    const si = this.idx(sc, sr), gi = this.idx(gc, gr);
    if (si === gi) return [{ x: tx, z: tz }];

    const { _g: g, _f: f, _came: came, _state: state, _heap: heap } = this;
    state.fill(0);
    const cols = this.cols;
    const h = (i) => {
      const dc = Math.abs((i % cols) - gc), dr = Math.abs(((i / cols) | 0) - gr);
      const m = Math.min(dc, dr);
      return (dc + dr - m) + m * 1.41421356; // octile
    };
    heap.size && (heap.items.length = 0, heap.keys.length = 0);
    g[si] = 0; f[si] = h(si); came[si] = -1; state[si] = 1;
    heap.push(si, f[si]);

    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
                  [1, 1, 1.41421356], [1, -1, 1.41421356], [-1, 1, 1.41421356], [-1, -1, 1.41421356]];
    let found = false;
    let guard = this.cols * this.rows * 4;
    while (heap.size && guard-- > 0) {
      const cur = heap.pop();
      if (state[cur] === 2) continue;
      state[cur] = 2;
      if (cur === gi) { found = true; break; }
      const cc = cur % cols, cr = (cur / cols) | 0;
      for (const [dc, dr, cost] of DIRS) {
        const nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
        const ni = nr * cols + nc;
        if (this.blocked[ni] || state[ni] === 2) continue;
        // no cutting corners: a diagonal needs both orthogonal cells free
        if (dc && dr && (this.blocked[cr * cols + nc] || this.blocked[nr * cols + cc])) continue;
        const ng = g[cur] + cost;
        if (state[ni] === 1 && ng >= g[ni]) continue;
        g[ni] = ng; f[ni] = ng + h(ni); came[ni] = cur; state[ni] = 1;
        heap.push(ni, f[ni]);
      }
    }
    if (!found) return null;

    // walk back, then string-pull from the start using real line of sight
    const cells = [];
    for (let i = gi; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => ({ x: this.cellX(i % cols), z: this.cellZ(((i / cols) | 0)) }));
    pts[0] = { x: sx, z: sz };
    pts[pts.length - 1] = { x: tx, z: tz };
    return this._smooth(pts);
  }

  _smooth(pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.los(pts[anchor].x, pts[anchor].z, pts[i].x, pts[i].z)) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
}
