// Guard hearing as its own organ: an audible event becomes a short-lived
// investigation order — never free target knowledge. A real ray from ear to
// source decides how much of the sound survives the masonry in between, so a
// shot behind a kiln carries far less than one fired in the open.
import * as THREE from 'three';

export function createHearing(world) {
  const ray = new THREE.Raycaster();
  const ear = new THREE.Vector3();
  const toward = new THREE.Vector3();

  // Fraction of a noise's reach that survives to this guard: full in the
  // open, sharply reduced through a wall, worst through heavy kiln masonry.
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

  // Wake every guard close enough to actually hear this event. Blasts nag at
  // a guard's attention longer than plain gunfire.
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
