// Emberline entry point: one seeded fixed-step simulation, one renderer, and
// a deterministic shot director. Ordinary play and screenshot scenes share the
// same movement, combat, objective and round code — nothing is faked for shots.
import * as THREE from 'three';
import { FOV_NORMAL, TICK, FOV_SCOPED, SHOTS } from './config.js';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapon.js';
import { createTargets } from './targets.js';
import { createBots } from './bots.js';
import { createMates } from './mates.js';
import { createBomb } from './bomb.js';
import { createEconomy, CATALOG } from './economy.js';
import { createRounds, ROUND_SECONDS } from './rounds.js';
import { createRadar } from './radar.js';
import { createHud } from './hud.js';
import { createTracerPool } from './combat.js';
import { sound } from './sound.js';

const params = new URLSearchParams(location.search);
const requested = params.get('shot');
const shot = SHOTS.includes(requested) ? requested : null;

// Seedable mulberry-style RNG so shot scenes and tracers are reproducible.
let rngState = Number.parseInt(params.get('seed') || '1', 10) || 1;
function random() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let v = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
  return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
}

// --- renderer, scene, camera ------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV_NORMAL, innerWidth / innerHeight, 0.05, 150);
scene.add(camera);

// --- systems ---------------------------------------------------------------
const world = createWorld(scene);
const nav = createNav(world);
const targets = createTargets(scene);
const bots = createBots(scene, world, nav, {
  shot: (guard) => sound.shot(guard.route.gun === 'dmr' ? 'longsight' : guard.route.gun === 'pistol' ? 'sidearm' : 'coil', true),
});
const bomb = createBomb(scene);
const economy = createEconomy(scene, world);
const rounds = createRounds();
const weapon = createWeapon(camera);
const player = createPlayer(world.colliders);
const body = player.state;
const hud = createHud();
const radar = createRadar(document.getElementById('radar'), world);
const playerTracers = createTracerPool(scene, PALETTE.paper, 12, 0.09);
const mates = createMates(scene, world, bots, nav, {
  kill: (killer, victim, headshot) => hud.kill(killer, victim, headshot),
  shot: () => sound.shot('coil', true),
});
bots.setOpponents({
  mates,
  hitMate: (mate, amount, part, guard) => (shot ? false : mates.hitBy(mate, amount, part, guard)),
});

const input = createInput(renderer.domElement, onPointerLock);
const raycaster = new THREE.Raycaster();
const aimDir = new THREE.Vector3();
const muzzlePoint = new THREE.Vector3();
const fireOrigin = new THREE.Vector3();
const shootables = [...world.solids, ...bots.hitMeshes, ...targets.hitMeshes];

// --- match bookkeeping -------------------------------------------------------
let hp = 100;
let playerAlive = true;
let kills = 0;
let deaths = 0;
let damageDone = 0;
let time = 0;
let started = false;
let roundEnded = false;
let aiming = false;
let shotLive = true;
let frozen = false;
let accumulator = 0;
let previousNow = performance.now();
let strideMark = 0;
let lastBlink = false;
let roundMessage = '';

function liveNow() {
  return shot ? shotLive : rounds.state.phase === 'live' && !roundEnded && playerAlive;
}

function syncCamera() {
  const bob = playerAlive && body.grounded ? Math.sin(body.bob * 2) * Math.min(0.018, player.speed() * 0.0035) : 0;
  camera.position.set(body.position.x, body.position.y + body.eye + bob, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  syncCamera();
}

function boardSnapshot(status) {
  return {
    rounds: rounds.state,
    player: { name: 'YOU', kills, deaths, dmg: damageDone },
    playerAlive,
    mates: mates.items,
    guards: bots.items,
    status,
  };
}

function showBoard(status) {
  hud.showBoard(boardSnapshot(status));
}

function setShop(open) {
  economy.state.shopOpen = open && rounds.state.phase === 'buy';
  if (economy.state.shopOpen) {
    hud.hideBoard();
    hud.showShop(economy.state, hp, {
      unlocked: weapon.state.unlocked,
      grenades: economy.grenadeCount(),
    }, rounds.state.number);
  } else {
    hud.hideShop();
    if (rounds.state.phase === 'buy') showBoard(`BUY PHASE · ${Math.ceil(rounds.state.clock)} SECONDS · B FOR SUPPLY`);
  }
}

// --- round lifecycle ---------------------------------------------------------
function resetRound() {
  hp = 100;
  playerAlive = true;
  roundEnded = false;
  roundMessage = '';
  player.reset();
  bots.reset();
  mates.reset();
  targets.reset();
  bomb.reset();
  const carried = economy.grenadeCount();
  economy.grenades.reset();
  economy.grenades.state.count = carried; // pots survive the round turnover
  weapon.beginRound();
  playerTracers.reset();
  hud.clearFeed();
  hud.setBomb(null);
  hud.setUse(null, 0);
  hud.scope(false);
  aiming = false;
  lastBlink = false;
  syncCamera();
}

function beginBuy(openShop = false) {
  rounds.state.phase = 'buy';
  setShop(openShop);
  if (!openShop) showBoard(`BUY PHASE · ${Math.ceil(rounds.state.clock)} SECONDS · B FOR SUPPLY`);
}

function startMatch() {
  rounds.start();
  hp = 100;
  kills = 0;
  deaths = 0;
  damageDone = 0;
  economy.reset();
  weapon.resetMatch();
  resetRound();
  beginBuy(true);
}

function finishRound(crewWon, reason) {
  if (roundEnded || shot) return;
  roundEnded = true;
  roundMessage = `${crewWon ? 'ROUND WON' : 'ROUND LOST'} · ${reason}`;
  economy.state.shopOpen = false;
  hud.hideShop();
  hud.setUse(null, 0);
  economy.award(crewWon ? 'win' : 'loss');
  sound.round(crewWon);
  const verdict = rounds.finish(crewWon, reason);
  if (verdict === 'match') {
    hud.setBomb(null);
    hud.hideBoard();
    hud.showOverlay(crewWon ? 'victory' : 'defeat', {
      crew: rounds.state.crew, guards: rounds.state.guards, kills, dmg: damageDone,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    showBoard(roundMessage);
  }
}

// --- combat wiring -----------------------------------------------------------
function onPlayerHit(rawAmount, part, guard) {
  if (!liveNow() || !playerAlive || shot) return false;
  const amount = economy.mitigate(rawAmount, part);
  hp = Math.max(0, hp - amount);
  hud.hurt();
  if (hp > 0) {
    sound.hurt();
    return false;
  }
  playerAlive = false;
  deaths += 1;
  hud.kill(guard ? guard.name : 'GUARD', 'YOU', part === 'head');
  finishRound(false, 'CREW ELIMINATED');
  return true;
}

function buy(slot) {
  if (rounds.state.phase !== 'buy' || !economy.state.shopOpen) return;
  const item = CATALOG[slot - 1];
  if (!item) return;
  const ok = economy.buy(item.key, {
    hp,
    heal(amount) { hp = Math.min(100, hp + amount); },
    ownsWeapon: (index) => weapon.state.unlocked[index],
    buyWeapon: (index) => weapon.unlock(index),
    refillAmmo: () => weapon.refillAmmo(),
    ammoFull: () => weapon.ammoFull(),
  });
  sound.purchase(ok);
  hud.notify(ok ? `${item.name} · ISSUED` : 'PURCHASE UNAVAILABLE');
  setShop(true);
}

function throwFirepot() {
  if (!liveNow() || economy.grenadeCount() <= 0) return;
  camera.getWorldDirection(aimDir);
  if (economy.throwPot(camera.position, aimDir)) {
    sound.throwPot();
    player.kick(0.012, (random() - 0.5) * 0.012);
  }
}

// One player trigger pull: recoil pattern, spread cone, exact hitscan,
// tracer, hit feedback, and the noise report every guard can hear.
function fireWeapon() {
  if (!liveNow() || !weapon.ready()) return false;
  const impulse = weapon.fire(random);
  if (!impulse) return false;
  const spread = shot ? 0 : weapon.spread(player.speed(), aiming);
  camera.getWorldDirection(aimDir);
  aimDir.x += (random() * 2 - 1) * spread;
  aimDir.y += (random() * 2 - 1) * spread;
  aimDir.z += (random() * 2 - 1) * spread;
  aimDir.normalize();
  scene.updateMatrixWorld(true);
  fireOrigin.copy(camera.position);
  raycaster.set(fireOrigin, aimDir);
  raycaster.far = 90;
  const hit = raycaster.intersectObjects(shootables, false)[0];
  weapon.muzzleWorld(muzzlePoint);
  playerTracers.fire(muzzlePoint, aimDir, hit ? hit.distance : 75, time);

  if (hit && hit.object.userData.owner) {
    const tag = hit.object.userData;
    const spec = weapon.current();
    const headshot = tag.part === 'head';
    const falloff = Math.max(0.7, 1 - hit.distance * 0.0045);
    const amount = Math.round(spec.damage * (headshot ? spec.head : 1) * falloff);
    const result = tag.kind === 'guard' ? bots.damage(hit.object, amount) : targets.damage(hit.object, amount);
    if (tag.kind === 'guard') damageDone += result.damage;
    if (result.killed && tag.kind === 'guard') {
      kills += 1;
      economy.award('kill');
      hud.kill('YOU', result.item.name, headshot);
    }
    hud.hit(result.killed, !!shot);
    sound.hit(result.killed);
  }

  const key = weapon.current().key;
  sound.shot(key);
  bots.hear(body.position.x, body.position.z, key === 'longsight' ? 34 : 26, 'shot');
  player.kick(impulse[0], impulse[1]);
  return true;
}

function applyExplosion(blast) {
  const results = bots.blast(blast.x, blast.y, blast.z, 5.4, 118);
  for (const result of results) {
    damageDone += result.damage;
    if (!result.killed) continue;
    kills += 1;
    economy.award('kill');
    hud.kill('YOU', result.item.name, false);
  }
  if (results.length) hud.hit(results.some((result) => result.killed), !!shot);
  const span = Math.hypot(body.position.x - blast.x, body.position.z - blast.z);
  if (liveNow() && span <= 5.4) {
    onPlayerHit(Math.round(70 * (1 - span / 5.4 * 0.8)), 'body', null);
    player.kick(0.025, (random() - 0.5) * 0.03);
  }
  for (const mate of mates.items) {
    if (!mate.alive) continue;
    const p = mate.group.position;
    const mateSpan = Math.hypot(p.x - blast.x, p.z - blast.z);
    if (mateSpan < 4.5) mates.hitBy(mate, Math.round(45 * (1 - mateSpan / 5)), 'body', null);
  }
  bots.hear(blast.x, blast.z, 36, 'blast');
  sound.explosion();
}

// --- the fixed-step simulation ----------------------------------------------
function simulate(dt) {
  time += dt;
  if (!shot) {
    const boundary = rounds.tick(dt, bomb.state.phase === 'planted');
    if (boundary === 'live') {
      setShop(false);
      hud.hideBoard();
      hud.notify('ROUND LIVE · PLANT A OR B');
    } else if (boundary === 'buy') {
      resetRound();
      beginBuy(false);
    } else if (boundary === 'timeout') {
      finishRound(false, 'TIME EXPIRED');
    }
  }

  const active = liveNow();
  player.step(dt, input.state.keys, playerAlive && rounds.state.phase !== 'match');
  weapon.step(dt, player.speed());
  world.update(time);
  targets.step(time);
  economy.step(dt);
  bots.step(dt, time, body, onPlayerHit, random, active);
  mates.step(dt, time, body, bomb, random, active);
  for (const blast of economy.takeExplosions()) applyExplosion(blast);

  // The objective: your E, or Mason's quiet-lane plant, against the guards.
  const holdingUse = active && input.state.keys.has('KeyE');
  const mason = holdingUse ? null : mates.planter();
  const actor = holdingUse ? body.position : mason ? mason.group.position : body.position;
  const event = bomb.step(dt, actor, holdingUse || !!mason, bots.alivePositions());
  if (bomb.state.phase === 'planting') {
    hud.setUse(mason ? 'MASON · PLANTING EMBER' : 'PLANTING EMBER', bomb.state.plantProgress,
      mason ? 'COVER THE PLANTER' : 'HOLD E · KEEP THE LANE QUIET');
  } else if (bomb.state.phase === 'planted' && bomb.state.defuseProgress > 0) {
    hud.setUse('DEFUSING EMBER', bomb.state.defuseProgress, 'HOLD E BESIDE THE CHARGE');
  } else if (bomb.state.phase === 'planted' && bomb.state.guardDefuse > 0) {
    hud.setUse('GUARD ON THE CHARGE', bomb.state.guardDefuse / 6.5, 'STOP THE DEFUSE');
  } else {
    hud.setUse(null, 0);
  }

  if (event === 'planted') {
    economy.award('plant');
    bots.setObjective(bomb.position.x, bomb.position.z);
    sound.plant();
    hud.notify(`EMBER ARMED · SITE ${bomb.state.site}`);
  } else if (event === 'exploded') {
    sound.explosion();
    finishRound(true, `SITE ${bomb.state.site} DESTROYED`);
  } else if (event === 'defused') {
    sound.defused();
    finishRound(false, 'EMBER DEFUSED');
  }
  if (bomb.state.phase === 'planted' && bomb.state.blink !== lastBlink) {
    lastBlink = bomb.state.blink;
    if (lastBlink) sound.beep(bomb.state.fuse < 10);
  }
  if (active && bots.allDown()) finishRound(true, 'YARD CLEARED');
  playerTracers.step(time);
  hud.step(dt);
}

// --- presentation ------------------------------------------------------------
function phaseText() {
  if (shot) return null;
  if (rounds.state.phase === 'buy') {
    const matchPoint = rounds.state.crew === 7 || rounds.state.guards === 7;
    return `${matchPoint ? 'MATCH POINT · ' : ''}BUY PHASE · ${Math.ceil(rounds.state.clock)} · B SUPPLY`;
  }
  if (rounds.state.phase === 'over') return roundMessage;
  return null;
}

function shotClock() {
  if (shot === 'play') return 94;
  if (shot === 'plant' || shot === 'radar') return 38;
  if (shot === 'bots' || shot === 'nade') return 71;
  return rounds.state.clock;
}

function updatePresentation(dt) {
  aiming = !!(input.state.aiming && weapon.state.index === 2 && liveNow() && !economy.state.shopOpen);
  const wantFov = aiming ? FOV_SCOPED : FOV_NORMAL;
  const fov = THREE.MathUtils.damp(camera.fov, wantFov, 15, dt);
  if (Math.abs(fov - camera.fov) > 0.001) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  hud.scope(aiming);
  weapon.setVisible(!aiming && playerAlive);
  syncCamera();
  radar.draw(body.position, body.yaw, bots.items, mates.items,
    bomb.state.phase === 'planted' ? { x: bomb.position.x, z: bomb.position.z, blink: bomb.state.blink } : null);
  hud.setRound(rounds.state, shot ? shotClock() : rounds.state.clock, phaseText());
  hud.setBomb(bomb.hudText());
  hud.setCrew(mates.items, bots.aliveCount());
  hud.setVitals(hp, economy.state);
  hud.setWeapon(weapon, economy.grenadeCount());
}

// --- input ------------------------------------------------------------------
function handleInput() {
  const look = input.consumeLook();
  player.look(look.x, look.y, aiming ? 0.38 : 1); // scoped: low-sensitivity aim
  if (input.consumeKey('KeyM')) {
    hud.notify(sound.toggleMute() ? 'AUDIO MUTED' : 'AUDIO ON');
  }
  if (input.consumeKey('KeyB') && rounds.state.phase === 'buy' && !roundEnded) setShop(!economy.state.shopOpen);
  if (economy.state.shopOpen) {
    for (let slot = 1; slot <= 7; slot += 1) if (input.consumeKey(`Digit${slot}`)) buy(slot);
  } else if (liveNow()) {
    for (let slot = 0; slot < 3; slot += 1) {
      if (input.consumeKey(`Digit${slot + 1}`)) weapon.select(slot);
    }
    const wantsFire = weapon.automatic() ? input.state.firing : input.consumeClick();
    if (wantsFire) fireWeapon();
    if (input.consumeKey('KeyR') && weapon.reload()) sound.reload();
    if (input.consumeKey('KeyG')) throwFirepot();
  }
  const tabOpen = input.state.keys.has('Tab') && !economy.state.shopOpen && started && !roundEnded;
  if (tabOpen) showBoard('LIVE ROSTER · RELEASE TAB TO RETURN');
  else if (rounds.state.phase === 'live') hud.hideBoard();
  input.endFrame();
}

function onPointerLock(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (rounds.state.phase === 'idle' || rounds.state.phase === 'match') startMatch();
  } else {
    economy.state.shopOpen = false;
    hud.hideShop();
    if (started && rounds.state.phase !== 'match') hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (!shot) input.requestLock();
});

// --- the frame loop -----------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - previousNow) / 1000));
  previousNow = now;
  if (!frozen) {
    if (started && input.state.locked) {
      handleInput();
      accumulator += dt;
      let steps = 0;
      while (accumulator >= TICK && steps < 6) {
        simulate(TICK);
        accumulator -= TICK;
        steps += 1;
      }
      if (accumulator > TICK * 6) accumulator = 0;
      if (liveNow() && body.grounded && player.speed() > 1.2) {
        strideMark += player.speed() * dt;
        if (strideMark > 2.35) {
          strideMark = 0;
          sound.step();
          bots.hear(body.position.x, body.position.z, 7, 'step');
        }
      }
    } else {
      world.update(time);
      weapon.step(dt, 0);
      hud.step(dt);
    }
    updatePresentation(dt);
  }
  renderer.render(scene, camera);
}

// --- the deterministic shot director ------------------------------------------
function settle(steps) {
  for (let i = 0; i < steps; i += 1) simulate(TICK);
}

function prepareLive(roundNumber = 1, clock = 90) {
  rounds.start();
  rounds.state.phase = 'live';
  rounds.state.number = roundNumber;
  rounds.state.clock = clock;
  resetRound();
  shotLive = true;
  economy.state.shopOpen = false;
  hud.hideOverlay();
  hud.hideShop();
  hud.hideBoard();
}

function runShot(name) {
  if (name === 'start') {
    rounds.start();
    rounds.state.phase = 'idle';
    rounds.state.clock = ROUND_SECONDS;
    resetRound();
    shotLive = false;
    body.position.set(0.6, 0, 10.3);
    aimAt(new THREE.Vector3(0, 2.2, -8));
    settle(12);
    hud.showOverlay('start');
  } else if (name === 'play') {
    prepareLive(3, 94);
    rounds.state.crew = 1;
    rounds.state.guards = 1;
    weapon.unlock(1);
    economy.state.money = 1750;
    body.position.set(0, 0, 2.7);
    const guard = bots.items[7];
    bots.stage(7, 0.4, -7.3, 0, 2.7);
    guard.cooldown = 0;
    mates.stage([[-2.3, 0.7, 0, -7], [2.4, 1.4, 1, -7], [0, 4.5, 0, 10]]);
    aimAt(new THREE.Vector3(0.4, 1.15, -7.3));
    settle(16);
    aimAt(new THREE.Vector3(guard.group.position.x, 1.1, guard.group.position.z));
    fireWeapon();
    settle(1);
  } else if (name === 'plant' || name === 'radar') {
    prepareLive(5, 38);
    rounds.state.crew = 2;
    rounds.state.guards = 2;
    body.position.set(-14.1, 0, -7.2);
    input.injectKey('KeyE');
    settle(188);
    input.releaseKey('KeyE');
    settle(name === 'radar' ? 88 : 65);
    mates.stage([[-17.1, -7.4, -20, -10], [-12.7, -9.9, -8, -6], [-14, -4.5, -14, 4]]);
    if (name === 'radar') {
      bots.stage(0, -18, -12, -15, -9);
      bots.stage(7, -8, -5, -15, -9);
      bots.items[0].mode = 'defuse';
      bots.items[7].mode = 'investigate';
      aimAt(new THREE.Vector3(-17, 1.2, -12));
    } else {
      aimAt(new THREE.Vector3(-15, 0.45, -9));
    }
    settle(1);
  } else if (name === 'bots') {
    prepareLive(4, 71);
    rounds.state.crew = 2;
    rounds.state.guards = 1;
    body.position.set(0, 0, -1.6);
    const guard = bots.items[2];
    bots.stage(2, 0, -9.3, 0, -1.6);
    guard.contactFor = 1;
    guard.cooldown = 0;
    mates.stage([[-2.4, -0.5, 0, -9], [2.2, 0.3, 1, -9], [0, 2.1, 0, 8]]);
    aimAt(new THREE.Vector3(0, 1.15, -9.3));
    settle(2);
    aimAt(new THREE.Vector3(guard.group.position.x, 1.12, guard.group.position.z));
  } else if (name === 'nade') {
    prepareLive(6, 71);
    rounds.state.crew = 3;
    rounds.state.guards = 2;
    economy.grenades.state.count = 1;
    body.position.set(0, 0, 8.2);
    bots.stage(4, 0, 6.2, 0, 8);
    aimAt(new THREE.Vector3(0, 0, 7.35));
    throwFirepot();
    settle(101);
    const bursts = economy.grenades.burstPositions();
    const target = bursts[0] || new THREE.Vector3(0, 0.2, 7.3);
    body.position.set(0, 0, 11.6);
    body.velocity.set(0, 0, 0);
    aimAt(new THREE.Vector3(target.x, Math.max(0.35, target.y + 0.2), target.z));
    settle(1);
  } else if (name === 'buy') {
    hud.hideOverlay();
    rounds.start();
    rounds.state.clock = 5.4;
    resetRound();
    shotLive = false;
    economy.state.money = 2350;
    body.position.set(0.5, 0, 10.8);
    aimAt(new THREE.Vector3(0, 1.8, -7));
    settle(8);
    setShop(true);
  } else if (name === 'match') {
    hud.hideOverlay();
    rounds.start();
    rounds.state.number = 14;
    rounds.state.crew = 7;
    rounds.state.guards = 6;
    rounds.state.clock = 5;
    resetRound();
    shotLive = false;
    kills = 9;
    deaths = 3;
    damageDone = 1284;
    mates.items.forEach((mate, index) => {
      mate.kills = [5, 3, 4][index];
      mate.deaths = [2, 3, 1][index];
      mate.dmg = [702, 488, 561][index];
    });
    bots.items.forEach((guard, index) => {
      guard.kills = (index * 3) % 4;
      guard.deaths = index % 3 === 0 ? 2 : 1;
      guard.dmg = 120 + index * 47;
      if (index === 4 || index === 7) guard.alive = false;
    });
    body.position.set(0.5, 0, 10.8);
    aimAt(new THREE.Vector3(0, 1.8, -7));
    settle(5);
    showBoard('MATCH POINT · BUY PHASE ENDS IN 5 · B FOR SUPPLY');
  } else if (name === 'end') {
    prepareLive(14, 0);
    shotLive = false;
    rounds.state.phase = 'match';
    rounds.state.crew = 8;
    rounds.state.guards = 5;
    kills = 24;
    deaths = 7;
    damageDone = 3176;
    body.position.set(0, 0, 1.8);
    aimAt(new THREE.Vector3(0, 1.6, -12));
    settle(5);
    hud.showOverlay('victory', { crew: 8, guards: 5, kills, dmg: damageDone });
  }
  updatePresentation(TICK);
  renderer.render(scene, camera);
  let painted = 0;
  function repaint() {
    updatePresentation(0);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      frozen = true;
      window.__shotReady = true;
    }
    // Headless Chrome may drop a non-preserved WebGL buffer after compositing;
    // repaint the frozen scene without advancing the deterministic simulation.
    requestAnimationFrame(repaint);
  }
  requestAnimationFrame(repaint);
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Read-only diagnostics for deterministic capture tooling; they never alter
// the simulation or bypass a live-game rule.
window.__EMBERLINE__ = {
  rounds, bots, mates, bomb, economy, weapon, player, scene, camera, renderer,
  get hp() { return hp; },
};
syncCamera();
updatePresentation(TICK);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
