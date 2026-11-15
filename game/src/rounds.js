// The match clock: buy time (freeze) -> live round -> intermission. First to eight
// rounds takes the yard. Pure state — main.js owns the world and acts on the
// transitions this module reports; deterministic shot modes bypass it entirely.
export const FREEZE_SECONDS = 6;
export const OVER_SECONDS = 3.2;
export const ROUNDS_TO_WIN = 8;
export const ROUND_SECONDS = 115; // the live round clock: stall it out and the round is lost

export function createRounds() {
  const state = {
    phase: 'idle', // idle | freeze | live | over
    round: 1,
    wins: 0,
    losses: 0,
    clock: 0,      // seconds left inside freeze/over
  };

  function startMatch() {
    state.round = 1;
    state.wins = 0;
    state.losses = 0;
    state.phase = 'freeze';
    state.clock = FREEZE_SECONDS;
  }

  // Returns 'match' when this result decides the match, otherwise 'round'.
  function endRound(result) {
    if (result === 'win') state.wins += 1;
    else state.losses += 1;
    if (state.wins >= ROUNDS_TO_WIN || state.losses >= ROUNDS_TO_WIN) {
      state.phase = 'idle';
      return 'match';
    }
    state.phase = 'over';
    state.clock = OVER_SECONDS;
    return 'round';
  }

  // Counts down freeze/over/live. On a boundary returns the new phase ('live',
  // 'freeze' for the next round, or 'timeout' when the live clock hits zero);
  // null while the current phase still has time left.
  function tick(dt) {
    if (state.phase === 'live') {
      state.clock -= dt;
      if (state.clock <= 0) {
        state.clock = 0;
        return 'timeout';
      }
      return null;
    }
    if (state.phase !== 'freeze' && state.phase !== 'over') return null;
    state.clock -= dt;
    if (state.clock > 0) return null;
    if (state.phase === 'freeze') {
      state.phase = 'live';
      state.clock = ROUND_SECONDS;
      return 'live';
    }
    state.round += 1;
    state.phase = 'freeze';
    state.clock = FREEZE_SECONDS;
    return 'freeze';
  }

  return { state, startMatch, endRound, tick };
}