// DOM presentation layer. The HUD renders snapshots and events; it never makes
// combat or economy decisions. Expensive roster rows rebuild only on change.
import { clockText, GUARD_NAMES } from './config.js';

const $ = (id) => document.getElementById(id);
const ROLE_LABEL = { entry: 'ENTRY', planter: 'PLANTER', anchor: 'ANCHOR' };

export function createHud() {
  const el = {
    crewScore: $('crew-score'), guardScore: $('guard-score'), round: $('round-label'), clock: $('clock'),
    phase: $('phase'), objective: $('objective'), crew: $('crew-strip'), alive: $('alive-count'),
    hp: $('hp'), armor: $('armor'), equipment: $('equipment'), money: $('money-value'),
    weapon: $('weapon-name'), weaponClass: $('weapon-class'), mag: $('ammo-mag'), reserve: $('ammo-reserve'),
    inventory: $('inventory'), heat: $('heat-fill'), interact: $('interact'), useLabel: $('use-label'),
    useSub: $('use-sub'), useFill: $('use-fill'), hitmarker: $('hitmarker'), damage: $('damage'),
    lowHealth: $('low-health'), toast: $('toast'), feed: $('killfeed'), board: $('board'),
    boardBody: $('board-body'), boardScore: $('board-score'), boardSubtitle: $('board-subtitle'),
    boardStatus: $('board-status'), shop: $('shop'), shopMoney: $('shop-money'), shopRound: $('shop-round'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    overlayKicker: $('overlay-kicker'), play: $('play'), overlayNote: $('overlay-note'), briefing: $('briefing'),
    scope: $('scope'), crosshair: $('crosshair'),
  };
  const shopRows = Array.from(document.querySelectorAll('.shop-row'));
  let hitLeft = 0;
  let hurtLeft = 0;
  let toastLeft = 0;
  let boardKey = '';
  let crewBuilt = false;

  function buildCrewStrip(mates) {
    el.crew.textContent = '';
    for (const mate of mates) {
      const card = document.createElement('div');
      card.className = 'mate-card';
      card.dataset.mate = mate.name;
      card.innerHTML = `<i class="mate-pip"></i><div><div class="mate-name">${mate.name}</div><div class="mate-role">${ROLE_LABEL[mate.role]}</div></div><span class="mate-hp">100</span>`;
      el.crew.appendChild(card);
    }
    crewBuilt = true;
  }

  function boardRow(person, team, alive) {
    const row = document.createElement('tr');
    row.className = `${team}${alive ? '' : ' down'}`;
    for (const value of [person.name, person.kills, person.deaths, Math.round(person.dmg), alive ? 'UP' : 'DOWN']) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.appendChild(cell);
    }
    return row;
  }

  function boardDivider(label) {
    const row = document.createElement('tr');
    row.className = 'team-divider';
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = label;
    row.appendChild(cell);
    return row;
  }

  return {
    onPlay(handler) { el.play.addEventListener('click', handler); },

    setRound(rounds, clock, phaseText) {
      el.crewScore.textContent = rounds.crew;
      el.guardScore.textContent = rounds.guards;
      el.round.textContent = `ROUND ${String(rounds.number).padStart(2, '0')} · FIRST TO 8`;
      el.clock.textContent = clockText(clock);
      el.clock.classList.toggle('urgent', rounds.phase === 'live' && clock <= 20 && clock > 0);
      el.phase.hidden = !phaseText;
      if (phaseText) el.phase.textContent = phaseText;
    },

    setBomb(text) {
      el.objective.hidden = !text;
      if (text) el.objective.textContent = text;
    },

    setCrew(mates, guardsAlive) {
      if (!crewBuilt) buildCrewStrip(mates);
      for (const mate of mates) {
        const card = el.crew.querySelector(`[data-mate="${mate.name}"]`);
        if (!card) continue;
        card.classList.toggle('dead', !mate.alive);
        card.querySelector('.mate-hp').textContent = mate.alive ? Math.max(0, Math.ceil(mate.health)) : 'KIA';
      }
      el.alive.textContent = `${1 + mates.filter((mate) => mate.alive).length} × ${guardsAlive}`;
    },

    setVitals(hp, economy) {
      el.hp.textContent = Math.max(0, Math.ceil(hp));
      el.hp.classList.toggle('hurt', hp <= 35);
      el.lowHealth.style.opacity = hp > 0 && hp <= 35 ? String((35 - hp) / 55) : '0';
      el.armor.textContent = economy.armor > 0 ? `VEST ${Math.ceil(economy.armor)}` : 'NO VEST';
      el.equipment.textContent = `VEST ${economy.armor > 0 ? 'ON' : '—'} · HELM ${economy.helmet ? 'ON' : '—'}`;
      el.money.textContent = `$${economy.money}`;
    },

    setWeapon(weapon, grenadeCount) {
      const spec = weapon.current();
      const box = weapon.ammo[weapon.state.index];
      el.weapon.textContent = spec.name;
      el.weaponClass.textContent = weapon.state.reloadLeft > 0
        ? `RELOADING · ${weapon.state.reloadLeft.toFixed(1)}S`
        : spec.className;
      el.mag.textContent = box.mag;
      el.mag.classList.toggle('empty', box.mag === 0);
      el.reserve.textContent = `/ ${box.reserve}`;
      el.inventory.textContent = `FIREPOT ×${grenadeCount} · ${spec.automatic ? 'AUTO' : 'SEMI'}`;
      el.heat.style.width = `${Math.min(100, weapon.state.heat / 1.35 * 100)}%`;
    },

    setUse(label, progress, subtext = 'HOLD POSITION') {
      el.interact.hidden = !label || progress <= 0;
      if (!label || progress <= 0) return;
      el.useLabel.textContent = label;
      el.useSub.textContent = subtext;
      el.useFill.style.width = `${Math.round(Math.min(1, progress) * 100)}%`;
    },

    hit(killed, persistent = false) {
      hitLeft = persistent ? 999 : 0.16;
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', killed);
    },

    hurt() { hurtLeft = 0.32; },

    notify(text, persistent = false) {
      toastLeft = persistent ? 999 : 1.8;
      el.toast.textContent = text;
      el.toast.classList.add('on');
    },

    kill(killer, victim, headshot = false) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      const killerTeam = GUARD_NAMES.includes(killer) ? 'guard' : 'crew';
      const victimTeam = GUARD_NAMES.includes(victim) ? 'guard' : 'crew';
      row.innerHTML = `<span class="${killerTeam}">${killer}</span><span class="hs">${headshot ? 'HEADSHOT' : '›'}</span><span class="${victimTeam}">${victim}</span>`;
      el.feed.prepend(row);
      while (el.feed.childElementCount > 5) el.feed.lastElementChild.remove();
    },

    clearFeed() { el.feed.textContent = ''; },

    showBoard(data) {
      const key = [
        data.rounds.number, data.rounds.crew, data.rounds.guards, data.status,
        data.player.kills, data.player.deaths, Math.round(data.player.dmg), data.playerAlive,
        ...data.mates.flatMap((m) => [m.kills, m.deaths, Math.round(m.dmg), m.alive]),
        ...data.guards.flatMap((g) => [g.kills, g.deaths, Math.round(g.dmg), g.alive]),
      ].join('|');
      el.board.hidden = false;
      el.boardScore.textContent = `${data.rounds.crew} — ${data.rounds.guards}`;
      el.boardSubtitle.textContent = `ROUND ${String(data.rounds.number).padStart(2, '0')} · K / D / DAMAGE`;
      el.boardStatus.textContent = data.status || 'HOLD TAB TO REVIEW · FIRST TO EIGHT ROUNDS';
      if (key === boardKey) return;
      boardKey = key;
      el.boardBody.textContent = '';
      el.boardBody.appendChild(boardDivider('EMBER CREW / ATTACKERS'));
      el.boardBody.appendChild(boardRow(data.player, 'crew', data.playerAlive));
      for (const mate of data.mates) el.boardBody.appendChild(boardRow(mate, 'crew', mate.alive));
      el.boardBody.appendChild(boardDivider('YARD GUARD / DEFENDERS'));
      for (const guard of data.guards) el.boardBody.appendChild(boardRow(guard, 'guard', guard.alive));
    },
    hideBoard() { el.board.hidden = true; },

    showShop(economy, hp, weapon, roundNumber) {
      el.shop.hidden = false;
      el.shopMoney.textContent = `$${economy.money}`;
      el.shopRound.textContent = String(roundNumber).padStart(2, '0');
      const PRICES = { vest: 650, helm: 400, ammo: 300, he: 400, stim: 500, coil: 650, longsight: 1350 };
      for (const row of shopRows) {
        const key = row.dataset.item;
        let owned = false;
        let stock = '';
        if (key === 'vest') { owned = economy.armor >= 100; stock = owned ? 'WORN' : `${Math.ceil(economy.armor)} INTEGRITY`; }
        else if (key === 'helm') { owned = economy.helmet; stock = owned ? 'WORN' : 'IN STOCK'; }
        else if (key === 'he') { stock = `${weapon.grenades} / 2 CARRIED`; owned = weapon.grenades >= 2; }
        else if (key === 'stim') { stock = `${Math.ceil(hp)} HP`; owned = hp >= 100; }
        else if (key === 'ammo') stock = 'OWNED WEAPONS';
        else if (key === 'coil') { owned = weapon.unlocked[1]; stock = owned ? 'ISSUED' : 'ON RACK'; }
        else if (key === 'longsight') { owned = weapon.unlocked[2]; stock = owned ? 'ISSUED' : 'ON RACK'; }
        row.classList.toggle('owned', owned);
        row.classList.toggle('poor', economy.money < PRICES[key] && !owned);
        row.querySelector('.stock').textContent = stock;
      }
    },
    hideShop() { el.shop.hidden = true; },

    scope(active) {
      el.scope.classList.toggle('on', active);
      el.crosshair.style.opacity = active ? '0' : '1';
    },

    showOverlay(mode, data = {}) {
      const content = {
        start: ['TACTICAL THREE.JS / SINGLE PLAYER', 'EMBER<span>LINE</span>', 'Breach a working kiln yard with three autonomous crew mates. Nine guards hold two sites. Plant the Ember or eliminate the defense — first to eight rounds takes the night shift.', 'DEPLOY TO THE YARD'],
        paused: ['OPERATION PAUSED', 'HOLD <span>POSITION</span>', 'The yard is frozen while your pointer is released. Return when you are ready; the round clock and every combatant resume together.', 'RETURN TO THE YARD'],
        victory: ['OPERATION COMPLETE / CREW VICTORY', 'YARD <span>TAKEN</span>', `The Ember crew owns the night shift. Final score ${data.crew ?? 8}—${data.guards ?? 0}. ${data.kills ?? 0} eliminations and ${Math.round(data.dmg ?? 0)} damage from your rifle.`, 'RUN IT AGAIN'],
        defeat: ['OPERATION COMPLETE / GUARD VICTORY', 'YARD <span>LOST</span>', `The defense held the kilns. Final score ${data.crew ?? 0}—${data.guards ?? 8}. Re-arm, use your crew and make every angle count.`, 'TRY AGAIN'],
      }[mode] || null;
      if (!content) return;
      el.overlayKicker.textContent = content[0];
      el.overlayTitle.innerHTML = content[1];
      el.overlayCopy.textContent = content[2];
      el.play.textContent = content[3];
      el.overlayNote.textContent = mode === 'start' ? 'CLICK TO CAPTURE MOUSE' : 'DESKTOP / MOUSE + KEYBOARD';
      el.briefing.hidden = mode !== 'start';
      el.overlay.hidden = false;
      if (mode !== 'start') el.play.focus();
    },
    hideOverlay() { el.overlay.hidden = true; },

    step(dt) {
      if (hitLeft > 0) {
        hitLeft -= dt;
        if (hitLeft <= 0) el.hitmarker.classList.remove('on');
      }
      if (hurtLeft > 0) {
        hurtLeft -= dt;
        el.damage.style.opacity = String(Math.max(0, hurtLeft / 0.32) * 0.72);
      } else el.damage.style.opacity = '0';
      if (toastLeft > 0) {
        toastLeft -= dt;
        if (toastLeft <= 0) el.toast.classList.remove('on');
      }
    },
  };
}
