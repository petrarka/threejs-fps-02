// North-up tactical radar: the wall plan is baked once from the live map, and
// contacts come from the simulation each frame — cyan for crew, ember for
// guards who have revealed themselves by engaging, hunting or defusing.
import { PALETTE } from './palette.js';
import { SITES } from './config.js';

const SIZE = 184;
const PAD = 15;
const SCALE = (SIZE - PAD * 2) / 48;

export function createRadar(canvas, world) {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  const px = (value) => PAD + (value + 24) * SCALE;
  const py = (value) => PAD + (value + 16) * SCALE;

  // Static underlay: grid, sites, wall plan, north tick — painted once.
  const base = document.createElement('canvas');
  base.width = base.height = SIZE;
  const g = base.getContext('2d');
  g.fillStyle = 'rgba(13,17,23,.93)';
  g.fillRect(0, 0, SIZE, SIZE);
  g.strokeStyle = 'rgba(127,208,200,.08)';
  g.lineWidth = 1;
  for (let i = -20; i <= 20; i += 5) {
    g.beginPath(); g.moveTo(px(i), py(-16)); g.lineTo(px(i), py(16)); g.stroke();
  }
  for (let i = -15; i <= 15; i += 5) {
    g.beginPath(); g.moveTo(px(-24), py(i)); g.lineTo(px(24), py(i)); g.stroke();
  }
  for (const site of SITES) {
    g.fillStyle = 'rgba(255,138,61,.09)';
    g.fillRect(px(site.x - 3.4), py(site.z - 3.4), 6.8 * SCALE, 6.8 * SCALE);
    g.strokeStyle = 'rgba(255,138,61,.55)';
    g.strokeRect(px(site.x - 3.4), py(site.z - 3.4), 6.8 * SCALE, 6.8 * SCALE);
    g.fillStyle = PALETTE.ember;
    g.font = '700 12px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText(site.id, px(site.x), py(site.z) + 4);
  }
  g.strokeStyle = '#626570';
  g.lineWidth = 2.4;
  g.lineCap = 'square';
  for (const wall of world.radarWalls) {
    g.beginPath();
    g.moveTo(px(wall[0]), py(wall[1]));
    g.lineTo(px(wall[2]), py(wall[3]));
    g.stroke();
  }
  g.fillStyle = PALETTE.muted;
  g.font = '600 9px ui-monospace, monospace';
  g.textAlign = 'left';
  g.fillText('N', 5, 11);

  function mark(x, y, tint, radius = 2.6, square = false) {
    context.fillStyle = tint;
    context.shadowColor = tint;
    context.shadowBlur = 5;
    if (square) context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    else {
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;
  }

  function draw(player, yaw, guards, mates, bomb) {
    context.clearRect(0, 0, SIZE, SIZE);
    context.drawImage(base, 0, 0);
    const cx = px(player.x);
    const cy = py(player.z);
    const angle = -yaw - Math.PI / 2;

    // View cone ahead of the player wedge.
    context.fillStyle = 'rgba(245,234,216,.08)';
    context.beginPath();
    context.moveTo(cx, cy);
    context.arc(cx, cy, 31, angle - 0.48, angle + 0.48);
    context.closePath();
    context.fill();

    for (const guard of guards) {
      if (!guard.alive) continue;
      // Quiet patrols stay off the scope until they act on something.
      if (!['engage', 'defuse', 'investigate'].includes(guard.mode)) continue;
      const p = guard.group.position;
      mark(px(p.x), py(p.z), PALETTE.ember, 2.5, true);
    }
    for (const mate of mates) {
      if (!mate.alive) continue;
      const p = mate.group.position;
      mark(px(p.x), py(p.z), PALETTE.friendly, 2.4);
    }
    if (bomb) mark(px(bomb.x), py(bomb.z), bomb.blink ? PALETTE.paper : PALETTE.ember, 3.5, true);

    context.save();
    context.translate(cx, cy);
    context.rotate(angle + Math.PI / 2);
    context.fillStyle = PALETTE.paper;
    context.shadowColor = PALETTE.paper;
    context.shadowBlur = 6;
    context.beginPath();
    context.moveTo(0, -6);
    context.lineTo(4.5, 5);
    context.lineTo(0, 3);
    context.lineTo(-4.5, 5);
    context.closePath();
    context.fill();
    context.restore();
  }

  return { draw };
}
