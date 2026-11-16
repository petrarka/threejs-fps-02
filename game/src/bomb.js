// bomb.js — the Ember charge itself. Mason (or you, if you pick it up)
// carries it to a site; planting is a four-second channel in the open; once
// it's in, the fuse ticks louder and faster while every living guard
// converges, and one guard kneeling beside it for five seconds defuses it.
// Detonation wins the round for the crew; a defuse or the clock wins it for
// the guards.
import * as THREE from 'three';
import { MATCH, clamp } from './config.js';

export class Bomb {
  constructor(G) {
    this.G = G;
    const geo = new THREE.OctahedronGeometry(0.22, 0);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    this.light = new THREE.PointLight(0xff8a30, 0, 9, 1.8);
    G.scene.add(this.mesh);
    G.scene.add(this.light);
    this.state = 'idle'; // carried | dropped | planted | defused | detonated
    this.carrier = null;
    this.x = 0; this.z = 0;
    this.site = null;
    this.fuse = 0;
    this.plantT = 0;      // channel progress of whoever is planting
    this.planter = null;
    this.defuseT = 0;
    this.defuser = null;
    this._tick = 0;
    this._beepNoise = 0;
    this.mesh.visible = false;
  }

  reset(carrier) {
    this.state = 'carried';
    this.carrier = carrier;
    this.site = null;
    this.planter = null;
    this.defuser = null;
    this.plantT = 0;
    this.defuseT = 0;
    this.fuse = MATCH.fuseTime;
    this.mesh.visible = true;
    this.light.intensity = 0;
  }

  dropAt(x, z) {
    this.state = 'dropped';
    this.carrier = null;
    this.x = x; this.z = z;
    this.planter = null;
    this.plantT = 0;
  }

  pickup(holder) {
    this.state = 'carried';
    this.carrier = holder;
    holder.hasBomb = true;
    this.G.hud.feed(`${holder.name} picks up the Ember`, true);
  }

  // channel management — call every frame the planter holds the plant key
  planting(holder, dt) {
    if (this.state !== 'carried' || this.carrier !== holder) return 0;
    const site = this.G.world.onSite(holder.pos.x, holder.pos.z);
    if (!site) { this.plantT = 0; this.planter = null; return 0; }
    if (this.planter !== holder) {
      this.planter = holder;
      this.plantT = 0;
      this._plantBeep = 0;
      this.G.hearing.emit(holder.pos.x, 1, holder.pos.z, 18, 'plant');
    }
    this.plantT += dt;
    this._plantBeep -= dt;
    if (this._plantBeep <= 0) {
      this._plantBeep = 0.45;
      this.G.sound.plantBeep();
    }
    if (this.plantT >= MATCH.plantTime) {
      this.state = 'planted';
      this.site = site;
      this.x = holder.pos.x; this.z = holder.pos.z;
      this.carrier = null;
      holder.hasBomb = false;
      this.planter = null;
      this.fuse = MATCH.fuseTime;
      this.G.sound.planted();
      this.G.hearing.emit(this.x, 1, this.z, 40, 'planted');
      this.G.rounds.onPlanted(holder, site);
    }
    return clamp(this.plantT / MATCH.plantTime, 0, 1);
  }

  stopPlanting() {
    this.planter = null;
    this.plantT = 0;
  }

  // guard channel beside the planted charge
  defusing(guard, dt) {
    if (this.state !== 'planted') return 0;
    if (this.defuser !== guard) { this.defuser = guard; this.defuseT = 0; }
    this.defuseT += dt;
    if (this.defuseT >= MATCH.defuseTime) {
      this.state = 'defused';
      this.G.sound.defused();
      this.G.rounds.onDefused(guard);
    }
    return clamp(this.defuseT / MATCH.defuseTime, 0, 1);
  }

  stopDefusing(guard) {
    if (this.defuser === guard) { this.defuser = null; this.defuseT = 0; }
  }

  update(dt) {
    const G = this.G;
    if (this.state === 'carried' && this.carrier) {
      const c = this.carrier;
      this.x = c.pos.x; this.z = c.pos.z;
      this.mesh.visible = !c.isPlayer; // your own hands are off-screen
      this.mesh.position.set(c.pos.x + 0.3, c.pos.y + 0.9, c.pos.z);
      this.light.intensity = 2.5;
      this.light.position.copy(this.mesh.position);
    } else if (this.state === 'dropped') {
      this.mesh.visible = true;
      this.mesh.position.set(this.x, 0.3 + Math.sin(G.time * 2.4) * 0.06, this.z);
      this.mesh.rotation.y += dt * 1.5;
      this.light.intensity = 4;
      this.light.position.set(this.x, 0.8, this.z);
    } else if (this.state === 'planted') {
      this.fuse -= dt;
      this.mesh.visible = true;
      this.mesh.position.set(this.x, 0.24, this.z);
      // the blink and the tick hurry up as the fuse burns
      const urgency = 1 - clamp(this.fuse / MATCH.fuseTime, 0, 1);
      const blink = 2 + urgency * 10;
      const on = Math.sin(G.time * blink * Math.PI) > 0;
      this.mesh.material.color.setHex(on ? 0xffd080 : 0xb34418);
      this.light.intensity = on ? 7 : 1.5;
      this.light.position.set(this.x, 0.7, this.z);
      this._tick -= dt;
      if (this._tick <= 0) {
        this._tick = Math.max(0.18, 1 - urgency * 0.85);
        G.sound.fuseTick(urgency > 0.6);
      }
      this._beepNoise -= dt;
      if (this._beepNoise <= 0) {
        this._beepNoise = 1.2;
        G.hearing.emit(this.x, 1, this.z, 14, 'beep');
      }
      if (this.fuse <= 0) {
        this.state = 'detonated';
        // the yard flashes white-hot for a moment
        this.light.intensity = 60;
        this.light.position.set(this.x, 3, this.z);
        G.gunplay.effects.flash(this.x, 1.2, this.z);
        for (let i = 0; i < 14; i++) {
          G.gunplay.effects.spark(this.x + (G.rng() - 0.5) * 3, 0.4 + G.rng() * 2.4, this.z + (G.rng() - 0.5) * 3, true);
        }
        G.sound.explosion(clamp(Math.hypot(G.player.pos.x - this.x, G.player.pos.z - this.z) / 60, 0, 1));
        G.rounds.onDetonated();
      }
    } else if (this.state === 'defused' || this.state === 'detonated') {
      this.mesh.material.color.setHex(this.state === 'defused' ? 0x445566 : 0x1a1a1a);
      this.light.intensity = Math.max(0, this.light.intensity - dt * 30);
    }
  }
}
