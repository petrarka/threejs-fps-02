// hud.js — every DOM pixel of the interface: clock and score, the quiet
// key-hint line, money and ammo, the alive-pip crew strip, the kick-table
// that names all nine guards with their K/D/DMG, hitmarkers, the scope
// shade, the plant bar, the buy menu, and the round/match boards.
import { MATCH, ECON } from './config.js';
import { clamp } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(G) {
    this.G = G;
    this.el = {
      clock: $('clock'), scoreUs: $('score-us'), scoreThem: $('score-them'), roundline: $('roundline'),
      roster: $('roster-rows'), feed: $('feed'), hp: $('hp'), armorLine: $('armor-line'),
      crew: $('crew'), money: $('money'), weaponName: $('weapon-name'), ammo: $('ammo'),
      gear: $('gear-line'), hint: $('hint'), cross: $('crosshair'), hitmark: $('hitmarker'),
      scope: $('scope'), progress: $('progress'), progressFill: document.querySelector('#progress .fill'),
      progressLbl: document.querySelector('#progress .lbl'),
      bigline: $('bigline'), subline: $('subline'),
      buymenu: $('buymenu'), buyMoney: $('buy-money'), buyItems: $('buy-items'), buyClock: $('buy-clock'),
      menu: $('menu'), board: $('board'), boardTitle: $('board-title'), boardSub: $('board-sub'),
      boardTable: $('board-table'), boardNext: $('board-next'),
      matchend: $('matchend'), matchTitle: $('match-title'), matchSub: $('match-sub'), matchTable: $('match-table'),
      dmgflash: $('dmgflash'),
    };
    this._rosterRows = null;
    this._pips = null;
    this._hitT = 0;
    this._flashT = 0;
    this._spectateText = null;
    this._buildPips();
  }

  // --- one-shot feedback ------------------------------------------------
  hitmarker(head) {
    const el = this.el.hitmark;
    el.classList.toggle('head', !!head);
    el.classList.remove('show');
    void el.offsetWidth; // restart the fade
    el.classList.add('show');
    this._hitT = 0.3;
  }

  damageFlash() {
    this._flashT = 0.35;
    this.el.dmgflash.style.opacity = '1';
  }

  feed(msg, mine = false) {
    const div = document.createElement('div');
    div.textContent = msg;
    if (mine) div.className = 'me';
    this.el.feed.prepend(div);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => { div.style.opacity = '0.35'; }, 3600);
  }

  spectate(text) { this._spectateText = text; }

  progress(p, label = 'PLANTING THE EMBER') {
    if (p > 0) {
      this.el.progress.style.display = 'block';
      this.el.progressLbl.textContent = label;
      this.el.progressFill.style.width = `${Math.round(clamp(p, 0, 1) * 100)}%`;
    } else {
      this.el.progress.style.display = 'none';
    }
  }

  big(text, sub = '') {
    this.el.bigline.textContent = text;
    this.el.subline.textContent = sub;
  }

  // --- roster / pips ------------------------------------------------------
  _buildPips() {
    this.el.crew.innerHTML = '';
    const names = ['YOU', 'TALLY', 'MASON', 'BRACK'];
    this._pips = names.map((n, i) => {
      const d = document.createElement('div');
      d.className = 'pip' + (i === 0 ? ' you' : '');
      d.innerHTML = `<i></i>${n}`;
      this.el.crew.appendChild(d);
      return d;
    });
  }

  _buildRoster() {
    const G = this.G;
    this.el.roster.innerHTML = '';
    this._rosterRows = [];
    const addRow = (e, cls = '') => {
      const row = document.createElement('div');
      row.className = 'row ' + cls;
      row.innerHTML = `<span class="nm">${e.name}</span><span class="kdd">0/0/0</span>`;
      this.el.roster.appendChild(row);
      this._rosterRows.push({ e, row, kdd: row.querySelector('.kdd') });
    };
    for (const g of G.guards) addRow(g);
    const sep = document.createElement('div');
    sep.className = 'row';
    sep.innerHTML = '<span class="nm" style="color:#7dd87d">— crew —</span><span></span>';
    this.el.roster.appendChild(sep);
    addRow(G.player, 'mate');
    for (const m of G.mates) addRow(m, 'mate');
  }

  // --- buy menu -------------------------------------------------------------
  showBuy(show) {
    this.el.buymenu.style.display = show ? 'block' : 'none';
    if (show) this.updateBuy();
  }

  updateBuy() {
    const G = this.G;
    this.el.buyMoney.textContent = `$${G.economy.money}`;
    this.el.buyItems.innerHTML = '';
    for (const item of G.economy.menu(G.player)) {
      const row = document.createElement('div');
      row.className = 'item' + (item.owned ? ' owned' : item.affordable ? '' : ' cant');
      row.innerHTML = `<span><span class="k">${item.key}</span>${item.name}</span><span>${item.owned ? 'OWNED' : '$' + item.price}</span>`;
      row.title = item.desc;
      this.el.buyItems.appendChild(row);
    }
  }

  // --- boards -----------------------------------------------------------------
  showMenu(show) { this.el.menu.style.display = show ? 'block' : 'none'; }

  _boardRows(table, title) {
    const G = this.G;
    const row = (e, cls = '') =>
      `<tr class="${cls}"><td class="${e.alive ? '' : 'dead'}">${e.name}</td><td>${e.stats.k}</td><td>${e.stats.d}</td><td>${e.stats.dmg}</td></tr>`;
    table.innerHTML = `
      <tr><th>${title}</th><th>K</th><th>D</th><th>DMG</th></tr>
      ${row(G.player, 'mate')}
      ${G.mates.map((m) => row(m)).join('')}
      <tr><th>GUARDS</th><th></th><th></th><th></th></tr>
      ${G.guards.map((g) => row(g)).join('')}`;
  }

  showBoard(won, reason) {
    const G = this.G;
    this.el.board.style.display = 'block';
    this.el.boardTitle.textContent = won ? 'ROUND WON' : 'ROUND LOST';
    this.el.boardTitle.style.color = won ? 'var(--ember)' : 'var(--bad)';
    this.el.boardSub.textContent = reason;
    this._boardRows(this.el.boardTable, 'CREW');
    this.el.boardNext.textContent = `next: round ${G.rounds.round + 1} · buy time in a moment`;
  }

  hideBoard() { this.el.board.style.display = 'none'; }

  showMatch(won) {
    const G = this.G;
    this.el.matchend.style.display = 'block';
    this.el.matchTitle.textContent = won ? 'MATCH WON' : 'MATCH LOST';
    this.el.matchTitle.style.color = won ? 'var(--ember)' : 'var(--bad)';
    this.el.matchSub.textContent = `final: crew ${G.rounds.wins.crew} — ${G.rounds.wins.guards} guards, over ${G.rounds.round} rounds`;
    this._boardRows(this.el.matchTable, 'CREW');
  }

  hideMatch() { this.el.matchend.style.display = 'none'; }

  // --- per-frame ------------------------------------------------------------
  update(dt) {
    const G = this.G;
    const p = G.player;
    const r = G.rounds;

    if (!this._rosterRows) this._buildRoster();

    // on the title screen the chrome stays out of the way
    const inMenu = r.phase === 'menu';
    if (inMenu !== this._wasMenu) {
      this._wasMenu = inMenu;
      const show = inMenu ? 'none' : '';
      document.getElementById('topbar').style.display = show;
      document.getElementById('roster').style.display = show;
      document.getElementById('vitals').style.display = show;
      document.getElementById('loadout').style.display = show;
      document.getElementById('hint').style.display = show;
      document.getElementById('radar-wrap').style.display = show;
    }
    if (inMenu) return;

    // clock + phase
    const t = Math.max(0, r.timeLeft);
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    this.el.clock.textContent = r.phase === 'buy' ? `0:${String(Math.ceil(t)).padStart(2, '0')} BUY` : `${mm}:${String(ss).padStart(2, '0')}`;
    this.el.clock.classList.toggle('low', r.phase === 'live' && t < 10);
    this.el.scoreUs.textContent = r.wins.crew;
    this.el.scoreThem.textContent = r.wins.guards;
    this.el.roundline.textContent = `ROUND ${r.round} · FIRST TO ${MATCH.roundsToWin}${G.bomb.state === 'planted' ? ' · EMBER PLANTED' : ''}`;

    // vitals
    const hp = Math.ceil(p.hp);
    this.el.hp.textContent = hp;
    this.el.hp.className = 'hp' + (hp < 30 ? ' crit' : hp < 65 ? ' hurt' : '');
    this.el.armorLine.textContent = `VEST ${p.vest ? '●' : '—'} · HELM ${p.helm ? '●' : '—'} · STIM ${p.stims}`;
    this._pips[0].classList.toggle('dead', !p.alive);
    G.mates.forEach((m, i) => this._pips[i + 1].classList.toggle('dead', !m.alive));

    // loadout
    this.el.money.textContent = `$${G.economy.money}`;
    this.el.weaponName.textContent = p.def.name + (p.ws.reloading ? ' · RELOADING' : '');
    this.el.ammo.innerHTML = `${p.ws.mag} <span class="res">/ ${p.ws.reserve}</span>`;
    this.el.gear.textContent = `FIREPOT ×${p.grenades}${p.hasBomb ? ' · ◆ THE EMBER' : ''}`;

    // roster rows
    for (const { e, row, kdd } of this._rosterRows) {
      kdd.textContent = `${e.stats.k}/${e.stats.d}/${e.stats.dmg}`;
      row.classList.toggle('dead', !e.alive);
    }

    // crosshair spread + scope
    const spreadPx = 4 + p.ws.spreadDeg(p) * 6;
    this.el.cross.style.setProperty('--sp', `${spreadPx}px`);
    this.el.cross.style.display = p.scoped || !p.alive ? 'none' : 'block';
    this.el.scope.style.display = p.scoped ? 'block' : 'none';

    // hint line: the quietest useful sentence for this exact moment
    this.el.hint.innerHTML = this._hint();

    // big line (spectate overrides)
    if (this._spectateText && !p.alive) {
      this.el.bigline.textContent = this._spectateText;
      this.el.subline.textContent = '';
    } else if (r.phase === 'live' && G.bomb.state === 'planted') {
      this.el.bigline.textContent = '';
      this.el.subline.textContent = `the Ember burns at site ${G.bomb.site ? G.bomb.site.id : '?'} — hold them off`;
    }

    // fades
    if (this._hitT > 0) { this._hitT -= dt; if (this._hitT <= 0) this.el.hitmark.classList.remove('show'); }
    if (this._flashT > 0) {
      this._flashT -= dt;
      this.el.dmgflash.style.opacity = String(Math.max(0, this._flashT / 0.35) * 0.9);
    }
  }

  _hint() {
    const G = this.G;
    const p = G.player;
    const r = G.rounds;
    if (r.phase === 'buy') return `<b>1-7</b> buy from the quartermaster · <b>${Math.ceil(r.timeLeft)}s</b> · money carries between rounds`;
    if (!p.alive) return `no mid-round respawns — the crew fights on`;
    if (p.hasBomb && G.world.onSite(p.pos.x, p.pos.z)) return `<b>E</b> hold to plant the Ember`;
    if (p.hasBomb) return `you carry the Ember — reach a site · <b>E</b> plants`;
    if (G.bomb.state === 'dropped') return `the Ember is down — walk over it to pick it up`;
    if (p.scoped) return `breathing moves the sight · <b>RMB</b> to lower the scope`;
    const bits = [`<b>LMB</b> fire`, `<b>R</b> reload`];
    if (p.weapons.coil || p.weapons.long) bits.push(`<b>1/2/3</b> weapons`);
    if (p.grenades > 0) bits.push(`<b>G</b> firepot`);
    if (p.stims > 0) bits.push(`<b>X</b> stim`);
    bits.push(`<b>Shift</b> quiet`);
    return bits.join(' · ');
  }
}
