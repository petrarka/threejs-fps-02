// The two wardens: box-and-sphere figures that walk fixed waypoint routes, spot the player
// on a clear line of sight (a raycast against the world's shootables), turn and shoot back.
// Head shots kill outright and three torso hits do; a downed warden topples, then returns to
// his route six seconds later. Their start points sit clear of the target dummies.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HEALTH = 100;
const RESPAWN_SECONDS = 6;
const FALL_SECONDS = 0.4;
const WALK_SPEED = 2.6;
const ENGAGE_RANGE = 26;
const FIRE_GAP = 0.7;
const AIM_HEIGHT = 1.35;

// Warden patrols the west/A side; stoker patrols the east/B side. Both converge on a
// planted charge (see setObjective).
const ROUTES = [
  { name: 'warden', color: 'accent', points: [[-18, -11.5], [-15, -9], [-13, -2], [-11.5, 3.2], [-8, 8], [-5, 12.5], [0, 12.8], [0, 7]] },
  { name: 'stoker', color: 'muted', points: [[18, -11.5], [15, -9], [13.5, -3], [11, 3.5], [8.5, 8], [9.5, 13], [12, 9]] },
];

export function createBots(scene, world) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6, metalness: 0.05 });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeometry = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeometry = new THREE.BoxGeometry(0.16, 0.62, 0.2);

  const items = [];
  const hitMeshes = [];
  let now = 0;

  for (let index = 0; index < ROUTES.length; index += 1) {
    const route = ROUTES[index];
    const group = new THREE.Group();

    const legL = new THREE.Mesh(legGeometry, legMat);
    legL.position.set(-0.14, 0.31, 0);
    const legR = new THREE.Mesh(legGeometry, legMat);
    legR.position.set(0.14, 0.31, 0);
    const torso = new THREE.Mesh(torsoGeometry, bodyMat);
    torso.position.y = 0.98;
    torso.userData.part = 'torso';
    torso.userData.kind = 'bot';
    const head = new THREE.Mesh(headGeometry, new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[route.color]), roughness: 0.45, metalness: 0.1 }));
    head.position.y = 1.5;
    head.userData.part = 'head';
    head.userData.kind = 'bot';
    group.add(legL, legR, torso, head);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const [sx, sz] = route.points[0];
    group.position.set(sx, 0, sz);

    const item = {
      group, torso, head, legL, legR,
      health: HEALTH, alive: true, fall: 0, respawnAt: 0,
      route, waypoint: 1, forward: 1,
      cooldown: 1 + index * 0.4, engaged: false,
    };
    torso.userData.target = item;
    head.userData.target = item;
    hitMeshes.push(torso, head);
    items.push(item);
  }

  const ray = new THREE.Raycaster();
  ray.far = ENGAGE_RANGE;
  const eye = new THREE.Vector3();
  const at = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const alivePositions = [];
  let objective = null; // {x, z}: a planted charge the wardens must converge on

  function down(item) {
    item.alive = false;
    item.fall = 0;
    item.respawnAt = now + RESPAWN_SECONDS;
    item.engaged = false;
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

  // A warden sees the player when the eye-to-chest ray reaches them without a wall in between.
  function canSee(item, playerPos) {
    eye.set(item.group.position.x, AIM_HEIGHT, item.group.position.z);
    at.set(playerPos.x, playerPos.y + 1.2, playerPos.z);
    dir.subVectors(at, eye);
    const dist = dir.length();
    if (dist > ENGAGE_RANGE) return false;
    dir.normalize();
    ray.set(eye, dir);
    const wall = ray.intersectObjects(world.shootables, false)[0];
    return !wall || wall.distance > dist - 0.5;
  }

  function step(dt, time, playerPos, onPlayerHit, rng) {
    now = time;
    for (const item of items) {
      if (!item.alive) {
        item.fall = Math.min(1, item.fall + dt / FALL_SECONDS);
        item.group.rotation.x = -item.fall * 1.45;
        if (time >= item.respawnAt) {
          item.alive = true;
          item.health = HEALTH;
          item.fall = 0;
          item.group.rotation.x = 0;
          item.cooldown = 0.8;
        }
        continue;
      }

      item.engaged = canSee(item, playerPos);
      const pos = item.group.position;
      if (item.engaged) {
        const dx = playerPos.x - pos.x;
        const dz = playerPos.z - pos.z;
        item.group.rotation.y = Math.atan2(dx, dz);
        item.cooldown -= dt;
        if (item.cooldown <= 0) {
          item.cooldown = FIRE_GAP * (0.8 + rng() * 0.5);
          if (onPlayerHit) {
            const dist = Math.hypot(dx, dz);
            const chance = Math.max(0.08, 0.55 - dist * 0.014);
            if (rng() < chance) onPlayerHit(8 + Math.floor(rng() * 7));
          }
        }
      } else {
        const points = item.route.points;
        let tx;
        let tz;
        if (objective) {
          tx = objective.x;
          tz = objective.z;
        } else {
          tx = points[item.waypoint][0];
          tz = points[item.waypoint][1];
        }
        const dx = tx - pos.x;
        const dz = tz - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < (objective ? 1.15 : 0.4)) {
          if (!objective) {
            let next = item.waypoint + item.forward;
            if (next <= 0 || next >= points.length - 1) item.forward *= -1;
            next = Math.max(0, Math.min(points.length - 1, next));
            item.waypoint = next;
          } else {
            // Hands on the charge: stand still and face it (bomb.js counts the seconds).
            item.legL.rotation.x = 0;
            item.legR.rotation.x = 0;
          }
        } else {
          pos.x += (dx / dist) * WALK_SPEED * dt;
          pos.z += (dz / dist) * WALK_SPEED * dt;
          item.group.rotation.y = Math.atan2(dx, dz);
          const stride = Math.sin(time * 9 + item.waypoint) * 0.3;
          item.legL.rotation.x = stride;
          item.legR.rotation.x = -stride;
        }
        item.cooldown = Math.max(item.cooldown, 0.25);
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
      item.group.rotation.set(0, 0, 0);
      item.group.position.set(sx, 0, sz);
    }
  }

  return {
    items, hitMeshes, damage, damageArea, step, reset,
    setObjective(x, z) {
      objective = x === null || x === undefined ? null : { x, z };
    },
    alivePositions() {
      alivePositions.length = 0;
      for (const item of items) if (item.alive) alivePositions.push(item.group.position);
      return alivePositions;
    },
  };
}