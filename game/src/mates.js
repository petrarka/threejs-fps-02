// mates.js — your crew. Three named mates on the same A* grid and the same
// physics as the guards: Tally entries ahead, Mason carries the Ember and
// plants it on the quiet lane, Brack anchors your back. They see, they
// fight, they die, and the round board remembers their K/D/DMG.
import * as THREE from 'three';
import { BOT, MATE_NAMES, clamp } from './config.js';
import { WeaponState } from './weapon.js';

const DEG = Math.PI / 180;

function nameSprite(name) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.font = 'bold 20px Menlo, monospace';
  g.textAlign = 'center';
  g.fillStyle = '#7dd87d';
  g.shadowColor = '#000';
  g.shadowBlur = 4;
  g.fillText(name.toUpperCase(), 64, 22);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(1.4, 0.35, 1);
  s.position.y = 2.1;
  return s;
}

function buildMateMesh(tint) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: 0x2e3b33 });
  const skin = new THREE.MeshLambertMaterial({ color: 0x8a7a66 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.15, 8), cloth);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), skin);
  head.position.y = 1.66;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.22), new THREE.MeshBasicMaterial({ color: tint }));
  band.position.set(0, 1.55, -0.02);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.58), new THREE.MeshLambertMaterial({ color: 0x22262e }));
  gun.position.set(0.24, 1.25, -0.28);
  g.add(body, head, band, gun);
  return g;
}

export class Mate {
  constructor(G, name, role) {
    this.G = G;
    this.name = name;
    this.role = role; // 'entry' | 'carrier' | 'anchor'
    this.team = 'crew';
    this.isPlayer = false;
    this.radius = BOT.radius;
    this.height = BOT.height;
    this.eyeY = BOT.eye;
    this.pos = { x: 0, y: 0, z: 19 };
    this.yaw = 0;
    this.alive = true;
    this.vest = false;
    this.helm = false;
    this.hasBomb = false;
    this.speedNow = 0;
    this.scoped = false;
    this.stats = { k: 0, d: 0, dmg: 0 };
    this._hp = BOT.hp;

    this.ws = new WeaponState(role === 'anchor' ? 'long' : 'coil');
    this.state = 'push';
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.repathT = 0;
    this.target = null;
    this.reactT = 0;
    this.trackT = 0;
    this.burstLeft = 0;
    this.pauseT = 0;
    this.scanT = 0;

    const tint = role === 'carrier' ? 0xffb347 : 0x7dd87d;
    this.mesh = buildMateMesh(tint);
    this.mesh.add(nameSprite(name));
    G.scene.add(this.mesh);
  }

  get hp() { return this._hp; }
  set hp(v) { this._hp = v; }

  reset(spawn) {
    this.pos.x = spawn.x; this.pos.z = spawn.z; this.pos.y = 0;
    this.yaw = 0;
    this.alive = true;
    this._hp = BOT.hp;
    this.hasBomb = false;
    this.target = null;
    this.path = null;
    this.goal = null;
    this.trackT = 0;
    this.ws.mag = this.ws.def.mag;
    this.ws.reserve = this.ws.def.reserve;
    this.ws.heat = 0;
    this.ws.reloadT = 0;
    this.mesh.visible = true;
    this.mesh.rotation.z = 0;
  }

  takeDamage(dmg, part, attacker) {
    if (!this.alive) return false;
    this._hp -= dmg;
    if (this._hp <= 0) {
      this.alive = false;
      this.stats.d += 1;
      if (this.hasBomb) { this.hasBomb = false; this.G.bomb.dropAt(this.pos.x, this.pos.z); }
      this.mesh.rotation.z = Math.PI / 2 * (this.G.rng() < 0.5 ? 1 : -1);
      return true;
    }
    // getting shot turns a mate toward the shooter
    if (attacker && !this.target) {
      this.target = attacker;
      this.reactT = 0.2 + this.G.rng() * 0.3;
      this.trackT = 0;
    }
    return false;
  }

  _visibleEnemy() {
    const G = this.G;
    let best = null, bestD = BOT.visionDist + 6;
    for (const e of G.targets.alive('guard')) {
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d > bestD) continue;
      if (!G.targets.canSee(this.pos.x, this.pos.y + this.eyeY, this.pos.z, e.pos.x, e.pos.y + 1.2, e.pos.z)) continue;
      best = e; bestD = d;
    }
    return best;
  }

  _aimAt(e) {
    const ty = e.pos.y + 1.25 + clamp(this.trackT / 3, 0, 1) * 0.3;
    let dx = e.pos.x - this.pos.x, dy = ty - (this.pos.y + this.eyeY), dz = e.pos.z - this.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= d; dy /= d; dz /= d;
    const err = (BOT.aimErrorBase * 0.7 + (BOT.aimErrorMin - BOT.aimErrorBase * 0.7) * clamp(this.trackT / 2, 0, 1)) * DEG;
    const rng = this.G.rng;
    const a = rng() * Math.PI * 2, r = Math.tan(err) * Math.sqrt(rng());
    let ux = -dz, uz = dx;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul; uz /= ul;
    const ox = dx + ux * Math.cos(a) * r;
    const oy = dy + Math.sin(a) * r * 0.6;
    const oz = dz + uz * Math.cos(a) * r;
    const ol = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
    return { x: ox / ol, y: oy / ol, z: oz / ol };
  }

  _setGoal(x, z) {
    if (this.goal && Math.hypot(this.goal.x - x, this.goal.z - z) < 1.5) return;
    this.goal = { x, z };
    this.repathT = 0;
  }

  _followPath(dt, speed = BOT.speed + 0.4) {
    const G = this.G;
    this.repathT -= dt;
    if ((!this.path || this.repathT <= 0) && this.goal) {
      this.path = G.nav.findPath(this.pos.x, this.pos.z, this.goal.x, this.goal.z);
      this.pathIdx = 0;
      this.repathT = BOT.repathSec;
    }
    if (!this.path || this.pathIdx >= this.path.length) { this.speedNow = 0; return true; }
    const wp = this.path[this.pathIdx];
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) { this.pathIdx++; return this._followPath(dt, speed); }
    const vx = (dx / d) * speed, vz = (dz / d) * speed;
    const moved = G.world.move(this.pos.x, this.pos.z, vx * dt, vz * dt, this.radius);
    this.pos.x = moved.x; this.pos.z = moved.z;
    this.speedNow = speed;
    if (!this.target) this.yaw = Math.atan2(-vx, -vz);
    return false;
  }

  _fight(dt) {
    const G = this.G;
    this.trackT += dt;
    this.reactT -= dt;
    this.yaw = Math.atan2(-(this.target.pos.x - this.pos.x), -(this.target.pos.z - this.pos.z));
    this.speedNow = 0;
    if (this.reactT > 0) return;
    if (this.ws.mag <= 0) {
      if (!this.ws.reloading && this.ws.reserve > 0) this.ws.startReload();
      return;
    }
    if (this.pauseT > 0) { this.pauseT -= dt; return; }
    if (this.burstLeft <= 0) {
      this.burstLeft = BOT.burstLen[0] + Math.floor(G.rng() * (BOT.burstLen[1] - BOT.burstLen[0]));
      return;
    }
    if (this.ws.cooldown <= 0) {
      const dir = this._aimAt(this.target);
      G.gunplay.fire(this, this.ws, dir.x, dir.y, dir.z);
      this.burstLeft -= 1;
      if (this.burstLeft <= 0) this.pauseT = BOT.burstGap[0] + G.rng() * (BOT.burstGap[1] - BOT.burstGap[0]);
    }
  }

  update(dt) {
    if (!this.alive) return;
    const G = this.G;
    this.ws.update(dt);

    const seen = this._visibleEnemy();
    if (seen) {
      if (this.target !== seen) { this.target = seen; this.reactT = 0.25 + G.rng() * 0.3; this.trackT = 0; }
    } else if (this.target) {
      this.trackT += dt;
      if (this.trackT > 1.6 || !this.target.alive) this.target = null;
    }
    if (this.target && !this.target.alive) this.target = null;

    if (this.target) { this._fight(dt); this._syncMesh(); return; }

    // no fight: do your job
    if (this.role === 'carrier') this._carrierJob(dt);
    else if (this.role === 'entry') this._entryJob(dt);
    else this._anchorJob(dt);
    this._syncMesh();
  }

  // the quiet lane: the site with fewer living guards near it
  _quietSite() {
    const G = this.G;
    const [a, b] = G.world.sites;
    const near = (s) => G.targets.alive('guard').filter((g) => Math.hypot(g.pos.x - s.cx, g.pos.z - s.cz) < 15).length;
    const na = near(a), nb = near(b);
    return na <= nb ? a : b;
  }

  _carrierJob(dt) {
    const G = this.G;
    const bomb = G.bomb;
    if (bomb.state === 'planted') {
      // ring the charge and guard it
      const d = Math.hypot(this.pos.x - bomb.x, this.pos.z - bomb.z);
      if (d > 4) { this._setGoal(bomb.x + 2, bomb.z + 2); this._followPath(dt); }
      else { this.speedNow = 0; this.yaw += Math.sin(G.time * 0.7) * dt * 0.5; }
      return;
    }
    if (this.hasBomb) {
      const site = this._quietSite();
      const onSite = G.world.onSite(this.pos.x, this.pos.z);
      if (onSite) {
        // plant only when the lane is quiet: no guard seen within 18m
        const close = G.targets.alive('guard').some((g) => Math.hypot(g.pos.x - this.pos.x, g.pos.z - this.pos.z) < 18);
        if (!close) {
          this.speedNow = 0;
          const p = bomb.planting(this, dt);
          if (p > 0) G.hud.progress(p, `${this.name.toUpperCase()} IS PLANTING`);
          return;
        }
        // too hot: shift position inside the site and wait a beat
        this._setGoal(site.cx + (G.rng() - 0.5) * 4, site.cz + (G.rng() - 0.5) * 4);
        this._followPath(dt, 2.5);
        return;
      }
      this._setGoal(site.cx, site.cz);
      this._followPath(dt);
      return;
    }
    if (bomb.state === 'dropped') {
      this._setGoal(bomb.x, bomb.z);
      const arrived = this._followPath(dt);
      if (Math.hypot(this.pos.x - bomb.x, this.pos.z - bomb.z) < 1.3) bomb.pickup(this);
      else if (arrived) this.repathT = 0;
      return;
    }
    // someone else has it (you): escort
    this._escort(dt, G.player.hasBomb ? G.player : null);
  }

  _entryJob(dt) {
    const G = this.G;
    const site = this._quietSite();
    // run the lane a few metres ahead of the carrier
    const mason = G.mates.find((m) => m.role === 'carrier');
    if (G.bomb.state === 'planted') {
      const d = Math.hypot(this.pos.x - G.bomb.x, this.pos.z - G.bomb.z);
      if (d > 6) { this._setGoal(G.bomb.x - 2, G.bomb.z - 2); this._followPath(dt); }
      else { this.speedNow = 0; this.scanT += dt; this.yaw += Math.sin(this.scanT * 0.6) * dt * 0.6; }
      return;
    }
    if (mason && mason.alive && (mason.hasBomb || G.bomb.state === 'dropped')) {
      // lead toward the site, staying ahead of Mason
      const ahead = 5;
      const dx = site.cx - mason.pos.x, dz = site.cz - mason.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this._setGoal(mason.pos.x + (dx / d) * ahead, mason.pos.z + (dz / d) * ahead);
      this._followPath(dt);
    } else {
      this._setGoal(site.cx, site.cz);
      this._followPath(dt);
    }
  }

  _anchorJob(dt) {
    // Brack lives on your shoulder, four metres back
    this._escort(dt, this.G.player);
  }

  _escort(dt, who) {
    const G = this.G;
    if (!who || !who.alive) { this.speedNow = 0; return; }
    const d = Math.hypot(who.pos.x - this.pos.x, who.pos.z - this.pos.z);
    if (d > 4.5) {
      this._setGoal(who.pos.x, who.pos.z);
      this._followPath(dt, d > 10 ? BOT.speed + 1.2 : BOT.speed);
    } else {
      this.speedNow = 0;
      this.scanT += dt;
      this.yaw += Math.sin(this.scanT * 0.55) * dt * 0.5;
    }
  }

  _syncMesh() {
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.yaw;
    if (this.alive && this.speedNow > 0.3) this.mesh.position.y = Math.abs(Math.sin(this.G.time * 9)) * 0.05;
  }
}

export class Crew {
  constructor(G) {
    this.G = G;
    this.mates = MATE_NAMES.map((name, i) => new Mate(G, name, ['entry', 'carrier', 'anchor'][i % 3]));
  }

  reset() {
    const G = this.G;
    this.mates.forEach((m, i) => {
      const spawn = G.spawns.crew[(i + 1) % G.spawns.crew.length];
      m.reset({ x: spawn.x + (G.rng() - 0.5), z: spawn.z + (G.rng() - 0.5) });
    });
    // Mason carries the Ember at the break of every round
    const mason = this.mates.find((m) => m.role === 'carrier');
    if (mason) {
      mason.hasBomb = true;
      G.bomb.reset(mason);
    }
  }

  update(dt) {
    for (const m of this.mates) m.update(dt);
  }
}
