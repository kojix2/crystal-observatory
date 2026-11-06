import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWorkspace } from '../web/ui/workspace.js';
import { TraceView } from '../web/ui/trace-view.js';
import { ViewLayout } from '../web/core/view-layout.js';

// Exercise the real workspace controller with browser primitives replaced at the boundary.
function workspace({ mobile = true, saved = {} } = {}, run) {
  const originals = new Map();
  const install = (key, value) => {
    originals.set(key, globalThis[key]);
    globalThis[key] = value;
  };
  const elements = new Map();
  const element = (id) => {
    if (elements.has(id)) return elements.get(id);
    const attributes = new Map(),
      classes = new Set(),
      listeners = new Map();
    const node = {
      id,
      dataset: {},
      hidden: false,
      inert: false,
      clientWidth: 1440,
      clientHeight: 600,
      scrollTop: 0,
      scrollLeft: 0,
      style: {
        setProperty(key, value) {
          this[key] = value;
        },
        removeProperty(key) {
          delete this[key];
        },
      },
      classList: {
        contains: (key) => classes.has(key),
        add: (key) => classes.add(key),
        remove: (key) => classes.delete(key),
        toggle(key, value = !classes.has(key)) {
          if (value) classes.add(key);
          else classes.delete(key);
        },
      },
      setAttribute: (key, value) => attributes.set(key, String(value)),
      getAttribute: (key) => attributes.get(key),
      removeAttribute: (key) => attributes.delete(key),
      hasAttribute: (key) => attributes.has(key),
      addEventListener: (key, fn) => listeners.set(key, fn),
      focus() {
        document.activeElement = this;
      },
      contains(target) {
        return this === target || target?.parent === this;
      },
      hidePopover() {
        this.popoverClosed = true;
      },
      querySelectorAll: () => [],
    };
    elements.set(id, node);
    return node;
  };
  const buttons = ['work', 'history', 'workflow', 'details'].map((pane) => {
    const button = element(`nav-${pane}`);
    button.dataset.pane = pane;
    button.parent = element('mobile-navigation');
    return button;
  });
  element('mobile-navigation').querySelectorAll = () => buttons;
  element('workflow-column').hidden = true;
  const mediaListeners = [];
  const media = { matches: mobile, addEventListener: (_, fn) => mediaListeners.push(fn) };
  const viewportListeners = [];
  const viewport = {
    height: 740,
    scale: 1,
    addEventListener: (_, fn) => viewportListeners.push(fn),
  };
  const storageKey = 'crystal-observatory.workspace.v5';
  const storage = new Map([[storageKey, JSON.stringify(saved)]]);
  install('document', {
    getElementById: element,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: element('html'),
    activeElement: null,
  });
  install('window', { matchMedia: () => media, visualViewport: viewport, addEventListener() {} });
  install('localStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  });
  install(
    'ResizeObserver',
    class {
      observe() {}
    },
  );
  try {
    const controller = setupWorkspace(() => {});
    run({
      controller,
      element,
      buttons,
      storage,
      storageKey,
      resize(value) {
        media.matches = value;
        for (const fn of mediaListeners) fn();
      },
      resizeViewport(height, scale = 1) {
        Object.assign(viewport, { height, scale });
        for (const fn of viewportListeners) fn();
      },
    });
  } finally {
    for (const [key, value] of originals) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

test('mobile navigation exposes one accessible pane and retains history scroll and selection', () => {
  workspace({}, ({ controller, element, buttons }) => {
    assert.equal(controller.mobile, true);
    assert.equal(element('app').dataset.mobilePane, 'work');
    assert.equal(element('timeline').inert, true);
    assert.equal(element('graph-panel').inert, false);
    assert.equal(element('header-options').getAttribute('popover'), 'auto');
    assert.equal(buttons[2].disabled, true);
    assert.equal(element('workflow-unavailable').hidden, false);
    assert.equal(controller.showPane('workflow'), false);
    element('trace-content').scrollTop = 237;
    element('search').value = 'MainVisitor';
    buttons[1].onclick();
    assert.equal(element('timeline').inert, false);
    element('timeline').focus();
    controller.showPane('details', { focus: true });
    assert.equal(document.activeElement.id, 'event-heading');
    assert.equal(element('timeline').inert, true);
    buttons[1].onclick();
    assert.equal(element('trace-content').scrollTop, 237);
    assert.equal(element('search').value, 'MainVisitor');
    element('workflow-column').hidden = false;
    controller.refresh();
    assert.equal(buttons[2].disabled, false);
    assert.equal(controller.showPane('workflow'), true);
    element('workflow-column').hidden = true;
    controller.refresh();
    assert.equal(element('app').dataset.mobilePane, 'work');
  });
});

test('phone and desktop transitions preserve saved layout and disable every phone divider', () => {
  const saved = {
    weights: [25, 45, 30],
    detailRatio: 0.55,
    workflowWidth: 220,
    collapsed: true,
    workflowCollapsed: true,
  };
  workspace({ mobile: false, saved }, ({ controller, element, storage, storageKey, resize }) => {
    const desktop = controller.capture();
    const originalPreference = storage.get(storageKey);
    assert.equal(controller.showPane('history'), false);
    resize(true);
    controller.showPane('details');
    for (const id of [
      'workflow-splitter',
      'timeline-splitter',
      'inspector-splitter',
      'detail-splitter',
      'comparison-splitter',
    ]) {
      assert.equal(element(id).tabIndex, -1);
      assert.equal(element(id).getAttribute('aria-disabled'), 'true');
    }
    assert.equal(element('workbench').style.minWidth, '0');
    assert.deepEqual(controller.capture(), desktop);
    assert.equal(storage.get(storageKey), originalPreference);
    element('nav-details').focus();
    resize(false);
    assert.equal(element('mobile-navigation').hidden, true);
    assert.equal(element('header-options').hasAttribute('popover'), false);
    assert.equal(element('inspector-panel').inert, false);
    assert.equal(document.activeElement.id, 'inspector-panel');
    assert.deepEqual(controller.capture(), desktop);
    assert.equal(storage.get(storageKey), originalPreference);
    resize(true);
    assert.equal(element('app').dataset.mobilePane, 'details');
  });
});

test('explicit event and stage selection opens Details even without a followable AST node', () => {
  const oldDocument = globalThis.document;
  globalThis.document = { getElementById: () => ({ checked: false }) };
  try {
    const destinations = [];
    const view = Object.create(TraceView.prototype);
    Object.assign(view, {
      model: { event: { node_id: 0 } },
      workspace: { showPane: (name) => destinations.push(name) },
      stop() {},
      seek() {},
      renderPhase() {},
      renderSelection() {},
    });
    view.selectEvent(0);
    view.selectStage('link');
    assert.deepEqual(destinations, ['details', 'details']);
    assert.equal(view.selectedStage, 'link');
  } finally {
    globalThis.document = oldDocument;
  }
});

test('keyboard viewport resizing leaves pinch zoom available and desktop height untouched', () => {
  workspace({}, ({ element, resize, resizeViewport }) => {
    const style = element('html').style;
    assert.equal(style['--viewport-height'], '740px');
    resizeViewport(400);
    assert.equal(style['--viewport-height'], '400px');
    resizeViewport(180);
    assert.equal(element('html').classList.contains('short-viewport'), true);
    resizeViewport(200, 2);
    assert.equal(style['--viewport-height'], undefined);
    resizeViewport(740);
    resize(false);
    assert.equal(style['--viewport-height'], undefined);
    assert.equal(element('html').classList.contains('short-viewport'), false);
  });
});

test('observation links reveal Work while declaration stepping keeps the current screen', () => {
  const destinations = [];
  const view = Object.create(TraceView.prototype);
  view.layout = new ViewLayout();
  view.workspace = { showPane: (name) => destinations.push(name) };
  view.applyLayout = () => {};
  view.setView('declarations', { reveal: false });
  assert.equal(view.view, 'declarations');
  assert.deepEqual(destinations, []);
  view.setView('ir');
  assert.deepEqual(destinations, ['work']);
});

test('header focus stays reachable when switching between the menu and desktop toolbar', () => {
  workspace({ mobile: false }, ({ element, resize }) => {
    element('language').parent = element('header-options');
    element('language').focus();
    resize(true);
    assert.equal(document.activeElement.id, 'more-actions');
    resize(false);
    assert.equal(document.activeElement.id, 'language');
  });
});
