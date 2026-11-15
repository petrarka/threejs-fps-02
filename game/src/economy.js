// The purse and the pocket: money for kills and rounds, a four-slot buy menu, and the
// FIREPOT HE grenade — a lobbed clay pot that bounces once and bursts into a short-radius
// kilnwash. A clay vest soaks most of what would hit the chest while it lasts.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const START_MONEY = 800;
const AWARDS = { kill: 200, win: 800 };
// A flat loss award starves a streak; three straight losses should still arm round four.
const LOSS_STREAK_BONUS = [300, 500, 700];
const ARMOR_ABSORB = 0.55;      // share of a hit the vest eats while it lasts
const NADE_MAX = 2;
const NADE_FUSE = 1.4;          // seconds from the throw to the burst
const NADE_RADIUS = 5.2;
const NADE_MAX_DAMAGE = 110;    // a pot at your feet is lethal; the rim of the wash is not
const NADE_THROW = 14.5;
const NADE_LOB = 3.2;
const GRAVITY = 22;
const BOUNCE = 0.42;
const ROLL = 0.72;
const BURST_SECONDS = 0.32;

export const CATALOG = [
  { key: 'vest', slot: 1, name: 'CLAY VEST', price: 650, note: 'soaks 55% of hits while it lasts' },
  { key: 'ammo', slot: 2, name: 'AMMO CRATE', price: 300, note: 'top up every reserve' },
  { key: 'he', slot: 3, name: 'FIREPOT HE', price: 400, note: '+1 grenade, throw with G' },
  { key: 'stim', slot: 4, name: 'STIM PACK', price: 500, note: '+60 HP, right now' },
];

export function createEconomy(scene) {
  const state = {
    money: START_MONEY,
    armor: 0,
    nades: 0,
    shopOpen: false,
    lossStreak: 0,
  };

  // One grenade in flight at a time is plenty for a yard this size.
  const nade = {
    active: false,
    fuse: 0,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35 }),
  );
  mesh.visible = false;
  mesh.castShadow = true;
  scene.add(mesh);

  const burst = {
    left: 0,
    pos: new THREE.Vector3(),
  };
  const burstMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, depthWrite: false }),
  );
  burstMesh.visible = false;
  scene.add(burstMesh);
  const burstLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18);
  scene.add(burstLight);

  const explosions = []; // drained by main.js each step, then applied to bots/player

  function reset() {
    state.money = START_MONEY;
    state.armor = 0;
    state.nades = 0;
    state.shopOpen = false;
    state.lossStreak = 0;
    nade.active = false;
    nade.fuse = 0;
    mesh.visible = false;
    burst.left = 0;
    burstMesh.visible = false;
    burstLight.intensity = 0;
    explosions.length = 0;
  }

  function award(kind) {
    if (kind === 'loss') {
      state.money += LOSS_STREAK_BONUS[Math.min(state.lossStreak, LOSS_STREAK_BONUS.length - 1)];
      state.lossStreak += 1;
      return;
    }
    if (kind === 'win') state.lossStreak = 0;
    state.money += AWARDS[kind] ?? 0;
  }

  // Returns true when the purchase went through; main.js owns hp/weapon and repaints the HUD.
  function buy(key, ctx) {
    const item = CATALOG.find((entry) => entry.key === key);
    if (!item || state.money < item.price) return false;
    if (key === 'vest' && state.armor >= 100) return false;
    if (key === 'he' && state.nades >= NADE_MAX) return false;
    if (key === 'stim' && ctx.hp >= ctx.maxHp) return false;
    state.money -= item.price;
    if (key === 'vest') state.armor = 100;
    else if (key === 'he') state.nades += 1;
    else if (key === 'ammo') ctx.refillAmmo();
    else if (key === 'stim') ctx.heal(60);
    return true;
  }

  // Armor first: the vest eats its share, the rest lands on HP. Returns HP damage taken.
  function absorb(amount) {
    if (state.armor <= 0) return amount;
    const soaked = Math.min(state.armor, amount * ARMOR_ABSORB);
    state.armor -= soaked;
    return amount - soaked;
  }

  function throwNade(origin, dir) {
    if (state.nades <= 0 || nade.active || burst.left > 0) return false;
    state.nades -= 1;
    nade.active = true;
    nade.fuse = NADE_FUSE;
    nade.pos.copy(origin);
    nade.vel.set(dir.x * NADE_THROW, dir.y * NADE_THROW + NADE_LOB, dir.z * NADE_THROW);
    mesh.visible = true;
    return true;
  }

  function explode() {
    nade.active = false;
    mesh.visible = false;
    burst.left = BURST_SECONDS;
    burst.pos.copy(nade.pos);
    burstLight.position.set(nade.pos.x, Math.max(0.6, nade.pos.y + 0.4), nade.pos.z);
    explosions.push({ x: nade.pos.x, y: nade.pos.y, z: nade.pos.z });
  }

  function step(dt) {
    if (nade.active) {
      nade.fuse -= dt;
      nade.vel.y -= GRAVITY * dt;
      nade.pos.x += nade.vel.x * dt;
      nade.pos.y += nade.vel.y * dt;
      nade.pos.z += nade.vel.z * dt;
      if (nade.pos.y <= 0.09) {
        nade.pos.y = 0.09;
        if (Math.abs(nade.vel.y) > 1.2) {
          nade.vel.y = -nade.vel.y * BOUNCE;
          nade.vel.x *= ROLL;
          nade.vel.z *= ROLL;
          // A clay pot thuds and stays: clamp the skid so the burst hugs the landing spot.
          const skid = Math.hypot(nade.vel.x, nade.vel.z);
          if (skid > 3.2) {
            nade.vel.x *= 3.2 / skid;
            nade.vel.z *= 3.2 / skid;
          }
        } else {
          nade.vel.y = 0;
          nade.vel.x *= 0.86;
          nade.vel.z *= 0.86;
        }
      }
      mesh.position.copy(nade.pos);
      if (nade.fuse <= 0) explode();
    }
    if (burst.left > 0) {
      burst.left = Math.max(0, burst.left - dt);
      const frac = 1 - burst.left / BURST_SECONDS;
      burstMesh.visible = true;
      burstMesh.position.copy(burst.pos);
      burstMesh.scale.setScalar(0.4 + frac * NADE_RADIUS);
      burstMesh.material.opacity = 0.55 * (1 - frac);
      burstLight.intensity = (1 - frac) * 46;
      if (burst.left === 0) {
        burstMesh.visible = false;
        burstLight.intensity = 0;
      }
    }
  }

  // Radial damage scaled by distance; y is ignored (the yard is flat).
  function damageAt(x, z, radius, maxDamage) {
    return function apply(px, py, pz) {
      const d = Math.hypot(px - x, pz - z);
      if (d > radius) return 0;
      return Math.round(maxDamage * (1 - (d / radius) * 0.75));
    };
  }

  return {
    state, CATALOG, NADE_RADIUS, NADE_MAX_DAMAGE,
    reset, award, buy, absorb, throwNade, step, damageAt,
    takeExplosions() {
      if (!explosions.length) return null;
      const snap = explosions.slice();
      explosions.length = 0;
      return snap;
    },
    nadeInFlight() {
      return nade.active;
    },
  };
}