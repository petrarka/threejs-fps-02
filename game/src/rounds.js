// Match state machine: buy phase, live round, intermission, match over.
// It owns clocks and scores only — world mutation and presentation live elsewhere.
import { ROUNDS_FOR_MATCH } from './config.js';

export const BUY_SECONDS = 7;
export const ROUND_SECONDS = 115;
export const INTERMISSION_SECONDS = 4;

export function createRounds() {
  const state = {
    phase: 'idle',
    number: 1,
    crew: 0,
    guards: 0,
    clock: 0,
    lastResult: '',
  };

  function start() {
    state.phase = 'buy';
    state.number = 1;
    state.crew = 0;
    state.guards = 0;
    state.clock = BUY_SECONDS;
    state.lastResult = '';
  }

  function finish(crewWon, reason) {
    if (!['live', 'buy'].includes(state.phase)) return 'ignored';
    if (crewWon) state.crew += 1;
    else state.guards += 1;
    state.lastResult = reason;
    if (state.crew >= ROUNDS_FOR_MATCH || state.guards >= ROUNDS_FOR_MATCH) {
      state.phase = 'match';
      state.clock = 0;
      return 'match';
    }
    state.phase = 'over';
    state.clock = INTERMISSION_SECONDS;
    return 'round';
  }

  // Returns the single boundary crossed on this fixed step, if any.
  function tick(dt, chargeActive) {
    if (!['buy', 'live', 'over'].includes(state.phase)) return null;
    // A planted Ember owns the endgame even after the round clock expires.
    if (state.phase === 'live' && chargeActive) return null;
    state.clock = Math.max(0, state.clock - dt);
    if (state.clock > 0) return null;
    if (state.phase === 'buy') {
      state.phase = 'live';
      state.clock = ROUND_SECONDS;
      return 'live';
    }
    if (state.phase === 'over') {
      state.number += 1;
      state.phase = 'buy';
      state.clock = BUY_SECONDS;
      return 'buy';
    }
    return 'timeout';
  }

  return { state, start, finish, tick };
}
