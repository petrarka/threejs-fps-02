// The objective: one Ember charge and two glowing sites. Carry it, hold E on a site pad to
// plant (3 s), then a 40 s fuse burns down with a lamp that blinks faster as it runs out.
// Hold E beside the planted charge to defuse (5 s) — the wardens converge and try the same,
// so a plant has to be defended, not just dropped. No assets: two boxes and a light.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const FUSE_SECONDS = 40;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const BOT_DEFUSE_SECONDS = 6;
const SITE_RADIUS = 3.4;
const DEFUSE_RANGE = 1.9;
const BOT_RANGE = 1.5;

const SITES = [
  { key: 'A', x: -15, z: -9 },
  { key: 'B', x: 15, z: -9 },
];

export function createBomb(scene) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.3 }),
  );
  body.position.y = 0.1;
  body.castShadow = true;

  const cell = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.06, 0.14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  cell.position.y = 0.215;

  const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 8);
  lamp.position.y = 0.5;

  group.add(body, cell, lamp);
  group.visible = false;
  scene.add(group);

  const state = {
    phase: 'carry',      // carry | plant | planted | done
    site: null,          // 'A' | 'B' once planted
    timeLeft: 0,
    progress: 0,         // 0..1 of the current hold action (plant or defuse)
    defuseByBot: 0,      // seconds a warden has spent crouched at the charge
    blinkOn: false,
    blinkClock: 0,
    exploded: false,
    defused: false,
  };

  function siteAt(pos) {
    for (const site of SITES) {
      if (Math.hypot(pos.x - site.x, pos.z - site.z) <= SITE_RADIUS) return site;
    }
    return null;
  }

  function reset() {
    state.phase = 'carry';
    state.site = null;
    state.timeLeft = 0;
    state.progress = 0;
    state.defuseByBot = 0;
    state.blinkOn = false;
    state.blinkClock = 0;
    state.exploded = false;
    state.defused = false;
    group.visible = false;
    group.scale.set(1, 1, 1);
    lamp.intensity = 0;
    cell.material.color.set(PALETTE.accent);
  }

  // Returns 'planted' | 'exploded' | 'defused' | null. botPositions is a reused, read-only
  // array of living wardens' positions.
  function step(dt, playerPos, useHeld, botPositions) {
    if (state.exploded || state.defused) return null;

    if (state.phase === 'carry' || state.phase === 'plant') {
      const site = siteAt(playerPos);
      if (site && useHeld) {
        state.phase = 'plant';
        state.progress += dt / PLANT_SECONDS;
        if (state.progress >= 1) {
          state.site = site.key;
          state.phase = 'planted';
          state.timeLeft = FUSE_SECONDS;
          state.progress = 0;
          group.position.set(site.x, 0.19, site.z); // resting on top of the glowing pad
          group.visible = true;
          return 'planted';
        }
      } else {
        state.phase = 'carry';
        state.progress = Math.max(0, state.progress - dt / PLANT_SECONDS);
      }
      return null;
    }

    // planted: fuse countdown, blinking lamp, and the defuse race.
    state.timeLeft -= dt;
    const frac = Math.max(0, state.timeLeft / FUSE_SECONDS);
    state.blinkClock += dt;
    if (state.blinkClock >= 0.18 + 2.2 * frac) {
      state.blinkClock = 0;
      state.blinkOn = !state.blinkOn;
    }
    lamp.intensity = state.blinkOn ? 4 + 12 * (1 - frac) : 0;
    cell.material.color.set(state.blinkOn ? PALETTE.accent : PALETTE.brick);

    const nearBomb = Math.hypot(playerPos.x - group.position.x, playerPos.z - group.position.z) <= DEFUSE_RANGE;
    if (nearBomb && useHeld) {
      state.progress += dt / DEFUSE_SECONDS;
      if (state.progress >= 1) {
        state.defused = true;
        state.phase = 'done';
        return 'defused';
      }
    } else {
      state.progress = Math.max(0, state.progress - dt / DEFUSE_SECONDS);
    }

    let botClose = false;
    for (let index = 0; index < botPositions.length; index += 1) {
      const p = botPositions[index];
      if (p && Math.hypot(p.x - group.position.x, p.z - group.position.z) <= BOT_RANGE) {
        botClose = true;
        break;
      }
    }
    if (botClose) {
      state.defuseByBot += dt;
      if (state.defuseByBot >= BOT_DEFUSE_SECONDS) {
        state.defused = true;
        state.phase = 'done';
        return 'defused';
      }
    } else {
      state.defuseByBot = Math.max(0, state.defuseByBot - dt);
    }

    if (state.timeLeft <= 0) {
      state.exploded = true;
      state.phase = 'done';
      lamp.intensity = 60;
      group.scale.set(3, 3, 3);
      return 'exploded';
    }
    return null;
  }

  function hudText() {
    if (state.phase !== 'planted') return null;
    return `SITE ${state.site} · ${Math.max(0, state.timeLeft).toFixed(1)}`;
  }

  return { SITES, state, position: group.position, step, reset, hudText };
}