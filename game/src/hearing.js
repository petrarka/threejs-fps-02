// Guard hearing: audible events become short-lived investigation orders, never
// magical target knowledge. A real ray between source and ear decides how much
// of a sound survives the masonry between them.
import * as THREE from 'three';

export function createHearing(world) {
  const ray = new THREE.Raycaster();
  const ear = new THREE.Vector3();
  const toward = new THREE.Vector3();

  // How much of a noise at (x, z) reaches this listener: 1 in the open,
  // sharply less through a wall, worse again through a kiln core.
  function transmission(guard, x, z) {
    const p = guard.group.position;
    ear.set(p.x, 1.35, p.z);
    toward.set(x - p.x, 0, z - p.z);
    const span = toward.length();
    if (span < 0.01) return 1;
    toward.divideScalar(span);
    ray.set(ear, toward);
    ray.far = span;
    const hit = ray.intersectObjects(world.solids, false)[0];
    if (!hit || hit.distance >= span - 0.35) return 1;
    return hit.object.userData.heavy ? 0.22 : 0.43;
  }

  function emit(guards, x, z, loudness, time, kind = 'shot') {
    for (const guard of guards) {
      if (!guard.alive) continue;
      const p = guard.group.position;
      const span = Math.hypot(p.x - x, p.z - z);
      if (span > loudness * transmission(guard, x, z)) continue;
      guard.noise.set(x, 0, z);
      guard.noiseUntil = time + (kind === 'blast' ? 10 : 7);
      guard.noisePriority = kind === 'blast' ? 2 : 1;
    }
  }

  return { emit, transmission };
}
