// Hearing: how a noise reaches the guard crew. Gunfire, bursting firepots and the
// crew's own traded rounds all emit at a radius; a guard inside it wakes and paths
// to the spot. Walls muffle — a noise source behind brick only carries a fraction
// as far, checked with a real eye-to-source raycast against the yard's shootables,
// so fighting inside a kiln does not wake the whole yard.
import * as THREE from 'three';

const AIM_HEIGHT = 1.35;
const HEAR_DECAY = 7;        // seconds a noise stays worth investigating
const MUFFLE_FACTOR = 0.45;  // a wall between source and ear eats over half the radius

export function createHearing(world) {
  const ray = new THREE.Raycaster();
  const eye = new THREE.Vector3();
  const at = new THREE.Vector3();
  const dir = new THREE.Vector3();

  // Straight, unobstructed line from a guard's ear to the noise source?
  function clearLine(item, x, z) {
    eye.set(item.group.position.x, AIM_HEIGHT, item.group.position.z);
    at.set(x, AIM_HEIGHT, z);
    dir.subVectors(at, eye);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.normalize();
    ray.set(eye, dir);
    ray.far = dist;
    const wall = ray.intersectObjects(world.shootables, false)[0];
    return !wall || wall.distance > dist - 0.5;
  }

  // Noise at (x, z) with a given radius wakes every guard who can genuinely hear it.
  // `now` is the match clock; the alert stays worth investigating for HEAR_DECAY seconds.
  function hear(items, x, z, radius, now) {
    for (const item of items) {
      if (!item.alive) continue;
      const d = Math.hypot(item.group.position.x - x, item.group.position.z - z);
      if (d > radius) continue;
      if (d > radius * MUFFLE_FACTOR && !clearLine(item, x, z)) continue;
      item.alertX = x;
      item.alertZ = z;
      item.alertUntil = now + HEAR_DECAY;
    }
  }

  return { hear, HEAR_DECAY, MUFFLE_FACTOR };
}
