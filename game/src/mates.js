// The crew: three friendly mates who run with the player. Tally entries ahead,
// Mason carries the Ember charge and puts it down on a site when the lane is clear,
// Brack anchors on the player's shoulder and watches the back. They share the yard's
// A* grid with the guards, see them through real line-of-sight raycasts and answer
// with true hitscan rounds — head sphere, body capsule, range falloff, the same
// physics the guards shoot with. When the charge is ticking they ring it and hold
// the posts. Dead is dead until the next round. Every decision flows from the seeded
// rng or the clock, so runs with the same seed stay frame-identical.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HEALTH = 100;
const FALL_SECONDS = 0.4;
const REACTION = 0.3;
const TURN_RATE = 9;
const AIM_HEIGHT = 1.35;
const REPATH_GAP = 0.5;
const ARRIVE_DIST = 0.45;
const BODY_RADIUS = 0.3;
const BODY_LO = 0.35;
const HEAD_RADIUS = 0.2;
const HEAD_INSET = 0.16;
const TRACER_SECONDS = 0.08;
const TRACER_POOL = 8;
const SPEED = 3.9;
const SITE_RADIUS = 3.4;

// One rifle between three pairs of hands: honest automatic fire.
const GUN = { damage: 9, gap: 0.16, burst: 4, pause: 2.2, spread: 0.028, range: 26 };

// name feeds the kill feed and the round board; follow is the slot in the player's
// local frame (x right, z back — negative z is the way the player faces).
const ROSTER = [
  { name: 'tally', role: 'entry', color: 'accent', spawn: [-2.2, 11.6], follow: [-1.5, 1.3] },
  { name: 'mason', role: 'plant', color: 'sand', spawn: [0, 12.4], follow: [1.4, 1.5] },
  { name: 'brack', role: 'anchor', color: 'hairline', spawn: [2.2, 11.6], follow: [0, 2.3] },
];

// Ray vs sphere: smallest positive t, or Infinity.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  if (c > 0 && b < 0) return Infinity;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = b - Math.sqrt(disc);
  return t > 0 ? t : Infinity;
}

// Ray vs a vertical capsule standing on the feet (same shape as the guards use).
function rayVCapsule(ox, oy, oz, dx, dy, dz, px, py, pz, height) {
  const flat = dx * dx + dz * dz;
  if (flat < 1e-8) return Infinity;
  const t = Math.max(0, ((px - ox) * dx + (pz - oz) * dz) / flat);
  const hx = ox + dx * t - px;
  const hz2 = oz + dz * t - pz;
  if (Math.hypot(hx, hz2) > BODY_RADIUS) return Infinity;
  const y = oy + dy * t;
  if (y < py + BODY_LO - BODY_RADIUS * 0.5 || y > py + height - BODY_LO + BODY_RADIUS * 0.5) return Infinity;
  return t;
}

export function createMates(scene, world, bots, nav, hooks) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sand), roughness: 0.6, metalness: 0.05 });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.muted), roughness: 0.85 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.night), roughness: 0.5, metalness: 0.4 });
  const torsoGeometry = new THREE.CapsuleGeometry(0.26, 0.42, 6, 12);
  const headGeometry = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeometry = new THREE.BoxGeometry(0.16, 0.62, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.06, 0.09, 0.52);

  const items = [];
  let now = 0;

  for (let index = 0; index < ROSTER.length; index += 1) {
    const entry = ROSTER[index];
    const group = new THREE.Group();

    const legL = new THREE.Mesh(legGeometry, legMat);
    legL.position.set(-0.14, 0.31, 0);
    const legR = new THREE.Mesh(legGeometry, legMat);
    legR.position.set(0.14, 0.31, 0);
    const torso = new THREE.Mesh(torsoGeometry, bodyMat);
    torso.position.y = 0.98;
    const head = new THREE.Mesh(headGeometry, new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[entry.color]), roughness: 0.45, metalness: 0.1 }));
    head.position.y = 1.5;
    const gun = new THREE.Mesh(gunGeometry, gunMat);
    gun.position.set(-0.17, 1.14, -0.26);
    group.add(legL, legR, torso, head, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const [sx, sz] = entry.spawn;
    group.position.set(sx, 0, sz);

    items.push({
      group, legL, legR, torso, head,
      name: entry.name, role: entry.role,
      follow: entry.follow, spawn: entry.spawn,
      health: HEALTH, alive: true, fall: 0,
      cooldown: 0.6 + index * 0.31, engaged: false, wasEngaged: false, burst: 0,
      engagedSince: 0, strafePhase: 2.1 + index * 1.9,
      path: null, pathIndex: 0, repathAt: 0, mode: 'follow',
      kills: 0, deaths: 0, dmg: 0, target: null, stageFace: null,
    });
  }

  // Tracer pool, ink-coloured so the crew's fire reads against the guards' ember.
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.ink), transparent: true, opacity: 0.8 });
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, until: 0 });
  }
  let tracerNext = 0;

  const ray = new THREE.Raycaster();
  const eye = new THREE.Vector3();
  const at = new THREE.Vector3();
  const dir = new THREE.Vector3();

  function down(item, shooterName) {
    item.alive = false;
    item.fall = 0;
    item.deaths += 1;
    item.engaged = false;
    item.target = null;
    item.path = null;
    if (hooks && hooks.killfeed) hooks.killfeed((shooterName || 'GUARD').toUpperCase(), item.name.toUpperCase());
  }

  // A guard's round lands here.
  function hitBy(item, amount, part, shooterName) {
    if (!item || !item.alive) return;
    item.health -= amount;
    if (item.health > 0) return;
    down(item, shooterName);
  }

  // Mate vs guard: same eye-line test the guards use, aimed at the nearest visible one.
  function acquireTarget(item) {
    let best = null;
    let bestDist = Infinity;
    for (const guard of bots.items) {
      if (!guard.alive) continue;
      const gx = guard.group.position.x;
      const gz = guard.group.position.z;
      const d = Math.hypot(gx - item.group.position.x, gz - item.group.position.z);
      if (d >= bestDist || d > GUN.range) continue;
      eye.set(item.group.position.x, AIM_HEIGHT, item.group.position.z);
      at.set(gx, 1.2, gz);
      dir.subVectors(at, eye);
      const dist = dir.length();
      dir.normalize();
      ray.set(eye, dir);
      ray.far = GUN.range;
      const wall = ray.intersectObjects(world.shootables, false)[0];
      if (wall && wall.distance < dist - 0.5) continue;
      bestDist = d;
      best = guard;
    }
    return best;
  }

  function faceToward(item, tx, tz, dt) {
    const target = Math.atan2(tx - item.group.position.x, tz - item.group.position.z);
    let diff = target - item.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    item.group.rotation.y += diff * Math.min(1, dt * TURN_RATE);
  }

  function setDestination(item, tx, tz) {
    if (now < item.repathAt && item.path) return;
    item.repathAt = now + REPATH_GAP;
    const pos = item.group.position;
    item.path = nav.findPath(pos.x, pos.z, tx, tz);
    item.pathIndex = 0;
    if (!item.path) item.path = [[tx, tz]];
  }

  function followPath(item, dt) {
    if (!item.path || item.pathIndex >= item.path.length) return false;
    const pos = item.group.position;
    let [tx, tz] = item.path[item.pathIndex];
    while (item.pathIndex < item.path.length - 1
      && Math.hypot(tx - pos.x, tz - pos.z) < ARRIVE_DIST) {
      item.pathIndex += 1;
      [tx, tz] = item.path[item.pathIndex];
    }
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE_DIST && item.pathIndex >= item.path.length - 1) {
      item.path = null;
      return false;
    }
    pos.x += (dx / dist) * SPEED * dt;
    pos.z += (dz / dist) * SPEED * dt;
    faceToward(item, tx, tz, dt);
    const stride = Math.sin(now * 9 + item.strafePhase) * 0.3;
    item.legL.rotation.x = stride;
    item.legR.rotation.x = -stride;
    return true;
  }

  // One hitscan round from a mate into a guard.
  function fireRound(item, guard, rng) {
    const pos = item.group.position;
    const gp = guard.group.position;
    const settle = item.engagedSince < 0.5 ? 2.0 : (item.engagedSince < 1.2 ? 1.3 : 1);
    const spread = GUN.spread * settle;
    const ox = pos.x;
    const oy = AIM_HEIGHT;
    const oz = pos.z;
    let dx = gp.x - ox;
    let dy = 1.12 - oy;
    let dz = gp.z - oz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    dx = dx / dist + (rng() * 2 - 1) * spread;
    dy = dy / dist + (rng() * 2 - 1) * spread;
    dz = dz / dist + (rng() * 2 - 1) * spread;
    const norm = Math.hypot(dx, dy, dz) || 1;
    dx /= norm;
    dy /= norm;
    dz /= norm;

    eye.set(ox, oy, oz);
    dir.set(dx, dy, dz);
    ray.set(eye, dir);
    ray.far = 70;
    const wall = ray.intersectObjects(world.shootables, false)[0];

    const tHead = raySphere(ox, oy, oz, dx, dy, dz, gp.x, 1.5 - HEAD_INSET, gp.z, HEAD_RADIUS);
    const tBody = rayVCapsule(ox, oy, oz, dx, dy, dz, gp.x, 0, gp.z, 1.72);
    let t = Math.min(tHead, tBody);
    if (t === Infinity) t = wall ? wall.distance : 40;
    if (wall && wall.distance < t) t = wall.distance;

    const slot = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_POOL;
    const attr = slot.line.geometry.getAttribute('position');
    attr.setXYZ(0, ox + dx * 0.5, oy + dy * 0.5 - 0.06, oz + dz * 0.5);
    attr.setXYZ(1, ox + dx * t, oy + dy * t, oz + dz * t);
    attr.needsUpdate = true;
    slot.line.visible = true;
    slot.line.material.opacity = 0.8;
    slot.until = now + TRACER_SECONDS;

    if (!wall || wall.distance > t) {
      const head = tHead <= tBody;
      const falloff = Math.max(0.5, 1 - dist * 0.011);
      const amount = Math.round(GUN.damage * (head ? 2.2 : 1) * falloff);
      const killed = bots.damage(head ? guard.head : guard.torso, amount);
      item.dmg += amount;
      if (killed) {
        item.kills += 1;
        if (hooks && hooks.killfeed) hooks.killfeed(item.name.toUpperCase(), guard.route.name.toUpperCase());
      }
    }
    bots.hear(ox, oz, 22);
  }

  function step(dt, time, playerState, bomb, rng, live) {
    now = time;
    const px = playerState.position.x;
    const pz = playerState.position.z;
    const yaw = playerState.yaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);

    for (const item of items) {
      if (!item.alive) {
        item.fall = Math.min(1, item.fall + dt / FALL_SECONDS);
        item.group.rotation.x = -item.fall * 1.45;
        continue;
      }

      // Shot staging: a posed mate holds his mark and does nothing else.
      if (item.mode === 'stage') {
        item.legL.rotation.x = 0;
        item.legR.rotation.x = 0;
        if (item.stageFace) faceToward(item, item.stageFace[0], item.stageFace[1], dt);
        continue;
      }

      // 1) Fight: a visible guard always comes first (never during buy time).
      item.target = live ? acquireTarget(item) : null;
      item.engaged = !!item.target;
      if (item.engaged) {
        const guard = item.target;
        const gp = guard.group.position;
        if (!item.wasEngaged) {
          item.cooldown = Math.max(item.cooldown, REACTION);
          item.engagedSince = 0;
        }
        item.engagedSince += dt;
        faceToward(item, gp.x, gp.z, dt);
        const sway = Math.sin(time * 2.3 + item.strafePhase) * 0.5 * SPEED * dt;
        const pxr = -Math.sin(item.group.rotation.y);
        const pzr = -Math.cos(item.group.rotation.y);
        const nx = item.group.position.x + pxr * sway;
        const nz = item.group.position.z + pzr * sway;
        if (nav.cellFree(nx, nz)) {
          item.group.position.x = nx;
          item.group.position.z = nz;
        }
        item.cooldown -= dt;
        if (item.cooldown <= 0) {
          item.burst += 1;
          let gap = GUN.gap * (0.85 + rng() * 0.4);
          if (item.burst % GUN.burst === 0) gap *= GUN.pause;
          item.cooldown = gap;
          fireRound(item, guard, rng);
        }
        item.wasEngaged = true;
        item.mode = 'fight';
        continue;
      }
      item.wasEngaged = false;
      item.engagedSince = 0;

      // 2) Mason puts the charge down when he is on a site with nobody shooting at him.
      if (item.role === 'plant' && bomb && (bomb.state.phase === 'carry' || bomb.state.phase === 'plant')) {
        const site = bomb.siteAt(item.group.position);
        if (site) {
          item.mode = 'plant';
          item.path = null;
          item.legL.rotation.x = 0;
          item.legR.rotation.x = 0;
          faceToward(item, px, pz, dt);
          continue;
        }
      }

      // 3) Charge is ticking: ring it and hold the posts.
      if (bomb && bomb.state.phase === 'planted') {
        const angle = item.strafePhase;
        const tx = bomb.position.x + Math.cos(angle) * 2.3;
        const tz = bomb.position.z + Math.sin(angle) * 2.3;
        item.mode = 'hold';
        setDestination(item, tx, tz);
        if (!followPath(item, dt)) {
          item.legL.rotation.x = 0;
          item.legR.rotation.x = 0;
          faceToward(item, bomb.position.x + Math.cos(angle) * 8, bomb.position.z + Math.sin(angle) * 8, dt);
        }
        continue;
      }

      // 4) Otherwise ride the player's shoulder.
      const fx = item.follow[0];
      const fz = item.follow[1];
      const tx = px + fx * cos - fz * sin;
      const tz = pz - fx * sin - fz * cos;
      item.mode = 'follow';
      const dist = Math.hypot(tx - item.group.position.x, tz - item.group.position.z);
      if (dist > 0.9) {
        setDestination(item, tx, tz);
        followPath(item, dt);
      } else {
        item.path = null;
        item.legL.rotation.x = 0;
        item.legR.rotation.x = 0;
        // Idle stance: entry and planter face the player's way, anchor watches the back.
        const back = item.role === 'anchor' ? Math.PI : 0;
        faceToward(item, px + Math.sin(yaw + back) * 4, pz + Math.cos(yaw + back) * 4, dt);
      }
    }

    // Don't stack: a soft deterministic separation between living mates.
    for (let a = 0; a < items.length; a += 1) {
      const A = items[a];
      if (!A.alive) continue;
      for (let b = a + 1; b < items.length; b += 1) {
        const B = items[b];
        if (!B.alive) continue;
        const dx = B.group.position.x - A.group.position.x;
        const dz = B.group.position.z - A.group.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 0.7) {
          const push = (0.7 - d) * 0.5;
          A.group.position.x -= (dx / d) * push;
          A.group.position.z -= (dz / d) * push;
          B.group.position.x += (dx / d) * push;
          B.group.position.z += (dz / d) * push;
        }
      }
    }

    for (const slot of tracers) {
      if (!slot.line.visible) continue;
      if (time >= slot.until) {
        slot.line.visible = false;
      } else {
        slot.line.material.opacity = 0.8 * ((slot.until - time) / TRACER_SECONDS);
      }
    }
  }

  function reset() {
    for (const item of items) {
      item.alive = true;
      item.health = HEALTH;
      item.fall = 0;
      item.engaged = false;
      item.wasEngaged = false;
      item.burst = 0;
      item.engagedSince = 0;
      item.mode = 'follow';
      item.path = null;
      item.repathAt = 0;
      item.target = null;
      item.stageFace = null;
      item.group.rotation.set(0, 0, 0);
      item.group.position.set(item.spawn[0], 0, item.spawn[1]);
    }
    for (const slot of tracers) slot.line.visible = false;
  }

  return {
    items, step, reset, hitBy,
    // Shot staging only: pose the crew on their marks [[x, z, faceX, faceZ] | null].
    stage(marks) {
      for (let i = 0; i < marks.length && i < items.length; i += 1) {
        const mark = marks[i];
        if (!mark) continue;
        const item = items[i];
        if (!item.alive) continue;
        item.group.position.set(mark[0], 0, mark[1]);
        item.stageFace = [mark[2], mark[3]];
        item.mode = 'stage';
        item.path = null;
        item.legL.rotation.x = 0;
        item.legR.rotation.x = 0;
      }
    },
    // The mate currently channelling a plant, if any — main.js feeds him to the bomb.
    planter() {
      for (const item of items) if (item.alive && item.mode === 'plant') return item;
      return null;
    },
    aliveCount() {
      let n = 0;
      for (const item of items) if (item.alive) n += 1;
      return n;
    },
  };
}
