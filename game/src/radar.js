// radar.js — the yard scan, top-left. A plan view of Emberline drawn from
// the real collider list, the two sites lettered, your heading wedge, your
// crew as green pips, and guards as red blips only while they're actually
// known: seen by you or a mate this moment, or heard through the walls a
// breath ago. The planted Ember flashes like it means it.
import { clamp } from './config.js';

export class Radar {
  constructor(G, canvas) {
    this.G = G;
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;
    this._knownT = 0;
    this._known = new Map(); // guard -> last known {x,z,t}
  }

  _pt(x, z) {
    const b = this.G.world.bounds;
    const sx = (this.w - 12) / (b.maxX - b.minX);
    const sz = (this.h - 12) / (b.maxZ - b.minZ);
    const s = Math.min(sx, sz);
    return [6 + (x - b.minX) * s, 6 + (z - b.minZ) * s];
  }

  update(dt) {
    const G = this.G;
    // refresh guard knowledge at 8 Hz — seen by any crew eye
    this._knownT -= dt;
    if (this._knownT <= 0) {
      this._knownT = 0.12;
      const eyes = [G.player, ...G.mates].filter((e) => e.alive);
      for (const guard of G.guards) {
        if (!guard.alive) continue;
        let seen = false;
        for (const e of eyes) {
          if (G.targets.canSee(e.pos.x, e.pos.y + e.eyeY, e.pos.z, guard.pos.x, guard.pos.y + 1.2, guard.pos.z)) {
            const d = Math.hypot(e.pos.x - guard.pos.x, e.pos.z - guard.pos.z);
            if (d < 34) { seen = true; break; }
          }
        }
        if (seen) this._known.set(guard, { x: guard.pos.x, z: guard.pos.z, t: G.time });
      }
    }

    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = 'rgba(8,12,20,0.85)';
    g.fillRect(0, 0, this.w, this.h);

    // walls from the live collider list
    g.strokeStyle = 'rgba(255,179,71,0.5)';
    g.fillStyle = 'rgba(255,179,71,0.12)';
    g.lineWidth = 1;
    for (const c of G.world.colliders) {
      if (c.y1 < 1.0) continue;
      const [x0, z0] = this._pt(c.x0, c.z0);
      const [x1, z1] = this._pt(c.x1, c.z1);
      g.fillRect(x0, z0, x1 - x0, z1 - z0);
      g.strokeRect(x0, z0, x1 - x0, z1 - z0);
    }

    // sites
    for (const s of G.world.sites) {
      const [x, z] = this._pt(s.cx, s.cz);
      g.strokeStyle = s.id === 'A' ? 'rgba(255,179,71,0.8)' : 'rgba(110,198,255,0.8)';
      g.setLineDash([3, 2]);
      const [hx, hz] = this._pt(s.cx + s.half, s.cz + s.half);
      g.strokeRect(x - (hx - x), z - (hz - z), (hx - x) * 2, (hz - z) * 2);
      g.setLineDash([]);
      g.fillStyle = s.id === 'A' ? '#ffb347' : '#6ec6ff';
      g.font = 'bold 11px Menlo, monospace';
      g.textAlign = 'center';
      g.fillText(s.id, x, z + 4);
    }

    // heard shots ring faintly where they happened
    for (const n of G.hearing.noises) {
      const age = G.hearing.now - n.t;
      if (age > 2.5 || (n.kind !== 'shot' && n.kind !== 'boom')) continue;
      const [x, z] = this._pt(n.x, n.z);
      g.strokeStyle = `rgba(255,107,94,${0.5 * (1 - age / 2.5)})`;
      g.beginPath();
      g.arc(x, z, 2 + age * 5, 0, Math.PI * 2);
      g.stroke();
    }

    // known guards: red blips, fading over two seconds
    for (const [guard, k] of this._known) {
      const age = G.time - k.t;
      if (age > 2 || !guard.alive) { this._known.delete(guard); continue; }
      const [x, z] = this._pt(k.x, k.z);
      g.fillStyle = `rgba(255,107,94,${1 - age / 2})`;
      g.beginPath();
      g.arc(x, z, 2.6, 0, Math.PI * 2);
      g.fill();
    }

    // the Ember: carried (small square on its carrier), dropped, or planted
    const bomb = G.bomb;
    if (bomb.state !== 'idle') {
      const [x, z] = this._pt(bomb.x, bomb.z);
      if (bomb.state === 'planted') {
        const blink = Math.sin(G.time * 9) > 0;
        g.fillStyle = blink ? '#ffd080' : '#ff7a2f';
        g.beginPath();
        g.arc(x, z, 4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(255,122,47,0.7)';
        g.beginPath();
        g.arc(x, z, 7, 0, Math.PI * 2);
        g.stroke();
      } else {
        g.fillStyle = '#ffb347';
        g.fillRect(x - 2.5, z - 2.5, 5, 5);
      }
    }

    // mates: green pips
    for (const m of G.mates) {
      if (!m.alive) continue;
      const [x, z] = this._pt(m.pos.x, m.pos.z);
      g.fillStyle = '#7dd87d';
      g.beginPath();
      g.arc(x, z, 2.4, 0, Math.PI * 2);
      g.fill();
    }

    // you: amber wedge with a heading tick
    if (G.player.alive) {
      const p = G.player;
      const [x, z] = this._pt(p.pos.x, p.pos.z);
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw); // facing on the plan
      g.save();
      g.translate(x, z);
      g.rotate(Math.atan2(fx, -fz));
      g.fillStyle = '#ffb347';
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(3.4, 4);
      g.lineTo(-3.4, 4);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
}
