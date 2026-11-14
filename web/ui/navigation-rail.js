import { $ } from './dom.js';

const STORAGE_KEY = 'crystal-observatory.navigation.v1';

export function setupNavigationRail() {
  const buttons = [$('show-navigation-app'), $('show-navigation-learning')];
  const hideButton = $('hide-navigation');
  const setHidden = (hidden, focus = false) => {
    document.body.classList.toggle('navigation-hidden', hidden);
    try {
      localStorage.setItem(STORAGE_KEY, String(hidden));
    } catch {
      /* Private browsing. */
    }
    if (focus) {
      const target = hidden ? ($('app').hidden ? buttons[1] : buttons[0]) : hideButton;
      target.focus({ preventScroll: true });
    }
  };
  try {
    document.body.classList.toggle(
      'navigation-hidden',
      localStorage.getItem(STORAGE_KEY) === 'true',
    );
  } catch {
    /* Private browsing. */
  }
  hideButton.onclick = () => setHidden(true, true);
  for (const button of buttons) button.onclick = () => setHidden(false, true);
  return { show: () => setHidden(false) };
}
