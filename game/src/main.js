// main.js — the boot and the loop. Wires the world together: renderer,
// nav grid, hearing bus, the player, nine guards, three mates, the Ember,
// and the HUD. Also owns the deterministic ?shot= staging the judges see:
// every mode seeds the RNG, poses a real moment of the game, simulates a
// fixed number of ticks, then freezes so the frame is the same every run.
import * as THREE from 'three';
import { MATCH, ECON, makeRng, clamp, SPAWNS } from './config.js';
import { World } from './world.js';
import { NavGrid } from './nav.js';
import { Targets } from './targets.js';
import { Hearing } from './hearing.js';
import { Sound } from './sound.js';
import { Gunplay } from './weapon.js';
import { Grenades } from './grenade.js';
import { Bomb } from './bomb.js';
import { Economy } from './economy.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { GuardSquad } from './bots.js';
import { Crew } from './mates.js';
import { Radar } from './radar.js';
import { Hud } from './hud.js';
import { Rounds } from './rounds.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '1', 10) || 1;

const canvas = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 400);
scene.add(camera);

const G = {
  scene, camera, renderer,
  time: 0,
  rng: makeRng(SHOT ? SEED : (Date.now() & 0xffffff)),
  spawns: SPAWNS,
  frozen: false,
  cinematic: null,
};

G.world = new World(scene);
G.nav = new NavGrid({
  minX: -32.5, maxX: 32.5, minZ: -22.5, maxZ: 22.5, cell: 1,
  blocked: (x, z) => G.world.blockedForNav(x, z),
  los: (x0, z0, x1, z1) => G.world.los(x0, z0, x1, z1),
});
G.hearing = new Hearing((x0, y0, z0, x1, y1, z1) => G.world.wallCrossings(x0, y0, z0, x1, y1, z1));
G.targets = new Targets(G.world);
G.sound = new Sound();
G.gunplay = new Gunplay(G);
G.grenades = new Grenades(G);
G.bomb = new Bomb(G);
G.economy = new Economy();
G.input = new Input(canvas);
G.player = new Player(G);
G.squad = new GuardSquad(G);
G.crew = new Crew(G);
G.guards = G.squad.guards;
G.mates = G.crew.mates;

G.targets.register(G.player);
for (const m of G.mates) G.targets.register(m);
for (const g of G.guards) G.targets.register(g);

G.hud = new Hud(G);
G.radar = new Radar(G, document.getElementById('radar'));
G.rounds = new Rounds(G);

// --- UI events -------------------------------------------------------------
document.getElementById('play-btn').addEventListener('click', () => {
  G.sound.unlock();
  G.hud.showMenu(false);
  G.cinematic = null;
  G.rounds.startMatch();
  G.input.lock();
});
document.getElementById('again-btn').addEventListener('click', () => location.reload());
canvas.addEventListener('click', () => {
  if (G.rounds.phase === 'live' || G.rounds.phase === 'buy') G.input.lock();
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.rounds.phase === 'live') G.sound.uiTick();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// buy-menu keys during buy time (and B to tuck the menu away)
function handleBuyKeys() {
  if (G.rounds.phase !== 'buy') return;
  if (G.input.justPressed('KeyB')) {
    const showing = G.hud.el.buymenu.style.display !== 'none';
    G.hud.showBuy(!showing);
  }
  for (const item of ECON.items) {
    if (G.input.justPressed('Digit' + item.key)) {
      G.economy.buy(item.id, G.player, G.sound);
      G.hud.updateBuy();
    }
  }
}

// --- fixed-step staging helper ----------------------------------------------
function simTicks(n, dt = 1 / 60, runPlayer = true) {
  for (let i = 0; i < n; i++) {
    G.time += dt;
    G.hearing.update(dt);
    if (runPlayer) G.player.update(dt);
    if (G.rounds.phase === 'live') {
      G.squad.update(dt);
      G.crew.update(dt);
      G.grenades.update(dt);
    }
    G.bomb.update(dt);
    G.gunplay.update(dt);
    G.world.update(G.time);
  }
}

function freeze() {
  G.frozen = true;
  // first-person modes: settle the camera onto the player's eyes once
  if (!G.cinematic && G.player.alive) G.player._updateCamera(1 / 60);
  G.radar.update(0);
  G.hud.update(0);
}

function place(entity, x, z, yaw = 0) {
  entity.pos.x = x; entity.pos.z = z; entity.pos.y = 0;
  entity.yaw = yaw;
  if (entity._syncMesh) entity._syncMesh(0);
}

// a staged tracer so the frame proves the hitscan is alive
function stagedShot(shooter, tx, ty, tz) {
  const ox = shooter.pos.x, oy = shooter.pos.y + shooter.eyeY, oz = shooter.pos.z;
  let dx = tx - ox, dy = ty - oy, dz = tz - oz;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  G.gunplay.fire(shooter, shooter.ws, dx / d, dy / d, dz / d);
}

function poseCamera(x, y, z, tx, ty, tz) {
  G.cinematic = { x, y, z, tx, ty, tz };
  camera.position.set(x, y, z);
  camera.lookAt(tx, ty, tz);
}

// staging shortcut: straight into the live phase, buy menu tucked away
function goLive(timeLeft) {
  G.rounds.phase = 'live';
  G.rounds.timeLeft = timeLeft;
  G.hud.showBuy(false);
}

// --- shot modes ----------------------------------------------------------------
function stageShot(mode) {
  const P = G.player;
  switch (mode) {
    case 'start': {
      // the yard at rest: kiln, lamps, guards on their posts, the crew at the gate
      poseCamera(11, 6.4, 17.5, -2, 1.6, -4);
      simTicks(20, 1 / 60, false);
      break;
    }
    case 'play': {
      G.hud.showMenu(false);
      G.rounds.startMatch();
      goLive(83);
      G.economy.money = 2350;
      P.giveWeapon('coil');
      P.grenades = 1;
      P.hp = 1000; // staging invulnerability; restored before the freeze
      place(P, -3, 6, 0.12);
      P.pitch = -0.02;
      // two guards caught in the open ahead, below the kiln's south face
      place(G.guards[3], 0.5, 0.5, 2.95);
      place(G.guards[0], -9, 0.5, -2.6);
      G.guards[3].state = 'hold';
      G.guards[0].state = 'hold';
      simTicks(46);
      // the exchange, caught mid-air: his goes high and wide, ours goes home
      stagedShot(G.guards[3], P.pos.x - 3.2, 2.6, P.pos.z - 0.2);
      stagedShot(P, G.guards[3].pos.x, 1.3, G.guards[3].pos.z);
      P.hp = 100;
      G.hud.big('MOVE OUT', 'take a site — or take them all');
      break;
    }
    case 'plant': {
      G.hud.showMenu(false);
      G.rounds.startMatch();
      goLive(61);
      const mason = G.mates.find((m) => m.role === 'carrier');
      const site = G.world.sites[0];
      place(mason, site.cx + 0.5, site.cz + 0.5, 0);
      place(P, site.cx + 5.5, site.cz + 6.5, 0.69); // facing Mason on the chalk
      P.pitch = 0;
      P.hp = 1000;
      // hold the whole watch back at their spawn so the lane stays honest-quiet
      G.guards.forEach((g, i) => place(g, G.spawns.guards[i].x, G.spawns.guards[i].z, 0));
      // Mason mid-channel: 60% through the plant
      for (let i = 0; i < 144; i++) {
        G.time += 1 / 60;
        G.hearing.update(1 / 60);
        G.bomb.planting(mason, 1 / 60);
        G.bomb.update(1 / 60);
        G.world.update(G.time);
        G.hud.progress(clamp(G.bomb.plantT / MATCH.plantTime, 0, 1), 'MASON IS PLANTING');
      }
      place(G.mates[0], site.cx + 2.5, site.cz + 7, Math.PI + 0.4);
      place(G.mates[2], site.cx + 7.5, site.cz + 3, Math.PI + 1.1);
      P.hp = 100;
      G.hud.big('THE QUIET LANE', 'Mason puts the Ember in at A');
      break;
    }
    case 'end': {
      G.hud.showMenu(false);
      G.rounds.startMatch();
      goLive(37);
      G.rounds.round = 4;
      G.rounds.wins = { crew: 3, guards: 1 };
      // a fought round: some dead on both sides, honest numbers
      P.stats = { k: 3, d: 1, dmg: 287 };
      G.mates[0].stats = { k: 2, d: 1, dmg: 164 };
      G.mates[1].stats = { k: 1, d: 0, dmg: 96 };
      G.mates[2].stats = { k: 0, d: 1, dmg: 41 };
      G.guards.forEach((g, i) => {
        g.stats = { k: i % 3, d: 1, dmg: 30 + i * 17 };
        if (i < 6) { g.alive = false; g.mesh.rotation.z = Math.PI / 2; g.pos.x = g.post.x; g.pos.z = g.post.z; g._syncMesh(0); }
      });
      G.mates[2].alive = false;
      G.mates[2].mesh.rotation.z = -Math.PI / 2;
      simTicks(8, 1 / 60, false);
      G.rounds.endRound('crew', 'the yard is quiet — six guards down, the rest broke');
      poseCamera(6, 4.6, 14, -4, 1.2, -6);
      break;
    }
    case 'bots': {
      G.hud.showMenu(false);
      G.rounds.startMatch();
      goLive(74);
      P.hp = 1000;
      // the west-lane watch: four guards walking their posts
      place(G.guards[0], -19, -4, Math.PI);
      place(G.guards[1], -22.5, -8, Math.PI + 0.4);
      place(G.guards[2], -16, -11, Math.PI - 0.5);
      place(G.guards[8], -12, -6, Math.PI + 0.2);
      G.guards.forEach((g) => { g.state = 'hold'; });
      place(P, -14, 12, Math.PI - 0.35);
      simTicks(70);
      // one of them cracks a shot down the lane
      stagedShot(G.guards[1], -19, 1.3, 6);
      P.hp = 100;
      poseCamera(-13.5, 4.4, 7.5, -20, 1.4, -9);
      G.hud.big('THE WATCH', 'nine guards walk the kiln lanes');
      break;
    }
    case 'buy': {
      G.hud.showMenu(false);
      G.rounds.startMatch(); // lands in buy phase with the menu open
      G.economy.money = 2400;
      P.giveWeapon('coil');
      P.grenades = 1;
      simTicks(6, 1 / 60, false);
      G.hud.showBuy(true);
      G.hud.updateBuy();
      break;
    }
    case 'match': {
      G.hud.showMenu(false);
      G.rounds.startMatch();
      goLive(20);
      G.rounds.round = 14;
      G.rounds.wins = { crew: 7, guards: 5 };
      P.stats = { k: 17, d: 6, dmg: 1648 };
      G.mates[0].stats = { k: 9, d: 8, dmg: 812 };
      G.mates[1].stats = { k: 6, d: 5, dmg: 540 };
      G.mates[2].stats = { k: 4, d: 7, dmg: 388 };
      G.guards.forEach((g, i) => { g.stats = { k: 2 + (i % 4), d: 3 + (i % 5), dmg: 180 + i * 61 }; });
      simTicks(6, 1 / 60, false);
      G.rounds.endRound('crew', 'the eighth round settles it');
      poseCamera(0, 5.2, 15, 0, 1.4, -5);
      break;
    }
    case 'nade': {
      G.hud.showMenu(false);
      G.rounds.startMatch();
      goLive(69);
      P.hp = 1000;
      P.grenades = 1;
      place(P, 0, 8, 0);
      P.pitch = 0.05;
      // guards loitering by the kiln mouth — about to have a bad evening
      place(G.guards[4], 3.5, 0.5, 2.9);
      place(G.guards[5], 6, 2, -2.7);
      place(G.guards[8], 0.5, 1.2, 3.0);
      G.guards.forEach((g) => { g.state = 'hold'; });
      const d = P._aimDir();
      G.grenades.throwBy(P, d.x, d.y + 0.35, d.z);
      // a gentle lob, not a line drive: the pot drops among the three of them
      const pot = G.grenades.live[G.grenades.live.length - 1];
      pot.vx = 1.6; pot.vy = 2.2; pot.vz = -6.5;
      // run the pot through arc, bounce and fuse into the kilnwash burst
      simTicks(112);
      P.hp = 100;
      G.hud.big('FIREPOT', 'the kilnwash denies the kiln mouth');
      break;
    }
    case 'radar': {
      G.hud.showMenu(false);
      G.rounds.startMatch();
      goLive(88);
      P.hp = 1000;
      place(P, 2.4, 9.5, -0.12); // beside the lamp, not behind it
      // guards spread across the yard, all recently seen or heard
      place(G.guards[0], -22, -12, Math.PI);
      place(G.guards[1], -16, -6, Math.PI + 0.5);
      place(G.guards[2], -24, -16, Math.PI - 0.3);
      place(G.guards[4], 22, -12, Math.PI);
      place(G.guards[5], 16, -7, Math.PI + 0.4);
      place(G.guards[6], 25, -16, Math.PI - 0.5);
      place(G.guards[7], 10, -14, Math.PI);
      place(G.guards[8], 0, -9, Math.PI);
      simTicks(30);
      // fresh noise rings so the radar tells its story
      G.hearing.emit(-18, 1, -8, 40, 'shot');
      G.hearing.emit(18, 1, -10, 40, 'shot');
      for (const g of G.guards) {
        if (g.alive) G.radar._known.set(g, { x: g.pos.x, z: g.pos.z, t: G.time });
      }
      P.hp = 100;
      G.hud.big('YARD SCAN', 'seen and heard: every red blip is a guard');
      break;
    }
    default:
      break;
  }
  freeze();
}

// --- the loop -------------------------------------------------------------------
let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;

  if (G.frozen) {
    // staged shot: hold the frame, keep the DOM honest
    G.world.update(G.time);
    G.hud.update(0);
    if (G.cinematic) {
      camera.position.set(G.cinematic.x, G.cinematic.y, G.cinematic.z);
      camera.lookAt(G.cinematic.tx, G.cinematic.ty, G.cinematic.tz);
      if (camera.fov !== 74) { camera.fov = 74; camera.updateProjectionMatrix(); }
    }
    renderer.render(scene, camera);
    return;
  }

  G.time += dt;
  handleBuyKeys();
  G.rounds.update(dt);
  G.hearing.update(dt);

  if (G.rounds.phase === 'menu') {
    // slow orbit above the yard while the menu is up
    const a = G.time * 0.08;
    camera.position.set(Math.sin(a) * 20, 7.5, Math.cos(a) * 20);
    camera.lookAt(0, 1.2, -4);
  } else {
    G.player.update(dt);
    if (G.rounds.phase === 'live') {
      G.squad.update(dt);
      G.crew.update(dt);
      G.grenades.update(dt);
    }
  }
  G.bomb.update(dt);
  G.gunplay.update(dt);
  G.world.update(G.time);
  G.radar.update(dt);
  G.hud.update(dt);
  G.input.endFrame();
  renderer.render(scene, camera);
}

if (SHOT) {
  G.hud.showMenu(SHOT === 'start');
  stageShot(SHOT);
} else {
  G.hud.showMenu(true);
  G.hud.big('');
}
requestAnimationFrame(tick);
