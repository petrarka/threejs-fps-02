// The FIREPOT HE grenade: a lobbed clay pot that bounces once, skids to a stop,
// and bursts into a short-radius kilnwash. This module owns the whole life of a
// thrown pot — the throw arc, the fuse, the burst light, and the explosion queue
// main.js drains onto guards and the player. The economy only owns the count of
// pots in the purse; physics and fire live here.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const NADE_MAX = 2;
const NADE_FUSE = 1.4;          // seconds from the throw to the burst
const NADE_RADIUS = 5.2;
const NADE_MAX_DAMAGE = 110;    // a pot at your feet is lethal; the rim of the wash is not
const NADE_THROW = 14.5;
const NADE_LOB = 3.2;
const GRAVITY = 22;
const BOUNCE = 0.42;
const ROLL = 0.72;
const BURST_SECONDS = 0.32;

export function createGrenades(scene) {
  const state = { count: 0 };

  // One grenade in flight at a time is plenty for a yard this size.
  const nade = {
    active: false,
    fuse: 0,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35 }),
  );
  mesh.visible = false;
  mesh.castShadow = true;
  scene.add(mesh);

  const burst = {
    left: 0,
    pos: new THREE.Vector3(),
  };
  const burstMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, depthWrite: false }),
  );
  burstMesh.visible = false;
  scene.add(burstMesh);
  const burstLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18);
  scene.add(burstLight);

  const explosions = []; // drained by main.js each step, then applied to bots/player

  function reset() {
    state.count = 0;
    nade.active = false;
    nade.fuse = 0;
    mesh.visible = false;
    burst.left = 0;
    burstMesh.visible = false;
    burstLight.intensity = 0;
    explosions.length = 0;
  }

  function throwNade(origin, dir) {
    if (state.count <= 0 || nade.active || burst.left > 0) return false;
    state.count -= 1;
    nade.active = true;
    nade.fuse = NADE_FUSE;
    nade.pos.copy(origin);
    nade.vel.set(dir.x * NADE_THROW, dir.y * NADE_THROW + NADE_LOB, dir.z * NADE_THROW);
    mesh.visible = true;
    return true;
  }

  function explode() {
    nade.active = false;
    mesh.visible = false;
    burst.left = BURST_SECONDS;
    burst.pos.copy(nade.pos);
    burstLight.position.set(nade.pos.x, Math.max(0.6, nade.pos.y + 0.4), nade.pos.z);
    explosions.push({ x: nade.pos.x, y: nade.pos.y, z: nade.pos.z });
  }

  function step(dt) {
    if (nade.active) {
      nade.fuse -= dt;
      nade.vel.y -= GRAVITY * dt;
      nade.pos.x += nade.vel.x * dt;
      nade.pos.y += nade.vel.y * dt;
      nade.pos.z += nade.vel.z * dt;
      if (nade.pos.y <= 0.09) {
        nade.pos.y = 0.09;
        if (Math.abs(nade.vel.y) > 1.2) {
          nade.vel.y = -nade.vel.y * BOUNCE;
          nade.vel.x *= ROLL;
          nade.vel.z *= ROLL;
          // A clay pot thuds and stays: clamp the skid so the burst hugs the landing spot.
          const skid = Math.hypot(nade.vel.x, nade.vel.z);
          if (skid > 3.2) {
            nade.vel.x *= 3.2 / skid;
            nade.vel.z *= 3.2 / skid;
          }
        } else {
          nade.vel.y = 0;
          nade.vel.x *= 0.86;
          nade.vel.z *= 0.86;
        }
      }
      mesh.position.copy(nade.pos);
      if (nade.fuse <= 0) explode();
    }
    if (burst.left > 0) {
      burst.left = Math.max(0, burst.left - dt);
      const frac = 1 - burst.left / BURST_SECONDS;
      burstMesh.visible = true;
      burstMesh.position.copy(burst.pos);
      burstMesh.scale.setScalar(0.4 + frac * NADE_RADIUS);
      burstMesh.material.opacity = 0.55 * (1 - frac);
      burstLight.intensity = (1 - frac) * 46;
      if (burst.left === 0) {
        burstMesh.visible = false;
        burstLight.intensity = 0;
      }
    }
  }

  return {
    state, NADE_MAX, NADE_RADIUS, NADE_MAX_DAMAGE,
    reset, throwNade, step,
    takeExplosions() {
      if (!explosions.length) return null;
      const snap = explosions.slice();
      explosions.length = 0;
      return snap;
    },
  };
}
