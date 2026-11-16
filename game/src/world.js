// Emberline is an original, compact three-lane kiln yard. All surface art is
// drawn into canvases here; geometry, collision, ballistics and navigation share
// the same box descriptions so what you see is what stops you.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './config.js';

function canvasTexture(size, painter, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  painter(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function speckle(context, size, count, color) {
  context.fillStyle = color;
  let seed = 712367;
  for (let i = 0; i < count; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % size;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = seed % size;
    const w = 1 + (seed % 4);
    context.fillRect(x, y, w, 1 + (seed % 2));
  }
}

function labelTexture(title, subtitle, accent = PALETTE.ember) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.fillStyle = 'rgba(16,20,27,.88)';
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = accent;
  g.fillRect(0, 0, 18, 256);
  g.fillRect(46, 40, 110, 5);
  g.fillStyle = PALETTE.paper;
  g.font = '700 78px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(title, 46, 116);
  g.fillStyle = PALETTE.muted;
  g.font = '500 27px ui-monospace, monospace';
  g.fillText(subtitle, 49, 190);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const colliders = [];
  const solids = [];
  const radarWalls = [];

  const brickMap = canvasTexture(256, (g, s) => {
    g.fillStyle = '#b7aaa0';
    g.fillRect(0, 0, s, s);
    for (let row = 0; row < 12; row += 1) {
      const y = row * 22;
      g.fillStyle = '#69666a';
      g.fillRect(0, y, s, 3);
      const offset = row % 2 ? 26 : 0;
      for (let x = offset; x < s; x += 52) g.fillRect(x, y, 3, 22);
      g.fillStyle = 'rgba(255,235,214,.10)';
      g.fillRect(0, y + 3, s, 2);
    }
    speckle(g, s, 260, 'rgba(35,27,29,.18)');
  }, 2.4, 1.6);
  const concreteMap = canvasTexture(256, (g, s) => {
    g.fillStyle = '#c2c0bd';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#77777d';
    g.lineWidth = 3;
    g.strokeRect(4, 4, s - 8, s - 8);
    g.beginPath();
    g.moveTo(s / 2, 0);
    g.lineTo(s / 2, s);
    g.moveTo(0, s / 2);
    g.lineTo(s, s / 2);
    g.stroke();
    speckle(g, s, 350, 'rgba(38,39,45,.15)');
    for (const x of [15, s - 15]) for (const y of [15, s - 15]) {
      g.fillStyle = '#55565c';
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  }, 2, 2);
  const groundMap = canvasTexture(512, (g, s) => {
    g.fillStyle = '#aaa7a5';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#67666b';
    g.lineWidth = 3;
    for (let i = 0; i <= 8; i += 1) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, s);
      g.moveTo(0, i * 64);
      g.lineTo(s, i * 64);
      g.stroke();
    }
    speckle(g, s, 950, 'rgba(30,28,31,.20)');
    g.strokeStyle = 'rgba(45,40,42,.32)';
    g.lineWidth = 2;
    for (let i = 0; i < 16; i += 1) {
      const x = (i * 83) % s;
      const y = (i * 137) % s;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 24, y + 8);
      g.lineTo(x + 36, y + 3);
      g.stroke();
    }
  }, 6, 4);
  const crateMap = canvasTexture(128, (g, s) => {
    g.fillStyle = '#d0c0a8';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#736554';
    for (let i = 0; i < 4; i += 1) g.fillRect(0, i * 32, s, 3);
    g.fillRect(10, 0, 7, s);
    g.fillRect(s - 17, 0, 7, s);
    g.strokeStyle = '#5a5046';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(18, 15);
    g.lineTo(s - 18, s - 15);
    g.moveTo(s - 18, 15);
    g.lineTo(18, s - 15);
    g.stroke();
    speckle(g, s, 90, 'rgba(45,32,26,.18)');
  });

  const materials = {
    ground: new THREE.MeshStandardMaterial({ color: PALETTE.ground, map: groundMap, roughness: 0.98 }),
    brick: new THREE.MeshStandardMaterial({ color: PALETTE.brick, map: brickMap, roughness: 0.94 }),
    clay: new THREE.MeshStandardMaterial({ color: PALETTE.clay, map: brickMap, roughness: 0.88 }),
    concrete: new THREE.MeshStandardMaterial({ color: PALETTE.concrete, map: concreteMap, roughness: 0.93 }),
    steel: new THREE.MeshStandardMaterial({ color: PALETTE.steel, map: concreteMap, roughness: 0.63, metalness: 0.3 }),
    crate: new THREE.MeshStandardMaterial({ color: PALETTE.sand, map: crateMap, roughness: 0.84 }),
    dark: new THREE.MeshStandardMaterial({ color: PALETTE.coal, roughness: 0.7, metalness: 0.25 }),
    ember: new THREE.MeshStandardMaterial({ color: PALETTE.ember, emissive: PALETTE.ember, emissiveIntensity: 2.2, roughness: 0.4 }),
  };

  function box(w, h, d, x, y, z, material = 'concrete', options = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = options.castShadow !== false;
    mesh.receiveShadow = true;
    if (options.heavy) mesh.userData.heavy = true;
    root.add(mesh);
    if (options.solid !== false) solids.push(mesh);
    if (options.collider !== false) {
      colliders.push(new THREE.Box3(
        new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
      ));
    }
    return mesh;
  }

  function wall(x1, z1, x2, z2, material = 'concrete', height = 4.3, thick = 0.45) {
    const horizontal = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
    const w = horizontal ? Math.abs(x2 - x1) + thick : thick;
    const d = horizontal ? thick : Math.abs(z2 - z1) + thick;
    const mesh = box(w, height, d, (x1 + x2) / 2, height / 2, (z1 + z2) / 2, material, { heavy: true });
    radarWalls.push([x1, z1, x2, z2]);
    return mesh;
  }

  box(48, 0.3, 32, 0, -0.15, 0, 'ground', { collider: false, castShadow: false });
  // Expansion joints and lane paint are geometry, not downloaded decals.
  const paint = new THREE.MeshBasicMaterial({ color: '#b76b3f', transparent: true, opacity: 0.52, depthWrite: false });
  for (const x of [-3.55, 3.55]) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 10), paint);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(x, 0.013, 9);
    root.add(stripe);
  }

  wall(-24, -16, 24, -16, 'brick');
  wall(-24, 16, 24, 16, 'brick');
  wall(-24, -16, -24, 16, 'concrete');
  wall(24, -16, 24, 16, 'concrete');

  // Mid is fast and exposed; the broken gate gives three distinct firing angles.
  wall(-4, 4, -4, 16);
  wall(4, 4, 4, 16);
  wall(-4, 4, -1.45, 4);
  wall(1.45, 4, 4, 4);
  box(1.55, 1.05, 1.55, -0.85, 0.525, 0.4, 'crate');
  box(1.55, 1.05, 1.55, 0.85, 0.525, -0.1, 'crate');
  box(0.65, 2.5, 0.65, -3.15, 1.25, -3.3, 'steel');
  box(0.65, 2.5, 0.65, 3.15, 1.25, -3.3, 'steel');
  box(8.2, 0.5, 2.2, 0, 0.25, -12.2, 'concrete', { collider: true });

  // West long rotates around a hot kiln and enters A through two doors.
  wall(-10.5, 2, -10.5, 12, 'brick');
  wall(-18.2, 2, -12.7, 2, 'brick');
  wall(-10.5, 2, -5.2, 2, 'brick');
  box(1.45, 1.1, 1.45, -7.3, 0.55, 7.8, 'crate');
  box(1.45, 1.1, 1.45, -7.3, 0.55, 3.4, 'crate');
  box(1.2, 3.4, 1.2, -14.1, 1.7, 8.2, 'clay', { heavy: true });

  // East short is tighter, with a single connector into B.
  wall(10.5, 6, 10.5, 12);
  wall(6.2, 6, 14, 6);
  wall(14, -14, 14, -2);
  wall(14, 2, 14, 6);
  box(1.45, 1.1, 1.45, 8.5, 0.55, 10.1, 'crate');
  box(1.45, 1.1, 1.45, 12.1, 0.55, 10.1, 'crate');
  box(0.65, 3.2, 0.65, 7, 1.6, -2.8, 'clay');
  box(0.65, 3.2, 0.65, -7, 1.6, -2.8, 'clay');

  // Site cover creates useful plant/defuse angles without hiding the large letters.
  for (const site of SITES) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(7.1, 7.1),
      new THREE.MeshStandardMaterial({ color: '#693c2e', roughness: 0.9, emissive: '#6b2b16', emissiveIntensity: 0.32 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.x, 0.018, site.z);
    pad.receiveShadow = true;
    root.add(pad);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.55, 2.66, 48),
      new THREE.MeshBasicMaterial({ color: PALETTE.ember, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.035, site.z);
    root.add(ring);
    const letterCanvas = document.createElement('canvas');
    letterCanvas.width = letterCanvas.height = 256;
    const lg = letterCanvas.getContext('2d');
    lg.fillStyle = PALETTE.paper;
    lg.font = '900 190px system-ui, sans-serif';
    lg.textAlign = 'center';
    lg.textBaseline = 'middle';
    lg.fillText(site.id, 128, 140);
    const letterTexture = new THREE.CanvasTexture(letterCanvas);
    letterTexture.colorSpace = THREE.SRGBColorSpace;
    const letter = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.1), new THREE.MeshBasicMaterial({
      map: letterTexture, transparent: true, opacity: 0.92, depthWrite: false,
    }));
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(site.x, 0.045, site.z);
    root.add(letter);
  }
  box(2.7, 0.95, 1.2, -13.4, 0.475, -4.6, 'crate');
  box(1.4, 1.4, 1.4, -18.6, 0.7, -6.2, 'crate');
  box(1.4, 1.4, 1.4, -17.1, 0.7, -6.2, 'crate');
  box(2.7, 0.95, 1.2, 13.1, 0.475, -4.6, 'crate');
  box(1.4, 1.4, 1.4, 18.2, 0.7, -6.2, 'crate');

  // The kiln silhouettes are cylindrical, while conservative box colliders keep
  // navigation and player motion predictable.
  for (const [x, z] of [[-20, -11.7], [20, -11.7]]) {
    const kiln = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.55, 3.4, 16), materials.clay);
    kiln.position.set(x, 1.7, z);
    kiln.castShadow = kiln.receiveShadow = true;
    kiln.userData.heavy = true;
    root.add(kiln);
    solids.push(kiln);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 1.35, 0, z - 1.35), new THREE.Vector3(x + 1.35, 3.4, z + 1.35)));
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.62, 3.2, 12), materials.dark);
    chimney.position.set(x, 4.5, z);
    chimney.castShadow = true;
    root.add(chimney);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.43, 16), materials.ember);
    mouth.position.set(x, 1.25, z + 1.37);
    root.add(mouth);
  }

  // Readable industrial wayfinding in the world itself.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.65), new THREE.MeshBasicMaterial({
    map: labelTexture('EMBERLINE', 'KILNWORKS  /  NIGHT SHIFT  /  YARD 02'), transparent: true,
  }));
  sign.position.set(0, 3.45, 3.74);
  root.add(sign);
  for (const site of SITES) {
    const siteSign = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.825), new THREE.MeshBasicMaterial({
      map: labelTexture(`SITE ${site.id}`, site.name), transparent: true,
    }));
    siteSign.position.set(site.x, 2.65, -15.74);
    root.add(siteSign);
  }

  const lampLights = [];
  for (const [x, z] of [[-4.65, 11.8], [4.65, 11.8], [-5.1, -8.2], [5.1, -8.2], [-16, -3.2], [16, -3.2]]) {
    box(0.12, 3.5, 0.12, x, 1.75, z, 'dark', { collider: false });
    box(0.48, 0.13, 0.48, x, 3.48, z, 'ember', { collider: false, solid: false, castShadow: false });
    const light = new THREE.PointLight(PALETTE.ember, 14, 12, 1.65);
    light.position.set(x, 3.25, z);
    scene.add(light);
    lampLights.push(light);
  }

  // Open dusk sky: a procedural gradient dome and sparse, deterministic ember stars.
  const skyTexture = canvasTexture(1024, (g, s) => {
    const gradient = g.createLinearGradient(0, 0, 0, s);
    gradient.addColorStop(0, '#101724');
    gradient.addColorStop(0.45, '#303245');
    gradient.addColorStop(0.72, '#805347');
    gradient.addColorStop(1, '#252936');
    g.fillStyle = gradient;
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(245,234,216,.45)';
    for (let i = 0; i < 90; i += 1) {
      const x = (i * 193) % s;
      const y = (i * 79) % (s * 0.45);
      g.fillRect(x, y, i % 7 === 0 ? 2 : 1, 1);
    }
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(95, 24, 16), new THREE.MeshBasicMaterial({
    map: skyTexture, side: THREE.BackSide, fog: false,
  }));
  sky.position.y = -12;
  scene.add(sky);

  scene.background = new THREE.Color(PALETTE.dusk);
  scene.fog = new THREE.FogExp2(PALETTE.dusk, 0.018);
  const hemisphere = new THREE.HemisphereLight('#9ca9c5', '#2d2020', 1.9);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight('#ffd0a1', 3.1);
  sun.position.set(-12, 20, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 24, bottom: -24, near: 1, far: 60 });
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  const coolRim = new THREE.DirectionalLight('#708bb0', 1.15);
  coolRim.position.set(10, 10, -15);
  scene.add(coolRim);

  return {
    root, colliders, solids, radarWalls, sites: SITES,
    update(time) {
      for (let i = 0; i < lampLights.length; i += 1) {
        lampLights[i].intensity = 13.5 + Math.sin(time * 3.1 + i * 2.7) * 0.6;
      }
    },
  };
}
