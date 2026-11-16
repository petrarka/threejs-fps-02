// FIREPOT HE grenades: thrown clay vessels with gravity, sphere/AABB bounces
// and a timed kilnwash burst. Damage events are queued for the match loop to
// apply, so this module never touches health directly.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const FIREPOT = Object.freeze({ max: 2, fuse: 1.65, speed: 13.5, lift: 3.6, radius: 5.4, damage: 118 });

export function createGrenades(scene, world) {
  const state = { count: 0 };
  const flying = [];
  const detonations = [];
  const bursts = [];

  const potGeo = new THREE.SphereGeometry(0.105, 10, 7);
  const potMat = new THREE.MeshStandardMaterial({ color: '#67362a', roughness: 0.82 });
  const fuseMat = new THREE.MeshBasicMaterial({ color: PALETTE.ember });
  const burstGeo = new THREE.IcosahedronGeometry(1, 2);

  function reset() {
    state.count = 0;
    for (const pot of flying) scene.remove(pot.group);
    flying.length = 0;
    for (const burst of bursts) scene.remove(burst.core, burst.cage, burst.ring, burst.light);
    bursts.length = 0;
    detonations.length = 0;
  }

  function throwPot(origin, direction) {
    if (state.count <= 0 || flying.length >= 3) return false;
    state.count -= 1;
    const group = new THREE.Group();
    const clay = new THREE.Mesh(potGeo, potMat);
    clay.scale.set(1, 1.15, 1);
    clay.castShadow = true;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.015, 5, 10), fuseMat);
    band.rotation.x = Math.PI / 2;
    group.add(clay, band);
    group.position.copy(origin).addScaledVector(direction, 0.42);
    scene.add(group);
    flying.push({
      group,
      velocity: new THREE.Vector3(
        direction.x * FIREPOT.speed,
        direction.y * FIREPOT.speed + FIREPOT.lift,
        direction.z * FIREPOT.speed,
      ),
      fuse: FIREPOT.fuse,
    });
    return true;
  }

  // Queue the damage event and spawn the kilnwash: an additive core, a
  // wireframe cage, a ground shock ring and a fast-fading point light.
  function detonate(pot) {
    const p = pot.group.position;
    detonations.push({ x: p.x, y: p.y, z: p.z });
    scene.remove(pot.group);

    const core = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({
      color: PALETTE.ember, transparent: true, opacity: 0.68,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    core.position.copy(p);
    const cage = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({
      color: '#ffd19a', transparent: true, opacity: 0.52, wireframe: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    cage.position.copy(p);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({
      color: PALETTE.ember, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, Math.max(0.035, p.y - 0.08), p.z);
    const light = new THREE.PointLight('#ffb05d', 55, 16, 1.6);
    light.position.copy(p).y += 0.4;
    scene.add(core, cage, ring, light);
    bursts.push({ core, cage, ring, light, life: 0.48, total: 0.48 });
  }

  // Sphere-vs-AABB resolution: reject along the axis with the smallest
  // correction from the pre-step position, reflect with clay damping.
  function collide(pot, previous) {
    const p = pot.group.position;
    const r = 0.105;
    if (p.y < r) {
      p.y = r;
      pot.velocity.y = pot.velocity.y < -0.8 ? pot.velocity.y * -0.43 : 0;
      pot.velocity.x *= 0.76;
      pot.velocity.z *= 0.76;
    }
    for (const box of world.colliders) {
      if (box.max.y <= 0.1) continue;
      if (p.x < box.min.x - r || p.x > box.max.x + r
        || p.y < box.min.y - r || p.y > box.max.y + r
        || p.z < box.min.z - r || p.z > box.max.z + r) continue;
      const pushX = Math.min(Math.abs(p.x - (box.min.x - r)), Math.abs(p.x - (box.max.x + r)));
      const pushZ = Math.min(Math.abs(p.z - (box.min.z - r)), Math.abs(p.z - (box.max.z + r)));
      if (pushX < pushZ) {
        p.x = previous.x;
        pot.velocity.x *= -0.48;
      } else {
        p.z = previous.z;
        pot.velocity.z *= -0.48;
      }
      break;
    }
  }

  function step(dt) {
    const previous = new THREE.Vector3();
    for (let i = flying.length - 1; i >= 0; i -= 1) {
      const pot = flying[i];
      pot.fuse -= dt;
      previous.copy(pot.group.position);
      pot.velocity.y -= 20 * dt;
      pot.group.position.addScaledVector(pot.velocity, dt);
      collide(pot, previous);
      pot.group.rotation.x += pot.velocity.z * dt * 3;
      pot.group.rotation.z -= pot.velocity.x * dt * 3;
      if (pot.fuse <= 0) {
        detonate(pot);
        flying.splice(i, 1);
      }
    }
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const burst = bursts[i];
      burst.life -= dt;
      const t = 1 - Math.max(0, burst.life) / burst.total;
      burst.core.scale.setScalar(0.35 + t * FIREPOT.radius * 0.82);
      burst.core.rotation.y += dt * 2;
      burst.core.material.opacity = 0.66 * (1 - t) * (1 - t);
      burst.cage.scale.setScalar(0.45 + t * FIREPOT.radius * 0.94);
      burst.cage.rotation.y -= dt * 3.5;
      burst.cage.rotation.x += dt * 1.7;
      burst.cage.material.opacity = 0.5 * (1 - t);
      burst.ring.scale.setScalar(0.4 + t * FIREPOT.radius);
      burst.ring.material.opacity = 0.8 * (1 - t);
      burst.light.intensity = 55 * (1 - t);
      if (burst.life <= 0) {
        scene.remove(burst.core, burst.cage, burst.ring, burst.light);
        burst.core.material.dispose();
        burst.cage.material.dispose();
        burst.ring.material.dispose();
        bursts.splice(i, 1);
      }
    }
  }

  return {
    state,
    reset,
    throwPot,
    step,
    takeExplosions() {
      return detonations.length ? detonations.splice(0, detonations.length) : [];
    },
    activeCount: () => flying.length,
    burstPositions: () => bursts.map((burst) => burst.core.position),
  };
}
