// The Ember charge: a three-second plant, a forty-second fuse and competing
// defuse channels. Its tiny display is a live canvas texture, just like the yard art.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './config.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const BOT_DEFUSE_TIME = 6.5;
export const FUSE_TIME = 40;

export function createBomb(scene) {
  const group = new THREE.Group();
  const caseMaterial = new THREE.MeshStandardMaterial({ color: '#292d32', roughness: 0.55, metalness: 0.45 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.ember, emissive: PALETTE.ember, emissiveIntensity: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.36), caseMaterial);
  body.castShadow = true;
  group.add(body);
  for (const x of [-0.17, 0.17]) {
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 8), trimMaterial);
    cell.rotation.x = Math.PI / 2;
    cell.position.set(x, 0.15, 0);
    group.add(cell);
  }
  const displayCanvas = document.createElement('canvas');
  displayCanvas.width = 256;
  displayCanvas.height = 96;
  const displayContext = displayCanvas.getContext('2d');
  const displayTexture = new THREE.CanvasTexture(displayCanvas);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.086), new THREE.MeshBasicMaterial({ map: displayTexture }));
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(0, 0.121, 0.03);
  group.add(screen);
  const light = new THREE.PointLight(PALETTE.ember, 0, 7);
  light.position.y = 0.55;
  group.add(light);
  group.visible = false;
  scene.add(group);

  const state = {
    phase: 'carry',
    site: null,
    fuse: FUSE_TIME,
    plantProgress: 0,
    defuseProgress: 0,
    guardDefuse: 0,
    blink: false,
    blinkClock: 0,
    lastSecond: -1,
  };

  function paintDisplay(text, hot = false) {
    displayContext.fillStyle = '#150e0b';
    displayContext.fillRect(0, 0, 256, 96);
    displayContext.strokeStyle = hot ? '#ff8a3d' : '#743d31';
    displayContext.lineWidth = 5;
    displayContext.strokeRect(3, 3, 250, 90);
    displayContext.fillStyle = hot ? '#ffb070' : '#b77c58';
    displayContext.font = '700 53px ui-monospace, monospace';
    displayContext.textAlign = 'center';
    displayContext.textBaseline = 'middle';
    displayContext.fillText(text, 128, 52);
    displayTexture.needsUpdate = true;
  }
  paintDisplay('EMBER');

  function siteAt(position) {
    return SITES.find((site) => Math.hypot(position.x - site.x, position.z - site.z) <= site.radius) || null;
  }

  function reset() {
    state.phase = 'carry';
    state.site = null;
    state.fuse = FUSE_TIME;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.guardDefuse = 0;
    state.blink = false;
    state.blinkClock = 0;
    state.lastSecond = -1;
    group.visible = false;
    group.scale.setScalar(1);
    light.intensity = 0;
    paintDisplay('EMBER');
  }

  function step(dt, actorPosition, useHeld, guardPositions) {
    if (state.phase === 'done') return null;
    if (state.phase === 'carry' || state.phase === 'planting') {
      const site = actorPosition ? siteAt(actorPosition) : null;
      if (site && useHeld) {
        state.phase = 'planting';
        state.plantProgress = Math.min(1, state.plantProgress + dt / PLANT_TIME);
        if (state.plantProgress >= 1) {
          state.phase = 'planted';
          state.site = site.id;
          state.fuse = FUSE_TIME;
          state.plantProgress = 0;
          group.position.set(site.x, 0.15, site.z);
          group.visible = true;
          return 'planted';
        }
      } else {
        state.phase = 'carry';
        state.plantProgress = Math.max(0, state.plantProgress - dt * 0.5);
      }
      return null;
    }

    state.fuse = Math.max(0, state.fuse - dt);
    const fraction = state.fuse / FUSE_TIME;
    state.blinkClock += dt;
    if (state.blinkClock >= 0.12 + 0.85 * fraction) {
      state.blinkClock = 0;
      state.blink = !state.blink;
    }
    light.intensity = state.blink ? 8 + (1 - fraction) * 13 : 0.4;
    const second = Math.ceil(state.fuse * 10);
    if (second !== state.lastSecond) {
      state.lastSecond = second;
      paintDisplay(state.fuse.toFixed(1).padStart(4, '0'), state.fuse < 10);
    }

    const playerNear = actorPosition && Math.hypot(actorPosition.x - group.position.x, actorPosition.z - group.position.z) <= 1.85;
    if (playerNear && useHeld) {
      state.defuseProgress = Math.min(1, state.defuseProgress + dt / DEFUSE_TIME);
      if (state.defuseProgress >= 1) {
        state.phase = 'done';
        light.intensity = 0;
        return 'defused';
      }
    } else {
      state.defuseProgress = Math.max(0, state.defuseProgress - dt * 0.35);
    }

    const guardNear = guardPositions.some((p) => Math.hypot(p.x - group.position.x, p.z - group.position.z) <= 1.5);
    state.guardDefuse = guardNear ? state.guardDefuse + dt : Math.max(0, state.guardDefuse - dt * 0.5);
    if (state.guardDefuse >= BOT_DEFUSE_TIME) {
      state.phase = 'done';
      light.intensity = 0;
      return 'defused';
    }
    if (state.fuse <= 0) {
      state.phase = 'done';
      light.intensity = 65;
      return 'exploded';
    }
    return null;
  }

  return {
    state,
    position: group.position,
    siteAt,
    reset,
    step,
    hudText: () => state.phase === 'planted' ? `EMBER ${state.site}  ·  ${state.fuse.toFixed(1)}` : null,
  };
}
