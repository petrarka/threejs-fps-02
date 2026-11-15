// The purse: money for kills and rounds, a seven-slot buy menu, a clay vest that
// soaks most of what would hit the chest while it lasts, and a kiln helm that
// blunts what would have cracked the skull. The FIREPOT HE itself — the throw,
// the fuse, the burst — lives in grenade.js; this module only sells and counts
// the pots (state.nades reads straight off the grenade bag).
import { createGrenades } from './grenade.js';

const START_MONEY = 800;
const AWARDS = { kill: 200, win: 800 };
// A flat loss award starves a streak; three straight losses should still arm round four.
const LOSS_STREAK_BONUS = [300, 500, 700];
const ARMOR_ABSORB = 0.55;      // share of a hit the vest eats while it lasts
const HELM_HEAD_FACTOR = 0.6;   // a helm leaves 60% of a headshot's sting

export const CATALOG = [
  { key: 'vest', slot: 1, name: 'CLAY VEST', price: 650, note: 'soaks 55% of hits while it lasts' },
  { key: 'ammo', slot: 2, name: 'AMMO CRATE', price: 300, note: 'top up every reserve' },
  { key: 'he', slot: 3, name: 'FIREPOT HE', price: 400, note: '+1 grenade, throw with G' },
  { key: 'stim', slot: 4, name: 'STIM PACK', price: 500, note: '+60 HP, right now' },
  { key: 'helm', slot: 5, name: 'KILN HELM', price: 400, note: 'blunts headshots by 40%' },
  { key: 'smg', slot: 6, name: 'COIL-9 SMG', price: 550, note: 'buy the gun: a fast 9mm hose', gun: 3 },
  { key: 'longsight', slot: 7, name: 'LONGSIGHT DMR', price: 1200, note: 'buy the scope: 100 a torso', gun: 2 },
];

export function createEconomy(scene) {
  const grenades = createGrenades(scene);

  const state = {
    money: START_MONEY,
    armor: 0,
    helm: 0,
    shopOpen: false,
    lossStreak: 0,
  };
  // The purse keeps counting pots in the old field so the HUD and the shop stock
  // lines never had to learn a new name; the bag itself belongs to grenade.js.
  Object.defineProperty(state, 'nades', {
    get() { return grenades.state.count; },
    set(value) { grenades.state.count = value; },
  });

  function reset() {
    state.money = START_MONEY;
    state.armor = 0;
    state.helm = 0;
    state.shopOpen = false;
    state.lossStreak = 0;
    grenades.reset();
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
  // `gun` entries sell a weapon from the arsenal: ctx.unlockWeapon puts it in hand.
  function buy(key, ctx) {
    const item = CATALOG.find((entry) => entry.key === key);
    if (!item || state.money < item.price) return false;
    if (key === 'vest' && state.armor >= 100) return false;
    if (key === 'helm' && state.helm >= 1) return false;
    if (key === 'he' && state.nades >= grenades.NADE_MAX) return false;
    if (key === 'stim' && ctx.hp >= ctx.maxHp) return false;
    if (item.gun !== undefined && ctx.hasWeapon(item.gun)) return false;
    state.money -= item.price;
    if (key === 'vest') state.armor = 100;
    else if (key === 'helm') state.helm = 1;
    else if (key === 'he') state.nades += 1;
    else if (key === 'ammo') ctx.refillAmmo();
    else if (key === 'stim') ctx.heal(60);
    else if (item.gun !== undefined) ctx.unlockWeapon(item.gun);
    return true;
  }

  // A helm softens a skull hit first; then armor: the vest eats its share, the rest
  // lands on HP. Returns HP damage taken.
  function absorb(amount, part) {
    let left = part === 'head' && state.helm ? amount * HELM_HEAD_FACTOR : amount;
    if (state.armor <= 0) return Math.round(left);
    const soaked = Math.min(state.armor, left * ARMOR_ABSORB);
    state.armor -= soaked;
    return Math.round(left - soaked);
  }

  // The throw itself is the grenade module's business; the purse only pays the pot.
  function throwNade(origin, dir) {
    return grenades.throwNade(origin, dir);
  }

  function step(dt) {
    grenades.step(dt);
  }

  return {
    state, CATALOG, NADE_MAX: grenades.NADE_MAX,
    NADE_RADIUS: grenades.NADE_RADIUS, NADE_MAX_DAMAGE: grenades.NADE_MAX_DAMAGE,
    reset, award, buy, absorb, throwNade, step,
    takeExplosions: grenades.takeExplosions,
  };
}
