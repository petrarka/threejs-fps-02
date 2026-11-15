// The map: "Emberline" — a dusk kiln-yard built entirely from boxes.
//   * two bomb sites: A in the north-west, B in the north-east;
//   * a walled mid lane running from the south (attacker) doors to the CT step;
//   * a west long lane that curls from spawn up into site A;
//   * an east short connector that links spawn to site B through a single door.
// Every box is both a player collider and a surface a bullet stops on, so the same
// geometry drives movement, shooting and the radar underlay. No models — every
// surface wears a procedural canvas skin (brick, panels, plates, site letters).
//
// Axes: +x east, +z south. Attackers spawn at z=+12, defenders at z=-12.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HEIGHT = 4.4;

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // Procedural canvas skins: every big surface gets a real pattern, drawn once at
  // load — brick courses, concrete panel seams, ground plates, clay speckle. The
  // texture multiplies the palette colour, so each material keeps its dusk tone.
  function makeTexture(size, repeatX, repeatY, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 4;
    return tex;
  }

  const brickTex = makeTexture(128, 2, 2, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#9a8f8a';
    for (let row = 0; row < 8; row += 1) {
      g.fillRect(0, row * 16, s, 2); // mortar courses
      const off = row % 2 ? 16 : 0;
      for (let col = 0; col < 4; col += 1) g.fillRect(((col * 32 + off) % s), row * 16, 2, 16);
    }
    g.fillStyle = 'rgba(70,60,55,0.18)';
    for (let i = 0; i < 40; i += 1) g.fillRect((i * 37) % s, (i * 53) % s, 5, 3);
  });
  const panelTex = makeTexture(128, 2, 2, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#8d8d94';
    for (let i = 0; i <= 4; i += 1) {
      g.fillRect(i * 32, 0, 2, s);
      g.fillRect(0, i * 32, s, 2);
    }
    g.fillStyle = 'rgba(60,60,66,0.15)';
    for (let i = 0; i < 24; i += 1) g.fillRect((i * 41) % s, (i * 29) % s, 7, 2);
  });
  const groundTex = makeTexture(256, 8, 6, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#8f8f93';
    for (let i = 0; i <= 4; i += 1) {
      g.fillRect(i * 64, 0, 3, s);
      g.fillRect(0, i * 64, s, 3);
    }
    g.fillStyle = 'rgba(50,48,52,0.25)';
    for (let i = 0; i < 90; i += 1) g.fillRect((i * 47) % s, (i * 71) % s, 4, 2);
  });
  const sandTex = makeTexture(64, 2, 2, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(90,75,55,0.35)';
    for (let i = 0; i < 60; i += 1) g.fillRect((i * 17) % s, (i * 23) % s, 2, 2);
  });

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    const shiny = name === 'accent' || name === 'sand';
    const map = name === 'brick' ? brickTex
      : name === 'surface' ? panelTex
        : name === 'ground' ? groundTex
          : name === 'sand' ? sandTex
            : null;
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: shiny ? 0.6 : 0.92,
      metalness: name === 'accent' ? 0.15 : 0.03,
      map,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Axis-aligned wall slab between two points, sitting on the floor. The long axis is
  // whichever of x/z spans further; the short axis gets the thickness.
  function wall(x1, z1, x2, z2, material, h = HEIGHT, t = 0.5) {
    if (Math.abs(x2 - x1) >= Math.abs(z2 - z1)) {
      return box(Math.abs(x2 - x1) + t, h, t, (x1 + x2) / 2, h / 2, z1, material);
    }
    return box(t, h, Math.abs(z2 - z1) + t, x1, h / 2, (z1 + z2) / 2, material);
  }

  // ---- ground and sky ------------------------------------------------------
  box(48.8, 0.4, 32.8, 0, -0.2, 0, 'canvas');          // base slab under everything
  box(47.6, 0.06, 31.6, 0, 0.03, 0, 'ground');         // walkable tone plate
  const skySlab = box(48.8, 0.4, 32.8, 0, 4.6, 0, 'night');
  skySlab.castShadow = false;                           // a shadow-casting roof would black out the yard
  skySlab.receiveShadow = false;

  // ---- perimeter -----------------------------------------------------------
  wall(-24, -16, 24, -16, 'brick');
  wall(-24, 16, 24, 16, 'brick');
  wall(-24, -16, -24, 16, 'surface');
  wall(24, -16, 24, 16, 'surface');

  // ---- site A (north-west) -------------------------------------------------
  box(7.2, 0.18, 7.2, -15, 0.09, -9, 'accent');        // glowing plant pad
  box(1.4, 1.2, 1.4, -18.6, 0.6, -6.4, 'sand');        // kiln crates
  box(1.4, 1.2, 1.4, -17.2, 0.6, -6.4, 'sand');
  box(1.4, 2.4, 1.4, -18.0, 1.2, -12.0, 'brick');      // the great kiln
  box(1.0, 1.0, 1.0, -12.0, 0.5, -12.2, 'hairline');
  box(2.6, 0.9, 1.2, -13.8, 0.45, -4.6, 'sand');       // low cover toward mid

  // ---- site B (north-east) -------------------------------------------------
  box(7.2, 0.18, 7.2, 15, 0.09, -9, 'accent');
  box(1.4, 1.2, 1.4, 17.4, 0.6, -5.8, 'sand');
  box(1.2, 2.8, 1.2, 18.4, 1.4, -11.4, 'surface');     // chimney stacks
  box(1.2, 2.8, 1.2, 18.4, 1.4, -8.6, 'surface');
  box(2.6, 0.9, 1.2, 12.6, 0.45, -4.2, 'sand');

  // Painted site letters flat on the pads — the yard reads at a glance from any angle.
  function siteLetter(letter, x, z) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d');
    g.fillStyle = '#f3e8d6';
    g.font = '900 92px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, 64, 68);
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 3.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.2, z);
    group.add(mesh);
  }
  siteLetter('A', -15, -9);
  siteLetter('B', 15, -9);

  // ---- mid: a walled lane from the south doors to the CT step --------------
  wall(-4, 16, -4, 4, 'surface');
  wall(4, 16, 4, 4, 'surface');
  wall(-4, 4, -1.5, 4, 'surface');                      // exit shoulders leave a 3 m gap
  wall(1.5, 4, 4, 4, 'surface');
  box(1.6, 1.1, 1.6, 0, 0.55, 1.0, 'sand');             // mid double crates
  box(1.6, 1.1, 1.6, 1.8, 0.55, 0.2, 'sand');
  box(1.2, 1.6, 1.2, -2.2, 0.8, -1.4, 'hairline');      // mid pillar base

  // ---- west long lane: south spawn, up and into site A ---------------------
  wall(-10.5, 12, -10.5, 2, 'brick');
  wall(-10.5, 2, -18, 2, 'brick');                      // top wall, door gap in the middle
  wall(-5, 2, -12.5, 2, 'brick');
  box(1.4, 1.1, 1.4, -7.4, 0.55, 8.0, 'sand');
  box(1.4, 1.1, 1.4, -7.4, 0.55, 3.2, 'sand');
  box(1.2, 3.2, 1.2, -13.5, 1.6, 8.6, 'brick');         // lane pillar

  // ---- east short connector: south spawn -> mid-east door -> site B --------
  wall(10.5, 12, 10.5, 6, 'surface');
  wall(6.5, 6, 14, 6, 'surface');
  wall(14, -14, 14, -2, 'surface');                     // B approach, door at z in [-2, 2]
  wall(14, 2, 14, 6, 'surface');
  box(1.4, 1.1, 1.4, 9.0, 0.55, 10.0, 'sand');
  box(1.4, 1.1, 1.4, 12.4, 0.55, 10.6, 'sand');

  // ---- CT step and mid pillars --------------------------------------------
  box(8.0, 0.5, 2.6, 0, 0.25, -11.6, 'surface');
  box(1.2, 3.2, 1.2, -7.0, 1.6, -2.6, 'brick');
  box(1.2, 3.2, 1.2, 7.0, 1.6, -2.6, 'brick');

  // ---- ember lamps: tall thin accent posts --------------------------------
  box(0.18, 3.4, 0.18, -4.6, 1.7, 12.2, 'accent');
  box(0.18, 3.4, 0.18, 4.6, 1.7, 12.2, 'accent');
  box(0.18, 3.4, 0.18, -4.9, 1.7, -8.0, 'accent');
  box(0.18, 3.4, 0.18, 4.9, 1.7, -8.0, 'accent');

  // ---- light: warm low ember key, cool dusk fill, faint rim. Bright enough that
  // the far yard still reads on a screenshot — dusk, not a cave. --------------
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.dusk), 24, 72);

  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.hairline), new THREE.Color(PALETTE.canvas), 1.7);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.accent), 2.5);
  key.position.set(14, 12, 10);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 1.2);
  fill.position.set(-12, 10, 12);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(new THREE.Color(PALETTE.hairline), 0.75);
  rim.position.set(0, 8, -16);
  scene.add(rim);

  // Ember lamp pools: the four accent posts are lit, so the lanes read in warm circles
  // even in the deepest part of the yard.
  for (const [lx, lz] of [[-4.6, 12.2], [4.6, 12.2], [-4.9, -8.0], [4.9, -8.0]]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 16, 15, 1.7);
    lamp.position.set(lx, 3.1, lz);
    scene.add(lamp);
  }

  return { colliders, shootables, group };
}