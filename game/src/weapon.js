// The arsenal: three hitscan weapons sharing one view-model rig, one muzzle flash and
// one heat model. Each weapon owns its own numbers; main.js owns the ray and the damage.
// Every weapon fires a fixed recoil PATTERN (not just a kick size): a climbing ladder of
// pitch/yaw steps the muzzle traces while the trigger stays down, so each gun draws its
// own shape on the wall — the rifle climbs and weaves, the pistol steps, the Longsight
// slams once.
//   1 EMBERETTE  pistol    — semi-auto, cheap and honest
//   2 KILN-R     rifle     — full-auto workhorse, sprays wide when hot
//   3 LONGSIGHT  marksman  — slow, near-perfect, hits like a kiln door (100 to the torso)
// Heat climbs with every shot and bleeds off over time; both spread and the camera kick
// grow with it, so short bursts beat a held trigger, and standing still beats running.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [pitch, yaw] per consecutive shot; the ladder holds on its last step while the
// trigger stays held. Yaw signs weave left-right — the rifle's signature.
const PATTERN_PISTOL = [
  [0.015, 0.003], [0.016, -0.004], [0.017, 0.005], [0.018, -0.005],
  [0.019, 0.006], [0.02, -0.006], [0.02, 0.007], [0.021, -0.007],
];
const PATTERN_RIFLE = [
  [0.009, 0.001], [0.011, -0.002], [0.012, 0.003], [0.013, -0.003],
  [0.014, 0.004], [0.015, -0.004], [0.016, 0.005], [0.016, -0.005],
  [0.017, 0.006], [0.018, -0.006], [0.018, 0.007], [0.019, -0.007],
  [0.02, 0.007], [0.02, -0.008], [0.021, 0.008], [0.021, -0.008],
];
const PATTERN_MARKSMAN = [[0.05, 0.006]];
// The COIL-9's ladder barely climbs — it shakes side to side like the hose it is.
const PATTERN_SMG = [
  [0.007, 0.004], [0.008, -0.005], [0.008, 0.005], [0.009, -0.006],
  [0.009, 0.006], [0.01, -0.006], [0.01, 0.007], [0.011, -0.007],
];

const MOVE_REFERENCE = 5.2;
const HEAT_PER_ROUND = 0.16;
const HEAT_COOL_RATE = 1.9;
const MUZZLE_TIME = 0.06;
const SWAP_TIME = 0.35;

const WEAPONS = [
  {
    key: 'pistol', name: 'EMBERETTE',
    damage: 34, magSize: 12, reserve: 36, fireGap: 0.22, reloadTime: 1.4,
    spreadStill: 0.0018, spreadMoving: 0.02, spreadHeat: 0.012,
    kick: 0.05, recoilPitch: 0.014, automatic: false, pattern: PATTERN_PISTOL,
    model: { receiver: [0.06, 0.09, 0.24], barrel: [0.035, 0.035, 0.18], barrelZ: -0.2, grip: true },
  },
  {
    key: 'rifle', name: 'KILN-R',
    damage: 34, magSize: 30, reserve: 90, fireGap: 0.096, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMoving: 0.028, spreadHeat: 0.03,
    kick: 0.055, recoilPitch: 0.011, automatic: true, pattern: PATTERN_RIFLE,
    model: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], barrelZ: -0.38, stock: true },
  },
  {
    key: 'marksman', name: 'LONGSIGHT',
    damage: 100, magSize: 5, reserve: 15, fireGap: 0.95, reloadTime: 2.6,
    spreadStill: 0.0006, spreadMoving: 0.05, spreadHeat: 0.004,
    kick: 0.12, recoilPitch: 0.05, automatic: false, pattern: PATTERN_MARKSMAN,
    model: { receiver: [0.07, 0.11, 0.6], barrel: [0.04, 0.04, 0.62], barrelZ: -0.58, scope: true },
  },
  {
    key: 'smg', name: 'COIL-9',
    damage: 22, magSize: 32, reserve: 128, fireGap: 0.068, reloadTime: 1.65,
    spreadStill: 0.0034, spreadMoving: 0.036, spreadHeat: 0.024,
    kick: 0.038, recoilPitch: 0.008, automatic: true, pattern: PATTERN_SMG,
    model: { receiver: [0.07, 0.1, 0.3], barrel: [0.04, 0.04, 0.22], barrelZ: -0.24, stock: true, grip: true },
  },
];

export function createWeapon(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.15 });

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // One model group per weapon; only the equipped one is visible.
  const models = WEAPONS.map((spec) => {
    const model = new THREE.Group();
    const [rw, rh, rd] = spec.model.receiver;
    const [bw, bh, bd] = spec.model.barrel;
    model.add(new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rd), bodyMat));
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), gripMat);
    barrel.position.set(0, rh * 0.25, spec.model.barrelZ);
    model.add(barrel);
    if (spec.model.grip) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), gripMat);
      handle.position.set(0, -rh * 0.7, rd * 0.28);
      handle.rotation.x = 0.25;
      model.add(handle);
    }
    if (spec.model.stock) {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), gripMat);
      stock.position.set(0, -0.02, rd * 0.72);
      model.add(stock);
    }
    if (spec.model.scope) {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), accentMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, rh * 0.75, -0.05);
      model.add(scope);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  });

  // Per-weapon ammo survives switching; heat and cooldowns are shared across the rig.
  const ammo = WEAPONS.map((w) => ({ mag: w.magSize, reserve: w.reserve }));
  const state = { index: 1, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, heat: 0, swapLeft: 0, patternIndex: 0 };
  // The pistol and the KILN-R are issued free; the Longsight and the COIL-9 are
  // bought at the yard shop (economy.js) and land on your back the moment they are.
  const unlocked = [true, true, false, false];

  function spec() {
    return WEAPONS[state.index];
  }

  // Draw a weapon: reset transient timers and show only its model. swapLeft gates firing
  // so the view-model is never invisible mid-draw.
  function loadWeapon(index) {
    state.index = index;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.heat = 0;
    state.swapLeft = SWAP_TIME;
    state.patternIndex = 0;
    for (let i = 0; i < models.length; i += 1) models[i].visible = i === index;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.heat = Math.max(0, state.heat - HEAT_COOL_RATE * dt);
    state.swapLeft = Math.max(0, state.swapLeft - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);

    const model = models[state.index];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;

    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (spec().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const box = ammo[state.index];
        const take = Math.min(spec().magSize - box.mag, box.reserve);
        box.mag += take;
        box.reserve -= take;
      }
    } else if (state.swapLeft > 0) {
      model.rotation.x = -0.35 * Math.min(1, state.swapLeft * 4);
    }
  }

  // Cold start: show the rifle with no draw animation, so ?shot= frames are stable.
  loadWeapon(state.index);
  state.swapLeft = 0;

  return {
    state,
    ammo,
    step,
    name() {
      return spec().name;
    },
    damage() {
      return spec().damage;
    },
    automatic() {
      return spec().automatic;
    },
    recoilPitch() {
      return spec().recoilPitch;
    },
    switchTo(index) {
      if (index === state.index || !unlocked[index] || state.reloadLeft > 0 || state.swapLeft > 0) return;
      loadWeapon(index);
    },
    unlocked,
    count() {
      return WEAPONS.length;
    },
    // A shop purchase: flag the gun owned and put it in your hands.
    unlock(index) {
      if (index < 0 || index >= WEAPONS.length || unlocked[index]) return false;
      unlocked[index] = true;
      loadWeapon(index);
      return true;
    },
    // Scoped aim hides the view-model: the Longsight's world is the scope overlay.
    setViewVisible(v) {
      models[state.index].visible = v;
    },
    ready() {
      const box = ammo[state.index];
      return box.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.swapLeft === 0;
    },
    pullTrigger() {
      state.cooldown = spec().fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = spec().kick;
      state.heat = Math.min(1.6, state.heat + HEAT_PER_ROUND);
      state.patternIndex += 1;
    },
    // The recoil step for the shot that just left: the weapon's pattern ladder,
    // scaled by a little seeded jitter. main.js feeds this to player.recoil.
    recoilKick(rng) {
      const ladder = spec().pattern;
      const step = ladder[Math.min(state.patternIndex - 1, ladder.length - 1)];
      return [step[0] * (0.85 + rng() * 0.3), step[1] * (0.7 + rng() * 0.6)];
    },
    takeRound() {
      const box = ammo[state.index];
      if (box.mag <= 0) return false;
      box.mag -= 1;
      return true;
    },
    reload() {
      const box = ammo[state.index];
      if (state.reloadLeft > 0 || box.mag === spec().magSize || box.reserve === 0) return;
      state.reloadLeft = spec().reloadTime;
    },
    spread(speed) {
      const s = spec();
      return s.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * s.spreadMoving + state.heat * s.spreadHeat;
    },
    refill() {
      for (let i = 0; i < WEAPONS.length; i += 1) {
        ammo[i].mag = WEAPONS[i].magSize;
        ammo[i].reserve = WEAPONS[i].reserve;
      }
      loadWeapon(state.index);
    },
  };
}