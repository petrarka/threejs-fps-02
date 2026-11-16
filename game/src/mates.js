// Tally, Mason and Brack: autonomous crew mates, not decorative followers.
// They share the guards' navigation grid, sight lines and capsule ballistics;
// Mason plants the Ember on a quiet lane, everyone fights, everyone can die.
import * as THREE from 'three';
import { MATE_NAMES } from './config.js';
import { PALETTE } from './palette.js';
import { clearSight, createTracerPool, makeCharacter, rayBodyCapsule, raySphere } from './combat.js';

const CREW = [
  { role: 'entry', spawn: [-2.1, 12.2], offset: [-1.4, 0.9], phase: 0.4 },
  { role: 'planter', spawn: [0, 13.2], offset: [1.35, 1.25], phase: 2.2 },
  { role: 'anchor', spawn: [2.1, 12.2], offset: [0, 2.25], phase: 4.1 },
];
const CARBINE = { damage: 11, gap: 0.17, burst: 4, rest: 1.5, spread: 0.025, range: 29 };

export function createMates(scene, world, bots, nav, hooks = {}) {
  const items = [];
  const tracers = createTracerPool(scene, PALETTE.friendly, 16, 0.11);
  const ray = new THREE.Raycaster();
  const muzzle = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const skull = new THREE.Vector3();
  let clock = 0;

  CREW.forEach((entry, index) => {
    const body = makeCharacter(scene, 'crew', index === 1 ? 'sand' : 'friendly');
    body.group.position.set(entry.spawn[0], 0, entry.spawn[1]);
    items.push({
      ...body,
      id: index,
      name: MATE_NAMES[index],
      role: entry.role,
      spawn: entry.spawn,
      offset: entry.offset,
      phase: entry.phase,
      health: 100,
      alive: true,
      deathTimer: 0,
      kills: 0,
      deaths: 0,
      dmg: 0,
      target: null,
      contactFor: 0,
      cooldown: 0.4 + index * 0.18,
      burst: 0,
      path: null,
      pathIndex: 0,
      nextPathAt: 0,
      mode: 'follow',
      staged: false,
      stageFacing: null,
    });
  });

  function face(item, x, z, dt, rate = 9) {
    const p = item.group.position;
    const want = Math.atan2(-(x - p.x), -(z - p.z));
    let delta = want - item.group.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    item.group.rotation.y += delta * Math.min(1, dt * rate);
  }

  function acquire(item) {
    const p = item.group.position;
    let best = null;
    let nearest = Infinity;
    for (const guard of bots.items) {
      if (!guard.alive) continue;
      const gp = guard.group.position;
      const span = Math.hypot(gp.x - p.x, gp.z - p.z);
      if (span >= nearest || span > CARBINE.range) continue;
      if (!clearSight(ray, world.solids, p.x, 1.36, p.z, gp.x, 1.08, gp.z, 0.3)) continue;
      nearest = span;
      best = guard;
    }
    return best;
  }

  function routeTo(item, x, z) {
    if (item.path && clock < item.nextPathAt) return;
    const p = item.group.position;
    item.path = nav.path(p.x, p.z, x, z) || [[x, z]];
    item.pathIndex = item.path.length > 1 ? 1 : 0;
    item.nextPathAt = clock + 0.55;
  }

  function advance(item, dt, pace = 3.65) {
    if (!item.path || item.pathIndex >= item.path.length) return false;
    const p = item.group.position;
    let node = item.path[item.pathIndex];
    let span = Math.hypot(node[0] - p.x, node[1] - p.z);
    while (span < 0.27 && item.pathIndex < item.path.length - 1) {
      item.pathIndex += 1;
      node = item.path[item.pathIndex];
      span = Math.hypot(node[0] - p.x, node[1] - p.z);
    }
    if (span < 0.3) {
      item.path = null;
      item.leftLeg.rotation.x = item.rightLeg.rotation.x = 0;
      return false;
    }
    const step = Math.min(span, pace * dt);
    p.x += (node[0] - p.x) / span * step;
    p.z += (node[1] - p.z) / span * step;
    face(item, node[0], node[1], dt);
    const stride = Math.sin(clock * 9 + item.phase) * 0.32;
    item.leftLeg.rotation.x = stride;
    item.rightLeg.rotation.x = -stride;
    return true;
  }

  function fire(item, guard, rng) {
    const p = item.group.position;
    const gp = guard.group.position;
    muzzle.set(p.x, 1.34, p.z);
    const settle = item.contactFor < 0.5 ? 1.8 : item.contactFor < 1.1 ? 1.25 : 1;
    const spread = CARBINE.spread * settle;
    dir.set(gp.x - p.x, 1.05 - 1.34, gp.z - p.z).normalize();
    dir.x += (rng() * 2 - 1) * spread;
    dir.y += (rng() * 2 - 1) * spread;
    dir.z += (rng() * 2 - 1) * spread;
    dir.normalize();
    ray.set(muzzle, dir);
    ray.far = CARBINE.range;
    const wall = ray.intersectObjects(world.solids, false)[0];
    skull.set(gp.x, 1.57, gp.z);
    const headSpan = raySphere(muzzle, dir, skull, 0.19);
    const bodySpan = rayBodyCapsule(muzzle, dir, gp.x, 0, gp.z, 1.74);
    const targetSpan = Math.min(headSpan, bodySpan);
    let tracerSpan = Math.min(targetSpan, wall ? wall.distance : CARBINE.range);
    if (!Number.isFinite(tracerSpan)) tracerSpan = CARBINE.range;
    tracers.fire(muzzle, dir, tracerSpan, clock);
    if (hooks.shot) hooks.shot(item);
    bots.hear(p.x, p.z, 22, 'shot');

    if (targetSpan === Infinity || (wall && wall.distance < targetSpan)) return;
    const headshot = headSpan <= bodySpan;
    const falloff = Math.max(0.62, 1 - Math.hypot(gp.x - p.x, gp.z - p.z) * 0.008);
    const amount = Math.round(CARBINE.damage * (headshot ? 2 : 1) * falloff);
    const result = bots.damage(headshot ? guard.head : guard.torso, amount);
    item.dmg += result.damage;
    if (result.killed) {
      item.kills += 1;
      if (hooks.kill) hooks.kill(item.name, guard.name, headshot);
    }
  }

  function hitBy(item, amount, part, guard) {
    if (!item.alive) return false;
    item.health -= amount;
    if (item.health > 0) return false;
    item.alive = false;
    item.deaths += 1;
    item.deathTimer = 0;
    item.path = null;
    item.target = null;
    if (hooks.kill) hooks.kill(guard ? guard.name : 'GUARD', item.name, part === 'head');
    return true;
  }

  // Mason plants only on a lane with no living guard within earshot of the pad.
  function laneIsQuiet(item) {
    const p = item.group.position;
    for (const guard of bots.items) {
      if (!guard.alive) continue;
      const gp = guard.group.position;
      if (Math.hypot(gp.x - p.x, gp.z - p.z) < 7.5) return false;
    }
    return true;
  }

  function step(dt, now, playerState, bomb, rng, live) {
    clock = now;
    const pp = playerState.position;
    const sin = Math.sin(playerState.yaw);
    const cos = Math.cos(playerState.yaw);

    for (const item of items) {
      if (!item.alive) {
        item.deathTimer = Math.min(0.5, item.deathTimer + dt);
        item.group.rotation.x = -1.48 * item.deathTimer / 0.5;
        item.group.position.y = -0.12 * item.deathTimer / 0.5;
        continue;
      }
      if (item.staged) {
        if (item.stageFacing) face(item, item.stageFacing[0], item.stageFacing[1], dt);
        continue;
      }
      item.target = live ? acquire(item) : null;
      if (item.target) {
        item.mode = 'engage';
        item.contactFor += dt;
        const gp = item.target.group.position;
        face(item, gp.x, gp.z, dt, 10);
        item.leftLeg.rotation.x = item.rightLeg.rotation.x = 0;
        item.cooldown -= dt;
        if (item.contactFor >= 0.27 && item.cooldown <= 0) {
          item.burst += 1;
          fire(item, item.target, rng);
          item.cooldown = CARBINE.gap * (item.burst % CARBINE.burst === 0 ? CARBINE.rest : 1) * (0.92 + rng() * 0.16);
        }
        continue;
      }
      item.contactFor = 0;
      item.cooldown = Math.max(item.cooldown, 0.1);

      if (live && item.role === 'planter' && ['carry', 'planting'].includes(bomb.state.phase)) {
        const site = bomb.siteAt(item.group.position);
        if (site && laneIsQuiet(item)) {
          item.mode = 'plant';
          item.path = null;
          face(item, site.x, site.z, dt, 4);
          continue;
        }
      }
      if (live && bomb.state.phase === 'planted') {
        item.mode = 'hold';
        const angle = item.phase;
        const x = bomb.position.x + Math.cos(angle) * 2.35;
        const z = bomb.position.z + Math.sin(angle) * 2.35;
        routeTo(item, x, z);
        if (!advance(item, dt, 3.9)) face(item, x + Math.cos(angle) * 5, z + Math.sin(angle) * 5, dt, 3);
        continue;
      }

      item.mode = live ? 'follow' : 'ready';
      const ox = item.offset[0];
      const oz = item.offset[1];
      const x = pp.x + ox * cos + oz * sin;
      const z = pp.z - ox * sin + oz * cos;
      if (live && Math.hypot(x - item.group.position.x, z - item.group.position.z) > 0.75) {
        routeTo(item, x, z);
        advance(item, dt, item.role === 'entry' ? 4 : 3.65);
      } else {
        item.path = null;
        item.leftLeg.rotation.x = item.rightLeg.rotation.x = 0;
        const behind = item.role === 'anchor' ? Math.PI : 0;
        const angle = playerState.yaw + behind;
        face(item, pp.x - Math.sin(angle) * 5, pp.z - Math.cos(angle) * 5, dt, 3);
      }
    }

    // Separation pass: silhouettes and routes must never collapse into one body.
    for (let a = 0; a < items.length; a += 1) {
      for (let b = a + 1; b < items.length; b += 1) {
        const A = items[a];
        const B = items[b];
        if (!A.alive || !B.alive || A.staged || B.staged) continue;
        const dx = B.group.position.x - A.group.position.x;
        const dz = B.group.position.z - A.group.position.z;
        const span = Math.hypot(dx, dz);
        if (span <= 0.01 || span >= 0.72) continue;
        const push = (0.72 - span) * 0.25;
        const ax = A.group.position.x - dx / span * push;
        const az = A.group.position.z - dz / span * push;
        const bx = B.group.position.x + dx / span * push;
        const bz = B.group.position.z + dz / span * push;
        if (nav.free(ax, az)) A.group.position.set(ax, 0, az);
        if (nav.free(bx, bz)) B.group.position.set(bx, 0, bz);
      }
    }
    tracers.step(clock);
  }

  function reset() {
    for (const item of items) {
      item.group.position.set(item.spawn[0], 0, item.spawn[1]);
      item.group.rotation.set(0, 0, 0);
      item.health = 100;
      item.alive = true;
      item.deathTimer = 0;
      item.target = null;
      item.contactFor = 0;
      item.cooldown = 0.4 + item.id * 0.18;
      item.burst = 0;
      item.path = null;
      item.nextPathAt = 0;
      item.mode = 'follow';
      item.staged = false;
      item.stageFacing = null;
      item.leftLeg.rotation.x = item.rightLeg.rotation.x = 0;
    }
    tracers.reset();
  }

  return {
    items,
    step,
    reset,
    hitBy,
    planter: () => items.find((item) => item.alive && item.mode === 'plant') || null,
    aliveCount: () => items.reduce((sum, item) => sum + Number(item.alive), 0),
    // Shot-director hook: freeze a mate into a composed position and facing.
    stage(marks) {
      marks.forEach((mark, index) => {
        if (!mark || !items[index] || !items[index].alive) return;
        const item = items[index];
        item.staged = true;
        item.group.position.set(mark[0], 0, mark[1]);
        item.stageFacing = [mark[2], mark[3]];
        item.path = null;
      });
    },
  };
}
