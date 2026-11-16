// Pointer-lock input. The simulation only ever sees this small state object;
// every DOM and vendor detail is quarantined here.
export function createInput(canvas, onLockChange) {
  const held = new Set();
  const tapped = new Set();
  const state = {
    keys: held,
    locked: false,
    firing: false,
    aiming: false,
    clicks: 0,
    mouseX: 0,
    mouseY: 0,
  };

  function dropButtons() {
    state.firing = false;
    state.aiming = false;
    state.clicks = 0;
  }

  window.addEventListener('keydown', (event) => {
    if (!held.has(event.code)) tapped.add(event.code);
    held.add(event.code);
    if (['Space', 'Tab', 'KeyB'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    tapped.clear();
    dropButtons();
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.mouseX += event.movementX;
    state.mouseY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) {
      state.firing = true;
      state.clicks += 1;
    } else if (event.button === 2) {
      state.aiming = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      held.clear();
      tapped.clear();
      dropButtons();
      state.mouseX = 0;
      state.mouseY = 0;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() { canvas.requestPointerLock(); },
    consumeLook() {
      const delta = { x: state.mouseX, y: state.mouseY };
      state.mouseX = 0;
      state.mouseY = 0;
      return delta;
    },
    consumeClick() {
      if (!state.clicks) return false;
      state.clicks -= 1;
      return true;
    },
    consumeKey(code) {
      if (!tapped.has(code)) return false;
      tapped.delete(code);
      return true;
    },
    endFrame() { tapped.clear(); },
    // Shot-mode hooks: deterministic scenes drive keys without a real keyboard.
    injectKey(code) {
      held.add(code);
      tapped.add(code);
    },
    releaseKey(code) {
      held.delete(code);
      tapped.delete(code);
    },
  };
}
