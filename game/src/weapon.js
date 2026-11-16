// weapon.js — the gunplay every fighter shares. WeaponState tracks one gun
// (mag, reserve, heat, where it is in its fixed recoil pattern). Gunplay
// resolves a shot: spread from the heat model, true hitscan against world +
// capsules, falloff and headshot bonus, armor soak, then the visuals — a
// tracer, a muzzle blink, an impact spark — and the noise every guard hears.
import * as THREE from 'three';
import { WEAPONS, clamp } from './config.js';

const DEG = Math.PI / 180;

export class WeaponState {
  constructor(id) {
    this.def = WEAPONS[id];
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
    this.heat = 0;
    this.patternIdx = 0;
    this.cooldown = 0;
    this.reloadT = 0;
    this.idleT = 0;
  }

  get reloading() { return this.reloadT > 0; }
  get ready() { return this.cooldown <= 0 && this.reloadT <= 0 && this.mag > 0; }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.idleT += dt;
    if (this.idleT > 0.7) this.patternIdx = 0; // pattern restarts once you settle
    this.heat = Math.max(0, this.heat - this.def.spread.coolPerSec * dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = this.def.mag - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
      }
    }
  }

  startReload() {
    if (this.reloadT > 0 || this.mag >= this.def.mag || this.reserve <= 0) return false;
    this.reloadT = this.def.reload;
    return true;
  }

  // degrees of cone spread right now, given how fast the holder moves/scopes
  spreadDeg(holder) {
    const s = this.def.spread;
    let deg = holder.scoped && s.scoped !== undefined ? s.scoped : s.base;
    deg += Math.min(holder.speedNow || 0, 6) * s.move * 0.35;
    deg += this.heat;
    return deg;
  }

  // recoil kick [pitch, yaw] in degrees for the next shot in the pattern
  kick() {
    const p = this.def.pattern[this.patternIdx % this.def.pattern.length];
    return p;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.sparks = [];
    this.flashes = [];
    this._tracerMat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 });
    this._sparkGeo = new THREE.SphereGeometry(0.09, 6, 5);
    this._sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true });
    this._flashGeo = new THREE.SphereGeometry(0.1, 6, 5);
    this._flashMat = new THREE.MeshBasicMaterial({
      color: 0xffc060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
  }

  tracer(x0, y0, z0, x1, y1, z1) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1),
    ]);
    const line = new THREE.Line(geo, this._tracerMat.clone());
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  spark(x, y, z, hot = false) {
    const m = new THREE.Mesh(this._sparkGeo, this._sparkMat.clone());
    if (hot) m.material.color.setHex(0xff5a3a);
    m.position.set(x, y, z);
    this.scene.add(m);
    this.sparks.push({ m, life: 0.22, max: 0.22 });
  }

  flash(x, y, z) {
    const m = new THREE.Mesh(this._flashGeo, this._flashMat.clone());
    m.position.set(x, y, z);
    this.scene.add(m);
    this.flashes.push({ m, life: 0.05 });
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      const k = Math.max(0, s.life / s.max);
      s.m.scale.setScalar(0.5 + (1 - k) * 2.2);
      s.m.material.opacity = k;
      if (s.life <= 0) { this.scene.remove(s.m); this.sparks.splice(i, 1); }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      f.m.material.opacity = Math.max(0, f.life / 0.05);
      if (f.life <= 0) { this.scene.remove(f.m); this.flashes.splice(i, 1); }
    }
  }
}

export class Gunplay {
  constructor(G) {
    this.G = G;
    this.effects = new Effects(G.scene);
    this._u = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  // One honest shot. holder: {pos, eyeY, team, name, stats, alive, isPlayer,
  // speedNow, scoped, vest, helm}. dir must be normalized.
  // Returns {hit:'entity'|'wall'|null, part, killed, entity} for feedback.
  fire(holder, ws, dx, dy, dz) {
    const G = this.G;
    const def = ws.def;
    ws.mag -= 1;
    ws.cooldown = 60 / def.rpm;
    ws.idleT = 0;
    ws.heat = Math.min(ws.heat + def.spread.heatPerShot, def.spread.heatMax);

    // cone spread around the aim direction
    const spread = ws.spreadDeg(holder) * DEG;
    const rng = G.rng;
    this._d.set(dx, dy, dz);
    this._u.set(-dz, 0, dx).normalize();
    if (this._u.lengthSq() < 0.01) this._u.set(1, 0, 0);
    this._w.crossVectors(this._d, this._u).normalize();
    const ang = rng() * Math.PI * 2;
    const rad = Math.tan(spread) * Math.sqrt(rng());
    const fx = dx + (this._u.x * Math.cos(ang) + this._w.x * Math.sin(ang)) * rad;
    const fy = dy + (this._u.y * Math.cos(ang) + this._w.y * Math.sin(ang)) * rad;
    const fz = dz + (this._u.z * Math.cos(ang) + this._w.z * Math.sin(ang)) * rad;
    const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);

    const ox = holder.pos.x, oy = holder.pos.y + holder.eyeY, oz = holder.pos.z;
    const hit = G.targets.hitscan(ox, oy, oz, fx / fl, fy / fl, fz / fl, 140, {
      team: holder.team, exclude: holder,
    });

    // noise: every guard in radius hears it, walls muffle it
    G.hearing.emit(ox, oy, oz, def.noise, 'shot');

    // sound: full volume for the player, distance-faded otherwise
    let dist01 = 0;
    if (!holder.isPlayer && G.player) {
      const p = G.player.pos;
      const dd = Math.hypot(p.x - ox, p.z - oz);
      dist01 = clamp(dd / def.noise, 0, 1);
    }
    G.sound.shot(def.id, dist01);

    // visuals: muzzle a touch forward so the tracer leaves the barrel
    const mx = ox + dx * 1.0, my = oy + dy * 1.0 - 0.14, mz = oz + dz * 1.0;
    this.effects.flash(mx, my, mz);
    const endT = hit ? hit.t : 140;
    this.effects.tracer(mx, my, mz, ox + (fx / fl) * endT, oy + (fy / fl) * endT, oz + (fz / fl) * endT);

    if (!hit) return { hit: null };
    if (hit.kind === 'wall') {
      this.effects.spark(hit.x, hit.y, hit.z);
      return { hit: 'wall' };
    }

    // entity hit: falloff, headshot bonus, armor soak
    const victim = hit.entity;
    let dmg = def.damage;
    const f = def.falloff;
    if (hit.t > f.start) dmg *= hit.t >= f.end ? f.min : 1 - (1 - f.min) * ((hit.t - f.start) / (f.end - f.start));
    if (hit.part === 'head') {
      dmg *= def.headMult;
      if (victim.helm) dmg *= 0.5;
    } else if (victim.vest) {
      dmg *= 0.6;
    }
    dmg = Math.round(dmg);
    this.effects.spark(hit.x, hit.y, hit.z, true);
    victim.stats.dmg += 0; // victim unchanged; credit goes to the shooter
    holder.stats.dmg += dmg;
    const killed = victim.takeDamage(dmg, hit.part, holder);
    if (!holder.isPlayer) {
      // the player flinches only when the shot actually lands on them
    } else {
      G.sound.hit(hit.part === 'head');
      G.hud.hitmarker(hit.part === 'head');
    }
    if (killed) {
      holder.stats.k += 1;
      G.rounds.onKill(holder, victim, hit.part);
    }
    return { hit: 'entity', part: hit.part, killed, entity: victim };
  }

  update(dt) {
    this.effects.update(dt);
  }
}
