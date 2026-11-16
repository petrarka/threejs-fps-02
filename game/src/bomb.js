// The Ember charge: a three-second plant, a forty-second fuse, and competing
// defuse channels — yours (E, five seconds) and the guards' (six and a half).
// Its face is a live canvas texture, painted like every other yard surface.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './config.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const BOT_DEFUSE_TIME = 6.5;
export const FUSE_TIME = 40;

export function createBomb(scene) {
  const group = new THREE.Group();
  const caseMat = new THREE.MeshStandardMaterial({ color: '#292d32', roughness: 0.55, metalness: 0.45 });
  const cellMat = new THREE.MeshStandardMaterial({ color: PALETTE.ember, emissive: PALETTE.ember, emissiveIntensity: 0.8 });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.36), caseMat);
  shell.castShadow = true;
  group.add(shell);
  for (const x of [-0.17, 0.17]) {
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 8), cellMat);
    cell.rotation.x = Math.PI / 2;
    cell.position.set(x, 0.15, 0);
    group.add(cell);
  }
  const face = document.createElement('canvas');
  face.width = 256;
  face.height = 96;
  const fg = face.getContext('2d');
  const faceTexture = new THREE.CanvasTexture(face);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.086), new THREE.MeshBasicMaterial({ map: faceTexture }));
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(0, 0.121, 0.03);
  group.add(screen);
  const glow = new THREE.PointLight(PALETTE.ember, 0, 7);
  glow.position.y = 0.55;
  group.add(glow);
  group.visible = false;
  scene.add(group);

  const state = {
    phase: 'carry', // carry -> planting -> planted -> done
    site: null,
    fuse: FUSE_TIME,
    plantProgress: 0,
    defuseProgress: 0,
    guardDefuse: 0,
    blink: false,
    blinkClock: 0,
    shownTenth: -1,
  };

  function paintFace(text, hot = false) {
    fg.fillStyle = '#150e0b';
    fg.fillRect(0, 0, 256, 96);
    fg.strokeStyle = hot ? '#ff8a3d' : '#743d31';
    fg.lineWidth = 5;
    fg.strokeRect(3, 3, 250, 90);
    fg.fillStyle = hot ? '#ffb070' : '#b77c58';
    fg.font = '700 53px ui-monospace, monospace';
    fg.textAlign = 'center';
    fg.textBaseline = 'middle';
    fg.fillText(text, 128, 52);
    faceTexture.needsUpdate = true;
  }
  paintFace('EMBER');

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
    state.shownTenth = -1;
    group.visible = false;
    glow.intensity = 0;
    paintFace('EMBER');
  }

  // One fixed step of the objective. `actor` is whoever holds the use key
  // (you or the planting mate); guardPositions drives the defending defuse.
  function step(dt, actor, useHeld, guardPositions) {
    if (state.phase === 'done') return null;

    if (state.phase === 'carry' || state.phase === 'planting') {
      const site = actor ? siteAt(actor) : null;
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

    // Planted: run the fuse, blink faster as it shortens, watch both defusers.
    state.fuse = Math.max(0, state.fuse - dt);
    const fraction = state.fuse / FUSE_TIME;
    state.blinkClock += dt;
    if (state.blinkClock >= 0.12 + 0.85 * fraction) {
      state.blinkClock = 0;
      state.blink = !state.blink;
    }
    glow.intensity = state.blink ? 8 + (1 - fraction) * 13 : 0.4;
    const tenth = Math.ceil(state.fuse * 10);
    if (tenth !== state.shownTenth) {
      state.shownTenth = tenth;
      paintFace(state.fuse.toFixed(1).padStart(4, '0'), state.fuse < 10);
    }

    const playerNear = actor
      && Math.hypot(actor.x - group.position.x, actor.z - group.position.z) <= 1.85;
    if (playerNear && useHeld) {
      state.defuseProgress = Math.min(1, state.defuseProgress + dt / DEFUSE_TIME);
      if (state.defuseProgress >= 1) {
        state.phase = 'done';
        glow.intensity = 0;
        return 'defused';
      }
    } else {
      state.defuseProgress = Math.max(0, state.defuseProgress - dt * 0.35);
    }

    const guardNear = guardPositions.some(
      (p) => Math.hypot(p.x - group.position.x, p.z - group.position.z) <= 1.5,
    );
    state.guardDefuse = guardNear ? state.guardDefuse + dt : Math.max(0, state.guardDefuse - dt * 0.5);
    if (state.guardDefuse >= BOT_DEFUSE_TIME) {
      state.phase = 'done';
      glow.intensity = 0;
      return 'defused';
    }
    if (state.fuse <= 0) {
      state.phase = 'done';
      glow.intensity = 65;
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
    hudText: () => (state.phase === 'planted' ? `EMBER ${state.site}  ·  ${state.fuse.toFixed(1)}` : null),
  };
}
