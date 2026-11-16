// Shared combat primitives and low-poly combatant visuals. Both teams use the
// same capsule maths, wall queries and tracer implementation; only decisions differ.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function raySphere(origin, direction, center, radius) {
  const lx = center.x - origin.x;
  const ly = center.y - origin.y;
  const lz = center.z - origin.z;
  const projection = lx * direction.x + ly * direction.y + lz * direction.z;
  const c = lx * lx + ly * ly + lz * lz - radius * radius;
  if (c > 0 && projection < 0) return Infinity;
  const discriminant = projection * projection - c;
  if (discriminant < 0) return Infinity;
  const near = projection - Math.sqrt(discriminant);
  if (near >= 0) return near;
  const far = projection + Math.sqrt(discriminant);
  return far >= 0 ? far : Infinity;
}

function rayCylinder(origin, direction, x, z, lowY, highY, radius) {
  const ox = origin.x - x;
  const oz = origin.z - z;
  const a = direction.x * direction.x + direction.z * direction.z;
  if (a < 1e-9) return Infinity;
  const b = 2 * (ox * direction.x + oz * direction.z);
  const c = ox * ox + oz * oz - radius * radius;
  const d = b * b - 4 * a * c;
  if (d < 0) return Infinity;
  const root = Math.sqrt(d);
  const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  let nearest = Infinity;
  for (const t of candidates) {
    if (t < 0) continue;
    const y = origin.y + direction.y * t;
    if (y >= lowY && y <= highY) nearest = Math.min(nearest, t);
  }
  return nearest;
}

// A vertical capsule is a cylinder with hemispherical caps. Testing all three
// pieces avoids the forgiving "closest approach" approximation of many bot shooters.
export function rayBodyCapsule(origin, direction, x, feetY, z, height, radius = 0.29) {
  const r = Math.min(radius, height * 0.25);
  const low = feetY + r;
  const high = feetY + height - r;
  let nearest = rayCylinder(origin, direction, x, z, low, high, r);
  const center = new THREE.Vector3();
  center.set(x, low, z);
  nearest = Math.min(nearest, raySphere(origin, direction, center, r));
  center.y = high;
  nearest = Math.min(nearest, raySphere(origin, direction, center, r));
  return nearest;
}

const sightOrigin = new THREE.Vector3();
const sightDirection = new THREE.Vector3();
export function clearSight(ray, solids, ax, ay, az, bx, by, bz, slack = 0.15) {
  sightOrigin.set(ax, ay, az);
  sightDirection.set(bx - ax, by - ay, bz - az);
  const distance = sightDirection.length();
  if (distance < 0.001) return true;
  sightDirection.divideScalar(distance);
  ray.set(sightOrigin, sightDirection);
  ray.far = distance;
  const hit = ray.intersectObjects(solids, false)[0];
  return !hit || hit.distance >= distance - slack;
}

export function makeCharacter(scene, team, accentName) {
  const group = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({
    color: team === 'crew' ? '#526a70' : '#4a4649', roughness: 0.86,
  });
  const armor = new THREE.MeshStandardMaterial({
    color: team === 'crew' ? '#263b43' : '#302d31', roughness: 0.68, metalness: 0.12,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: PALETTE[accentName], roughness: 0.5, emissive: PALETTE[accentName], emissiveIntensity: 0.12,
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#171b21', roughness: 0.55, metalness: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: '#bd9474', roughness: 0.9 });

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.22), uniform);
  const rightLeg = leftLeg.clone();
  leftLeg.position.set(-0.14, 0.34, 0);
  rightLeg.position.set(0.14, 0.34, 0);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.44, 4, 8), uniform);
  torso.position.y = 1.02;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.48, 0.32), armor);
  vest.position.set(0, 1.03, -0.015);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.065, 0.345), trim);
  stripe.position.set(0, 1.14, -0.02);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 8), skin);
  head.position.y = 1.56;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.192, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), armor);
  helmet.position.y = 1.59;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.055, 0.045), trim);
  visor.position.set(0, 1.59, -0.157);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.12, 0.62), dark);
  gun.position.set(0.23, 1.13, -0.33);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 7), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.23, 1.15, -0.73);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.48), uniform);
  arm.position.set(0.16, 1.13, -0.18);
  arm.rotation.y = -0.25;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.23, 1.15, -0.9);

  group.add(leftLeg, rightLeg, torso, vest, stripe, head, helmet, visor, gun, barrel, arm, muzzle);
  group.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  scene.add(group);
  return { group, torso, head, leftLeg, rightLeg, gun, muzzle, trim };
}

export function createTracerPool(scene, tint, count = 18, lifetime = 0.11) {
  const slots = [];
  for (let i = 0; i < count; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0 });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    slots.push({ line, expires: 0, born: 0 });
  }
  let cursor = 0;
  return {
    fire(origin, direction, distance, time) {
      const slot = slots[cursor];
      cursor = (cursor + 1) % slots.length;
      const positions = slot.line.geometry.attributes.position;
      positions.setXYZ(0, origin.x, origin.y, origin.z);
      positions.setXYZ(1,
        origin.x + direction.x * distance,
        origin.y + direction.y * distance,
        origin.z + direction.z * distance);
      positions.needsUpdate = true;
      slot.born = time;
      slot.expires = time + lifetime;
      slot.line.material.opacity = 0.95;
      slot.line.visible = true;
    },
    step(time) {
      for (const slot of slots) {
        if (!slot.line.visible) continue;
        if (time >= slot.expires) {
          slot.line.visible = false;
          continue;
        }
        slot.line.material.opacity = 0.95 * (slot.expires - time) / (slot.expires - slot.born);
      }
    },
    reset() {
      for (const slot of slots) slot.line.visible = false;
    },
  };
}
