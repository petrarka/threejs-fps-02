// Match state machine. World mutation and presentation deliberately live elsewhere.
import { ROUNDS_TO_WIN } from './config.js';

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
    if (state.crew >= ROUNDS_TO_WIN || state.guards >= ROUNDS_TO_WIN) {
      state.phase = 'match';
      state.clock = 0;
      return 'match';
    }
    state.phase = 'over';
    state.clock = INTERMISSION_SECONDS;
    return 'round';
  }

  // A return value describes exactly one boundary crossed on this fixed step.
  function tick(dt, chargeActive) {
    if (!['buy', 'live', 'over'].includes(state.phase)) return null;
    // A planted Ember owns the endgame even after the ordinary round clock expires.
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
