// Three deliberately different weapons, each with a fixed recoil signature and a
// heat-driven accuracy model. The arsenal owns ammunition and view models; main
// owns the actual ray so walls and hitboxes are resolved in one place.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = Object.freeze([
  {
    key: 'sidearm', name: 'EMBERETTE', className: 'SERVICE SIDEARM', price: 0,
    damage: 34, head: 2.65, magazine: 12, reserve: 48, gap: 0.23, reload: 1.35,
    automatic: false, spread: 0.0014, moveSpread: 0.018, heatSpread: 0.013,
    pattern: [[0.015, 0.002], [0.016, -0.003], [0.018, 0.004], [0.019, -0.004], [0.021, 0.005], [0.022, -0.005]],
  },
  {
    key: 'coil', name: 'COIL-9', className: '9MM INDUCTION SMG', price: 650,
    damage: 24, head: 2.35, magazine: 30, reserve: 120, gap: 0.072, reload: 1.75,
    automatic: true, spread: 0.0025, moveSpread: 0.025, heatSpread: 0.021,
    pattern: [[0.007, 0.003], [0.008, -0.004], [0.009, 0.005], [0.01, -0.006], [0.011, 0.006], [0.012, -0.007], [0.013, 0.007], [0.014, -0.007], [0.015, 0.006], [0.016, -0.005]],
  },
  {
    key: 'longsight', name: 'LONGSIGHT', className: 'SCOPED KILN DMR', price: 1350,
    damage: 92, head: 2.1, magazine: 5, reserve: 20, gap: 0.9, reload: 2.45,
    automatic: false, spread: 0.0045, moveSpread: 0.048, heatSpread: 0.004,
    pattern: [[0.052, 0.004], [0.047, -0.006], [0.055, 0.005]],
  },
]);

export function createWeapon(camera) {
  const state = {
    index: 0,
    unlocked: [true, false, false],
    cooldown: 0,
    reloadLeft: 0,
    drawLeft: 0,
    heat: 0,
    pattern: 0,
    flashLeft: 0,
    time: 0,
    recoil: 0,
  };
  const ammo = WEAPONS.map((weapon) => ({ mag: weapon.magazine, reserve: weapon.reserve }));
  const rig = new THREE.Group();
  rig.position.set(0.31, -0.27, -0.59);
  rig.scale.setScalar(0.84);
  camera.add(rig);

  const gunmetal = new THREE.MeshStandardMaterial({ color: '#252a31', metalness: 0.72, roughness: 0.33 });
  const steel = new THREE.MeshStandardMaterial({ color: '#59616a', metalness: 0.65, roughness: 0.4 });
  const grip = new THREE.MeshStandardMaterial({ color: '#171a20', roughness: 0.9 });
  const ember = new THREE.MeshStandardMaterial({ color: PALETTE.ember, emissive: PALETTE.ember, emissiveIntensity: 0.65 });
  const glove = new THREE.MeshStandardMaterial({ color: '#3d4a4b', roughness: 0.95 });

  function part(group, size, position, material, rotation = null) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  }

  function buildModel(index) {
    const group = new THREE.Group();
    if (index === 0) {
      part(group, [0.12, 0.13, 0.39], [0, 0, -0.05], gunmetal);
      part(group, [0.105, 0.055, 0.34], [0, 0.083, -0.08], steel);
      part(group, [0.095, 0.25, 0.12], [0, -0.16, 0.07], grip, [-0.2, 0, 0]);
      part(group, [0.025, 0.035, 0.025], [0, 0.126, -0.22], ember);
      part(group, [0.038, 0.038, 0.18], [0, 0.015, -0.32], gunmetal);
    } else if (index === 1) {
      part(group, [0.14, 0.18, 0.55], [0, 0, -0.14], gunmetal);
      part(group, [0.11, 0.29, 0.12], [0, -0.19, -0.02], grip, [-0.13, 0, 0]);
      part(group, [0.12, 0.22, 0.15], [0, -0.16, -0.3], grip);
      part(group, [0.11, 0.11, 0.32], [0, -0.025, 0.27], grip);
      for (let i = 0; i < 4; i += 1) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 5, 12), ember);
        coil.position.set(0, 0.025, -0.28 - i * 0.065);
        group.add(coil);
      }
      part(group, [0.045, 0.045, 0.3], [0, 0.02, -0.54], gunmetal);
      part(group, [0.035, 0.09, 0.05], [0, 0.135, -0.29], steel);
    } else {
      part(group, [0.13, 0.17, 0.78], [0, 0, -0.24], gunmetal);
      part(group, [0.115, 0.15, 0.35], [0, -0.025, 0.35], grip);
      part(group, [0.1, 0.29, 0.13], [0, -0.18, 0.04], grip, [-0.14, 0, 0]);
      part(group, [0.042, 0.042, 0.66], [0, 0.025, -0.92], steel);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.39, 12), gunmetal);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.17, -0.2);
      group.add(scope);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.052, 16), ember);
      lens.position.set(0, 0.17, -0.401);
      lens.rotation.y = Math.PI;
      group.add(lens);
      part(group, [0.04, 0.11, 0.04], [0, 0.09, -0.11], steel);
      part(group, [0.04, 0.11, 0.04], [0, 0.09, -0.31], steel);
    }
    // A gloved support hand anchors the model in first person instead of leaving
    // the impression of a floating box gun.
    part(group, [0.12, 0.13, 0.19], [-0.09, -0.13, -0.23], glove, [0.2, 0.15, -0.3]);
    group.visible = false;
    rig.add(group);
    return group;
  }

  const models = WEAPONS.map((_, index) => buildModel(index));
  const flash = new THREE.Group();
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: PALETTE.ember, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (const rotation of [0, Math.PI / 2]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.095, 0.21), flashMaterial);
    plane.rotation.z = rotation;
    flash.add(plane);
  }
  flash.position.set(0, 0.02, -0.83);
  flash.visible = false;
  rig.add(flash);
  const flashLight = new THREE.PointLight(PALETTE.ember, 0, 4);
  flashLight.position.set(0.2, -0.1, -0.8);
  camera.add(flashLight);

  function current() {
    return WEAPONS[state.index];
  }

  function select(index, instant = false) {
    if (!state.unlocked[index] || index === state.index) return false;
    state.index = index;
    state.reloadLeft = 0;
    state.drawLeft = instant ? 0 : 0.3;
    state.cooldown = Math.max(state.cooldown, state.drawLeft);
    state.pattern = 0;
    state.heat = Math.min(state.heat, 0.25);
    for (let i = 0; i < models.length; i += 1) models[i].visible = i === index;
    return true;
  }

  function unlock(index) {
    if (state.unlocked[index]) return false;
    state.unlocked[index] = true;
    state.index = -1;
    return select(index, true);
  }

  function resetMatch() {
    state.unlocked = [true, false, false];
    state.index = 0;
    for (let i = 0; i < ammo.length; i += 1) {
      ammo[i].mag = WEAPONS[i].magazine;
      ammo[i].reserve = WEAPONS[i].reserve;
    }
    state.heat = 0;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.drawLeft = 0;
    for (let i = 0; i < models.length; i += 1) models[i].visible = i === 0;
  }

  function beginRound() {
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.heat = 0;
    state.pattern = 0;
    const box = ammo[state.index];
    const needed = Math.min(current().magazine - box.mag, box.reserve);
    box.mag += needed;
    box.reserve -= needed;
  }

  function step(dt, speed) {
    state.time += dt;
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.drawLeft = Math.max(0, state.drawLeft - dt);
    state.flashLeft = Math.max(0, state.flashLeft - dt);
    state.heat = Math.max(0, state.heat - dt * 0.78);
    state.recoil = THREE.MathUtils.damp(state.recoil, 0, 18, dt);
    flash.visible = state.flashLeft > 0;
    flash.rotation.z += dt * 19;
    flashLight.intensity = state.flashLeft > 0 ? 11 : 0;

    const moving = Math.min(1, speed / 4.85);
    rig.position.x = 0.31 + Math.sin(state.time * 7.5) * 0.006 * moving;
    rig.position.y = -0.27 + Math.abs(Math.cos(state.time * 7.5)) * 0.009 * moving - state.recoil * 0.13;
    rig.position.z = -0.59 + state.recoil * 0.5;
    rig.rotation.x = state.recoil * 0.8;
    rig.rotation.z = Math.sin(state.time * 3.75) * 0.005 * moving;
    if (state.drawLeft > 0) rig.rotation.x -= state.drawLeft * 1.6;

    if (state.reloadLeft > 0) {
      const before = state.reloadLeft;
      state.reloadLeft = Math.max(0, before - dt);
      const progress = 1 - state.reloadLeft / current().reload;
      rig.rotation.z += Math.sin(progress * Math.PI) * 0.65;
      rig.position.y -= Math.sin(progress * Math.PI) * 0.17;
      if (before > 0 && state.reloadLeft === 0) {
        const box = ammo[state.index];
        const amount = Math.min(current().magazine - box.mag, box.reserve);
        box.mag += amount;
        box.reserve -= amount;
        state.pattern = 0;
      }
    }
  }

  models[0].visible = true;
  return {
    state,
    ammo,
    current,
    step,
    select,
    unlock,
    resetMatch,
    beginRound,
    name: () => current().name,
    automatic: () => current().automatic,
    ready: () => state.cooldown <= 0 && state.reloadLeft <= 0 && state.drawLeft <= 0 && ammo[state.index].mag > 0,
    fire(rng) {
      if (ammo[state.index].mag <= 0) return null;
      ammo[state.index].mag -= 1;
      state.cooldown = current().gap;
      state.flashLeft = 0.055;
      state.recoil = 0.12;
      state.heat = Math.min(1.35, state.heat + (state.index === 1 ? 0.12 : 0.2));
      const pattern = current().pattern;
      const kick = pattern[Math.min(state.pattern, pattern.length - 1)];
      state.pattern += 1;
      return [kick[0] * (0.92 + rng() * 0.16), kick[1] * (0.9 + rng() * 0.2)];
    },
    reload() {
      const box = ammo[state.index];
      if (state.reloadLeft > 0 || state.drawLeft > 0 || box.reserve <= 0 || box.mag >= current().magazine) return false;
      state.reloadLeft = current().reload;
      state.cooldown = current().reload;
      return true;
    },
    spread(speed, scoped) {
      const spec = current();
      const base = scoped && state.index === 2 ? 0.00012 : spec.spread;
      return base + Math.min(1, speed / 4.85) * spec.moveSpread + state.heat * spec.heatSpread;
    },
    refillAmmo() {
      for (let i = 0; i < ammo.length; i += 1) {
        if (!state.unlocked[i]) continue;
        ammo[i].mag = WEAPONS[i].magazine;
        ammo[i].reserve = WEAPONS[i].reserve;
      }
    },
    ammoFull() {
      return ammo.every((box, index) => !state.unlocked[index]
        || (box.mag === WEAPONS[index].magazine && box.reserve === WEAPONS[index].reserve));
    },
    setVisible(visible) {
      rig.visible = visible;
      flashLight.visible = visible;
    },
    muzzleWorld(target) {
      return flash.getWorldPosition(target);
    },
  };
}
