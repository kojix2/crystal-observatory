import { $ } from './dom.js';

// Selection changes reset the inspector; replay/localization of the same node
// preserve the reader's tab and scroll. Explicit history actions may choose a tab.
export function setupNodeTabs() {
  const names = ['overview', 'activities', 'ir'];
  let trace,
    selected,
    current = 'overview';
  const show = (name, focus = false) => {
    if (!names.includes(name)) return;
    current = name;
    for (const candidate of names) {
      const active = candidate === current;
      const button = $(`node-tab-${candidate}`);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      $(`node-${candidate}-panel`).hidden = !active;
    }
    if (focus) $(`node-tab-${current}`).focus({ preventScroll: true });
  };
  for (const [index, name] of names.entries()) {
    const button = $(`node-tab-${name}`);
    button.onclick = () => show(name);
    button.onkeydown = (event) => {
      let next;
      if (event.key === 'ArrowRight') next = names[(index + 1) % names.length];
      if (event.key === 'ArrowLeft') next = names[(index + names.length - 1) % names.length];
      if (event.key === 'Home') next = names[0];
      if (event.key === 'End') next = names.at(-1);
      if (!next) return;
      event.preventDefault();
      event.stopPropagation(); // Do not step History with the tab's arrow keys.
      show(next, true);
    };
  }
  return {
    show,
    get current() {
      return current;
    },
    update(model, id) {
      if (trace === model.trace && selected === id) return;
      trace = model.trace;
      selected = id;
      $('node-expand-code').ariaExpanded = 'false';
      show('overview');
      for (const name of names) $(`node-${name}-panel`).scrollTop = 0;
      $('node-panel').querySelector('.node-content').scrollTop = 0;
    },
  };
}
