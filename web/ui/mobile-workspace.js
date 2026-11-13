import { $ } from './dom.js';

// Keep the mobile route separate from saved desktop dimensions and observation tabs.
export function setupMobileWorkspace(onModeChange) {
  const media = window.matchMedia('(max-width: 960px)');
  const app = $('app');
  const navigation = $('mobile-navigation');
  const options = $('header-options');
  const menuButton = $('more-actions');
  const inputs = $('runtime-inputs');
  // Restore the same elements (and their handlers) to their desktop positions.
  const relocated = [['compare-view', options]].map(([id, destination]) => {
    const node = $(id);
    return { node, destination, parent: node.parentElement, next: node.nextSibling };
  });
  const panes = {
    work: $('graph-panel'),
    history: $('side-panel'),
    details: $('inspector-panel'),
  };
  const buttons = [...navigation.querySelectorAll('[data-pane]')];
  // Start with the Files tab of the shared Files / compilation trace panel.
  let current = 'history';
  let wasMobile = false;
  let mobileInputsOpen = false;
  let detailContext = { section: 'event', key: null };
  let displayedDetailContext = detailContext;

  function refresh() {
    const mobile = media.matches;
    const headerFocused =
      options.contains(document.activeElement) ||
      document.activeElement === menuButton ||
      relocated.some(
        ({ node, destination }) => destination === options && node.contains(document.activeElement),
      );
    app.classList.toggle('mobile', mobile);
    app.dataset.mobilePane = current;
    navigation.hidden = !mobile;
    menuButton.hidden = !mobile;
    if (mobile !== wasMobile) {
      if (wasMobile) mobileInputsOpen = inputs.open;
      inputs.open = mobile ? mobileInputsOpen : true;
      if (mobile) {
        for (const { node, destination } of relocated) destination.append(node);
      } else {
        for (const { node, parent, next } of [...relocated].reverse())
          parent.insertBefore(node, next);
      }
    }
    if (mobile && !options.hasAttribute('popover')) options.setAttribute('popover', 'auto');
    if (!mobile && options.hasAttribute('popover')) {
      options.hidePopover();
      options.removeAttribute('popover');
    }
    for (const [name, panel] of Object.entries(panes)) {
      const inactive = mobile && name !== current;
      panel.dataset.mobileHidden = String(inactive);
      panel.inert = inactive;
    }
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.pane === current));
    }
    // Do not leave keyboard focus inside a panel that just became hidden.
    const hiddenFocus = Object.values(panes).some(
      (panel) => panel.inert && panel.contains(document.activeElement),
    );
    if (hiddenFocus) buttons.find((button) => button.dataset.pane === current).focus();
    else if (!mobile && wasMobile && navigation.contains(document.activeElement))
      panes[current].focus({ preventScroll: true });
    else if (mobile !== wasMobile && headerFocused)
      (mobile ? menuButton : $('language')).focus({ preventScroll: true });
    wasMobile = mobile;
  }

  function setDetailContext(section, key) {
    detailContext = { section, key };
  }
  function showPane(name, { focus = false, section = detailContext.section } = {}) {
    if (!media.matches || !panes[name]) return false;
    current = name;
    refresh();
    const newDetail =
      name === 'details' &&
      (displayedDetailContext.section !== section ||
        displayedDetailContext.key !== detailContext.key);
    if (focus || newDetail) {
      // Reset only for a new selection, preserving reading position on a round trip.
      if (name === 'details') panes.details.scrollTop = 0;
      const target = name === 'details' ? $(`${section}-panel`) : panes[name];
      target.focus({ preventScroll: true });
      if (name === 'details' && section === 'node')
        $('node-panel').scrollIntoView({ block: 'start', inline: 'nearest' });
    }
    if (name === 'details') displayedDetailContext = { section, key: detailContext.key };
    return true;
  }
  for (const button of buttons) button.onclick = () => showPane(button.dataset.pane);
  // Actions keep their existing handlers and IDs in both layouts.
  options.addEventListener('click', (event) => {
    if (media.matches && event.target.closest('button, a')) options.hidePopover();
  });
  options.addEventListener('change', (event) => {
    if (media.matches && event.target.id === 'compare-view') options.hidePopover();
  });
  media.addEventListener('change', onModeChange);

  // Mobile keyboards can resize only the visual viewport, leaving 100dvh unchanged.
  const viewport = window.visualViewport;
  function resizeViewport() {
    document.documentElement.classList.toggle(
      'short-viewport',
      media.matches && (viewport?.height ?? window.innerHeight) < 360,
    );
    if (media.matches && viewport && viewport.scale === 1) {
      document.documentElement.style.setProperty('--viewport-height', `${viewport.height}px`);
    } else document.documentElement.style.removeProperty('--viewport-height');
  }
  viewport?.addEventListener('resize', resizeViewport);
  media.addEventListener('change', resizeViewport);
  resizeViewport();
  return {
    refresh,
    showPane,
    setDetailContext,
    get active() {
      return media.matches;
    },
  };
}
