// The corner radar: a north-up 2D canvas minimap of the yard. A static underlay (walls,
// site pads, labels) is baked once; each frame only the blips are redrawn — the player dot
// with a view wedge, the living wardens, and the charge once it is planted. Read-only: the
// simulation never looks back at it.
import { PALETTE } from './palette.js';

const WORLD = { minX: -24, maxX: 24, minZ: -16, maxZ: 16 };

// Wall segments exactly as world.js lays them out (axis-aligned, world metres).
const WALLS = [
  [-24, -16, 24, -16], [24, -16, 24, 16], [24, 16, -24, 16], [-24, 16, -24, -16], // perimeter
  [-4, 16, -4, 4], [4, 16, 4, 4], [-4, 4, -1.5, 4], [1.5, 4, 4, 4],              // mid
  [-10.5, 12, -10.5, 2], [-18, 2, -12.5, 2], [-10.5, 2, -5, 2],                    // west lane
  [10.5, 12, 10.5, 6], [6.5, 6, 14, 6], [14, -2, 14, 6], [14, -14, 14, -2],        // east connector
];

const SITES = [
  { key: 'A', x: -15, z: -9, half: 3.6 },
  { key: 'B', x: 15, z: -9, half: 3.6 },
];

const SIZE = 148; // square canvas; CSS keeps it crisp
const PAD = 8;

export function createRadar(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const scale = (SIZE - PAD * 2) / Math.max(WORLD.maxX - WORLD.minX, WORLD.maxZ - WORLD.minZ);

  function px(x) { return PAD + (x - WORLD.minX) * scale; }
  function py(z) { return PAD + (z - WORLD.minZ) * scale; }

  // Static underlay, drawn once onto an offscreen canvas.
  const base = document.createElement('canvas');
  base.width = SIZE;
  base.height = SIZE;
  const b = base.getContext('2d');
  b.fillStyle = 'rgba(21, 23, 29, 0.82)';
  b.fillRect(0, 0, SIZE, SIZE);
  b.strokeStyle = PALETTE.hairline;
  b.lineWidth = 1;
  b.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
  b.strokeStyle = 'rgba(76, 74, 86, 0.9)';
  b.lineWidth = 2;
  for (const [x1, z1, x2, z2] of WALLS) {
    b.beginPath();
    b.moveTo(px(x1), py(z1));
    b.lineTo(px(x2), py(z2));
    b.stroke();
  }
  b.font = '600 9px ui-monospace, Menlo, monospace';
  b.textAlign = 'center';
  b.textBaseline = 'middle';
  for (const site of SITES) {
    b.strokeStyle = 'rgba(242, 136, 58, 0.75)';
    b.lineWidth = 1;
    b.strokeRect(px(site.x - site.half), py(site.z - site.half), site.half * 2 * scale, site.half * 2 * scale);
    b.fillStyle = PALETTE.accent;
    b.fillText(site.key, px(site.x), py(site.z));
  }
  b.fillStyle = PALETTE.muted;
  b.textAlign = 'left';
  b.fillText('N', 5, py(WORLD.minZ) + 1);

  // Dynamic layer: playerPos {x,z}, yaw, wardens [{x,z,alive,color}], bomb null | {x,z,blink}.
  function draw(playerPos, yaw, wardens, bomb) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(base, 0, 0);

    const pxp = px(playerPos.x);
    const pyp = py(playerPos.z);
    // yaw 0 faces north (-z), which is up on the radar.
    const forward = -yaw;
    ctx.fillStyle = 'rgba(243, 232, 214, 0.10)';
    ctx.beginPath();
    ctx.moveTo(pxp, pyp);
    ctx.arc(pxp, pyp, 26, forward - Math.PI / 2 - 0.42, forward - Math.PI / 2 + 0.42);
    ctx.closePath();
    ctx.fill();

    for (const w of wardens) {
      if (!w.alive) continue;
      ctx.fillStyle = PALETTE[w.color] || PALETTE.muted;
      ctx.beginPath();
      ctx.arc(px(w.x), py(w.z), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (bomb) {
      ctx.fillStyle = bomb.blink ? PALETTE.accent : PALETTE.brick;
      const bx = px(bomb.x);
      const by = py(bomb.z);
      ctx.fillRect(bx - 3, by - 3, 6, 6);
    }

    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(pxp, pyp, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pxp, pyp);
    ctx.lineTo(pxp + Math.sin(forward) * 8, pyp - Math.cos(forward) * 8);
    ctx.stroke();
  }

  return { draw };
}