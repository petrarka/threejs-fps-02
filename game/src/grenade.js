// grenade.js — the FIREPOT: a clay pot of kiln wash. Thrown in an honest
// arc, it bounces off clay and ash with a dull tok, the fuse hiss speeds up,
// and then the kilnwash burst: a blast that hurts what it can see, plus a
// burning puddle that denies the ground it landed on for six seconds.
import * as THREE from 'three';
import { FIREPOT, clamp } from './config.js';
import { lampPoolTexture } from './palette.js';

const GRAV = 16;

export class Grenades {
  constructor(G) {
    this.G = G;
    this.live = [];   // flying pots
    this.washes = []; // burning puddles
    this.flashes = []; // burst lights fading out
    this._potGeo = new THREE.SphereGeometry(0.14, 8, 6);
    this._potMat = new THREE.MeshLambertMaterial({ color: 0x5a3226, emissive: 0xff5a1a, emissiveIntensity: 0.8 });
    this._poolTex = lampPoolTexture();
  }

  throwBy(holder, dx, dy, dz) {
    const G = this.G;
    const m = new THREE.Mesh(this._potGeo, this._potMat.clone());
    const ox = holder.pos.x + dx * 0.5;
    const oy = holder.pos.y + holder.eyeY - 0.1;
    const oz = holder.pos.z + dz * 0.5;
    m.position.set(ox, oy, oz);
    G.scene.add(m);
    const up = 0.35; // a bit of loft so the arc reads
    this.live.push({
      m, x: ox, y: oy, z: oz,
      vx: dx * FIREPOT.throwSpeed, vy: dy * FIREPOT.throwSpeed + up * FIREPOT.throwSpeed * 0.5, vz: dz * FIREPOT.throwSpeed,
      fuse: FIREPOT.fuse, team: holder.team, owner: holder,
    });
    G.sound.bounce();
  }

  _explode(p) {
    const G = this.G;
    G.scene.remove(p.m);
    // burst light: a white-hot instant, then a second of afterglow
    const blast = new THREE.PointLight(0xffc880, 90, 26, 1.7);
    blast.position.set(p.x, p.y + 1.2, p.z);
    G.scene.add(blast);
    this.flashes.push({ light: blast, life: 0.6, max: 0.6, peak: 90 });
    // flash + sparks
    G.gunplay.effects.flash(p.x, p.y + 0.2, p.z);
    for (let i = 0; i < 10; i++) {
      G.gunplay.effects.spark(
        p.x + (G.rng() - 0.5) * 1.6, p.y + 0.2 + G.rng() * 1.2, p.z + (G.rng() - 0.5) * 1.6, true);
    }
    // scorch pool
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(FIREPOT.washRadius * 2.4, FIREPOT.washRadius * 2.4),
      new THREE.MeshBasicMaterial({ map: this._poolTex, color: 0xff5a20, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(p.x, 0.04, p.z);
    G.scene.add(pool);

    // blast damage: falloff with distance, walls soak half
    for (const e of G.targets.list) {
      if (!e.alive) continue;
      if (e.team === p.team && e !== p.owner) continue; // no crew-on-crew griefing
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > FIREPOT.blastRadius) continue;
      let dmg = FIREPOT.maxDamage * (1 - d / FIREPOT.blastRadius);
      const clear = G.targets.canSee(p.x, p.y + 0.3, p.z, e.pos.x, e.pos.y + 1.0, e.pos.z);
      if (!clear) dmg *= 0.4;
      dmg = Math.round(dmg);
      if (dmg <= 0) continue;
      if (e === p.owner) dmg = Math.round(dmg * 0.5);
      p.owner.stats.dmg += dmg;
      const killed = e.takeDamage(dmg, 'body', p.owner);
      if (killed) { p.owner.stats.k += 1; G.rounds.onKill(p.owner, e, 'body'); }
    }

    G.hearing.emit(p.x, 1, p.z, 60, 'boom');
    const pl = G.player.pos;
    G.sound.explosion(clamp(Math.hypot(pl.x - p.x, pl.z - p.z) / 60, 0, 1));

    // the kilnwash puddle: six seconds of "do not stand here"
    const washLight = new THREE.PointLight(0xff7a30, 10, 11, 1.8);
    washLight.position.set(p.x, 0.8, p.z);
    G.scene.add(washLight);
    const flames = [];
    for (let i = 0; i < 6; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.7, 5),
        new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.85 })
      );
      const a = (i / 6) * Math.PI * 2;
      cone.position.set(p.x + Math.cos(a) * FIREPOT.washRadius * 0.55, 0.35, p.z + Math.sin(a) * FIREPOT.washRadius * 0.55);
      G.scene.add(cone);
      flames.push(cone);
    }
    this.washes.push({ x: p.x, z: p.z, t: FIREPOT.washDuration, pool, flames, light: washLight, tick: 0 });
  }

  update(dt) {
    const G = this.G;
    // burst lights fading
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      f.light.intensity = Math.max(0, (f.life / f.max)) * f.peak;
      if (f.life <= 0) { G.scene.remove(f.light); this.flashes.splice(i, 1); }
    }
    // flying pots
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.fuse -= dt;
      if (p.fuse <= 0) {
        this.live.splice(i, 1);
        this._explode(p);
        continue;
      }
      p.vy -= GRAV * dt;
      let nx = p.x + p.vx * dt;
      let ny = p.y + p.vy * dt;
      let nz = p.z + p.vz * dt;
      // clay bounce: floor, then walls axis-separated
      if (ny < 0.14) {
        ny = 0.14;
        if (Math.abs(p.vy) > 1.2) { G.sound.bounce(); G.hearing.emit(p.x, 0.4, p.z, 12, 'bounce'); }
        p.vy = -p.vy * FIREPOT.bounceDamping;
        p.vx *= 0.7; p.vz *= 0.7;
      }
      if (G.world.collides(nx, p.z, 0.15)) { p.vx = -p.vx * FIREPOT.bounceDamping; G.sound.bounce(); nx = p.x; }
      if (G.world.collides(nx, nz, 0.15)) { p.vz = -p.vz * FIREPOT.bounceDamping; G.sound.bounce(); nz = p.z; }
      p.x = nx; p.y = ny; p.z = nz;
      p.m.position.set(nx, ny, nz);
      // fuse hiss: the pot's seam glows harder as it runs out
      p.m.material.emissiveIntensity = 0.6 + (1 - p.fuse / FIREPOT.fuse) * 2.4;
    }
    // burning puddles
    for (let i = this.washes.length - 1; i >= 0; i--) {
      const w = this.washes[i];
      w.t -= dt;
      w.tick -= dt;
      const k = clamp(w.t / FIREPOT.washDuration, 0, 1);
      w.pool.material.opacity = 0.25 + 0.45 * k;
      w.light.intensity = (6 + 4 * Math.sin(G.time * 13)) * (0.3 + 0.7 * k);
      w.flames.forEach((f, j) => {
        const s = (0.7 + 0.5 * Math.sin(G.time * 11 + j * 2.1)) * (0.4 + 0.6 * k);
        f.scale.set(s, s * (1 + 0.3 * Math.sin(G.time * 17 + j)), s);
      });
      if (w.tick <= 0) {
        w.tick = 0.5;
        for (const e of G.targets.list) {
          if (!e.alive) continue;
          if (Math.hypot(e.pos.x - w.x, e.pos.z - w.z) < FIREPOT.washRadius) {
            const killed = e.takeDamage(Math.round(FIREPOT.washDps * 0.5), 'body', null);
            if (killed) G.rounds.onKill(null, e, 'body');
          }
        }
      }
      if (w.t <= 0) {
        G.scene.remove(w.pool);
        G.scene.remove(w.light);
        w.flames.forEach((f) => G.scene.remove(f));
        this.washes.splice(i, 1);
      }
    }
  }

  reset() {
    for (const p of this.live) this.G.scene.remove(p.m);
    for (const w of this.washes) { this.G.scene.remove(w.pool); this.G.scene.remove(w.light); w.flames.forEach((f) => this.G.scene.remove(f)); }
    for (const f of this.flashes) this.G.scene.remove(f.light);
    this.live.length = 0;
    this.washes.length = 0;
    this.flashes.length = 0;
  }
}
