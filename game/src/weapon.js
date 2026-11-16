// The arsenal: three deliberately different weapons, each with a fixed recoil
// signature and a heat-driven accuracy model. This module owns ammunition,
// timing and the first-person view models; the match loop owns the actual ray.
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
  const ammo = WEAPONS.map((spec) => ({ mag: spec.magazine, reserve: spec.reserve }));

  const rig = new THREE.Group();
  rig.position.set(0.31, -0.27, -0.59);
  rig.scale.setScalar(0.84);
  camera.add(rig);

  const gunmetal = new THREE.MeshStandardMaterial({ color: '#252a31', metalness: 0.72, roughness: 0.33 });
  const brightSteel = new THREE.MeshStandardMaterial({ color: '#59616a', metalness: 0.65, roughness: 0.4 });
  const polymer = new THREE.MeshStandardMaterial({ color: '#171a20', roughness: 0.9 });
  const emberGlass = new THREE.MeshStandardMaterial({ color: PALETTE.ember, emissive: PALETTE.ember, emissiveIntensity: 0.65 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: '#3d4a4b', roughness: 0.95 });

  function piece(group, size, position, material, rotation = null) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  }

  function buildModel(index) {
    const group = new THREE.Group();
    if (index === 0) {
      // EMBERETTE sidearm: compact slide-and-grip profile.
      piece(group, [0.12, 0.13, 0.39], [0, 0, -0.05], gunmetal);
      piece(group, [0.105, 0.055, 0.34], [0, 0.083, -0.08], brightSteel);
      piece(group, [0.095, 0.25, 0.12], [0, -0.16, 0.07], polymer, [-0.2, 0, 0]);
      piece(group, [0.025, 0.035, 0.025], [0, 0.126, -0.22], emberGlass);
      piece(group, [0.038, 0.038, 0.18], [0, 0.015, -0.32], gunmetal);
    } else if (index === 1) {
      // COIL-9: squat induction hose with a glowing toroid stack.
      piece(group, [0.14, 0.18, 0.55], [0, 0, -0.14], gunmetal);
      piece(group, [0.11, 0.29, 0.12], [0, -0.19, -0.02], polymer, [-0.13, 0, 0]);
      piece(group, [0.12, 0.22, 0.15], [0, -0.16, -0.3], polymer);
      piece(group, [0.11, 0.11, 0.32], [0, -0.025, 0.27], polymer);
      for (let i = 0; i < 4; i += 1) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 5, 12), emberGlass);
        coil.position.set(0, 0.025, -0.28 - i * 0.065);
        group.add(coil);
      }
      piece(group, [0.045, 0.045, 0.3], [0, 0.02, -0.54], gunmetal);
      piece(group, [0.035, 0.09, 0.05], [0, 0.135, -0.29], brightSteel);
    } else {
      // LONGSIGHT: long barrel, tall optic, kiln-fired lens.
      piece(group, [0.13, 0.17, 0.78], [0, 0, -0.24], gunmetal);
      piece(group, [0.115, 0.15, 0.35], [0, -0.025, 0.35], polymer);
      piece(group, [0.1, 0.29, 0.13], [0, -0.18, 0.04], polymer, [-0.14, 0, 0]);
      piece(group, [0.042, 0.042, 0.66], [0, 0.025, -0.92], brightSteel);
      const optic = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.39, 12), gunmetal);
      optic.rotation.x = Math.PI / 2;
      optic.position.set(0, 0.17, -0.2);
      group.add(optic);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.052, 16), emberGlass);
      lens.position.set(0, 0.17, -0.401);
      lens.rotation.y = Math.PI;
      group.add(lens);
      piece(group, [0.04, 0.11, 0.04], [0, 0.09, -0.11], brightSteel);
      piece(group, [0.04, 0.11, 0.04], [0, 0.09, -0.31], brightSteel);
    }
    // A gloved support hand keeps the model from floating in frame.
    piece(group, [0.12, 0.13, 0.19], [-0.09, -0.13, -0.23], gloveMat, [0.2, 0.15, -0.3]);
    group.visible = false;
    rig.add(group);
    return group;
  }

  const models = WEAPONS.map((_, index) => buildModel(index));
  models[0].visible = true;

  const flash = new THREE.Group();
  const flashMat = new THREE.MeshBasicMaterial({
    color: PALETTE.ember, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (const roll of [0, Math.PI / 2]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.095, 0.21), flashMat);
    plane.rotation.z = roll;
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
    models.forEach((model, i) => { model.visible = i === index; });
    return true;
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

    const sway = Math.min(1, speed / 4.85);
    rig.position.x = 0.31 + Math.sin(state.time * 7.5) * 0.006 * sway;
    rig.position.y = -0.27 + Math.abs(Math.cos(state.time * 7.5)) * 0.009 * sway - state.recoil * 0.13;
    rig.position.z = -0.59 + state.recoil * 0.5;
    rig.rotation.x = state.recoil * 0.8;
    rig.rotation.z = Math.sin(state.time * 3.75) * 0.005 * sway;
    if (state.drawLeft > 0) rig.rotation.x -= state.drawLeft * 1.6;

    if (state.reloadLeft > 0) {
      const before = state.reloadLeft;
      state.reloadLeft = Math.max(0, before - dt);
      const arc = Math.sin((1 - state.reloadLeft / current().reload) * Math.PI);
      rig.rotation.z += arc * 0.65;
      rig.position.y -= arc * 0.17;
      if (before > 0 && state.reloadLeft === 0) {
        const box = ammo[state.index];
        const pulled = Math.min(current().magazine - box.mag, box.reserve);
        box.mag += pulled;
        box.reserve -= pulled;
        state.pattern = 0;
      }
    }
  }

  return {
    state,
    ammo,
    current,
    step,
    select,
    name: () => current().name,
    automatic: () => current().automatic,
    ready: () => state.cooldown <= 0 && state.reloadLeft <= 0 && state.drawLeft <= 0 && ammo[state.index].mag > 0,
    unlock(index) {
      if (state.unlocked[index]) return false;
      state.unlocked[index] = true;
      state.index = -1;
      return select(index, true);
    },
    resetMatch() {
      state.unlocked = [true, false, false];
      state.index = 0;
      WEAPONS.forEach((spec, i) => {
        ammo[i].mag = spec.magazine;
        ammo[i].reserve = spec.reserve;
      });
      state.heat = 0;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.drawLeft = 0;
      models.forEach((model, i) => { model.visible = i === 0; });
    },
    beginRound() {
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.heat = 0;
      state.pattern = 0;
      const box = ammo[state.index];
      const topped = Math.min(current().magazine - box.mag, box.reserve);
      box.mag += topped;
      box.reserve -= topped;
    },
    fire(rng) {
      if (ammo[state.index].mag <= 0) return null;
      ammo[state.index].mag -= 1;
      state.cooldown = current().gap;
      state.flashLeft = 0.055;
      state.recoil = 0.12;
      state.heat = Math.min(1.35, state.heat + (state.index === 1 ? 0.12 : 0.2));
      const pattern = current().pattern;
      const impulse = pattern[Math.min(state.pattern, pattern.length - 1)];
      state.pattern += 1;
      return [impulse[0] * (0.92 + rng() * 0.16), impulse[1] * (0.9 + rng() * 0.2)];
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
      const rest = scoped && state.index === 2 ? 0.00012 : spec.spread;
      return rest + Math.min(1, speed / 4.85) * spec.moveSpread + state.heat * spec.heatSpread;
    },
    refillAmmo() {
      WEAPONS.forEach((spec, i) => {
        if (!state.unlocked[i]) return;
        ammo[i].mag = spec.magazine;
        ammo[i].reserve = spec.reserve;
      });
    },
    ammoFull() {
      return WEAPONS.every((spec, i) => !state.unlocked[i]
        || (ammo[i].mag === spec.magazine && ammo[i].reserve === spec.reserve));
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
