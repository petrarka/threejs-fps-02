// Browser input only. The simulation receives a small, stable state object and
// never has to know about DOM events or pointer-lock vendor details.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = {
    keys,
    locked: false,
    firing: false,
    aiming: false,
    clicks: 0,
    mouseX: 0,
    mouseY: 0,
  };

  const clearButtons = () => {
    state.firing = false;
    state.aiming = false;
    state.clicks = 0;
  };

  window.addEventListener('keydown', (event) => {
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
    if (['Space', 'Tab', 'KeyB'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
    clearButtons();
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
    }
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      pressed.clear();
      clearButtons();
      state.mouseX = 0;
      state.mouseY = 0;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    consumeLook() {
      const look = { x: state.mouseX, y: state.mouseY };
      state.mouseX = 0;
      state.mouseY = 0;
      return look;
    },
    consumeClick() {
      if (!state.clicks) return false;
      state.clicks -= 1;
      return true;
    },
    consumeKey(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    endFrame() {
      pressed.clear();
    },
    injectKey(code) {
      keys.add(code);
      pressed.add(code);
    },
    releaseKey(code) {
      keys.delete(code);
      pressed.delete(code);
    },
  };
}
