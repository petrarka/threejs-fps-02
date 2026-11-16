// Kinematic first-person movement with axis-separated AABB collision. Low kerbs
// are stepped over; walls, kiln cores and crates remain solid at every frame rate.
import * as THREE from 'three';
import { PLAYER_SPAWN } from './config.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.74;
const CROUCH_HEIGHT = 1.16;
const STAND_EYE = 1.61;
const CROUCH_EYE = 1.04;
const STEP_HEIGHT = 0.56;
const GRAVITY = 21;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.z),
    velocity: new THREE.Vector3(),
    yaw: PLAYER_SPAWN.yaw,
    pitch: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    grounded: true,
    crouched: false,
    bob: 0,
  };
  const box = new THREE.Box3();

  function collision(x, y, z, height = state.height, inset = 0.025) {
    box.min.set(x - RADIUS, y + inset, z - RADIUS);
    box.max.set(x + RADIUS, y + height - inset, z + RADIUS);
    for (const solid of colliders) {
      if (solid.max.y <= 0.08) continue;
      if (box.intersectsBox(solid)) return solid;
    }
    return null;
  }

  function moveHorizontal(axis, amount) {
    if (!amount) return;
    const nextX = state.position.x + (axis === 'x' ? amount : 0);
    const nextZ = state.position.z + (axis === 'z' ? amount : 0);
    const hit = collision(nextX, state.position.y, nextZ);
    if (!hit) {
      state.position[axis] += amount;
      return;
    }
    const step = hit.max.y - state.position.y;
    if (state.grounded && step > 0 && step <= STEP_HEIGHT
      && !collision(nextX, hit.max.y + 0.01, nextZ)) {
      state.position.y = hit.max.y + 0.01;
      state.position[axis] += amount;
      return;
    }
    state.velocity[axis] = 0;
  }

  function look(dx, dy, scale = 1) {
    state.yaw -= dx * 0.0021 * scale;
    state.pitch = THREE.MathUtils.clamp(state.pitch - dy * 0.0021 * scale, -1.43, 1.43);
  }

  function kick(pitch, yaw) {
    state.pitch = Math.min(1.43, state.pitch + pitch);
    state.yaw += yaw;
  }

  function reset() {
    state.position.set(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.z);
    state.velocity.set(0, 0, 0);
    state.yaw = PLAYER_SPAWN.yaw;
    state.pitch = 0;
    state.eye = STAND_EYE;
    state.height = STAND_HEIGHT;
    state.grounded = true;
    state.crouched = false;
    state.bob = 0;
  }

  function step(dt, keys, mobile = true) {
    const wantsCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantsCrouch) {
      state.crouched = true;
      state.height = CROUCH_HEIGHT;
    } else if (state.crouched && !collision(state.position.x, state.position.y, state.position.z, STAND_HEIGHT)) {
      state.crouched = false;
      state.height = STAND_HEIGHT;
    }
    state.eye = THREE.MathUtils.damp(state.eye, state.crouched ? CROUCH_EYE : STAND_EYE, 15, dt);

    const forward = mobile ? Number(keys.has('KeyW')) - Number(keys.has('KeyS')) : 0;
    const side = mobile ? Number(keys.has('KeyD')) - Number(keys.has('KeyA')) : 0;
    const length = Math.hypot(forward, side) || 1;
    const f = forward / length;
    const s = side / length;
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    const speed = state.crouched ? 2.25 : 4.85;
    const wishX = (-sin * f + cos * s) * speed;
    const wishZ = (-cos * f - sin * s) * speed;
    const response = state.grounded ? 18 : 3.5;
    state.velocity.x = THREE.MathUtils.damp(state.velocity.x, wishX, response, dt);
    state.velocity.z = THREE.MathUtils.damp(state.velocity.z, wishZ, response, dt);

    if (mobile && keys.has('Space') && state.grounded) {
      state.velocity.y = 6.1;
      state.grounded = false;
    }
    state.velocity.y = Math.max(-28, state.velocity.y - GRAVITY * dt);
    moveHorizontal('x', state.velocity.x * dt);
    moveHorizontal('z', state.velocity.z * dt);

    state.position.y += state.velocity.y * dt;
    state.grounded = false;
    const verticalHit = collision(state.position.x, state.position.y, state.position.z, state.height, 0);
    if (verticalHit) {
      if (state.velocity.y <= 0) {
        state.position.y = verticalHit.max.y;
        state.grounded = true;
      } else {
        state.position.y = verticalHit.min.y - state.height;
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
    reset,
    step,
    look,
    kick,
    speed: () => Math.hypot(state.velocity.x, state.velocity.z),
  };
}
