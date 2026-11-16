// Kinematic first-person body: axis-separated AABB sweeps so walls, kiln
// cores and crates stay solid at any frame rate, while low kerbs are stepped
// over automatically.
import * as THREE from 'three';
import { SPAWN } from './config.js';

const RADIUS = 0.34;
const HEIGHT_STAND = 1.74;
const HEIGHT_CROUCH = 1.16;
const EYE_STAND = 1.61;
const EYE_CROUCH = 1.04;
const STEP_UP = 0.56;
const GRAVITY = 21;
const SPEED_RUN = 4.85;
const SPEED_CROUCH = 2.25;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z),
    velocity: new THREE.Vector3(),
    yaw: SPAWN.yaw,
    pitch: 0,
    eye: EYE_STAND,
    height: HEIGHT_STAND,
    grounded: true,
    crouched: false,
    bob: 0,
  };
  const probe = new THREE.Box3();

  function overlap(x, y, z, height = state.height, inset = 0.025) {
    probe.min.set(x - RADIUS, y + inset, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - inset, z + RADIUS);
    for (const box of colliders) {
      if (box.max.y <= 0.08) continue;
      if (probe.intersectsBox(box)) return box;
    }
    return null;
  }

  // Move along one axis; step up low kerbs, otherwise stop dead.
  function slide(axis, amount) {
    if (!amount) return;
    const nx = state.position.x + (axis === 'x' ? amount : 0);
    const nz = state.position.z + (axis === 'z' ? amount : 0);
    const hit = overlap(nx, state.position.y, nz);
    if (!hit) {
      state.position[axis] += amount;
      return;
    }
    const rise = hit.max.y - state.position.y;
    if (state.grounded && rise > 0 && rise <= STEP_UP && !overlap(nx, hit.max.y + 0.01, nz)) {
      state.position.y = hit.max.y + 0.01;
      state.position[axis] += amount;
      return;
    }
    state.velocity[axis] = 0;
  }

  function step(dt, keys, mobile = true) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch) {
      state.crouched = true;
      state.height = HEIGHT_CROUCH;
    } else if (state.crouched && !overlap(state.position.x, state.position.y, state.position.z, HEIGHT_STAND)) {
      state.crouched = false;
      state.height = HEIGHT_STAND;
    }
    state.eye = THREE.MathUtils.damp(state.eye, state.crouched ? EYE_CROUCH : EYE_STAND, 15, dt);

    const fwd = mobile ? Number(keys.has('KeyW')) - Number(keys.has('KeyS')) : 0;
    const strafe = mobile ? Number(keys.has('KeyD')) - Number(keys.has('KeyA')) : 0;
    const norm = Math.hypot(fwd, strafe) || 1;
    const f = fwd / norm;
    const s = strafe / norm;
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    const pace = state.crouched ? SPEED_CROUCH : SPEED_RUN;
    const wishX = (-sin * f + cos * s) * pace;
    const wishZ = (-cos * f - sin * s) * pace;
    const grip = state.grounded ? 18 : 3.5; // air control is deliberately weak
    state.velocity.x = THREE.MathUtils.damp(state.velocity.x, wishX, grip, dt);
    state.velocity.z = THREE.MathUtils.damp(state.velocity.z, wishZ, grip, dt);

    if (mobile && keys.has('Space') && state.grounded) {
      state.velocity.y = 6.1;
      state.grounded = false;
    }
    state.velocity.y = Math.max(-28, state.velocity.y - GRAVITY * dt);
    slide('x', state.velocity.x * dt);
    slide('z', state.velocity.z * dt);

    state.position.y += state.velocity.y * dt;
    state.grounded = false;
    const floor = overlap(state.position.x, state.position.y, state.position.z, state.height, 0);
    if (floor) {
      if (state.velocity.y <= 0) {
        state.position.y = floor.max.y;
        state.grounded = true;
      } else {
        state.position.y = floor.min.y - state.height;
      }
      state.velocity.y = 0;
    }
    if (state.position.y <= 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.grounded = true;
    }

    const groundSpeed = Math.hypot(state.velocity.x, state.velocity.z);
    if (state.grounded && groundSpeed > 0.2) state.bob += dt * groundSpeed * 1.75;
  }

  return {
    state,
    step,
    look(dx, dy, scale = 1) {
      state.yaw -= dx * 0.0021 * scale;
      state.pitch = THREE.MathUtils.clamp(state.pitch - dy * 0.0021 * scale, -1.43, 1.43);
    },
    kick(pitch, yaw) {
      state.pitch = Math.min(1.43, state.pitch + pitch);
      state.yaw += yaw;
    },
    reset() {
      state.position.set(SPAWN.x, SPAWN.y, SPAWN.z);
      state.velocity.set(0, 0, 0);
      state.yaw = SPAWN.yaw;
      state.pitch = 0;
      state.eye = EYE_STAND;
      state.height = HEIGHT_STAND;
      state.grounded = true;
      state.crouched = false;
      state.bob = 0;
    },
    speed: () => Math.hypot(state.velocity.x, state.velocity.z),
  };
}
