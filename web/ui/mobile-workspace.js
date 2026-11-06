import { $ } from './dom.js';

// Keep the mobile route separate from saved desktop dimensions and observation tabs.
export function setupMobileWorkspace(onModeChange) {
  const media = window.matchMedia('(max-width: 960px)');
  const app = $('app');
  const navigation = $('mobile-navigation');
  const options = $('header-options');
  const menuButton = $('more-actions');
  const panes = {
    work: $('graph-panel'),
    history: $('timeline'),
    workflow: $('workflow-column'),
    details: $('inspector-panel'),
  };
  const buttons = [...navigation.querySelectorAll('[data-pane]')];
  let current = 'work';
  let wasMobile = false;

  function refresh() {
    const mobile = media.matches;
    const headerFocused =
      options.contains(document.activeElement) || document.activeElement === menuButton;
    const workflowAvailable = !panes.workflow.hidden;
    if (current === 'workflow' && !workflowAvailable) current = 'work';
    app.classList.toggle('mobile', mobile);
    app.dataset.mobilePane = current;
    navigation.hidden = !mobile;
    menuButton.hidden = !mobile;
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
      if (button.dataset.pane === 'workflow') {
        button.disabled = !workflowAvailable;
        button.setAttribute('aria-describedby', workflowAvailable ? '' : 'workflow-unavailable');
      }
    }
    $('workflow-unavailable').hidden = !mobile || workflowAvailable;
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

  function showPane(name, { focus = false } = {}) {
    if (!media.matches || !panes[name] || (name === 'workflow' && panes.workflow.hidden))
      return false;
    current = name;
    refresh();
    if (focus) {
      const target = name === 'details' ? $('event-heading') : panes[name];
      target.focus({ preventScroll: true });
    }
    return true;
  }
  for (const button of buttons) button.onclick = () => showPane(button.dataset.pane);
  // Actions keep their existing handlers and IDs in both layouts.
  options.addEventListener('click', (event) => {
    if (media.matches && event.target.closest('button, a')) options.hidePopover();
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
    get active() {
      return media.matches;
    },
  };
}
