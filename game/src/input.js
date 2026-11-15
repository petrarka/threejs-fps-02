// Keyboard and mouse plus the pointer lock that turns the mouse into a look device.
// Plain browser APIs: the game asks the canvas for pointer lock and reads movementX/Y
// while it holds it. Semi-auto weapons consume one queued shot per click; full-auto
// weapons read the held `firing` flag instead.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0, queuedShots: 0 };

  window.addEventListener('contextmenu', (event) => event.preventDefault());

  function setKey(event, down) {
    if (down) keys.add(event.code);
    else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => keys.clear());

  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });

  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 2) {
      state.aiming = true;
      return;
    }
    if (event.button !== 0) return;
    state.firing = true;
    state.queuedShots += 1;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 2) state.aiming = false;
    if (event.button === 0) state.firing = false;
  });

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.aiming = false;
      state.queuedShots = 0;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takeQueuedShot() {
      if (state.queuedShots <= 0) return false;
      state.queuedShots -= 1;
      return true;
    },
  };
}