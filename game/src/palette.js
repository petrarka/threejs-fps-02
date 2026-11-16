// palette.js — the Emberline look: one place for every colour and the
// canvas-painted textures (ground ash, kiln brick, clay wall, crate wood,
// site letters, lamp glow pool). No image files; everything is painted here.
import * as THREE from 'three';

export const PAL = {
  night: 0x0c1220,
  fog: 0x141a2a,
  ember: 0xffb347,
  emberHot: 0xff7a2f,
  emberDeep: 0xb34418,
  ashGround: 0x3a3640,
  clayWall: 0x6e5a4a,
  kilnBrick: 0x4a3230,
  crateWood: 0x7a6238,
  sootMetal: 0x2c313c,
  crewBlue: 0x7dd87d,
  guardRed: 0xff6b5e,
  siteA: 0xffb347,
  siteB: 0x6ec6ff,
};

// deterministic tiny hash noise so textures are stable frame to frame
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function canvasTexture(size, paint, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  paint(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function speckle(g, size, base, dots, seed) {
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (const [color, count, r0, r1] of dots) {
    g.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = hash(i, seed, 1) * size;
      const y = hash(i, seed, 2) * size;
      const r = r0 + hash(i, seed, 3) * (r1 - r0);
      g.globalAlpha = 0.12 + hash(i, seed, 4) * 0.25;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

export function groundTexture() {
  return canvasTexture(256, (g, s) => {
    speckle(g, s, '#3a3640', [['#2c2830', 240, 1, 3], ['#4a4450', 200, 1, 2.4], ['#5a4632', 60, 1, 2]], 7);
    // faint wagon ruts
    g.strokeStyle = 'rgba(20,18,24,0.35)';
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, hash(i, 9, 1) * s);
      g.bezierCurveTo(s * 0.3, hash(i, 9, 2) * s, s * 0.7, hash(i, 9, 3) * s, s, hash(i, 9, 4) * s);
      g.stroke();
    }
  }, 18);
}

export function clayTexture() {
  return canvasTexture(128, (g, s) => {
    speckle(g, s, '#6e5a4a', [['#5d4b3d', 130, 1, 3], ['#81695a', 110, 1, 2.5]], 21);
    g.strokeStyle = 'rgba(40,30,24,0.4)';
    g.lineWidth = 2;
    for (let y = 0; y < s; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
  }, 2);
}

export function brickTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#4a3230';
    g.fillRect(0, 0, s, s);
    const bh = 16, bw = 32;
    for (let y = 0, row = 0; y < s; y += bh, row++) {
      for (let x = -bw; x < s + bw; x += bw) {
        const off = row % 2 ? bw / 2 : 0;
        const v = hash(x, y, 5) * 18 - 9;
        g.fillStyle = `rgb(${74 + v},${50 + v},${48 + v})`;
        g.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
    g.fillStyle = 'rgba(255,140,60,0.08)'; // kiln heat kissed bricks near base
    g.fillRect(0, s - 20, s, 20);
  }, 3);
}

export function woodTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#7a6238';
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      const v = hash(x, 3, 6) * 20 - 10;
      g.fillStyle = `rgb(${122 + v},${98 + v},${56 + v})`;
      g.fillRect(x + 1, 0, 14, s);
      g.strokeStyle = 'rgba(60,44,22,0.5)';
      g.strokeRect(x + 0.5, 0.5, 15, s - 1);
    }
    g.strokeStyle = 'rgba(50,36,18,0.6)';
    for (let i = 0; i < 26; i++) {
      const x = hash(i, 4, 7) * s, y = hash(i, 4, 8) * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y + 10 * hash(i, 4, 9)); g.stroke();
    }
  }, 1);
}

export function metalTexture() {
  return canvasTexture(64, (g, s) => {
    speckle(g, s, '#2c313c', [['#22262f', 90, 1, 2], ['#3a4150', 70, 1, 2]], 33);
  }, 1);
}

// big site letter painted on the ground: "A" / "B" in chalky paint
export function siteLetterTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = color;
  g.globalAlpha = 0.85;
  g.lineWidth = 7;
  g.setLineDash([22, 12]);
  g.strokeRect(18, 18, 220, 220);
  g.setLineDash([]);
  g.fillStyle = color;
  g.font = 'bold 170px Menlo, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 128, 140);
  // weathering: rub holes in the paint
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.25 + hash(i, 2, 11) * 0.5;
    g.beginPath();
    g.arc(hash(i, 2, 12) * 256, hash(i, 2, 13) * 256, 1 + hash(i, 2, 14) * 4, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// warm radial pool of lamplight for the ground under each ember lamp
export function lampPoolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,170,80,0.55)');
  grad.addColorStop(0.5, 'rgba(255,130,50,0.18)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// night sky gradient with a smear of kiln glow on the horizon
export function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#04060d');
  grad.addColorStop(0.45, '#0c1220');
  grad.addColorStop(0.75, '#1c2030');
  grad.addColorStop(0.92, '#3a2a28');
  grad.addColorStop(1.0, '#5a3626');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
