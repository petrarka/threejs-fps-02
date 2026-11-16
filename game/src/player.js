// player.js — you. A first-person capsule with honest momentum, walk-quiet
// on Shift, a viewmodel gun that bobs and kicks, the Longsight scope
// (FOV 74→32, low sensitivity, sway), stims, the FIREPOT key, and the
// hold-E plant channel when you're the one carrying the Ember.
import * as THREE from 'three';
import { PLAYER, WEAPONS, clamp, lerp } from './config.js';
import { WeaponState } from './weapon.js';

const GRAV = 14;

function buildViewmodel(id) {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x525c6e, emissive: 0x11141c });
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a42, emissive: 0x1a1208 });
  const ember = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  if (id === 'spark') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.3), dark);
    body.position.set(0, 0, -0.1);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), wood);
    grip.position.set(0, -0.11, 0.03);
    grip.rotation.x = 0.25;
    g.add(body, grip);
  } else if (id === 'coil') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.5), dark);
    body.position.set(0, 0, -0.2);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.55);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.08), dark);
    mag.position.set(0, -0.14, -0.14);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12), ember);
    ring.position.set(0, 0.02, -0.44);
    g.add(body, barrel, mag, ring);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.7), wood);
    body.position.set(0, -0.01, -0.25);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.75);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, -0.3);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), ember);
    lens.position.set(0, 0.1, -0.405);
    lens.rotation.y = Math.PI;
    g.add(body, barrel, scope, lens);
  }
  return g;
}

export class Player {
  constructor(G) {
    this.G = G;
    this.isPlayer = true;
    this.team = 'crew';
    this.name = 'You';
    this.radius = PLAYER.radius;
    this.height = PLAYER.height;
    this.eyeY = PLAYER.eye;
    this.pos = { x: 0, y: 0, z: 19 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; // yaw 0 looks down -z: north, toward the kiln
    this.pitch = 0;
    this.alive = true;
    this.hp = PLAYER.hp;
    this.vest = false;
    this.helm = false;
    this.stims = 0;
    this.stimT = 0;
    this.grenades = 1;
    this.hasBomb = false;
    this.stats = { k: 0, d: 0, dmg: 0 };
    this.speedNow = 0;
    this.scoped = false;
    this.weapons = { spark: new WeaponState('spark') };
    this.current = 'spark';
    this.recoilP = 0; // accumulated camera kick, recovers over time
    this.recoilY = 0;
    this.bobT = 0;
    this.stepAcc = 0;
    this.fov = PLAYER.fov;
    this._models = {};

    // viewmodel rig hangs off the camera
    this.rig = new THREE.Group();
    G.camera.add(this.rig);
    for (const id of ['spark', 'coil', 'long']) {
      const m = buildViewmodel(id);
      m.position.set(0.24, -0.22, -0.5);
      m.scale.setScalar(0.8);
      m.visible = false;
      this.rig.add(m);
      this._models[id] = m;
    }
    this._models.spark.visible = true;
  }

  giveWeapon(id) {
    if (!this.weapons[id]) this.weapons[id] = new WeaponState(id);
    this.switchTo(id);
  }

  switchTo(id) {
    if (!this.weapons[id] || this.current === id) return;
    this._models[this.current].visible = false;
    this.current = id;
    this._models[id].visible = true;
    this.G.sound.uiTick();
  }

  get ws() { return this.weapons[this.current]; }
  get def() { return this.ws.def; }

  reset(spawn) {
    this.pos.x = spawn.x; this.pos.z = spawn.z; this.pos.y = 0;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.alive = true;
    this.hp = PLAYER.hp;
    this.vest = false;
    this.helm = false;
    this.stims = 0;
    this.stimT = 0;
    this.grenades = 1;
    this.hasBomb = false;
    this.scoped = false;
    this.recoilP = this.recoilY = 0;
    this.weapons = { spark: new WeaponState('spark') };
    this.current = 'spark';
    for (const id of ['spark', 'coil', 'long']) this._models[id].visible = id === 'spark';
    this.fov = PLAYER.fov;
  }

  takeDamage(dmg, part, attacker) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.G.sound.hurt();
    this.G.hud.damageFlash();
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.stats.d += 1;
      this.scoped = false;
      if (this.hasBomb) { this.hasBomb = false; this.G.bomb.dropAt(this.pos.x, this.pos.z); }
      return true;
    }
    return false;
  }

  update(dt) {
    const G = this.G;
    const input = G.input;
    if (!this.alive) { this._spectate(dt); return; }
    // buy time and the round board are freeze time: look, don't move
    const frozen = G.rounds.phase !== 'live';

    // --- look ---
    const sens = 0.0021 * (this.scoped ? WEAPONS.long.scope.sens : 1);
    const md = input.consumeMouse();
    this.yaw -= md.x * sens;
    this.pitch = clamp(this.pitch - md.y * sens, -1.45, 1.45);

    // recoil recovery — the pattern kicks, the spring brings you back
    this.recoilP = lerp(this.recoilP, 0, Math.min(1, dt * 7));
    this.recoilY = lerp(this.recoilY, 0, Math.min(1, dt * 7));

    // --- scope ---
    const wantScope = input.aiming && this.current === 'long' && !this.ws.reloading;
    this.scoped = wantScope;
    const targetFov = this.scoped ? WEAPONS.long.scope.fovIn : WEAPONS.long.scope.fovOut;
    this.fov = lerp(this.fov, targetFov, Math.min(1, dt * 10));

    // --- move ---
    const quiet = input.down('ShiftLeft') || input.down('ShiftRight');
    const maxSpeed = frozen ? 0 : quiet ? PLAYER.quietSpeed : PLAYER.speed;
    let ax = 0, az = 0;
    if (!frozen) {
      if (input.down('KeyW')) az -= 1;
      if (input.down('KeyS')) az += 1;
      if (input.down('KeyA')) ax -= 1;
      if (input.down('KeyD')) ax += 1;
    }
    const len = Math.hypot(ax, az) || 1;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = (ax * cos - az * sin) / len;
    const wz = (ax * sin + az * cos) / len;
    this.vel.x += wx * PLAYER.accel * dt;
    this.vel.z += wz * PLAYER.accel * dt;
    // friction
    const f = Math.max(0, 1 - PLAYER.friction * dt);
    this.vel.x *= f; this.vel.z *= f;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > maxSpeed) { this.vel.x *= maxSpeed / sp; this.vel.z *= maxSpeed / sp; }
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);

    // jump + gravity (the yard is flat; the jump is for crossing low walls of fire)
    if (!frozen && input.justPressed('Space') && this.pos.y <= 0.001) this.vel.y = PLAYER.jump;
    this.vel.y -= GRAV * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; }

    const moved = G.world.move(this.pos.x, this.pos.z, this.vel.x * dt, this.vel.z * dt, this.radius);
    this.pos.x = moved.x; this.pos.z = moved.z;

    // footsteps make noise guards can hear — quieter at a walk
    this.stepAcc += this.speedNow * dt;
    const stride = quiet ? 2.6 : 2.2;
    if (this.stepAcc > stride && this.speedNow > 0.5 && this.pos.y <= 0.001) {
      this.stepAcc = 0;
      G.sound.footstep(quiet);
      G.hearing.emit(this.pos.x, 0.5, this.pos.z, quiet ? PLAYER.quietNoise : PLAYER.stepNoise, 'step');
    }

    // --- weapons --- (digits belong to the buy menu during buy time)
    for (const ws of Object.values(this.weapons)) ws.update(dt);
    if (!frozen) {
      if (input.justPressed('Digit1')) this.switchTo('spark');
      if (input.justPressed('Digit2')) this.switchTo('coil');
      if (input.justPressed('Digit3')) this.switchTo('long');
    }
    if (!frozen && input.justPressed('KeyR')) {
      if (this.ws.startReload()) G.sound.reload();
    }

    const wantFire = !frozen && (this.def.auto ? input.firing : input.fireClicked);
    if (wantFire) this._tryFire();

    // --- grenade ---
    if (!frozen && input.justPressed('KeyG') && this.grenades > 0) {
      this.grenades -= 1;
      const d = this._aimDir();
      G.grenades.throwBy(this, d.x, d.y + 0.12, d.z);
    }

    // --- stim ---
    if (!frozen && input.justPressed('KeyX') && this.stims > 0 && this.hp < 100 && this.stimT <= 0) {
      this.stims -= 1;
      this.stimT = 2;
      G.sound.stim();
    }
    if (this.stimT > 0) {
      this.stimT -= dt;
      this.hp = Math.min(100, this.hp + 30 * dt);
    }

    // --- plant ---
    if (!frozen && this.hasBomb && input.down('KeyE')) {
      const p = G.bomb.planting(this, dt);
      G.hud.progress(p > 0 ? p : 0, 'PLANTING THE EMBER');
    } else if (G.bomb.planter === this) {
      G.bomb.stopPlanting();
      G.hud.progress(0);
    }

    // dropped Ember: walk over it to pick it up
    if (G.bomb.state === 'dropped' && !this.hasBomb) {
      if (Math.hypot(this.pos.x - G.bomb.x, this.pos.z - G.bomb.z) < 1.4) G.bomb.pickup(this);
    }

    this._updateCamera(dt);
  }

  _aimDir() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // yaw=PI faces -z (north); forward = (sin(yaw)*-cp? derive: dir = (-sin(yaw)*cp, sp, -cos(yaw)*cp)
    return { x: -Math.sin(this.yaw) * cp, y: sp, z: -Math.cos(this.yaw) * cp };
  }

  _tryFire() {
    const G = this.G;
    const ws = this.ws;
    if (this.pos.y > 0.01) { /* airborne: still allowed, spread punishes it */ }
    if (!ws.ready) {
      if (ws.mag <= 0 && ws.cooldown <= 0 && !ws.reloading) {
        G.sound.dryFire();
        ws.cooldown = 0.25;
        if (ws.reserve > 0) { ws.startReload(); G.sound.reload(); }
      }
      return;
    }
    const d = this._aimDir();
    G.gunplay.fire(this, ws, d.x, d.y, d.z);
    // fixed pattern kick: next entry every shot
    const [kp, ky] = ws.kick();
    this.recoilP += kp * (Math.PI / 180);
    this.recoilY += ky * (Math.PI / 180);
    ws.patternIdx += 1;
    // viewmodel snap
    this.rig.position.z = 0.06;
  }

  _updateCamera(dt) {
    const G = this.G;
    // scoped sway: slow breathing figure-eight
    let swayP = 0, swayY = 0;
    if (this.scoped) {
      const s = WEAPONS.long.scope.sway * (Math.PI / 180);
      swayP = Math.sin(G.time * 0.9) * s;
      swayY = Math.sin(G.time * 1.7) * s * 0.7;
    }
    // walk bob
    if (this.speedNow > 0.5 && this.pos.y <= 0.001) this.bobT += dt * this.speedNow * 1.6;
    const bobY = Math.sin(this.bobT * 2) * 0.025 * Math.min(this.speedNow / PLAYER.speed, 1);
    const bobX = Math.cos(this.bobT) * 0.015 * Math.min(this.speedNow / PLAYER.speed, 1);

    G.camera.position.set(this.pos.x + bobX * Math.cos(this.yaw), this.pos.y + this.eyeY + bobY, this.pos.z + bobX * Math.sin(this.yaw));
    G.camera.rotation.order = 'YXZ';
    G.camera.rotation.y = this.yaw + this.recoilY + swayY;
    G.camera.rotation.x = this.pitch + this.recoilP + swayP;
    G.camera.rotation.z = 0;
    if (Math.abs(G.camera.fov - this.fov) > 0.1) {
      G.camera.fov = this.fov;
      G.camera.updateProjectionMatrix();
    }
    // viewmodel spring back from the shot
    this.rig.position.z = lerp(this.rig.position.z, 0, Math.min(1, dt * 9));
    this.rig.position.y = bobY * 0.6 - (this.ws.reloading ? 0.12 : 0);
    this.rig.visible = !this.scoped;
  }

  // dead: ride along with the first living mate
  _spectate(dt) {
    const G = this.G;
    const mate = G.mates.find((m) => m.alive);
    const cam = G.camera;
    if (mate) {
      const tx = mate.pos.x, ty = mate.pos.y + mate.eyeY, tz = mate.pos.z;
      cam.position.lerp(new THREE.Vector3(tx, ty + 1.2, tz + 3), Math.min(1, dt * 3));
      cam.lookAt(tx, ty, tz);
      G.hud.spectate(`YOU ARE DOWN — WATCHING ${mate.name.toUpperCase()}`);
    } else {
      cam.position.y = Math.max(cam.position.y - dt * 0.5, 0.4);
      G.hud.spectate('YOU ARE DOWN');
    }
    this.rig.visible = false;
  }
}
