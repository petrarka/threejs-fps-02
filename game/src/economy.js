// Round economy and the five-slot field kit plus the primary rack. Utility
// slots and the two optional primaries share one menu, but every purchase is
// validated here — the HUD only displays what this module decides.
import { createGrenades, FIREPOT } from './grenade.js';

export const CATALOG = Object.freeze([
  { key: 'vest', slot: 1, name: 'CLAY VEST', price: 650, detail: '55% body absorption' },
  { key: 'helm', slot: 2, name: 'KILN HELM', price: 400, detail: '40% headshot protection' },
  { key: 'ammo', slot: 3, name: 'AMMO CRATE', price: 300, detail: 'Refill owned weapons' },
  { key: 'he', slot: 4, name: 'FIREPOT HE', price: 400, detail: 'Clay blast grenade · G' },
  { key: 'stim', slot: 5, name: 'STIM PACK', price: 500, detail: 'Restore 60 HP now' },
  { key: 'coil', slot: 6, name: 'COIL-9 SMG', price: 650, detail: 'Fast, close, controllable', weapon: 1 },
  { key: 'longsight', slot: 7, name: 'LONGSIGHT DMR', price: 1350, detail: 'Scoped · RMB · 92 damage', weapon: 2 },
]);

const LOSS_LADDER = [350, 650, 950, 1250];
const WALLET_CAP = 12000;

export function createEconomy(scene, world) {
  const grenades = createGrenades(scene, world);
  const state = {
    money: 800,
    armor: 0,
    helmet: false,
    losses: 0,
    shopOpen: false,
  };

  function reset() {
    state.money = 800;
    state.armor = 0;
    state.helmet = false;
    state.losses = 0;
    state.shopOpen = false;
    grenades.reset();
  }

  function award(kind) {
    if (kind === 'kill') state.money = Math.min(WALLET_CAP, state.money + 250);
    else if (kind === 'plant') state.money = Math.min(WALLET_CAP, state.money + 300);
    else if (kind === 'win') {
      state.money = Math.min(WALLET_CAP, state.money + 1100);
      state.losses = 0;
    } else if (kind === 'loss') {
      state.money = Math.min(WALLET_CAP, state.money + LOSS_LADDER[Math.min(state.losses, LOSS_LADDER.length - 1)]);
      state.losses += 1;
    }
  }

  // Every purchase rule lives in this one place.
  function buy(key, ctx) {
    const item = CATALOG.find((entry) => entry.key === key);
    if (!item || state.money < item.price) return false;
    if (key === 'vest' && state.armor >= 100) return false;
    if (key === 'helm' && state.helmet) return false;
    if (key === 'he' && grenades.state.count >= FIREPOT.max) return false;
    if (key === 'stim' && ctx.hp >= 100) return false;
    if (key === 'ammo' && ctx.ammoFull()) return false;
    if (item.weapon !== undefined && ctx.ownsWeapon(item.weapon)) return false;

    state.money -= item.price;
    if (key === 'vest') state.armor = 100;
    else if (key === 'helm') state.helmet = true;
    else if (key === 'he') grenades.state.count += 1;
    else if (key === 'stim') ctx.heal(60);
    else if (key === 'ammo') ctx.refillAmmo();
    else ctx.buyWeapon(item.weapon);
    return true;
  }

  // Armor soaks body hits first; the helm blunts headshots on top of that.
  function mitigate(amount, part) {
    let damage = amount;
    if (part === 'head' && state.helmet) damage *= 0.6;
    if (state.armor > 0) {
      const share = part === 'head' ? 0.25 : 0.55;
      const absorbed = Math.min(state.armor, damage * share);
      state.armor -= absorbed;
      damage -= absorbed;
    }
    return Math.max(1, Math.round(damage));
  }

  return {
    state,
    grenades,
    reset,
    award,
    buy,
    mitigate,
    step: grenades.step,
    throwPot: grenades.throwPot,
    takeExplosions: grenades.takeExplosions,
    grenadeCount: () => grenades.state.count,
  };
}
