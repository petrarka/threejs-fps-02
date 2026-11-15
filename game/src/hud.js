// The DOM HUD: crosshair, hit marker, ammo, vitals, purse, round strip and the one overlay
// panel. It never touches the simulation — main.js pushes numbers in and reads the play
// callback out. Overlay copy lives here too, so all player-facing strings sit in one file.
const COPY = {
  start: {
    title: 'Emberline',
    copy: 'A dusk kiln-yard: two sites, one mid, nine guards with real hitscan rounds — and three mates who run with you. Tally entries, Mason plants the Ember, Brack watches the back. First to eight rounds.',
    action: 'Click to play',
  },
  paused: {
    title: 'Emberline',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Yard cleared',
    copy: 'Every dummy is down.',
    action: 'Play again',
  },
  dead: {
    title: 'You went down',
    copy: 'The yard keeps what it takes.',
    action: 'Play again',
  },
  exploded: {
    title: 'Site destroyed',
    copy: 'The fuse ran out and the kilns went up.',
    action: 'Play again',
  },
  defused: {
    title: 'Charge defused',
    copy: 'A warden got his hands on the Ember in time.',
    action: 'Play again',
  },
  victory: {
    title: 'Yard taken',
    copy: 'Three rounds on the board — the kilns are yours.',
    action: 'Play again',
  },
  defeat: {
    title: 'Yard lost',
    copy: 'Three rounds went to the wardens.',
    action: 'Play again',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammo = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const weaponName = document.getElementById('weapon-name');
  const hp = document.getElementById('hp');
  const scoreValue = document.getElementById('score-value');
  const hitmarker = document.getElementById('hitmarker');
  const bomb = document.getElementById('bomb');
  const phase = document.getElementById('phase');
  const round = document.getElementById('round');
  const use = document.getElementById('use');
  const useLabel = document.getElementById('use-label');
  const useFill = document.getElementById('use-fill');
  const money = document.getElementById('money');
  const moneyValue = document.getElementById('money-value');
  const armor = document.getElementById('armor');
  const nades = document.getElementById('nades');
  const shop = document.getElementById('shop');
  const shopMoney = document.getElementById('shop-money');
  const shopRows = Array.from(shop.querySelectorAll('[data-item]'));
  const board = document.getElementById('board');
  const boardTitle = board.querySelector('#board-head span');
  const boardScore = document.getElementById('board-score');
  const boardYou = document.getElementById('board-you');
  const boardFoes = document.getElementById('board-foes');
  const boardMates = document.getElementById('board-mates');
  const matesBar = document.getElementById('mates');
  const killfeed = document.getElementById('killfeed');
  const vignette = document.getElementById('vignette');

  let boardKey = '';
  let hitTimer = 0;
  let lastMatesKey = '';
  let lastMag = -1;
  let lastReserve = -1;
  let lastScore = -1;
  let lastHp = -1;
  let lastWeapon = '';
  let lastMoney = -1;
  let lastArmor = -1;
  let lastNades = -1;

  return {
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) {
      if (name === lastWeapon) return;
      lastWeapon = name;
      weaponName.textContent = name;
    },
    setHp(value) {
      if (value === lastHp) return;
      lastHp = value;
      hp.textContent = String(Math.max(0, value));
      hp.classList.toggle('hurt', value <= 40);
      vignette.classList.toggle('on', value <= 40 && value > 0);
    },
    setScore(value) {
      if (value === lastScore) return;
      lastScore = value;
      scoreValue.textContent = String(value);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      money.classList.toggle('flush', value < 500);
    },
    setArmor(value, helm = 0) {
      const key = `${Math.round(value)}|${helm}`;
      if (key === lastArmor) return;
      lastArmor = key;
      armor.hidden = value <= 0 && !helm;
      const tag = helm ? ' · HELM' : '';
      armor.textContent = value > 0 ? `VEST ${Math.max(0, Math.round(value))}${tag}` : `HELM${tag ? ' ON' : ''}`;
    },
    setNades(value) {
      if (value === lastNades) return;
      lastNades = value;
      nades.hidden = value <= 0;
      nades.textContent = `HE ×${value}`;
    },
    // The buy menu is keyboard-driven (1-5 buy, B closes); main.js passes the full state
    // after every change so affordability and stock lines stay honest.
    showShop(economyState, hpNow, maxHp, catalog) {
      shop.hidden = false;
      shopMoney.textContent = `$${economyState.money}`;
      for (const row of shopRows) {
        const item = catalog.find((entry) => entry.key === row.dataset.item);
        const afford = economyState.money >= item.price;
        let stock = '';
        let owned = false;
        if (item.key === 'vest') {
          owned = economyState.armor >= 100;
          stock = owned ? 'WORN' : `${Math.round(economyState.armor)} left`;
        } else if (item.key === 'he') {
          owned = economyState.nades >= 2;
          stock = `carrying ${economyState.nades}/2`;
        } else if (item.key === 'stim') {
          owned = hpNow >= maxHp;
          stock = `${hpNow} HP`;
        } else if (item.key === 'helm') {
          owned = economyState.helm >= 1;
          stock = owned ? 'WORN' : 'on the shelf';
        }
        row.classList.toggle('poor', !afford && !owned);
        row.classList.toggle('owned', owned);
        const stockNode = row.querySelector('[data-stock]');
        if (stockNode && stockNode.textContent !== stock) stockNode.textContent = stock;
      }
    },
    hideShop() {
      if (!shop.hidden) shop.hidden = true;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' ? `${text.copy} You scored ${score}.` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    setBomb(text) {
      if (!text) {
        if (!bomb.hidden) bomb.hidden = true;
        return;
      }
      if (bomb.hidden) bomb.hidden = false;
      if (bomb.textContent !== text) bomb.textContent = text;
    },
    // The match strip: intermission/freeze banner up top, round score under it.
    setPhase(text) {
      if (!text) {
        if (!phase.hidden) phase.hidden = true;
        return;
      }
      if (phase.hidden) phase.hidden = false;
      if (phase.textContent !== text) phase.textContent = text;
    },
    setRound(text) {
      if (round.textContent !== text) round.textContent = text;
    },
    // The kick-table, up during buy time and the intermission. main.js pushes a full
    // snapshot; we repaint only when the joined text actually changes.
    showBoard(boardTitleText, score, youLine, foesLine, matesLine) {
      const key = `${boardTitleText}|${score}|${youLine}|${foesLine}|${matesLine}`;
      if (key === boardKey && !board.hidden) return;
      boardKey = key;
      boardTitle.textContent = boardTitleText;
      boardScore.textContent = score;
      boardYou.textContent = youLine;
      boardFoes.textContent = foesLine;
      if (boardMates) boardMates.textContent = matesLine || '';
      board.hidden = false;
    },
    hideBoard() {
      boardKey = '';
      if (!board.hidden) board.hidden = true;
    },
    setUse(label, frac) {
      if (label === null || frac === null || frac <= 0) {
        if (!use.hidden) use.hidden = true;
        return;
      }
      if (use.hidden) use.hidden = false;
      if (useLabel.textContent !== label) useLabel.textContent = label;
      const pct = `${Math.min(100, Math.round(frac * 100))}%`;
      if (useFill.style.width !== pct) useFill.style.width = pct;
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    // The kill feed: newest on top, capped at five. Each row is "killer » victim".
    pushKill(killer, victim) {
      const row = document.createElement('div');
      row.className = 'kf';
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = killer;
      const m = document.createElement('span');
      m.className = 'm';
      m.textContent = ' » ';
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = victim;
      row.append(k, m, v);
      killfeed.insertBefore(row, killfeed.firstChild);
      while (killfeed.childElementCount > 5) killfeed.removeChild(killfeed.lastChild);
    },
    // The crew strip: one pip per mate, lit while he is up. Builds its pips once.
    setMates(list) {
      let key = '';
      for (const m of list) key += m.alive ? '1' : '0';
      if (key === lastMatesKey) return;
      lastMatesKey = key;
      for (let i = 0; i < list.length; i += 1) {
        let pip = matesBar.children[i];
        if (!pip) {
          pip = document.createElement('i');
          matesBar.appendChild(pip);
        }
        pip.className = list[i].alive ? 'pip on' : 'pip';
        pip.title = list[i].name;
      }
    },
    clearKillfeed() {
      killfeed.textContent = '';
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}