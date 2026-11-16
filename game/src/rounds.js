// rounds.js — the referee. Buy time, the live clock, honest time-expiry
// losses, elimination checks (which the planted Ember suspends — once it's
// in, only the fuse or a defuse decides), round boards, money between
// rounds, and the first-to-eight match call.
import { MATCH, ECON } from './config.js';

export class Rounds {
  constructor(G) {
    this.G = G;
    this.phase = 'menu'; // menu | buy | live | board | match
    this.round = 1;
    this.wins = { crew: 0, guards: 0 };
    this.timeLeft = 0;
    this._buyMenuShown = false;
  }

  startMatch() {
    const G = this.G;
    this.round = 1;
    this.wins = { crew: 0, guards: 0 };
    G.economy.resetMatch();
    for (const e of G.targets.list) e.stats = { k: 0, d: 0, dmg: 0 };
    G.hud.hideMatch();
    this.startRound();
  }

  startRound() {
    const G = this.G;
    G.hearing.reset();
    G.grenades.reset();
    G.player.reset(G.spawns.crew[0]);
    G.crew.reset();
    G.squad.reset();
    G.hud.hideBoard();
    G.hud.big('');
    G.hud.spectate(null);
    G.hud._rosterRows = null; // names persist, rows rebuild lazily
    this.phase = 'buy';
    this.timeLeft = MATCH.buyTime;
    this._buyMenuShown = false;
    G.hud.showBuy(true);
    G.hud.feed(`— round ${this.round} —`, false);
  }

  // --- events ------------------------------------------------------------
  onKill(attacker, victim, part) {
    const G = this.G;
    const an = attacker ? attacker.name : 'the kilnwash';
    const head = part === 'head' ? ' ⌖' : '';
    G.hud.feed(`${an} ▸ ${victim.name}${head}`, attacker === G.player || victim === G.player);
    if (attacker === G.player && victim.team === 'guard') G.economy.award('kill');
    if (victim === G.player) G.hud.spectate('YOU ARE DOWN');
  }

  onPlanted(planter, site) {
    const G = this.G;
    G.economy.award('plant');
    G.hud.big('THE EMBER IS IN', `site ${site.id} — ${MATCH.fuseTime}s on the fuse`);
    G.hud.feed(`${planter.name} plants the Ember at ${site.id}`, true);
  }

  onDefused(guard) {
    this.endRound('guards', `${guard.name} defused the Ember`);
  }

  onDetonated() {
    this.endRound('crew', 'the Ember bloomed');
  }

  // --- flow ----------------------------------------------------------------
  endRound(winner, reason) {
    const G = this.G;
    if (this.phase !== 'live') return;
    this.phase = 'board';
    this.timeLeft = MATCH.boardTime;
    this.wins[winner] += 1;
    const won = winner === 'crew';
    G.economy.award(won ? 'win' : 'loss');
    if (won) G.sound.roundWin(); else G.sound.roundLose();
    G.hud.progress(0);
    G.hud.showBoard(won, reason);
    if (this.wins[winner] >= MATCH.roundsToWin) {
      this.phase = 'match';
      if (won) G.sound.matchWin(); else G.sound.matchLose();
      G.hud.hideBoard();
      G.hud.showMatch(won);
    }
  }

  update(dt) {
    const G = this.G;
    if (this.phase === 'buy') {
      this.timeLeft -= dt;
      G.hud.el.buyClock.textContent = `${Math.ceil(Math.max(0, this.timeLeft))}s`;
      if (!this._buyMenuShown) { G.hud.showBuy(true); this._buyMenuShown = true; }
      if (this.timeLeft <= 0) {
        this.phase = 'live';
        this.timeLeft = MATCH.roundTime;
        G.hud.showBuy(false);
        G.hud.big('MOVE OUT', 'take a site — or take them all');
        this._bigT = 2.5;
      }
      return;
    }
    if (this.phase === 'live') {
      if (this._bigT > 0) { this._bigT -= dt; if (this._bigT <= 0) G.hud.big(''); }
      if (G.bomb.state !== 'planted') {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.endRound('guards', 'the clock ran out — no plant, no round');
          return;
        }
      }
      const crewAlive = G.targets.alive('crew').length;
      const guardsAlive = G.targets.alive('guard').length;
      if (G.bomb.state !== 'planted') {
        if (guardsAlive === 0) { this.endRound('crew', 'the yard is quiet — all nine guards down'); return; }
        if (crewAlive === 0) { this.endRound('guards', 'the crew is gone'); return; }
      }
      return;
    }
    if (this.phase === 'board') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.round += 1;
        this.startRound();
      }
      return;
    }
    // 'match' and 'menu' wait on the player, not the clock
  }
}
