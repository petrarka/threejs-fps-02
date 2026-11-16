// Ballistic primitives and combatant meshes shared by both teams. The ray
// tests are exact (sphere, capped cylinder), not closest-approach guesses, so
// a head sphere plus a body capsule behave like honest hitboxes.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function raySphere(origin, dir, center, radius) {
  const ox = center.x - origin.x;
  const oy = center.y - origin.y;
  const oz = center.z - origin.z;
  const along = ox * dir.x + oy * dir.y + oz * dir.z;
  const offSq = ox * ox + oy * oy + oz * oz - radius * radius;
  if (offSq > 0 && along < 0) return Infinity;
  const disc = along * along - offSq;
  if (disc < 0) return Infinity;
  const root = Math.sqrt(disc);
  const near = along - root;
  if (near >= 0) return near;
  const far = along + root;
  return far >= 0 ? far : Infinity;
}

function rayWallCylinder(origin, dir, x, z, yLow, yHigh, radius) {
  const relX = origin.x - x;
  const relZ = origin.z - z;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-9) return Infinity;
  const b = 2 * (relX * dir.x + relZ * dir.z);
  const c = relX * relX + relZ * relZ - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const root = Math.sqrt(disc);
  let best = Infinity;
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t < 0) continue;
    const y = origin.y + dir.y * t;
    if (y >= yLow && y <= yHigh && t < best) best = t;
  }
  return best;
}

// Vertical capsule = cylinder body + two hemisphere caps, tested as three pieces.
export function rayBodyCapsule(origin, dir, x, feetY, z, height, radius = 0.29) {
  const r = Math.min(radius, height * 0.25);
  const low = feetY + r;
  const high = feetY + height - r;
  let best = rayWallCylinder(origin, dir, x, z, low, high, r);
  const cap = new THREE.Vector3(x, low, z);
  best = Math.min(best, raySphere(origin, dir, cap, r));
  cap.y = high;
  return Math.min(best, raySphere(origin, dir, cap, r));
}

const eyePoint = new THREE.Vector3();
const aimDir = new THREE.Vector3();

// True when a straight ear/eye line between two points crosses no world solid.
export function clearSight(ray, solids, ax, ay, az, bx, by, bz, slack = 0.15) {
  eyePoint.set(ax, ay, az);
  aimDir.set(bx - ax, by - ay, bz - az);
  const span = aimDir.length();
  if (span < 0.001) return true;
  aimDir.divideScalar(span);
  ray.set(eyePoint, aimDir);
  ray.far = span;
  const hit = ray.intersectObjects(solids, false)[0];
  return !hit || hit.distance >= span - slack;
}

// One low-poly silhouette for every combatant; team and accent vary the trim.
export function makeCharacter(scene, team, accentName) {
  const group = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({
    color: team === 'crew' ? '#526a70' : '#4a4649', roughness: 0.86,
  });
  const plate = new THREE.MeshStandardMaterial({
    color: team === 'crew' ? '#263b43' : '#302d31', roughness: 0.68, metalness: 0.12,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: PALETTE[accentName], roughness: 0.5, emissive: PALETTE[accentName], emissiveIntensity: 0.12,
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#171b21', roughness: 0.55, metalness: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: '#bd9474', roughness: 0.9 });

  const legGeo = new THREE.BoxGeometry(0.18, 0.65, 0.22);
  const leftLeg = new THREE.Mesh(legGeo, uniform);
  const rightLeg = new THREE.Mesh(legGeo, uniform);
  leftLeg.position.set(-0.14, 0.34, 0);
  rightLeg.position.set(0.14, 0.34, 0);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.44, 4, 8), uniform);
  torso.position.y = 1.02;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.48, 0.32), plate);
  vest.position.set(0, 1.03, -0.015);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.065, 0.345), trim);
  stripe.position.set(0, 1.14, -0.02);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 8), skin);
  head.position.y = 1.56;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.192, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), plate);
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
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  scene.add(group);
  return { group, torso, head, leftLeg, rightLeg, gun, muzzle, trim };
}

// A ring-buffer of fading line segments: cheap, deterministic tracers.
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
    slots.push({ line, born: 0, expires: 0 });
  }
  let cursor = 0;

  return {
    fire(origin, dir, distance, time) {
      const slot = slots[cursor];
      cursor = (cursor + 1) % slots.length;
      const attr = slot.line.geometry.attributes.position;
      attr.setXYZ(0, origin.x, origin.y, origin.z);
      attr.setXYZ(1, origin.x + dir.x * distance, origin.y + dir.y * distance, origin.z + dir.z * distance);
      attr.needsUpdate = true;
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
        } else {
          slot.line.material.opacity = 0.95 * (slot.expires - time) / (slot.expires - slot.born);
        }
      }
    },
    reset() {
      for (const slot of slots) slot.line.visible = false;
    },
  };
}
