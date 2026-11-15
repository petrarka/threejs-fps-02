// The yard crew: nine kiln-yard guards, each with a role, a weapon and a patrol. They
// navigate the yard on the shared A* grid, hear gunfire and grenades, investigate
// noises, converge on a planted charge, and — when they see an attacker — shoot true
// hitscan rounds with per-weapon cadence, not probability rolls. The target is whoever
// they actually see: the player or one of the three crew mates, nearest first. Head
// shots land through a sphere test, body shots through a capsule test, so cover,
// crouching and distance all genuinely matter. Every decision flows from the seeded
// rng or the clock, so runs with the same seed stay frame-identical.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createNav, worldToCell, cellIndex, findPath } from './nav.js';

const HEALTH = 100;
const FALL_SECONDS = 0.4;
const REACTION = 0.38;       // a guard needs a beat to bring his weapon up
const TURN_RATE = 8;
const AIM_HEIGHT = 1.35;
const HEAR_DECAY = 7;        // seconds a noise stays worth investigating
const REPATH_GAP = 0.55;     // minimum seconds between replans for one guard
const ARRIVE_DIST = 0.5;
const BODY_RADIUS = 0.3;     // a body's capsule, shared shape with player.js
const BODY_LO = 0.35;        // capsule segment inset from the feet
const HEAD_RADIUS = 0.2;
const HEAD_INSET = 0.16;     // head sphere centre below the crown
const TRACER_SECONDS = 0.08;
const FLASH_SECONDS = 0.06;
const TRACER_POOL = 10;

// Weapon table for the crew: damage per landed round, seconds between rounds, burst
// length before a recovery pause, base aim spread (radians), engage range.
const GUNS = {
  pistol: { damage: 9, gap: 0.3, burst: 3, pause: 1.9, spread: 0.034, range: 20 },
  rifle: { damage: 8, gap: 0.13, burst: 5, pause: 2.2, spread: 0.027, range: 28 },
  marksman: { damage: 34, gap: 1.5, burst: 1, pause: 1, spread: 0.007, range: 42 },
};

// name/route.color feed the radar and the kill feed; points are the home patrol.
const ROSTER = [
  { name: 'warden', gun: 'rifle', speed: 2.6, color: 'brick', points: [[-18.5, -12.5], [-12, -12.5], [-10.8, -6], [-15.5, -4.2]] },
  { name: 'stoker', gun: 'rifle', speed: 2.6, color: 'surface', points: [[18.5, -12.5], [12.5, -12], [11.2, -5.6], [16.5, -4.2]] },
  { name: 'lookout', gun: 'marksman', speed: 2.2, color: 'hairline', points: [[-3.2, -11.4], [3.2, -11.4]] },
  { name: 'kilnman', gun: 'marksman', speed: 2.2, color: 'muted', points: [[-2.4, -8.6], [2.4, -8.6]] },
  { name: 'prowler', gun: 'pistol', speed: 3.2, color: 'accent', points: [[0, 12.5], [0, 6], [0.2, 1.6], [-2.6, 0.4], [2.6, 0.4]] },
  { name: 'drifter', gun: 'rifle', speed: 3.2, color: 'sand', points: [[-7, 12], [-7, 5.2], [-7, 1.2], [-13.5, 1], [-15, -4.5]] },
  { name: 'cinder', gun: 'pistol', speed: 3.2, color: 'brick', points: [[9, 10.5], [9.2, 4.2], [11, 0.5], [11, -3.4]] },
  { name: 'roamer', gun: 'rifle', speed: 3.4, color: 'accent', points: [[-14, -9], [-6, -6.5], [0, -5.5], [7, -6.5], [14, -9], [6, 1.5], [-6, 1.5]] },
  { name: 'lurker', gun: 'rifle', speed: 2.8, color: 'muted', points: [[-2.6, 13], [2.6, 13], [0, 8.4]] },
];

// ---- ray tests -------------------------------------------------------------
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

// Ray vs a vertical capsule standing on the feet: horizontal closest-approach
// distance to the segment plus a height gate. Approximation, but honest: cover,
// crouching and strafing all change the outcome.
function rayVCapsule(ox, oy, oz, dx, dy, dz, px, py, pz, height) {
  const flat = dx * dx + dz * dz;
  if (flat < 1e-8) return Infinity;
  const t = Math.max(0, ((px - ox) * dx + (pz - oz) * dz) / flat);
  const hx = ox + dx * t - px;
  const hz2 = oz + dz * t - pz;
  const miss = Math.hypot(hx, hz2);
  if (miss > BODY_RADIUS) return Infinity;
  const y = oy + dy * t;
  if (y < py + BODY_LO - BODY_RADIUS * 0.5 || y > py + height - BODY_LO + BODY_RADIUS * 0.5) return Infinity;
  return t;
}

export function createBots(scene, world, nav) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6, metalness: 0.05 });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.night), roughness: 0.5, metalness: 0.4 });
  const torsoGeometry = new THREE.CapsuleGeometry(0.26, 0.42, 6, 12);
  const headGeometry = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeometry = new THREE.BoxGeometry(0.16, 0.62, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.06, 0.09, 0.52);

  const blocked = nav ? nav.blocked : createNav(world).blocked;

  const items = [];
  const hitMeshes = [];
  let now = 0;
  let mates = null; // set later: {items, hitBy(item, amount, part, shooter)}

  for (let index = 0; index < ROSTER.length; index += 1) {
    const entry = ROSTER[index];
    const group = new THREE.Group();

    const legL = new THREE.Mesh(legGeometry, legMat);
    legL.position.set(-0.14, 0.31, 0);
    const legR = new THREE.Mesh(legGeometry, legMat);
    legR.position.set(0.14, 0.31, 0);
    // Capsule torso: the same shape the attackers' bullets are tested against.
    const torso = new THREE.Mesh(torsoGeometry, bodyMat);
    torso.position.y = 0.98;
    torso.userData.part = 'torso';
    torso.userData.kind = 'bot';
    const head = new THREE.Mesh(headGeometry, new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[entry.color]), roughness: 0.45, metalness: 0.1 }));
    head.position.y = 1.5;
    head.userData.part = 'head';
    head.userData.kind = 'bot';
    const gun = new THREE.Mesh(gunGeometry, gunMat);
    gun.position.set(0.17, 1.14, -0.26);
    group.add(legL, legR, torso, head, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const [sx, sz] = entry.points[0];
    group.position.set(sx, 0, sz);

    const item = {
      group, torso, head, legL, legR,
      route: { name: entry.name, color: entry.color, points: entry.points },
      gun: GUNS[entry.gun], speed: entry.speed,
      health: HEALTH, alive: true, fall: 0,
      waypoint: 1, forward: 1,
      cooldown: 1 + index * 0.23, engaged: false, wasEngaged: false, burst: 0,
      engagedSince: 0, strafePhase: index * 1.7,
      path: null, pathIndex: 0, repathAt: 0, mode: 'patrol',
      alertX: 0, alertZ: 0, alertUntil: 0, flashUntil: 0,
      target: null, // {x, z, height, crouching, onHit(amount, part, name)}
    };
    torso.userData.target = item;
    head.userData.target = item;
    hitMeshes.push(torso, head);
    items.push(item);
  }

  // Tracer pool: thin ember lines from a muzzle to where the round went, alive
  // for a few frames — the firefight reads as fire, not dice.
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 });
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
  const alivePositions = [];
  let objective = null; // {x, z}: a planted charge the crew must converge on

  function down(item) {
    item.alive = false;
    item.fall = 0;
    item.engaged = false;
    item.target = null;
    item.mode = 'patrol';
    item.path = null;
  }

  function damage(mesh, amount) {
    const item = mesh.userData.target;
    if (!item || !item.alive) return false;
    item.health -= amount;
    if (item.health > 0) return false;
    down(item);
    return true;
  }

  // Radial blast from a firepot: falloff with distance, returns how many went down.
  function damageArea(x, z, radius, amount) {
    let kills = 0;
    for (const item of items) {
      if (!item.alive) continue;
      const d = Math.hypot(item.group.position.x - x, item.group.position.z - z);
      if (d > radius) continue;
      item.health -= Math.round(amount * (1 - (d / radius) * 0.75));
      if (item.health <= 0) {
        down(item);
        kills += 1;
      }
    }
    return kills;
  }

  // Noise travels: gunfire and firepots wake every guard inside the radius.
  function hear(x, z, radius) {
    for (const item of items) {
      if (!item.alive) continue;
      const d = Math.hypot(item.group.position.x - x, item.group.position.z - z);
      if (d > radius) continue;
      item.alertX = x;
      item.alertZ = z;
      item.alertUntil = now + HEAR_DECAY;
    }
  }

  // A straight eye-to-chest line with no wall in between, inside the gun's reach.
  function canSeeAt(item, tx, tz, ty) {
    eye.set(item.group.position.x, AIM_HEIGHT, item.group.position.z);
    at.set(tx, ty, tz);
    dir.subVectors(at, eye);
    const dist = dir.length();
    if (dist > item.gun.range) return false;
    dir.normalize();
    ray.set(eye, dir);
    ray.far = item.gun.range;
    const wall = ray.intersectObjects(world.shootables, false)[0];
    return !wall || wall.distance > dist - 0.5;
  }

  // Pick who this guard fights: the nearest visible attacker — the player or a mate.
  function acquireTarget(item, playerState, playerPos) {
    let best = null;
    let bestDist = Infinity;
    const ph = playerState.height ?? 1.72;
    const px = playerPos.x;
    const pz = playerPos.z;
    const dP = Math.hypot(px - item.group.position.x, pz - item.group.position.z);
    if (dP < bestDist && canSeeAt(item, px, pz, playerPos.y + 1.2)) {
      bestDist = dP;
      best = {
        x: px, z: pz, height: ph, crouching: !!playerState.crouching,
        onHit: item.onPlayerHit ?? null,
      };
    }
    if (mates) {
      for (const mate of mates.items) {
        if (!mate.alive) continue;
        const mx = mate.group.position.x;
        const mz = mate.group.position.z;
        const dM = Math.hypot(mx - item.group.position.x, mz - item.group.position.z);
        if (dM >= bestDist || !canSeeAt(item, mx, mz, 1.2)) continue;
        bestDist = dM;
        const target = mate;
        best = {
          x: mx, z: mz, height: 1.72, crouching: false,
          onHit: (amount, part, name) => mates.hitBy(target, amount, part, name),
        };
      }
    }
    return best;
  }

  // A guard turns toward a point at a bounded rate, so flanking and quick pushes work.
  function faceToward(item, tx, tz, dt) {
    const target = Math.atan2(tx - item.group.position.x, tz - item.group.position.z);
    let diff = target - item.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    item.group.rotation.y += diff * Math.min(1, dt * TURN_RATE);
  }

  // Plan or refresh the route toward (tx, tz); fall back to a straight beeline
  // when the grid finds nothing (the yard is small and mostly open, so this is rare).
  function setDestination(item, tx, tz) {
    if (now < item.repathAt && item.path) return;
    item.repathAt = now + REPATH_GAP;
    const pos = item.group.position;
    item.path = findPath(blocked, pos.x, pos.z, tx, tz);
    item.pathIndex = 0;
    if (!item.path) item.path = [[tx, tz]];
  }

  // Walk the planned path; returns true while still travelling.
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
    pos.x += (dx / dist) * item.speed * dt;
    pos.z += (dz / dist) * item.speed * dt;
    faceToward(item, tx, tz, dt);
    const stride = Math.sin(now * 9 + item.waypoint) * 0.3;
    item.legL.rotation.x = stride;
    item.legR.rotation.x = -stride;
    return true;
  }

  // One true hitscan round: a seeded aim error around the chest, a wall test, then
  // head-sphere and body-capsule tests. Damage falls off with range.
  function fireRound(item, target, rng) {
    const pos = item.group.position;
    const height = target.height ?? 1.72;
    const settle = item.engagedSince < 0.55 ? 2.1 : (item.engagedSince < 1.3 ? 1.35 : 1);
    const spread = item.gun.spread * settle;
    const chestY = target.crouching ? 0.72 : 1.12;
    const ox = pos.x;
    const oy = AIM_HEIGHT;
    const oz = pos.z;
    let dx = target.x - ox;
    let dy = chestY - oy;
    let dz = target.z - oz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    dx = dx / dist + (rng() * 2 - 1) * spread;
    dy = dy / dist + (rng() * 2 - 1) * spread;
    dz = dz / dist + (rng() * 2 - 1) * spread;
    const norm = Math.hypot(dx, dy, dz) || 1;
    dx /= norm;
    dy /= norm;
    dz /= norm;

    // Where does this round stop if the target is not in the way?
    eye.set(ox, oy, oz);
    dir.set(dx, dy, dz);
    ray.set(eye, dir);
    ray.far = 70;
    const wall = ray.intersectObjects(world.shootables, false)[0];

    const tHead = raySphere(ox, oy, oz, dx, dy, dz, target.x, height - HEAD_INSET, target.z, HEAD_RADIUS);
    const tBody = rayVCapsule(ox, oy, oz, dx, dy, dz, target.x, 0, target.z, height);
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
    slot.line.material.opacity = 0.85;
    slot.until = now + TRACER_SECONDS;
    item.flashUntil = now + FLASH_SECONDS;

    if (!wall || wall.distance > t) {
      const head = tHead <= tBody;
      const falloff = Math.max(0.5, 1 - dist * 0.011);
      const amount = Math.round(item.gun.damage * (head ? 2.2 : 1) * falloff);
      if (target.onHit) target.onHit(amount, head ? 'head' : 'body', item.route.name);
    }
  }

  function step(dt, time, playerState, onPlayerHit, rng) {
    now = time;
    const playerPos = playerState.position ?? playerState;
    for (const item of items) {
      if (!item.alive) {
        // Downed wardens STAY down until the round turns over: no mid-round respawns,
        // so clearing the whole crew wins the round by elimination. reset() revives
        // everyone at the next freeze.
        item.fall = Math.min(1, item.fall + dt / FALL_SECONDS);
        item.group.rotation.x = -item.fall * 1.45;
        continue;
      }

      item.onPlayerHit = onPlayerHit;
      item.target = acquireTarget(item, playerState, playerPos);
      item.engaged = !!item.target;
      const pos = item.group.position;
      if (item.engaged) {
        const target = item.target;
        if (!item.wasEngaged) {
          item.cooldown = Math.max(item.cooldown, REACTION);
          item.engagedSince = 0;
        }
        item.engagedSince += dt;
        faceToward(item, target.x, target.z, dt);
        // Strafe while he fights: a slow deterministic sway, seeded by his slot.
        const sway = Math.sin(time * 2.1 + item.strafePhase) * 0.5 * item.speed * dt;
        const px = -Math.sin(item.group.rotation.y);
        const pz = -Math.cos(item.group.rotation.y);
        const nx = pos.x + px * sway;
        const nz = pos.z + pz * sway;
        const [ncx, ncz] = worldToCell(nx, nz);
        if (!blocked[cellIndex(ncx, ncz)]) {
          pos.x = nx;
          pos.z = nz;
        }
        item.cooldown -= dt;
        if (item.cooldown <= 0) {
          item.burst += 1;
          let gap = item.gun.gap * (0.85 + rng() * 0.4);
          if (item.burst % item.gun.burst === 0) gap *= item.gun.pause;
          item.cooldown = gap;
          fireRound(item, target, rng);
        }
        item.wasEngaged = true;
        continue;
      }

      item.wasEngaged = false;
      item.engagedSince = 0;
      if (objective) {
        // The charge is ticking: every guard who is not fighting runs at it.
        setDestination(item, objective.x, objective.z);
        const arrived = !followPath(item, dt);
        if (arrived) {
          item.legL.rotation.x = 0;
          item.legR.rotation.x = 0;
          faceToward(item, objective.x, objective.z, dt);
        }
      } else if (time < item.alertUntil) {
        // A noise worth his boots: path to it, look around on arrival.
        setDestination(item, item.alertX, item.alertZ);
        if (!followPath(item, dt)) {
          item.legL.rotation.x = 0;
          item.legR.rotation.x = 0;
          faceToward(item, item.alertX, item.alertZ, dt);
        }
      } else {
        // Plain patrol along his route, ping-ponging through its points.
        const points = item.route.points;
        const [tx, tz] = points[item.waypoint];
        const dx = tx - pos.x;
        const dz = tz - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.4) {
          let next = item.waypoint + item.forward;
          if (next <= 0 || next >= points.length - 1) item.forward *= -1;
          next = Math.max(0, Math.min(points.length - 1, next));
          item.waypoint = next;
        } else {
          setDestination(item, tx, tz);
          if (!followPath(item, dt)) {
            pos.x += (dx / dist) * item.speed * dt;
            pos.z += (dz / dist) * item.speed * dt;
            faceToward(item, tx, tz, dt);
          }
        }
      }
      item.cooldown = Math.max(item.cooldown, 0.25);
    }

    for (const slot of tracers) {
      if (!slot.line.visible) continue;
      if (time >= slot.until) {
        slot.line.visible = false;
      } else {
        slot.line.material.opacity = 0.85 * ((slot.until - time) / TRACER_SECONDS);
      }
    }
  }

  function reset() {
    objective = null;
    for (const item of items) {
      const [sx, sz] = item.route.points[0];
      item.alive = true;
      item.health = HEALTH;
      item.fall = 0;
      item.waypoint = 1;
      item.forward = 1;
      item.engaged = false;
      item.wasEngaged = false;
      item.burst = 0;
      item.engagedSince = 0;
      item.mode = 'patrol';
      item.path = null;
      item.repathAt = 0;
      item.alertUntil = 0;
      item.target = null;
      item.group.rotation.set(0, 0, 0);
      item.group.position.set(sx, 0, sz);
    }
    for (const slot of tracers) slot.line.visible = false;
  }

  return {
    items, hitMeshes, damage, damageArea, step, reset, hear,
    setMates(api) { mates = api; },
    allDown() {
      for (const item of items) if (item.alive) return false;
      return true;
    },
    setObjective(x, z) {
      objective = x === null || x === undefined ? null : { x, z };
      if (objective) {
        for (const item of items) {
          item.path = null;
          item.repathAt = 0;
        }
      }
    },
    alivePositions() {
      alivePositions.length = 0;
      for (const item of items) if (item.alive) alivePositions.push(item.group.position);
      return alivePositions;
    },
  };
}
