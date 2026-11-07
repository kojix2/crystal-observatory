import { $ } from './dom.js';

// Keep the chosen context while stepping; a new recording starts with its result.
export function setupEventTabs() {
  const names = ['operation', 'context', 'stack', 'source'];
  let trace,
    index,
    current = 'operation';
  const show = (name, focus = false) => {
    if (!names.includes(name)) return;
    current = name;
    for (const candidate of names) {
      const active = candidate === name;
      const button = $(`event-tab-${candidate}`);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      $(`event-${candidate}-panel`).hidden = !active;
    }
    if (focus) $(`event-tab-${name}`).focus({ preventScroll: true });
  };
  for (const [i, name] of names.entries()) {
    const button = $(`event-tab-${name}`);
    button.onclick = () => show(name);
    button.onkeydown = (event) => {
      let next;
      if (event.key === 'ArrowRight') next = names[(i + 1) % names.length];
      if (event.key === 'ArrowLeft') next = names[(i + names.length - 1) % names.length];
      if (event.key === 'Home') next = names[0];
      if (event.key === 'End') next = names.at(-1);
      if (!next) return;
      event.preventDefault();
      event.stopPropagation(); // Arrow keys here must not step History.
      show(next, true);
    };
  }
  $('event-phase').onclick = () => show('context', true);
  return {
    show,
    get current() {
      return current;
    },
    update(model) {
      if (trace === model.trace && index === model.index) return;
      if (trace !== model.trace) show('operation');
      trace = model.trace;
      index = model.index;
      for (const name of names) $(`event-${name}-panel`).scrollTop = 0;
      $('event-panel').querySelector('.event-content').scrollTop = 0;
      for (const id of ['raw-event', 'activity-reason-details']) $(id).open = false;
    },
  };
}
