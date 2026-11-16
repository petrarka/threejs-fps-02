// world.js — builds the Emberline yard: perimeter clay walls, the big brick
// kiln and its annexes, wooden crates and low clay walls for cover, eight
// ember lamps with warm light pools, and the two bomb sites with their
// chalked letters. Also owns the colliders and every raycast the game needs
// (bullets, vision, hearing muffling, nav string pulling).
import * as THREE from 'three';
import { PAL, groundTexture, clayTexture, brickTexture, woodTexture, metalTexture, siteLetterTexture, lampPoolTexture, skyTexture } from './palette.js';
import { SITES } from './config.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];   // {x0,y0,z0,x1,y1,z1} axis-aligned boxes
    this.lamps = [];
    this.sites = SITES.map((s) => ({ ...s }));
    this.bounds = { minX: -32, maxX: 32, minZ: -22, maxZ: 22 };
    this._build();
  }

  _box(x0, z0, x1, z1, h, mat, y0 = 0) {
    const w = x1 - x0, d = z1 - z0;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
    this.scene.add(mesh);
    this.colliders.push({ x0, y0, z0, x1, y1: y0 + h, z1 });
    return mesh;
  }

  _build() {
    const s = this.scene;
    s.fog = new THREE.Fog(PAL.fog, 34, 130);
    s.background = new THREE.Color(PAL.night);

    // sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(240, 24, 12),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })
    );
    sky.renderOrder = -10;
    s.add(sky);

    // lights: cool moon fill + warm lamps
    s.add(new THREE.HemisphereLight(0x44547a, 0x241c14, 1.3));
    const moon = new THREE.DirectionalLight(0x8fa8d8, 0.75);
    moon.position.set(-30, 60, 20);
    s.add(moon);

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(68, 48),
      new THREE.MeshLambertMaterial({ map: groundTexture() })
    );
    ground.rotation.x = -Math.PI / 2;
    s.add(ground);

    const clay = new THREE.MeshLambertMaterial({ map: clayTexture() });
    const brick = new THREE.MeshLambertMaterial({ map: brickTexture() });
    const wood = new THREE.MeshLambertMaterial({ map: woodTexture() });
    const metal = new THREE.MeshLambertMaterial({ map: metalTexture() });

    // perimeter walls (h=4)
    this._box(-33, -23, 33, -22, 4, clay);
    this._box(-33, 22, 33, 23, 4, clay);
    this._box(-33, -23, -32, 23, 4, clay);
    this._box(32, -23, 33, 23, 4, clay);

    // the kiln: central block, chimney, two annexes
    this._box(-5, -6, 5, 0, 5, brick);
    this._box(-1.2, -3.2, 1.2, -0.8, 8.5, brick);
    this._box(-11, -5, -7, -1, 3.2, brick);
    this._box(7, -5, 11, -1, 3.2, brick);

    // charcoal bins by the kiln mouth
    this._box(-4.6, -9.2, -3.2, -7.8, 1.0, metal);
    this._box(3.2, -9.2, 4.6, -7.8, 1.0, metal);

    // south shed — mid-map anchor between spawn and the kiln
    this._box(-3, 12, 3, 14, 2.6, brick);

    // crates (1.4m cubes of firing wood)
    const crates = [
      [-16, 2], [-18.5, -6], [-12, -10.5], [16, 0.5], [18.5, -8], [12, -10.5],
      [-6, 9], [6, 9], [-20.5, -10], [-26, -16.5], [20.5, -10], [26, -16.5],
      [-9, 15.5], [9, 15.5],
    ];
    for (const [x, z] of crates) this._box(x - 0.7, z - 0.7, x + 0.7, z + 0.7, 1.4, wood);

    // low clay walls (1.1m — duck behind, shoot over)
    const lows = [
      [-15, 3.3, -11, 3.7], [11, 3.3, 15, 3.7],
      [-2, -11.2, 2, -10.8],
      [-20, -13.2, -16, -12.8], [16, -13.2, 20, -12.8],
      [-26, -5.2, -22, -4.8], [22, -5.2, 26, -4.8],
    ];
    for (const [x0, z0, x1, z1] of lows) this._box(x0, z0, x1, z1, 1.1, clay);

    // bomb site letters chalked on the ground
    for (const site of this.sites) {
      const color = site.id === 'A' ? '#ffb347' : '#6ec6ff';
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(site.half * 2, site.half * 2),
        new THREE.MeshBasicMaterial({ map: siteLetterTexture(site.id, color), transparent: true, depthWrite: false })
      );
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(site.cx, 0.02, site.cz);
      s.add(decal);
    }

    // ember lamps: pole, glowing bowl, point light, warm pool on the ash
    const poolTex = lampPoolTexture();
    const lampSpots = [[-24, -12], [0, -13], [24, -12], [-8, 6], [8, 6], [-16, 14], [16, 14], [0, 8]];
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 2.3, 6);
    const bowlGeo = new THREE.IcosahedronGeometry(0.24, 1);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c313c });
    const poolGeo = new THREE.PlaneGeometry(9, 9);
    lampSpots.forEach(([x, z], i) => {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 1.15, z);
      s.add(pole);
      const flame = new THREE.Mesh(bowlGeo, new THREE.MeshBasicMaterial({ color: PAL.ember }));
      flame.position.set(x, 2.45, z);
      s.add(flame);
      const light = new THREE.PointLight(0xffa050, 19, 21, 1.8);
      light.position.set(x, 2.6, z);
      s.add(light);
      const pool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
        map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.03, z);
      s.add(pool);
      this.colliders.push({ x0: x - 0.12, y0: 0, z0: z - 0.12, x1: x + 0.12, y1: 2.3, z1: z + 0.12 });
      this.lamps.push({ x, z, light, flame, phase: i * 1.7, base: 19 });
    });
  }

  // deterministic lamp breathing — driven by sim time, so frozen frames stay put
  update(t) {
    for (const l of this.lamps) {
      const f = 0.88 + 0.09 * Math.sin(t * 6.1 + l.phase) + 0.05 * Math.sin(t * 13.7 + l.phase * 2.3);
      l.light.intensity = l.base * f;
      l.flame.scale.setScalar(0.9 + 0.18 * f);
    }
  }

  onSite(x, z) {
    for (const s of this.sites) {
      if (Math.abs(x - s.cx) <= s.half && Math.abs(z - s.cz) <= s.half) return s;
    }
    return null;
  }

  // --- movement queries -------------------------------------------------
  // circle at (x,z,r) vs every collider tall enough to matter
  collides(x, z, r) {
    for (const c of this.colliders) {
      if (c.y1 < 0.35) continue;
      const cx = Math.max(c.x0, Math.min(x, c.x1));
      const cz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // axis-separated move: slide along walls, never tunnel
  move(x, z, dx, dz, r) {
    let nx = x + dx;
    if (this.collides(nx, z, r)) nx = x;
    let nz = z + dz;
    if (this.collides(nx, nz, r)) nz = z;
    return { x: nx, z: nz };
  }

  // point used by the nav grid: blocked if a body-radius circle can't stand here
  blockedForNav(x, z) { return this.collides(x, z, 0.5); }

  // chest-height 2D line of sight for nav string pulling
  los(x0, z0, x1, z1) {
    return !this._segmentHit(x0, 1.1, z0, x1, 1.1, z1, 0.55);
  }

  // --- raycasts -----------------------------------------------------------
  // nearest collider hit along ray, or null. Slab method per AABB.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let bestT = maxT;
    let hit = null;
    for (const c of this.colliders) {
      let t0 = 0, t1 = bestT;
      let axis = -1, sign = 0;
      let ok = true;
      const o = [ox, oy, oz], d = [dx, dy, dz];
      const lo = [c.x0, c.y0, c.z0], hi = [c.x1, c.y1, c.z1];
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) {
          if (o[a] < lo[a] || o[a] > hi[a]) { ok = false; break; }
        } else {
          let ta = (lo[a] - o[a]) / d[a];
          let tb = (hi[a] - o[a]) / d[a];
          let s = -1;
          if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; s = 1; }
          if (ta > t0) { t0 = ta; axis = a; sign = s; }
          if (tb < t1) t1 = tb;
          if (t0 > t1) { ok = false; break; }
        }
      }
      if (ok && t0 < bestT && t0 > 0.0001) {
        bestT = t0;
        hit = { t: t0, axis, sign };
      }
    }
    if (!hit) return null;
    const n = [0, 0, 0];
    if (hit.axis >= 0) n[hit.axis] = hit.sign;
    return {
      t: hit.t,
      nx: n[0], ny: n[1], nz: n[2],
      x: ox + dx * hit.t, y: oy + dy * hit.t, z: oz + dz * hit.t,
    };
  }

  // does the segment cross any collider taller than minH? (used at 1.1m chest)
  _segmentHit(x0, y0, z0, x1, y1, z1, minH) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    for (const c of this.colliders) {
      if (c.y1 < minH) continue;
      let t0 = 0, t1 = 1;
      let ok = true;
      const o = [x0, y0, z0], d = [dx, dy, dz];
      const lo = [c.x0, c.y0, c.z0], hi = [c.x1, c.y1, c.z1];
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) {
          if (o[a] < lo[a] || o[a] > hi[a]) { ok = false; break; }
        } else {
          let ta = (lo[a] - o[a]) / d[a];
          let tb = (hi[a] - o[a]) / d[a];
          if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
          if (t0 > t1) { ok = false; break; }
        }
      }
      if (ok && t1 > 0.001 && t0 < 0.999) return true;
    }
    return false;
  }

  // count of walls between two points — the hearing muffling input
  wallCrossings(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    let count = 0;
    for (const c of this.colliders) {
      if (c.y1 < 1.2) continue; // low cover doesn't muffle sound
      let t0 = 0, t1 = 1;
      let ok = true;
      const o = [x0, y0, z0], d = [dx, dy, dz];
      const lo = [c.x0, c.y0, c.z0], hi = [c.x1, c.y1, c.z1];
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) {
          if (o[a] < lo[a] || o[a] > hi[a]) { ok = false; break; }
        } else {
          let ta = (lo[a] - o[a]) / d[a];
          let tb = (hi[a] - o[a]) / d[a];
          if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
          if (t0 > tb || t1 < ta) { ok = false; break; }
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
        }
      }
      if (ok && t1 > 0.001 && t0 < 0.999) count++;
    }
    return count;
  }
}
