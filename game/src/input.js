// Keyboard + mouse + pointer lock. State lives in one object the simulation reads;
// the look delta is consumed once per frame so nothing is double-applied.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    lookX: 0,
    lookY: 0,
    firing: false,
    locked: false,
    // Edge-triggered presses, consumed by the loop once each.
    pressed: new Set(),
  };

  function takeLook() {
    const out = { x: state.lookX, y: state.lookY };
    state.lookX = 0;
    state.lookY = 0;
    return out;
  }

  function takePressed(code) {
    if (state.pressed.has(code)) {
      state.pressed.delete(code);
      return true;
    }
    return false;
  }

  function requestLock() {
    canvas.requestPointerLock();
  }

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(state.locked);
  });

  document.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });

  document.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.pressed.add('MouseScope');
  });

  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.pressed.add('MouseScopeOff');
  });

  document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    state.keys.add(event.code);
    state.pressed.add(event.code);
    if (event.code === 'Tab') event.preventDefault();
  });

  document.addEventListener('keyup', (event) => {
    state.keys.delete(event.code);
  });

  document.addEventListener('contextmenu', (event) => event.preventDefault());

  document.addEventListener('wheel', (event) => {
    if (!state.locked) return;
    state.pressed.add(event.deltaY > 0 ? 'WheelDown' : 'WheelUp');
  }, { passive: true });

  return { state, takeLook, takePressed, requestLock };
}
