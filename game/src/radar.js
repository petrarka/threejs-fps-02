// North-up tactical radar. The static walls are baked from the actual map; live
// contacts are supplied by the simulation, with cyan crew and ember guard marks.
import { PALETTE } from './palette.js';
import { SITES } from './config.js';

const SIZE = 184;
const PAD = 15;
const SCALE = (SIZE - PAD * 2) / 48;

export function createRadar(canvas, world) {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  const base = document.createElement('canvas');
  base.width = base.height = SIZE;
  const g = base.getContext('2d');
  const x = (value) => PAD + (value + 24) * SCALE;
  const y = (value) => PAD + (value + 16) * SCALE;

  g.fillStyle = 'rgba(13,17,23,.93)';
  g.fillRect(0, 0, SIZE, SIZE);
  g.strokeStyle = 'rgba(127,208,200,.08)';
  g.lineWidth = 1;
  for (let i = -20; i <= 20; i += 5) {
    g.beginPath(); g.moveTo(x(i), y(-16)); g.lineTo(x(i), y(16)); g.stroke();
  }
  for (let i = -15; i <= 15; i += 5) {
    g.beginPath(); g.moveTo(x(-24), y(i)); g.lineTo(x(24), y(i)); g.stroke();
  }
  for (const site of SITES) {
    g.fillStyle = 'rgba(255,138,61,.09)';
    g.fillRect(x(site.x - 3.4), y(site.z - 3.4), 6.8 * SCALE, 6.8 * SCALE);
    g.strokeStyle = 'rgba(255,138,61,.55)';
    g.strokeRect(x(site.x - 3.4), y(site.z - 3.4), 6.8 * SCALE, 6.8 * SCALE);
    g.fillStyle = PALETTE.ember;
    g.font = '700 12px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText(site.id, x(site.x), y(site.z) + 4);
  }
  g.strokeStyle = '#626570';
  g.lineWidth = 2.4;
  g.lineCap = 'square';
  for (const wall of world.radarWalls) {
    g.beginPath();
    g.moveTo(x(wall[0]), y(wall[1]));
    g.lineTo(x(wall[2]), y(wall[3]));
    g.stroke();
  }
  g.fillStyle = PALETTE.muted;
  g.font = '600 9px ui-monospace, monospace';
  g.textAlign = 'left';
  g.fillText('N', 5, 11);

  function dot(px, py, color, radius = 2.6, square = false) {
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 5;
    if (square) context.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    else {
      context.beginPath();
      context.arc(px, py, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;
  }

  function draw(player, yaw, guards, mates, bomb) {
    context.clearRect(0, 0, SIZE, SIZE);
    context.drawImage(base, 0, 0);
    const px = x(player.x);
    const py = y(player.z);
    const angle = -yaw - Math.PI / 2;
    context.fillStyle = 'rgba(245,234,216,.08)';
    context.beginPath();
    context.moveTo(px, py);
    context.arc(px, py, 31, angle - 0.48, angle + 0.48);
    context.closePath();
    context.fill();

    for (const guard of guards) {
      if (!guard.alive) continue;
      // Patrols stay off radar until they make contact or answer the objective.
      if (!['engage', 'defuse', 'investigate'].includes(guard.mode)) continue;
      const p = guard.group.position;
      dot(x(p.x), y(p.z), PALETTE.ember, 2.5, true);
    }
    for (const mate of mates) {
      if (!mate.alive) continue;
      const p = mate.group.position;
      dot(x(p.x), y(p.z), PALETTE.friendly, 2.4);
    }
    if (bomb) dot(x(bomb.x), y(bomb.z), bomb.blink ? PALETTE.paper : PALETTE.ember, 3.5, true);

    context.save();
    context.translate(px, py);
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
