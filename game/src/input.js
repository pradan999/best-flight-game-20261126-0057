// input.js — keyboard and mouse. Arrow keys fly the plane, Shift and
// Control work the throttle, F and G work flaps and gear. The mouse only
// picks menu items, so the game is fully playable from the keyboard.

export function makeInput() {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered keys, consumed once per frame
  const mouse = { x: 0, y: 0, clicked: false, clickedAt: null };

  const codeOf = (event) => event.code;

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) pressed.add(codeOf(event));
    keys.add(codeOf(event));
  }

  function onKeyUp(event) {
    keys.delete(codeOf(event));
  }

  function onMouseMove(event) {
    const rect = event.target.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    const rect = event.target.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.clicked = true;
    mouse.clickedAt = { x: mouse.x, y: mouse.y };
  }

  return {
    attach(canvas) {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mousedown', onMouseDown);
    },
    // Flight controls, read every frame.
    flightState() {
      return {
        pitchUp: keys.has('ArrowUp') || keys.has('KeyW'),
        pitchDown: keys.has('ArrowDown') || keys.has('KeyS'),
        rollLeft: keys.has('ArrowLeft') || keys.has('KeyA'),
        rollRight: keys.has('ArrowRight') || keys.has('KeyD'),
        throttleUp: keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Equal'),
        throttleDown: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('Minus'),
        brakes: keys.has('KeyB') || keys.has('Space'),
        toggleFlaps: pressed.has('KeyF'),
        toggleGear: pressed.has('KeyG'),
      };
    },
    // One-shot keys, for menus and pause.
    wasPressed(code) {
      return pressed.has(code);
    },
    mousePosition() {
      return { x: mouse.x, y: mouse.y };
    },
    consumeClick() {
      if (!mouse.clicked) return null;
      mouse.clicked = false;
      const at = mouse.clickedAt;
      mouse.clickedAt = null;
      return at;
    },
    endFrame() {
      pressed.clear();
    },
  };
}
