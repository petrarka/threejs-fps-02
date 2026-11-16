// FIREPOT grenades: physical little clay vessels with a timed kilnwash. Flight
// uses gravity and sphere/AABB bounce tests; damage is queued for the match to apply.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const FIREPOT = Object.freeze({ max: 2, fuse: 1.65, speed: 13.5, lift: 3.6, radius: 5.4, damage: 118 });

export function createGrenades(scene, world) {
  const state = { count: 0 };
  const active = [];
  const explosions = [];
  const bursts = [];
  const potGeometry = new THREE.SphereGeometry(0.105, 10, 7);
  const potMaterial = new THREE.MeshStandardMaterial({ color: '#67362a', roughness: 0.82 });
  const fuseMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.ember });
  const burstGeometry = new THREE.IcosahedronGeometry(1, 2);

  function reset() {
    state.count = 0;
    for (const pot of active) scene.remove(pot.group);
    active.length = 0;
    for (const burst of bursts) scene.remove(burst.mesh, burst.shell, burst.ring, burst.light);
    bursts.length = 0;
    explosions.length = 0;
  }

  function throwPot(origin, direction) {
    if (state.count <= 0 || active.length >= 3) return false;
    state.count -= 1;
    const group = new THREE.Group();
    const clay = new THREE.Mesh(potGeometry, potMaterial);
    clay.scale.set(1, 1.15, 1);
    clay.castShadow = true;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.015, 5, 10), fuseMaterial);
    band.rotation.x = Math.PI / 2;
    group.add(clay, band);
    group.position.copy(origin).addScaledVector(direction, 0.42);
    scene.add(group);
    active.push({
      group,
      velocity: new THREE.Vector3(direction.x * FIREPOT.speed, direction.y * FIREPOT.speed + FIREPOT.lift, direction.z * FIREPOT.speed),
      fuse: FIREPOT.fuse,
      bounces: 0,
    });
    return true;
  }

  function detonate(pot) {
    const p = pot.group.position;
    explosions.push({ x: p.x, y: p.y, z: p.z });
    scene.remove(pot.group);
    const material = new THREE.MeshBasicMaterial({
      color: PALETTE.ember, transparent: true, opacity: 0.68,
      blending: THREE.AdditiveBlending, depthWrite: false, wireframe: false,
    });
    const mesh = new THREE.Mesh(burstGeometry, material);
    mesh.position.copy(p);
    const shell = new THREE.Mesh(burstGeometry, new THREE.MeshBasicMaterial({
      color: '#ffd19a', transparent: true, opacity: 0.52, wireframe: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    shell.position.copy(p);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({
      color: PALETTE.ember, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, Math.max(0.035, p.y - 0.08), p.z);
    scene.add(mesh, shell, ring);
    const light = new THREE.PointLight('#ffb05d', 55, 16, 1.6);
    light.position.copy(p).y += 0.4;
    scene.add(light);
    bursts.push({ mesh, shell, ring, light, life: 0.48, total: 0.48 });
  }

  function bounce(pot, previous) {
    const p = pot.group.position;
    const radius = 0.105;
    if (p.y < radius) {
      p.y = radius;
      if (pot.velocity.y < -0.8) pot.velocity.y *= -0.43;
      else pot.velocity.y = 0;
      pot.velocity.x *= 0.76;
      pot.velocity.z *= 0.76;
      pot.bounces += 1;
    }
    for (const solid of world.colliders) {
      if (solid.max.y <= 0.1) continue;
      if (p.x < solid.min.x - radius || p.x > solid.max.x + radius
        || p.y < solid.min.y - radius || p.y > solid.max.y + radius
        || p.z < solid.min.z - radius || p.z > solid.max.z + radius) continue;
      // Resolve along the smallest travel correction from the previous safe point.
      const dx = Math.min(Math.abs(p.x - (solid.min.x - radius)), Math.abs(p.x - (solid.max.x + radius)));
      const dz = Math.min(Math.abs(p.z - (solid.min.z - radius)), Math.abs(p.z - (solid.max.z + radius)));
      if (dx < dz) {
        p.x = previous.x;
        pot.velocity.x *= -0.48;
      } else {
        p.z = previous.z;
        pot.velocity.z *= -0.48;
      }
      pot.bounces += 1;
      break;
    }
  }

  function step(dt) {
    const previous = new THREE.Vector3();
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const pot = active[i];
      pot.fuse -= dt;
      previous.copy(pot.group.position);
      pot.velocity.y -= 20 * dt;
      pot.group.position.addScaledVector(pot.velocity, dt);
      bounce(pot, previous);
      pot.group.rotation.x += pot.velocity.z * dt * 3;
      pot.group.rotation.z -= pot.velocity.x * dt * 3;
      if (pot.fuse <= 0) {
        detonate(pot);
        active.splice(i, 1);
      }
    }
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const burst = bursts[i];
      burst.life -= dt;
      const t = 1 - Math.max(0, burst.life) / burst.total;
      burst.mesh.scale.setScalar(0.35 + t * FIREPOT.radius * 0.82);
      burst.mesh.rotation.y += dt * 2;
      burst.mesh.material.opacity = 0.66 * (1 - t) * (1 - t);
      burst.shell.scale.setScalar(0.45 + t * FIREPOT.radius * 0.94);
      burst.shell.rotation.y -= dt * 3.5;
      burst.shell.rotation.x += dt * 1.7;
      burst.shell.material.opacity = 0.5 * (1 - t);
      burst.ring.scale.setScalar(0.4 + t * FIREPOT.radius);
      burst.ring.material.opacity = 0.8 * (1 - t);
      burst.light.intensity = 55 * (1 - t);
      if (burst.life <= 0) {
        scene.remove(burst.mesh, burst.shell, burst.ring, burst.light);
        burst.mesh.material.dispose();
        burst.shell.material.dispose();
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
      if (!explosions.length) return [];
      return explosions.splice(0, explosions.length);
    },
    activeCount: () => active.length,
    burstPositions: () => bursts.map((burst) => burst.mesh.position),
  };
}
