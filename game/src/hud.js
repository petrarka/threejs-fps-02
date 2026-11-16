// DOM presentation layer. The HUD receives snapshots and events; it never makes
// combat or economy decisions. Expensive board rows are rebuilt only when stats change.
import { formatClock, GUARD_NAMES } from './config.js';

const $ = (id) => document.getElementById(id);
const ROLE = { entry: 'ENTRY', planter: 'PLANTER', anchor: 'ANCHOR' };

export function createHud() {
  const nodes = {
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
  let damageLeft = 0;
  let toastLeft = 0;
  let boardKey = '';
  let crewBuilt = false;

  function buildCrew(items) {
    nodes.crew.textContent = '';
    for (const mate of items) {
      const card = document.createElement('div');
      card.className = 'mate-card';
      card.dataset.mate = mate.name;
      card.innerHTML = `<i class="mate-pip"></i><div><div class="mate-name">${mate.name}</div><div class="mate-role">${ROLE[mate.role]}</div></div><span class="mate-hp">100</span>`;
      nodes.crew.appendChild(card);
    }
    crewBuilt = true;
  }

  function boardRow(person, team, alive) {
    const row = document.createElement('tr');
    row.className = `${team}${alive ? '' : ' down'}`;
    const values = [person.name, person.kills, person.deaths, Math.round(person.dmg), alive ? 'UP' : 'DOWN'];
    values.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.appendChild(cell);
    });
    return row;
  }

  function divider(label) {
    const row = document.createElement('tr');
    row.className = 'team-divider';
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = label;
    row.appendChild(cell);
    return row;
  }

  return {
    onPlay(handler) { nodes.play.addEventListener('click', handler); },

    setRound(rounds, clock, phaseText) {
      nodes.crewScore.textContent = rounds.crew;
      nodes.guardScore.textContent = rounds.guards;
      nodes.round.textContent = `ROUND ${String(rounds.number).padStart(2, '0')} · FIRST TO 8`;
      nodes.clock.textContent = formatClock(clock);
      nodes.clock.classList.toggle('urgent', rounds.phase === 'live' && clock <= 20 && clock > 0);
      nodes.phase.hidden = !phaseText;
      if (phaseText) nodes.phase.textContent = phaseText;
    },

    setBomb(text) {
      nodes.objective.hidden = !text;
      if (text) nodes.objective.textContent = text;
    },

    setCrew(mates, guardsAlive) {
      if (!crewBuilt) buildCrew(mates);
      for (const mate of mates) {
        const card = nodes.crew.querySelector(`[data-mate="${mate.name}"]`);
        if (!card) continue;
        card.classList.toggle('dead', !mate.alive);
        card.querySelector('.mate-hp').textContent = mate.alive ? Math.max(0, Math.ceil(mate.health)) : 'KIA';
      }
      nodes.alive.textContent = `${1 + mates.filter((mate) => mate.alive).length} × ${guardsAlive}`;
    },

    setVitals(hp, economy) {
      nodes.hp.textContent = Math.max(0, Math.ceil(hp));
      nodes.hp.classList.toggle('hurt', hp <= 35);
      nodes.lowHealth.style.opacity = hp > 0 && hp <= 35 ? String((35 - hp) / 55) : '0';
      nodes.armor.textContent = economy.armor > 0 ? `VEST ${Math.ceil(economy.armor)}` : 'NO VEST';
      nodes.equipment.textContent = `VEST ${economy.armor > 0 ? 'ON' : '—'} · HELM ${economy.helmet ? 'ON' : '—'}`;
      nodes.money.textContent = `$${economy.money}`;
    },

    setWeapon(weapon, grenadeCount) {
      const spec = weapon.current();
      const ammo = weapon.ammo[weapon.state.index];
      nodes.weapon.textContent = spec.name;
      nodes.weaponClass.textContent = weapon.state.reloadLeft > 0 ? `RELOADING · ${weapon.state.reloadLeft.toFixed(1)}S` : spec.className;
      nodes.mag.textContent = ammo.mag;
      nodes.mag.classList.toggle('empty', ammo.mag === 0);
      nodes.reserve.textContent = `/ ${ammo.reserve}`;
      nodes.inventory.textContent = `FIREPOT ×${grenadeCount} · ${spec.automatic ? 'AUTO' : 'SEMI'}`;
      nodes.heat.style.width = `${Math.min(100, weapon.state.heat / 1.35 * 100)}%`;
    },

    setUse(label, progress, subtext = 'HOLD POSITION') {
      nodes.interact.hidden = !label || progress <= 0;
      if (!label || progress <= 0) return;
      nodes.useLabel.textContent = label;
      nodes.useSub.textContent = subtext;
      nodes.useFill.style.width = `${Math.round(Math.min(1, progress) * 100)}%`;
    },

    hit(killed, persistent = false) {
      hitLeft = persistent ? 999 : 0.16;
      nodes.hitmarker.classList.add('on');
      nodes.hitmarker.classList.toggle('kill', killed);
    },

    hurt() { damageLeft = 0.32; },

    notify(text, persistent = false) {
      toastLeft = persistent ? 999 : 1.8;
      nodes.toast.textContent = text;
      nodes.toast.classList.add('on');
    },

    kill(killer, victim, headshot = false) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      const killerClass = GUARD_NAMES.includes(killer) ? 'guard' : 'crew';
      const victimClass = GUARD_NAMES.includes(victim) ? 'guard' : 'crew';
      row.innerHTML = `<span class="${killerClass}">${killer}</span><span class="hs">${headshot ? 'HEADSHOT' : '›'}</span><span class="${victimClass}">${victim}</span>`;
      nodes.feed.prepend(row);
      while (nodes.feed.childElementCount > 5) nodes.feed.lastElementChild.remove();
    },

    clearFeed() { nodes.feed.textContent = ''; },

    showBoard(data) {
      const key = [
        data.rounds.number, data.rounds.crew, data.rounds.guards, data.status,
        data.player.kills, data.player.deaths, Math.round(data.player.dmg), data.playerAlive,
        ...data.mates.flatMap((mate) => [mate.kills, mate.deaths, Math.round(mate.dmg), mate.alive]),
        ...data.guards.flatMap((guard) => [guard.kills, guard.deaths, Math.round(guard.dmg), guard.alive]),
      ].join('|');
      nodes.board.hidden = false;
      nodes.boardScore.textContent = `${data.rounds.crew} — ${data.rounds.guards}`;
      nodes.boardSubtitle.textContent = `ROUND ${String(data.rounds.number).padStart(2, '0')} · K / D / DAMAGE`;
      nodes.boardStatus.textContent = data.status || 'HOLD TAB TO REVIEW · FIRST TO EIGHT ROUNDS';
      if (key === boardKey) return;
      boardKey = key;
      nodes.boardBody.textContent = '';
      nodes.boardBody.appendChild(divider('EMBER CREW / ATTACKERS'));
      nodes.boardBody.appendChild(boardRow(data.player, 'crew', data.playerAlive));
      for (const mate of data.mates) nodes.boardBody.appendChild(boardRow(mate, 'crew', mate.alive));
      nodes.boardBody.appendChild(divider('YARD GUARD / DEFENDERS'));
      for (const guard of data.guards) nodes.boardBody.appendChild(boardRow(guard, 'guard', guard.alive));
    },
    hideBoard() { nodes.board.hidden = true; },

    showShop(economy, hp, weapon, roundNumber) {
      nodes.shop.hidden = false;
      nodes.shopMoney.textContent = `$${economy.money}`;
      nodes.shopRound.textContent = String(roundNumber).padStart(2, '0');
      for (const row of shopRows) {
        const key = row.dataset.item;
        const price = key === 'coil' ? 650 : key === 'longsight' ? 1350
          : key === 'vest' ? 650 : key === 'helm' ? 400 : key === 'ammo' ? 300 : key === 'he' ? 400 : 500;
        let owned = false;
        let stock = '';
        if (key === 'vest') { owned = economy.armor >= 100; stock = owned ? 'WORN' : `${Math.ceil(economy.armor)} INTEGRITY`; }
        if (key === 'helm') { owned = economy.helmet; stock = owned ? 'WORN' : 'IN STOCK'; }
        if (key === 'he') { stock = `${weapon.grenades} / 2 CARRIED`; owned = weapon.grenades >= 2; }
        if (key === 'stim') { stock = `${Math.ceil(hp)} HP`; owned = hp >= 100; }
        if (key === 'ammo') stock = 'OWNED WEAPONS';
        if (key === 'coil') { owned = weapon.unlocked[1]; stock = owned ? 'ISSUED' : 'ON RACK'; }
        if (key === 'longsight') { owned = weapon.unlocked[2]; stock = owned ? 'ISSUED' : 'ON RACK'; }
        row.classList.toggle('owned', owned);
        row.classList.toggle('poor', economy.money < price && !owned);
        row.querySelector('.stock').textContent = stock;
      }
    },
    hideShop() { nodes.shop.hidden = true; },

    scope(active) {
      nodes.scope.classList.toggle('on', active);
      nodes.crosshair.style.opacity = active ? '0' : '1';
    },

    showOverlay(mode, data = {}) {
      const content = {
        start: ['TACTICAL THREE.JS / SINGLE PLAYER', 'EMBER<span>LINE</span>', 'Breach a working kiln yard with three autonomous crew mates. Nine guards hold two sites. Plant the Ember or eliminate the defense — first to eight rounds takes the night shift.', 'DEPLOY TO THE YARD'],
        paused: ['OPERATION PAUSED', 'HOLD <span>POSITION</span>', 'The yard is frozen while your pointer is released. Return when you are ready; the round clock and every combatant resume together.', 'RETURN TO THE YARD'],
        victory: ['OPERATION COMPLETE / CREW VICTORY', 'YARD <span>TAKEN</span>', `The Ember crew owns the night shift. Final score ${data.crew ?? 8}—${data.guards ?? 0}. ${data.kills ?? 0} eliminations and ${Math.round(data.dmg ?? 0)} damage from your rifle.`, 'RUN IT AGAIN'],
        defeat: ['OPERATION COMPLETE / GUARD VICTORY', 'YARD <span>LOST</span>', `The defense held the kilns. Final score ${data.crew ?? 0}—${data.guards ?? 8}. Re-arm, use your crew and make every angle count.`, 'TRY AGAIN'],
      }[mode] || null;
      if (!content) return;
      nodes.overlayKicker.textContent = content[0];
      nodes.overlayTitle.innerHTML = content[1];
      nodes.overlayCopy.textContent = content[2];
      nodes.play.textContent = content[3];
      nodes.overlayNote.textContent = mode === 'start' ? 'CLICK TO CAPTURE MOUSE' : 'DESKTOP / MOUSE + KEYBOARD';
      nodes.briefing.hidden = mode !== 'start';
      nodes.overlay.hidden = false;
      if (mode !== 'start') nodes.play.focus();
    },
    hideOverlay() { nodes.overlay.hidden = true; },

    step(dt) {
      if (hitLeft > 0) {
        hitLeft -= dt;
        if (hitLeft <= 0) nodes.hitmarker.classList.remove('on');
      }
      if (damageLeft > 0) {
        damageLeft -= dt;
        nodes.damage.style.opacity = String(Math.max(0, damageLeft / 0.32) * 0.72);
      } else nodes.damage.style.opacity = '0';
      if (toastLeft > 0) {
        toastLeft -= dt;
        if (toastLeft <= 0) nodes.toast.classList.remove('on');
      }
    },
  };
}
