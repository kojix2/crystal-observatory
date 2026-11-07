// Columns and the stacked inspector share keyboard/pointer behavior.
export function bindDivider(
  handle,
  { axis, enabled, measure, move, reset, persist, keyboard = true },
) {
  const coordinate = axis === 'x' ? 'clientX' : 'clientY';
  const keys = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  let drag;
  handle.addEventListener('pointerdown', (event) => {
    if (!enabled() || event.button !== 0) return;
    drag = { origin: event[coordinate], sizes: measure() };
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('dragging');
    document.body.classList.add('resizing');
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (drag) move(drag.sizes, event[coordinate] - drag.origin);
  });
  const finish = () => {
    if (!drag) return;
    drag = null;
    handle.classList.remove('dragging');
    document.body.classList.remove('resizing');
    persist();
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    handle.addEventListener(name, finish);
  handle.addEventListener('dblclick', () => {
    if (enabled()) {
      reset();
      persist();
    }
  });
  if (keyboard)
    handle.addEventListener('keydown', (event) => {
      if (!enabled() || ![...keys, 'Home'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Home') reset();
      else move(measure(), (event.key === keys[1] ? 1 : -1) * (event.shiftKey ? 40 : 12));
      persist();
    });
}
export function range(handle, value, min, max) {
  handle.setAttribute('aria-valuemin', min);
  handle.setAttribute('aria-valuemax', Math.round(max));
  handle.setAttribute('aria-valuenow', Math.round(value));
  handle.setAttribute('aria-valuetext', `${Math.round(value)}px`);
}
