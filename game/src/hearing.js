// Audible events are short-lived investigation orders, not magical target knowledge.
// A real ray between source and ear determines how much of the sound survives masonry.
import * as THREE from 'three';

export function createHearing(world) {
  const ray = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();

  function transmission(guard, x, z) {
    const p = guard.group.position;
    origin.set(p.x, 1.35, p.z);
    direction.set(x - p.x, 0, z - p.z);
    const distance = direction.length();
    if (distance < 0.01) return 1;
    direction.divideScalar(distance);
    ray.set(origin, direction);
    ray.far = distance;
    const obstruction = ray.intersectObjects(world.solids, false)[0];
    if (!obstruction || obstruction.distance >= distance - 0.35) return 1;
    // Two close surfaces read as one wall; thick kiln cores damp even further.
    return obstruction.object.userData.heavy ? 0.22 : 0.43;
  }

  function emit(guards, x, z, loudness, time, kind = 'shot') {
    for (const guard of guards) {
      if (!guard.alive) continue;
      const p = guard.group.position;
      const distance = Math.hypot(p.x - x, p.z - z);
      const reach = loudness * transmission(guard, x, z);
      if (distance > reach) continue;
      guard.noise.set(x, 0, z);
      guard.noiseUntil = time + (kind === 'blast' ? 10 : 7);
      guard.noisePriority = kind === 'blast' ? 2 : 1;
    }
  }

  return { emit, transmission };
}
