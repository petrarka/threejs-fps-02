// bots.js — the nine kiln guards. Each one holds a post, scans the lanes,
// and listens. A noise (gunshot, bounce, the plant) through hearing.js —
// walls honestly muffling it — sends him to investigate; a visible crew
// member starts his reaction clock and then aimed, bursted fire with real
// spread. When the Ember goes in, everyone converges and one kneels to
// defuse. All of them walk the shared A* grid from nav.js.
import * as THREE from 'three';
import { BOT, GUARD_NAMES, WEAPONS, MATCH, clamp } from './config.js';
import { WeaponState } from './weapon.js';

const DEG = Math.PI / 180;

function buildGuardMesh() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: 0x3c2f33 });
  const hide = new THREE.MeshLambertMaterial({ color: 0x59424a });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.15, 8), cloth);
  body.position.y = 0.85;
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), hide);
  shoulders.position.y = 1.42;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), hide);
  head.position.y = 1.66;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: 0xff5040 }));
  visor.position.set(0, 1.68, -0.15);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), new THREE.MeshLambertMaterial({ color: 0x22262e }));
  gun.position.set(0.24, 1.25, -0.3);
  g.add(body, shoulders, head, visor, gun);
  return g;
}

let GUARD_ID = 0;

export class Guard {
  constructor(G, name, post) {
    this.G = G;
    this.id = GUARD_ID++;
    this.name = name;
    this.team = 'guard';
    this.isPlayer = false;
    this.radius = BOT.radius;
    this.height = BOT.height;
    this.eyeY = BOT.eye;
    this.pos = { x: post.x, y: 0, z: post.z };
    this.post = { ...post };
    this.yaw = G.rng() * Math.PI * 2;
    this.alive = true;
    this.vest = false;
    this.helm = false;
    this.hasBomb = false;
    this.speedNow = 0;
    this.scoped = false;
    this.stats = { k: 0, d: 0, dmg: 0 };

    // guards carry worn coil-guns tuned to suppress, not delete
    this.ws = new WeaponState(G.rng() < 0.75 ? 'coil' : 'spark');
    this.ws.def = { ...this.ws.def, damage: Math.round(this.ws.def.damage * BOT.guardDamageScale) };

    this.state = 'hold';
    this.scanT = G.rng() * 4;
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.repathT = 0;
    this.target = null;
    this.lastSeen = null;
    this.lastSeenT = 0;
    this.reactT = 0;
    this.trackT = 0;
    this.burstLeft = 0;
    this.pauseT = 0;
    this.strafeDir = 1;
    this.strafeT = 0;

    this.mesh = buildGuardMesh();
    G.scene.add(this.mesh);
    this._syncMesh(0);
  }

  reset(spawn, post) {
    this.pos.x = spawn.x; this.pos.z = spawn.z; this.pos.y = 0;
    this.post = { ...post };
    this.yaw = Math.atan2(-(0 - spawn.x), -(0 - spawn.z)); // face yard centre
    this.alive = true;
    this._hp = BOT.hp;
    this.state = 'hold';
    this.path = null;
    this.goal = null;
    this.target = null;
    this.lastSeen = null;
    this.reactT = 0;
    this.trackT = 0;
    this.burstLeft = 0;
    this.pauseT = 0;
    this.ws.mag = this.ws.def.mag;
    this.ws.reserve = this.ws.def.reserve;
    this.ws.heat = 0;
    this.mesh.visible = true;
    this.mesh.rotation.z = 0;
    this.mesh.position.y = 0;
    this._syncMesh(0);
  }

  takeDamage(dmg, part, attacker) {
    if (!this.alive) return false;
    this.hp -= dmg;
    // getting shot pulls your attention even through a wall
    if (attacker && this.alive) {
      this.lastSeen = { x: attacker.pos.x, z: attacker.pos.z };
      this.lastSeenT = 0;
      if (this.state === 'hold' || this.state === 'investigate') this.state = 'investigate';
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.stats.d += 1;
      this.mesh.rotation.z = Math.PI / 2 * (this.G.rng() < 0.5 ? 1 : -1);
      this.mesh.position.y = 0.25;
      return true;
    }
    return false;
  }

  get hp() { return this._hp ?? BOT.hp; }
  set hp(v) { this._hp = v; }

  _syncMesh(dt) {
    this.mesh.position.x = this.pos.x;
    this.mesh.position.z = this.pos.z;
    this.mesh.rotation.y = this.yaw;
    if (this.alive && this.speedNow > 0.3) {
      this.mesh.position.y = Math.abs(Math.sin(this.G.time * 9)) * 0.05;
    } else if (this.alive) {
      this.mesh.position.y = 0;
    }
  }

  _setGoal(x, z) {
    if (this.goal && Math.hypot(this.goal.x - x, this.goal.z - z) < 1.5) return;
    this.goal = { x, z };
    this.repathT = 0;
  }

  _followPath(dt) {
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
    if (d < 0.45) { this.pathIdx++; return this._followPath(dt); }
    const vx = (dx / d) * BOT.speed, vz = (dz / d) * BOT.speed;
    const moved = G.world.move(this.pos.x, this.pos.z, vx * dt, vz * dt, this.radius);
    this.pos.x = moved.x; this.pos.z = moved.z;
    this.speedNow = BOT.speed;
    // face travel direction when not fighting (mesh looks down its -z)
    if (!this.target) this.yaw = Math.atan2(-vx, -vz);
    return false;
  }

  // nearest living crew member he can actually see
  _visibleEnemy() {
    const G = this.G;
    let best = null, bestD = BOT.visionDist;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    for (const e of G.targets.alive('crew')) {
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      const dot = (dx / (d || 1)) * fx + (dz / (d || 1)) * fz;
      if (dot < Math.cos((BOT.visionFov / 2) * DEG) && d > 2.5) continue;
      if (!G.targets.canSee(this.pos.x, this.pos.y + this.eyeY, this.pos.z, e.pos.x, e.pos.y + 1.2, e.pos.z)) continue;
      best = e; bestD = d;
    }
    return best;
  }

  _aimAt(e) {
    // aim at chest, drifting to the head as he settles on target
    const headBias = clamp(this.trackT / 2.5, 0, 1) * 0.35;
    const ty = e.pos.y + 1.2 + headBias * 0.45;
    let dx = e.pos.x - this.pos.x;
    let dy = ty - (this.pos.y + this.eyeY);
    let dz = e.pos.z - this.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= d; dy /= d; dz /= d;
    // cone of error shrinks while he tracks
    const err = (BOT.aimErrorBase + (BOT.aimErrorMin - BOT.aimErrorBase) * clamp(this.trackT / 2.2, 0, 1)) * DEG;
    const rng = this.G.rng;
    const a = rng() * Math.PI * 2, r = Math.tan(err) * Math.sqrt(rng());
    // build a perpendicular basis
    let ux = -dz, uz = dx;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul; uz /= ul;
    const wx = dy * uz - dz * 0, wy = dz * ux - dx * uz, wz = dx * 0 - dy * ux; // rough cross
    const ox = dx + (ux * Math.cos(a) + wy) * r;
    const oy = dy + (Math.sin(a)) * r * 0.6;
    const oz = dz + (uz * Math.cos(a) + wx) * r * -1;
    const ol = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
    return { x: ox / ol, y: oy / ol, z: oz / ol };
  }

  update(dt) {
    if (!this.alive) return;
    const G = this.G;
    this.ws.update(dt);

    // --- senses ---
    const seen = this._visibleEnemy();
    if (seen) {
      if (this.target !== seen) {
        this.target = seen;
        this.reactT = BOT.reactionMin + G.rng() * (BOT.reactionMax - BOT.reactionMin);
        this.trackT = 0;
      }
      this.lastSeen = { x: seen.pos.x, z: seen.pos.z };
      this.lastSeenT = 0;
    } else {
      this.lastSeenT += dt;
      if (this.target && this.lastSeenT > 1.4) {
        this.target = null;
        this.state = 'investigate';
        if (this.lastSeen) this._setGoal(this.lastSeen.x, this.lastSeen.z);
      }
    }

    // --- hearing (only when not already fighting) ---
    if (!this.target) {
      const heard = G.hearing.loudestFor(this.pos.x, this.pos.y + this.eyeY, this.pos.z);
      if (heard && heard.loudness > 0.14 && this.state !== 'converge' && this.state !== 'defuse') {
        this.state = 'investigate';
        this._setGoal(heard.noise.x, heard.noise.z);
      }
    }

    // --- the planted charge outranks everything ---
    if (G.bomb.state === 'planted' && this.state !== 'converge' && this.state !== 'defuse') {
      this.state = 'converge';
      this._setGoal(G.bomb.x, G.bomb.z);
    }

    // --- act ---
    if (this.target) {
      this.trackT += dt;
      this.reactT -= dt;
      // face the target
      this.yaw = Math.atan2(-(this.target.pos.x - this.pos.x), -(this.target.pos.z - this.pos.z));
      // strafe a little; a moving guard is a fair guard
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.7 + G.rng() * 0.8; this.strafeDir = G.rng() < 0.5 ? -1 : 1; }
      const px = -(this.target.pos.z - this.pos.z), pz = this.target.pos.x - this.pos.x;
      const pl = Math.hypot(px, pz) || 1;
      const sx = (px / pl) * this.strafeDir * 1.6 * dt, sz = (pz / pl) * this.strafeDir * 1.6 * dt;
      const moved = G.world.move(this.pos.x, this.pos.z, sx, sz, this.radius);
      this.pos.x = moved.x; this.pos.z = moved.z;
      this.speedNow = 1.6;

      if (this.reactT <= 0) {
        if (this.ws.mag <= 0) {
          if (!this.ws.reloading && this.ws.reserve > 0) this.ws.startReload();
        } else if (this.pauseT > 0) {
          this.pauseT -= dt;
        } else if (this.burstLeft <= 0) {
          this.burstLeft = BOT.burstLen[0] + Math.floor(G.rng() * (BOT.burstLen[1] - BOT.burstLen[0]));
        } else if (this.ws.cooldown <= 0) {
          const dir = this._aimAt(this.target);
          G.gunplay.fire(this, this.ws, dir.x, dir.y, dir.z);
          this.burstLeft -= 1;
          if (this.burstLeft <= 0) this.pauseT = BOT.burstGap[0] + G.rng() * (BOT.burstGap[1] - BOT.burstGap[0]);
        }
      }
    } else if (this.state === 'investigate') {
      const arrived = this._followPath(dt);
      if (arrived) {
        this.scanT -= dt;
        this.yaw += dt * 0.9;
        if (this.scanT <= 0) {
          this.scanT = 2 + G.rng() * 3;
          this.state = G.bomb.state === 'planted' ? 'converge' : 'hold';
          if (this.state === 'hold') this._setGoal(this.post.x, this.post.z);
          else this._setGoal(G.bomb.x, G.bomb.z);
        }
      }
    } else if (this.state === 'converge') {
      this._setGoal(G.bomb.x, G.bomb.z);
      this._followPath(dt);
      const d = Math.hypot(this.pos.x - G.bomb.x, this.pos.z - G.bomb.z);
      if (d < 1.6 && G.bomb.state === 'planted') this.state = 'defuse';
    } else if (this.state === 'defuse') {
      const d = Math.hypot(this.pos.x - G.bomb.x, this.pos.z - G.bomb.z);
      if (G.bomb.state !== 'planted') this.state = 'hold';
      else if (d >= 1.8) this.state = 'converge';
      else {
        this.yaw = Math.atan2(-(G.bomb.x - this.pos.x), -(G.bomb.z - this.pos.z));
        G.bomb.defusing(this, dt);
      }
    } else {
      // hold: drift back to post, scan the lane
      const d = Math.hypot(this.pos.x - this.post.x, this.pos.z - this.post.z);
      if (d > 1.2) {
        this._setGoal(this.post.x, this.post.z);
        this._followPath(dt);
      } else {
        this.speedNow = 0;
        this.scanT += dt;
        this.yaw += Math.sin(this.scanT * 0.5) * dt * 0.4;
      }
    }

    if (this.state !== 'defuse') G.bomb.stopDefusing(this);
    this._syncMesh(dt);
  }
}

export class GuardSquad {
  constructor(G) {
    this.G = G;
    // posts: four watching A, four watching B, one roaming mid
    const posts = [
      { x: -24, z: -16 }, { x: -19, z: -12 }, { x: -26, z: -9 }, { x: -15, z: -16 },
      { x: 24, z: -16 }, { x: 19, z: -12 }, { x: 26, z: -9 }, { x: 15, z: -16 },
      { x: 0, z: -8 },
    ];
    this.guards = GUARD_NAMES.map((name, i) => new Guard(G, name, posts[i % posts.length]));
    this.posts = posts;
  }

  reset() {
    const G = this.G;
    this.guards.forEach((g, i) => {
      const spawn = G.spawns.guards[i % G.spawns.guards.length];
      const jitter = () => (G.rng() - 0.5) * 2;
      g.reset({ x: spawn.x + jitter(), z: spawn.z + jitter() * 0.5 }, this.posts[i % this.posts.length]);
    });
  }

  update(dt) {
    for (const g of this.guards) g.update(dt);
  }
}
