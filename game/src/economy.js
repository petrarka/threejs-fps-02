// economy.js — the crew's wallet. Money carries between rounds; kills, round
// results and a successful plant all pay. The five-slot buy menu (vest, helm,
// ammo, HE, stim) plus the two buyable weapons live here as pure logic —
// hud.js only draws what canAfford/canBuy say.
import { ECON, MATCH, WEAPONS, FIREPOT } from './config.js';

export class Economy {
  constructor() {
    this.money = MATCH.startMoney;
  }

  resetMatch() {
    this.money = MATCH.startMoney;
  }

  award(kind, who = null) {
    const table = { kill: ECON.kill, win: ECON.roundWin, loss: ECON.roundLoss, plant: ECON.plantBonus };
    this.money = Math.min(MATCH.maxMoney, this.money + (table[kind] || 0));
  }

  // what buying an item actually does to the player; returns true if bought
  buy(id, player, sound) {
    const item = ECON.items.find((i) => i.id === id);
    if (!item || this.money < item.price) { sound.deny(); return false; }

    if (id === 'vest') {
      if (player.vest) { sound.deny(); return false; }
      player.vest = true;
    } else if (id === 'helm') {
      if (player.helm) { sound.deny(); return false; }
      player.helm = true;
    } else if (id === 'ammo') {
      for (const ws of Object.values(player.weapons)) ws.reserve = ws.def.reserve;
    } else if (id === 'he') {
      if (player.grenades >= 2) { sound.deny(); return false; }
      player.grenades += 1;
    } else if (id === 'stim') {
      if (player.stims >= 2) { sound.deny(); return false; }
      player.stims += 1;
    } else if (id === 'coil' || id === 'long') {
      player.giveWeapon(id);
    }
    this.money -= item.price;
    sound.buy();
    return true;
  }

  owned(id, player) {
    if (id === 'vest') return player.vest;
    if (id === 'helm') return player.helm;
    if (id === 'he') return player.grenades >= 2;
    if (id === 'stim') return player.stims >= 2;
    if (id === 'coil' || id === 'long') return !!player.weapons[id];
    return false; // ammo is always re-buyable
  }

  menu(player) {
    return ECON.items.map((i) => ({
      ...i,
      owned: this.owned(i.id, player),
      affordable: this.money >= i.price,
    }));
  }
}

export { WEAPONS, FIREPOT };
