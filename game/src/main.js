// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// ?shot=start|play|plant|end|bots (plus a few capture extras) with &seed=N sets up a
// deterministic frame, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapon.js';
import { createTargets } from './targets.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createEconomy } from './economy.js';
import { createRounds, ROUNDS_TO_WIN } from './rounds.js';
import { createRadar } from './radar.js';
import { createHud } from './hud.js';
import * as sound from './sound.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

// The only randomness in the game. Two runs with the same seed produce identical frames.
function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 18, 46);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const targets = createTargets(scene);
const bots = createBots(scene, world);
const bomb = createBomb(scene);
const economy = createEconomy(scene);
const rounds = createRounds();
const radar = createRadar(document.getElementById('radar'));
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 80;
const shootables = world.shootables.concat(targets.hitMeshes, bots.hitMeshes);
const direction = new THREE.Vector3();

const body = player.state;
const markerHoldMs = shot ? 4000 : 90;
const prevKeys = new Set();
let score = 0;
let frags = 0;
let elapsed = 0;
let hp = 100;
let cleared = false;
let lastBlink = false; // fuse-lamp edge for the radar beep tick
let frozen = false;
let started = false;
let accumulator = 0;
let stepPhase = 0;
let lastTime = performance.now();

function edge(code) {
  return input.state.keys.has(code) && !prevKeys.has(code);
}

function syncPrevKeys() {
  prevKeys.clear();
  for (const code of input.state.keys) prevKeys.add(code);
}

hud.setAmmo(weapon.ammo[weapon.state.index].mag, weapon.ammo[weapon.state.index].reserve);
hud.setWeapon(weapon.name());
hud.setHp(hp);
hud.setScore(0);
hud.setMoney(economy.state.money);
hud.setArmor(economy.state.armor, economy.state.helm);
hud.setNades(economy.state.nades);
hud.onPlay(() => {
  if (shot) return;
  if (cleared) restart();
  input.requestLock();
});

function restart() {
  cleared = false;
  score = 0;
  frags = 0;
  hp = 100;
  elapsed = 0;
  targets.reset();
  bots.reset();
  bomb.reset();
  economy.reset();
  weapon.refill();
  hud.setScore(0);
  hud.setHp(hp);
  hud.setWeapon(weapon.name());
  hud.setBomb(null);
  hud.setUse(null, null);
  hud.setPhase(null);
  hud.setRound('R1 · 0–0');
  hud.hideBoard();
  hud.setMoney(economy.state.money);
  hud.setArmor(economy.state.armor, economy.state.helm);
  hud.setNades(economy.state.nades);
  hud.hideShop();
  hud.setAmmo(weapon.ammo[weapon.state.index].mag, weapon.ammo[weapon.state.index].reserve);
  hud.clearKillfeed();
}

// --- Match flow (non-shot only): buy time -> live round -> intermission. ---
let lastCount = -1; // whole-second edge for the freeze countdown beep

function roundText() {
  return `R${rounds.state.round} · ${rounds.state.wins}–${rounds.state.losses}`;
}

// The kick-table snapshot: score, your line, warden headcount. DOM only.
function pushBoard() {
  let up = 0;
  for (const item of bots.items) if (item.alive) up += 1;
  hud.showBoard(
    `THE YARD · R${rounds.state.round}`,
    `${rounds.state.wins}–${rounds.state.losses}`,
    `${frags} frags · ${hp} HP · $${economy.state.money}`,
    `${up}/${bots.items.length} up`,
  );
}

function beginFreeze() {
  economy.state.shopOpen = true;
  refreshShop();
  const point = rounds.state.wins === ROUNDS_TO_WIN - 1 || rounds.state.losses === ROUNDS_TO_WIN - 1;
  hud.setPhase(point ? `ROUND ${rounds.state.round} · MATCH POINT` : `ROUND ${rounds.state.round} · BUY TIME`);
  hud.setRound(roundText());
  pushBoard();
  lastCount = -1;
}

function resetRoundWorld() {
  hp = 100;
  body.position.set(0, 0, 9.5);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  body.crouching = false;
  body.height = 1.72;
  body.eye = 1.6;
  targets.reset();
  bots.reset();
  bomb.reset();
  weapon.refill();
  hud.setHp(hp);
  hud.setBomb(null);
  hud.setUse(null, null);
  hud.setWeapon(weapon.name());
  hud.setAmmo(weapon.ammo[weapon.state.index].mag, weapon.ammo[weapon.state.index].reserve);
  hud.setArmor(economy.state.armor, economy.state.helm);
  hud.setNades(economy.state.nades);
  hud.clearKillfeed();
}

function refreshShop() {
  if (economy.state.shopOpen) hud.showShop(economy.state, hp, 100, economy.CATALOG);
}

function toggleShop() {
  if (cleared) return;
  economy.state.shopOpen = !economy.state.shopOpen;
  if (economy.state.shopOpen) refreshShop();
  else hud.hideShop();
}

function tryBuy(slotIndex) {
  const item = economy.CATALOG[slotIndex];
  if (!item) return;
  const ok = economy.buy(item.key, {
    hp,
    maxHp: 100,
    refillAmmo() {
      weapon.refill();
    },
    heal(amount) {
      hp = Math.min(100, hp + amount);
      hud.setHp(hp);
    },
  });
  if (ok) {
    sound.buy();
    hud.setMoney(economy.state.money);
    hud.setArmor(economy.state.armor, economy.state.helm);
    hud.setNades(economy.state.nades);
  }
  refreshShop();
}

function throwNade() {
  if (economy.state.nades <= 0) return;
  camera.getWorldDirection(direction);
  if (economy.throwNade(camera.position, direction)) {
    sound.nadeThrow();
    hud.setNades(economy.state.nades);
    player.recoil(0.014, (random() * 2 - 1) * 0.01);
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (rounds.state.phase === 'idle') {
      rounds.startMatch();
      beginFreeze();
    }
  } else {
    economy.state.shopOpen = false;
    hud.hideShop();
    if (!cleared) hud.showOverlay(started ? 'paused' : 'start', score);
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

const wardenBlips = [];
function drawRadar() {
  wardenBlips.length = 0;
  for (const item of bots.items) {
    wardenBlips.push({
      x: item.group.position.x,
      z: item.group.position.z,
      alive: item.alive,
      color: item.route.color,
    });
  }
  const bombBlip = bomb.state.phase === 'planted'
    ? { x: bomb.position.x, z: bomb.position.z, blink: bomb.state.blinkOn }
    : null;
  radar.draw(body.position, body.yaw, wardenBlips, bombBlip);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapon.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  if (hit && hit.object.userData.target) {
    const headshot = hit.object.userData.part === 'head';
    const amount = headshot ? weapon.damage() * 3 : weapon.damage();
    // Branch on the hitbox owner so damage is never applied twice: bots and dummies each
    // own their health and their death handling.
    const isBot = hit.object.userData.kind === 'bot';
    const killed = isBot
      ? bots.damage(hit.object, amount)
      : targets.damage(hit.object, amount);
    score += killed ? 100 : 10;
    if (killed) {
      economy.award('kill');
      frags += 1;
      hud.setMoney(economy.state.money);
      hud.pushKill('YOU', isBot ? hit.object.userData.target.route.name.toUpperCase() : 'DUMMY');
    }
    hud.setScore(score);
    hud.hitMarker(killed, markerHoldMs);
    sound.hit(killed);
    if (targets.remaining() === 0 && !cleared) {
      if (shot) {
        cleared = true;
        hud.showOverlay('end', score);
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        endRound('cleared');
      }
    }
  }
  weapon.pullTrigger();
  sound.shoot();
  bots.hear(body.position.x, body.position.z, 24);
  const kick = weapon.recoilKick(random);
  player.recoil(kick[0], kick[1]);
  hud.setAmmo(weapon.ammo[weapon.state.index].mag, weapon.ammo[weapon.state.index].reserve);
  return true;
}

function endRound(mode) {
  if (cleared) return;
  cleared = true;
  economy.state.shopOpen = false;
  hud.hideShop();
  const lost = mode === 'defused' || mode === 'dead';
  economy.award(lost ? 'loss' : 'win');
  sound.roundEnd(!lost);
  hud.setMoney(economy.state.money);
  hud.setUse(null, null);
  if (shot) {
    hud.showOverlay(mode, score);
    if (document.pointerLockElement) document.exitPointerLock();
    return;
  }
  const verdict = rounds.endRound(lost ? 'loss' : 'win');
  hud.setRound(roundText());
  if (verdict === 'match') {
    hud.setPhase(null);
    hud.hideBoard();
    hud.showOverlay(lost ? 'defeat' : 'victory', score);
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    // Intermission: keep the pointer, let the match clock run down to the next round.
    hud.setPhase(`${lost ? 'ROUND LOST' : 'ROUND WON'} · ${rounds.state.wins}–${rounds.state.losses}`);
    pushBoard();
  }
}

function onPlayerHit(amount, part, shooter) {
  if (cleared || shot === 'end' || shot === 'plant') return;
  if (!shot && rounds.state.phase !== 'live') return;
  const absorbed = economy.absorb(amount, part);
  if (shot) {
    // Shot renders must never die mid-frame: the hits show on the HUD, the round
    // never ends. Two deterministic runs still produce identical frames.
    hp = Math.max(5, hp - absorbed);
    hud.setHp(hp);
    hud.setArmor(economy.state.armor, economy.state.helm);
    return;
  }
  hp -= absorbed;
  hud.setHp(hp);
  hud.setArmor(economy.state.armor, economy.state.helm);
  if (hp > 0) sound.hurt();
  if (hp <= 0) {
    const label = (shooter || 'GUARD').toUpperCase() + (part === 'head' ? ' · HEADSHOT' : '');
    hud.pushKill(label, 'YOU');
    endRound('dead');
  }
}

function step(dt) {
  elapsed += dt;
  if (!shot) {
    const transition = rounds.tick(dt);
    if (transition === 'live') {
      economy.state.shopOpen = false;
      hud.hideShop();
      hud.hideBoard();
      hud.setPhase(null);
      hud.setRound(roundText());
    } else if (transition === 'freeze') {
      cleared = false;
      resetRoundWorld();
      beginFreeze();
    }
    if (rounds.state.phase === 'freeze') {
      const count = Math.ceil(rounds.state.clock);
      if (count !== lastCount) {
        lastCount = count;
        const point = rounds.state.wins === ROUNDS_TO_WIN - 1 || rounds.state.losses === ROUNDS_TO_WIN - 1;
        hud.setPhase(point ? `MATCH POINT · BUY ${count}` : `ROUND ${rounds.state.round} · BUY ${count}`);
        sound.tick();
      }
    }
  }
  player.step(dt, input.state.keys);
  weapon.step(dt);
  economy.step(dt);
  targets.step(dt, elapsed);
  const livePhase = shot || rounds.state.phase === 'live';
  bots.step(dt, elapsed, body, livePhase ? onPlayerHit : null, random);
  const blasts = economy.takeExplosions();
  if (blasts) {
    for (let index = 0; index < blasts.length; index += 1) {
      const at = blasts[index];
      const kills = bots.damageArea(at.x, at.z, economy.NADE_RADIUS, economy.NADE_MAX_DAMAGE);
      bots.hear(at.x, at.z, 20);
      if (kills > 0) {
        for (let k = 0; k < kills; k += 1) {
          economy.award('kill');
          hud.pushKill('YOU', 'WARDEN');
        }
        frags += kills;
        score += kills * 100;
        hud.setScore(score);
        hud.setMoney(economy.state.money);
        hud.hitMarker(true, markerHoldMs);
      }
      const dist = Math.hypot(body.position.x - at.x, body.position.z - at.z);
      if (dist <= economy.NADE_RADIUS) {
        const selfDamage = Math.round(economy.NADE_MAX_DAMAGE * (1 - (dist / economy.NADE_RADIUS) * 0.75) * 0.7);
        if (selfDamage > 0) onPlayerHit(selfDamage);
        player.recoil(0.02, (random() * 2 - 1) * 0.02);
      }
    }
  }
  const useHeld = livePhase && input.state.keys.has('KeyE');
  const event = bomb.step(dt, body.position, useHeld, bots.alivePositions());
  if (bomb.state.phase === 'plant') {
    hud.setUse('PLANTING THE CHARGE', bomb.state.progress);
  } else if (bomb.state.phase === 'planted' && bomb.state.progress > 0) {
    hud.setUse('DEFUSING', bomb.state.progress);
  } else {
    hud.setUse(null, null);
  }
  hud.setBomb(bomb.hudText());
  if (event === 'planted') {
    bots.setObjective(bomb.position.x, bomb.position.z);
    sound.armed();
  } else if (event) {
    if (event === 'exploded') sound.explosion();
    if (event === 'defused') sound.defused();
    if (!shot) endRound(event);
  }
  if (bomb.state.phase === 'planted') {
    if (bomb.state.blinkOn !== lastBlink) {
      lastBlink = bomb.state.blinkOn;
      if (bomb.state.blinkOn) sound.tick();
    }
  } else if (lastBlink) lastBlink = false;
}

// Footstep cadence: only in live play, never in shot renders (no gesture, so silent anyway).
function footsteps(dt) {
  const speed = player.groundSpeed();
  if (speed < 1.5 || !body.onGround) {
    stepPhase = 0;
    return;
  }
  stepPhase += dt * speed;
  if (stepPhase >= 2.4) {
    stepPhase = 0;
    sound.step();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const matchPhase = shot ? 'live' : rounds.state.phase;
    if (edge('KeyB') && started && !cleared && matchPhase === 'freeze') toggleShop();
    if (edge('KeyM')) sound.toggleMute();
    if (economy.state.shopOpen) {
      for (let slot = 0; slot < economy.CATALOG.length; slot += 1) {
        if (edge(`Digit${slot + 1}`)) tryBuy(slot);
      }
    } else if (matchPhase === 'live') {
      for (let slot = 0; slot < 3; slot += 1) {
        if (input.state.keys.has(`Digit${slot + 1}`)) weapon.switchTo(slot);
      }
      const wantsShot = weapon.automatic() ? input.state.firing : input.takeQueuedShot();
      if (wantsShot && weapon.ready()) shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
      if (edge('KeyG') && started && !cleared) throwNade();
    }
    if (input.state.keys.has('KeyR')) weapon.reload();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncPrevKeys();
    syncCamera();
    drawRadar();
    hud.setWeapon(weapon.name());
    hud.setAmmo(weapon.ammo[weapon.state.index].mag, weapon.ammo[weapon.state.index].reserve);
    if (!shot) footsteps(dt);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'play' || name === 'end') {
    body.position.set(0, 0, -5);
    settle(20);
    const count = name === 'play' ? 1 : targets.items.length;
    for (let index = 0; index < count; index += 1) {
      const point = targets.aimPoint(index);
      for (let round = 0; round < 3; round += 1) {
        aimAt(point);
        shoot(0);
        if (round < 2) settle(8);
      }
    }
    if (name === 'play') {
      settle(12);
      aimAt(targets.aimPoint(1));
      shoot(0);
      settle(1);
    } else {
      settle(40);
    }
  } else if (name === 'plant') {
    // The charge goes down on site A through the real hold-E path; two seconds into the
    // fuse the nearest warden is already closing in to defuse it.
    body.position.set(-14, 0, -7.6);
    settle(10);
    input.state.keys.add('KeyE');
    settle(200); // 3.33 s > PLANT_SECONDS
    input.state.keys.delete('KeyE');
    settle(120); // 2 s into the fuse, wardens converging
    aimAt(new THREE.Vector3(-15, 0.35, -9));
    settle(1);
  } else if (name === 'radar') {
    // Same plant as ?shot=plant, framed to sell the corner minimap: the charge blip is
    // blinking on pad A while both wardens are mid-converge.
    body.position.set(-14, 0, -7.6);
    settle(10);
    input.state.keys.add('KeyE');
    settle(200);
    input.state.keys.delete('KeyE');
    settle(140);
    aimAt(new THREE.Vector3(-16.5, 0.6, -10.5));
    settle(1);
  } else if (name === 'match') {
    // Round one at the top of the clock: supply screen open, buy banner counting, quiet yard.
    rounds.startMatch();
    beginFreeze();
    body.position.set(0.6, 0, 8.6);
    settle(30);
    hud.setPhase('ROUND 1 · BUY 5');
  } else if (name === 'buy') {
    // The supply screen mid-round: two sparring kills in the purse, menu open, yard behind.
    body.position.set(0.6, 0, 8.6);
    settle(30);
    economy.award('kill');
    economy.award('kill');
    hud.setMoney(economy.state.money);
    economy.state.shopOpen = true;
    refreshShop();
    settle(2);
  } else if (name === 'nade') {
    // A firepot lobbed with a lead onto the warden's path just burst: he is going down, the
    // kilnwash is still hot, and the purse already paid the kill.
    body.position.set(-20, 0, -8);
    settle(120);
    economy.state.nades = 1;
    const item = bots.items[0];
    const p = item.group.position;
    aimAt(new THREE.Vector3(p.x - 0.65, 0, p.z + 1.15));
    throwNade();
    settle(86);
    aimAt(new THREE.Vector3(p.x, 0.8, p.z));
    settle(2);
  } else if (name === 'bots') {
    // Five simulated seconds from the CT step: the warden is mid-route, has a clear line,
    // and is already firing — the frame catches a live firefight, not a corpse.
    body.position.set(0, 0.5, -11.6);
    settle(300);
    aimAt(new THREE.Vector3(bots.items[0].group.position.x, 1.1, bots.items[0].group.position.z));
    settle(2);
  } else {
    body.position.set(0.6, 0, 8.6);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start', 0);
  }
  hud.setScore(score);
  hud.setWeapon(weapon.name());
  hud.setHp(hp);
  hud.setAmmo(weapon.ammo[weapon.state.index].mag, weapon.ammo[weapon.state.index].reserve);
  hud.setMoney(economy.state.money);
  hud.setArmor(economy.state.armor, economy.state.helm);
  hud.setNades(economy.state.nades);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    drawRadar();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);