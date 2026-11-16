// Nine named yard guards. Each owns a patrol route, perception, an A*
// destination and a real hitscan weapon. Noise, sight and the planted Ember
// are the only ways they learn where to go; the dead stay down all round.
import * as THREE from 'three';
import { GUARD_NAMES } from './config.js';
import { PALETTE } from './palette.js';
import { createHearing } from './hearing.js';
import { clearSight, createTracerPool, makeCharacter, rayBodyCapsule, raySphere } from './combat.js';

// Patrol loops, chosen weapons and walking pace per guard.
const ROUTES = [
  { gun: 'rifle', pace: 2.45, trim: 'ember', points: [[-17, -13], [-12, -12], [-11, -6], [-16, -4.8]] },
  { gun: 'rifle', pace: 2.45, trim: 'danger', points: [[17, -13], [12, -12], [11.5, -6], [16, -4.8]] },
  { gun: 'dmr', pace: 2.05, trim: 'steel', points: [[-3, -10.6], [-3, -7.2], [-1.8, -5.5]] },
  { gun: 'dmr', pace: 2.05, trim: 'muted', points: [[3, -10.6], [3, -7.2], [1.8, -5.5]] },
  { gun: 'pistol', pace: 3.0, trim: 'clay', points: [[0, 7], [0, 3], [2.6, 1.8], [-2.6, 1.8]] },
  { gun: 'rifle', pace: 2.85, trim: 'sand', points: [[-7.4, 11], [-7.4, 5.2], [-8.8, 1], [-15, -3.5]] },
  { gun: 'pistol', pace: 3.0, trim: 'ember', points: [[8.4, 12], [8.4, 7.5], [11.5, 3.8], [11.5, -3.5]] },
  { gun: 'rifle', pace: 2.6, trim: 'danger', points: [[-6, -6], [-9, -4], [-5, -1], [0, -4]] },
  { gun: 'rifle', pace: 2.6, trim: 'muted', points: [[6, -6], [9, -4], [5, -1], [0, -4]] },
];

// Guard-side ballistics: burst length and rest rhythm shape the pressure.
const ARSENAL = {
  pistol: { damage: 10, gap: 0.31, burst: 3, rest: 1.4, spread: 0.028, range: 22 },
  rifle: { damage: 9, gap: 0.14, burst: 5, rest: 1.65, spread: 0.024, range: 30 },
  dmr: { damage: 30, gap: 1.35, burst: 1, rest: 0.7, spread: 0.008, range: 43 },
};

export function createBots(scene, world, nav, hooks = {}) {
  const items = [];
  const hitMeshes = [];
  const hearing = createHearing(world);
  const tracers = createTracerPool(scene, PALETTE.ember, 22, 0.1);
  const ray = new THREE.Raycaster();
  const muzzle = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const skull = new THREE.Vector3();
  let clock = 0;
  let objective = null;
  let opponents = null;

  ROUTES.forEach((route, index) => {
    const body = makeCharacter(scene, 'guard', route.trim);
    const start = route.points[0];
    body.group.position.set(start[0], 0, start[1]);
    const item = {
      ...body,
      id: index,
      name: GUARD_NAMES[index],
      route,
      gun: ARSENAL[route.gun],
      health: 100,
      alive: true,
      deathTimer: 0,
      kills: 0,
      deaths: 0,
      dmg: 0,
      waypoint: 1,
      routeDir: 1,
      path: null,
      pathIndex: 0,
      nextPathAt: 0,
      noise: new THREE.Vector3(),
      noiseUntil: 0,
      noisePriority: 0,
      cooldown: 0.65 + index * 0.13,
      burst: 0,
      contactFor: 0,
      target: null,
      phase: index * 1.713,
      mode: 'patrol',
    };
    item.torso.userData = { kind: 'guard', part: 'body', owner: item };
    item.head.userData = { kind: 'guard', part: 'head', owner: item };
    hitMeshes.push(item.torso, item.head);
    items.push(item);
  });

  function face(item, x, z, dt, rate = 8) {
    const p = item.group.position;
    const want = Math.atan2(-(x - p.x), -(z - p.z));
    let delta = want - item.group.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    item.group.rotation.y += delta * Math.min(1, dt * rate);
  }

  function routeTo(item, x, z, force = false) {
    if (!force && item.path && clock < item.nextPathAt) return;
    item.path = nav.path(item.group.position.x, item.group.position.z, x, z) || [[x, z]];
    item.pathIndex = item.path.length > 1 ? 1 : 0;
    item.nextPathAt = clock + 0.65;
  }

  function advance(item, dt, paceScale = 1) {
    if (!item.path || item.pathIndex >= item.path.length) return false;
    const p = item.group.position;
    let node = item.path[item.pathIndex];
    let span = Math.hypot(node[0] - p.x, node[1] - p.z);
    while (span < 0.28 && item.pathIndex < item.path.length - 1) {
      item.pathIndex += 1;
      node = item.path[item.pathIndex];
      span = Math.hypot(node[0] - p.x, node[1] - p.z);
    }
    if (span < 0.28) {
      item.path = null;
      item.leftLeg.rotation.x = item.rightLeg.rotation.x = 0;
      return false;
    }
    const step = Math.min(span, item.route.pace * paceScale * dt);
    p.x += (node[0] - p.x) / span * step;
    p.z += (node[1] - p.z) / span * step;
    face(item, node[0], node[1], dt);
    const stride = Math.sin(clock * 9 + item.phase) * 0.34;
    item.leftLeg.rotation.x = stride;
    item.rightLeg.rotation.x = -stride;
    return true;
  }

  function canSee(item, x, y, z) {
    const p = item.group.position;
    if (Math.hypot(x - p.x, z - p.z) > item.gun.range) return false;
    return clearSight(ray, world.solids, p.x, 1.36, p.z, x, y, z, 0.32);
  }

  // Pick the nearest visible hostile: the player or any living crew mate.
  function acquire(item, playerState) {
    const p = item.group.position;
    let best = null;
    let bestSpan = Infinity;
    const pp = playerState.position;
    const playerSpan = Math.hypot(pp.x - p.x, pp.z - p.z);
    if (canSee(item, pp.x, pp.y + (playerState.crouched ? 0.75 : 1.15), pp.z)) {
      bestSpan = playerSpan;
      best = {
        x: pp.x, feetY: pp.y, z: pp.z,
        height: playerState.height,
        crouched: playerState.crouched,
        hurt: item.playerHit,
      };
    }
    if (opponents) {
      for (const mate of opponents.mates.items) {
        if (!mate.alive) continue;
        const mp = mate.group.position;
        const span = Math.hypot(mp.x - p.x, mp.z - p.z);
        if (span >= bestSpan || !canSee(item, mp.x, 1.12, mp.z)) continue;
        bestSpan = span;
        best = {
          x: mp.x, feetY: 0, z: mp.z, height: 1.74, crouched: false,
          hurt: (amount, part, guard) => opponents.hitMate(mate, amount, part, guard),
        };
      }
    }
    return best;
  }

  // One honest hitscan round at the current target. Aim takes a beat to
  // settle after first contact — close and early is wild.
  function fire(item, target, rng) {
    const p = item.group.position;
    muzzle.set(p.x, 1.34, p.z);
    const settle = item.contactFor < 0.55 ? 1.9 : item.contactFor < 1.2 ? 1.3 : 1;
    const spread = item.gun.spread * settle;
    const chestY = target.feetY + (target.crouched ? 0.72 : 1.08);
    dir.set(target.x - p.x, chestY - 1.34, target.z - p.z).normalize();
    dir.x += (rng() * 2 - 1) * spread;
    dir.y += (rng() * 2 - 1) * spread;
    dir.z += (rng() * 2 - 1) * spread;
    dir.normalize();

    ray.set(muzzle, dir);
    ray.far = item.gun.range;
    const wall = ray.intersectObjects(world.solids, false)[0];
    skull.set(target.x, target.feetY + target.height - 0.17, target.z);
    const headSpan = raySphere(muzzle, dir, skull, 0.19);
    const bodySpan = rayBodyCapsule(muzzle, dir, target.x, target.feetY, target.z, target.height);
    const targetSpan = Math.min(headSpan, bodySpan);
    let tracerSpan = Math.min(targetSpan, wall ? wall.distance : item.gun.range);
    if (!Number.isFinite(tracerSpan)) tracerSpan = item.gun.range;
    tracers.fire(muzzle, dir, tracerSpan, clock);
    if (hooks.shot) hooks.shot(item);

    if (targetSpan === Infinity || (wall && wall.distance < targetSpan)) return;
    const headshot = headSpan <= bodySpan;
    const span = Math.hypot(target.x - p.x, target.z - p.z);
    const falloff = Math.max(0.58, 1 - span * 0.009);
    const amount = Math.max(1, Math.round(item.gun.damage * (headshot ? 2.05 : 1) * falloff));
    item.dmg += amount;
    const died = target.hurt ? target.hurt(amount, headshot ? 'head' : 'body', item) : false;
    if (died) item.kills += 1;
  }

  function damage(mesh, amount) {
    const item = mesh.userData.owner;
    if (!item || !item.alive) return { killed: false, damage: 0, item };
    const dealt = Math.min(item.health, Math.max(0, Math.round(amount)));
    item.health -= dealt;
    if (item.health <= 0) {
      item.alive = false;
      item.deaths += 1;
      item.deathTimer = 0;
      item.path = null;
      item.target = null;
      return { killed: true, damage: dealt, item };
    }
    return { killed: false, damage: dealt, item };
  }

  // Explosion evaluation: falloff by distance, and a wall between the pot and
  // a guard soaks the burst entirely.
  function blast(x, y, z, radius, maximum) {
    const results = [];
    for (const item of items) {
      if (!item.alive) continue;
      const p = item.group.position;
      const span = Math.hypot(p.x - x, p.y + 0.8 - y, p.z - z);
      if (span > radius) continue;
      if (!clearSight(ray, world.solids, x, Math.max(0.2, y), z, p.x, 0.9, p.z, 0.2)) continue;
      const amount = Math.round(maximum * (1 - 0.8 * span / radius));
      results.push({ item, ...damage(item.torso, amount) });
    }
    return results;
  }

  function step(dt, now, playerState, onPlayerHit, rng, live) {
    clock = now;
    for (const item of items) {
      if (!item.alive) {
        item.deathTimer = Math.min(0.5, item.deathTimer + dt);
        item.group.rotation.x = -1.48 * item.deathTimer / 0.5;
        item.group.position.y = -0.12 * item.deathTimer / 0.5;
        continue;
      }
      item.playerHit = onPlayerHit;
      item.target = live ? acquire(item, playerState) : null;
      if (item.target) {
        item.mode = 'engage';
        item.contactFor += dt;
        face(item, item.target.x, item.target.z, dt, 10);
        item.leftLeg.rotation.x = item.rightLeg.rotation.x = 0;
        item.cooldown -= dt;
        if (item.contactFor >= 0.32 && item.cooldown <= 0) {
          item.burst += 1;
          fire(item, item.target, rng);
          const resting = item.burst % item.gun.burst === 0;
          item.cooldown = item.gun.gap * (resting ? item.gun.rest : 1) * (0.92 + rng() * 0.16);
        }
        continue;
      }
      item.contactFor = 0;
      item.cooldown = Math.max(item.cooldown, 0.12);
      if (!live) {
        item.leftLeg.rotation.x = item.rightLeg.rotation.x = 0;
        continue;
      }
      if (objective) {
        // The planted Ember pulls every living guard to the charge.
        item.mode = 'defuse';
        routeTo(item, objective.x, objective.z);
        if (!advance(item, dt, 1.2)) face(item, objective.x, objective.z, dt);
      } else if (clock < item.noiseUntil) {
        item.mode = 'investigate';
        routeTo(item, item.noise.x, item.noise.z);
        if (!advance(item, dt, 1.05)) face(item, item.noise.x, item.noise.z, dt, 3);
      } else {
        item.mode = 'patrol';
        const point = item.route.points[item.waypoint];
        const p = item.group.position;
        if (Math.hypot(point[0] - p.x, point[1] - p.z) < 0.5) {
          item.waypoint += item.routeDir;
          if (item.waypoint >= item.route.points.length - 1 || item.waypoint <= 0) item.routeDir *= -1;
          item.waypoint = Math.max(0, Math.min(item.route.points.length - 1, item.waypoint));
          item.path = null;
        } else {
          routeTo(item, point[0], point[1]);
          advance(item, dt);
        }
      }
    }
    tracers.step(clock);
  }

  function reset() {
    objective = null;
    for (const item of items) {
      const start = item.route.points[0];
      item.group.position.set(start[0], 0, start[1]);
      item.group.rotation.set(0, 0, 0);
      item.health = 100;
      item.alive = true;
      item.deathTimer = 0;
      item.waypoint = 1;
      item.routeDir = 1;
      item.path = null;
      item.pathIndex = 0;
      item.nextPathAt = 0;
      item.noiseUntil = 0;
      item.cooldown = 0.65 + item.id * 0.13;
      item.burst = 0;
      item.contactFor = 0;
      item.target = null;
      item.mode = 'patrol';
      item.leftLeg.rotation.x = item.rightLeg.rotation.x = 0;
    }
    tracers.reset();
  }

  return {
    items,
    hitMeshes,
    step,
    reset,
    damage,
    blast,
    hear: (x, z, radius, kind) => hearing.emit(items, x, z, radius, clock, kind),
    setOpponents(api) { opponents = api; },
    setObjective(x, z) {
      objective = x === null ? null : { x, z };
      for (const item of items) item.path = null;
    },
    alivePositions: () => items.filter((item) => item.alive).map((item) => item.group.position),
    allDown: () => items.every((item) => !item.alive),
    aliveCount: () => items.reduce((sum, item) => sum + Number(item.alive), 0),
    // Shot-director hook: place a guard and face him somewhere, deterministically.
    stage(index, x, z, faceX, faceZ) {
      const item = items[index];
      item.group.position.set(x, 0, z);
      item.group.rotation.y = Math.atan2(-(faceX - x), -(faceZ - z));
      item.path = null;
    },
  };
}
