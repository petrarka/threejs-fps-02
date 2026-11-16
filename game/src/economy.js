// Round economy and inventory. Five utility slots share the menu with two
// optional primaries, but each purchase is validated here rather than in the HUD.
import { createGrenades, FIREPOT } from './grenade.js';

export const CATALOG = Object.freeze([
  { key: 'vest', slot: 1, name: 'CLAY VEST', price: 650, detail: '55% body absorption', group: 'utility' },
  { key: 'helm', slot: 2, name: 'KILN HELM', price: 400, detail: '40% headshot protection', group: 'utility' },
  { key: 'ammo', slot: 3, name: 'AMMO CRATE', price: 300, detail: 'Refill owned weapons', group: 'utility' },
  { key: 'he', slot: 4, name: 'FIREPOT HE', price: 400, detail: 'Clay blast grenade · G', group: 'utility' },
  { key: 'stim', slot: 5, name: 'STIM PACK', price: 500, detail: 'Restore 60 HP now', group: 'utility' },
  { key: 'coil', slot: 6, name: 'COIL-9 SMG', price: 650, detail: 'Fast, close, controllable', group: 'weapon', weapon: 1 },
  { key: 'longsight', slot: 7, name: 'LONGSIGHT DMR', price: 1350, detail: 'Scoped · RMB · 92 damage', group: 'weapon', weapon: 2 },
]);

const LOSS_AWARDS = [350, 650, 950, 1250];

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
    if (kind === 'kill') state.money = Math.min(12000, state.money + 250);
    if (kind === 'plant') state.money = Math.min(12000, state.money + 300);
    if (kind === 'win') {
      state.money = Math.min(12000, state.money + 1100);
      state.losses = 0;
    }
    if (kind === 'loss') {
      state.money = Math.min(12000, state.money + LOSS_AWARDS[Math.min(state.losses, LOSS_AWARDS.length - 1)]);
      state.losses += 1;
    }
  }

  function buy(key, context) {
    const item = CATALOG.find((entry) => entry.key === key);
    if (!item || state.money < item.price) return false;
    if (key === 'vest' && state.armor >= 100) return false;
    if (key === 'helm' && state.helmet) return false;
    if (key === 'he' && grenades.state.count >= FIREPOT.max) return false;
    if (key === 'stim' && context.hp >= 100) return false;
    if (item.weapon !== undefined && context.ownsWeapon(item.weapon)) return false;
    if (key === 'ammo' && context.ammoFull()) return false;

    state.money -= item.price;
    if (key === 'vest') state.armor = 100;
    else if (key === 'helm') state.helmet = true;
    else if (key === 'he') grenades.state.count += 1;
    else if (key === 'stim') context.heal(60);
    else if (key === 'ammo') context.refillAmmo();
    else context.buyWeapon(item.weapon);
    return true;
  }

  function mitigate(amount, part) {
    let damage = amount;
    if (part === 'head' && state.helmet) damage *= 0.6;
    if (state.armor > 0 && part !== 'head') {
      const absorbed = Math.min(state.armor, damage * 0.55);
      state.armor -= absorbed;
      damage -= absorbed;
    } else if (state.armor > 0 && part === 'head') {
      const absorbed = Math.min(state.armor, damage * 0.25);
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
