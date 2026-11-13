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
    assert(
      ![
        'workflow-column',
        'workflow-splitter',
        'compiler-map',
        'toggle-workflow',
        'workflow-unavailable',
        'first',
        'prev',
        'next',
        'last',
        'history-extra-playback',
      ].includes(id),
      `Removed element accessed: ${id}`,
    );
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
      children: [],
      parentElement: null,
      get nextSibling() {
        return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] ?? null;
      },
      append(child) {
        this.insertBefore(child, null);
      },
      insertBefore(child, next) {
        if (child.parentElement) {
          const siblings = child.parentElement.children;
          siblings.splice(siblings.indexOf(child), 1);
        }
        const index = next ? this.children.indexOf(next) : this.children.length;
        this.children.splice(index, 0, child);
        child.parentElement = this;
      },
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
        for (let node = target; node; node = node.parentElement || node.parent)
          if (node === this) return true;
        return false;
      },
      scrollIntoView() {
        this.scrolled = true;
      },
      hidePopover() {
        this.popoverClosed = true;
      },
      querySelectorAll: () => [],
    };
    elements.set(id, node);
    return node;
  };
  const buttons = ['work', 'history', 'details'].map((pane) => {
    const button = element(`nav-${pane}`);
    button.dataset.pane = pane;
    button.parent = element('mobile-navigation');
    return button;
  });
  element('mobile-navigation').querySelectorAll = () => buttons;
  element('mobile-navigation').append(element('more-actions'));
  for (const [parent, children] of [
    ['learning-navigation', ['header-options']],
    ['work-status', ['cancel-job', 'status-message']],
    [
      'source-tools',
      ['compile-actions', 'compile-options', 'prelude-toggle', 'prelude-hint', 'share-source'],
    ],
    ['compile-actions', ['compile-run', 'compile-options-button']],
    ['compile-options', ['compile-only', 'analyze']],
    ['prelude-toggle', ['prelude']],
    ['status-message', ['notice']],
    ['header-options', ['language']],
    ['graph-head', ['view-tabs', 'compare-view', 'maximize-graph']],
    ['playback', ['play', 'scrubber', 'position', 'playback-options', 'history-tools']],
  ])
    for (const id of children) element(parent).append(element(id));
  element('runtime-inputs').open = false;
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
    body: element('body'),
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

test('mobile starts in the side panel and navigation retains scroll and selection', () => {
  workspace({}, ({ controller, element, buttons }) => {
    assert.equal(controller.mobile, true);
    assert.equal(element('app').dataset.mobilePane, 'history');
    assert.equal(element('side-panel').inert, false);
    assert.equal(element('graph-panel').inert, true);
    assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
    assert.equal(element('header-options').getAttribute('popover'), 'auto');
    assert.deepEqual(
      buttons.map((button) => button.dataset.pane),
      ['work', 'history', 'details'],
    );
    assert.equal(controller.showPane('missing'), false);
    buttons[0].onclick();
    controller.refresh();
    assert.equal(element('app').dataset.mobilePane, 'work');
    assert.equal(element('graph-panel').inert, false);
    element('trace-content').scrollTop = 237;
    element('search').value = 'MainVisitor';
    buttons[1].onclick();
    assert.equal(element('side-panel').inert, false);
    element('side-panel').focus();
    element('inspector-panel').scrollTop = 650;
    controller.showPane('details', { focus: true });
    assert.equal(document.activeElement.id, 'event-panel');
    assert.equal(element('inspector-panel').scrollTop, 0);
    assert.equal(element('side-panel').inert, true);
    buttons[1].onclick();
    assert.equal(element('trace-content').scrollTop, 237);
    assert.equal(element('search').value, 'MainVisitor');
  });
});

test('secondary controls move into popovers and restore desktop order without resetting values', () => {
  workspace({ mobile: false }, ({ element, controller, resize }) => {
    const order = element('source-tools').children.map((node) => node.id);
    const playback = element('playback').children.map((node) => node.id);
    element('kind').value = 'type';
    assert.equal(element('header-options').parentElement.id, 'learning-navigation');
    resize(true);
    assert.equal(element('header-options').parentElement.id, 'body');
    assert.equal(element('compare-view').parentElement.id, 'header-options');
    assert.equal(element('compile-only').parentElement.id, 'compile-options');
    assert.equal(element('analyze').parentElement.id, 'compile-options');
    assert.equal(element('runtime-inputs').open, false);
    element('runtime-inputs').open = true;
    element('inspector-panel').scrollTop = 330;
    controller.showPane('details');
    assert.equal(element('inspector-panel').scrollTop, 330);
    controller.showPane('details', { focus: true, section: 'node' });
    assert.equal(document.activeElement.id, 'node-panel');
    assert.equal(element('node-panel').scrolled, true);
    resize(false);
    assert.equal(element('header-options').parentElement.id, 'learning-navigation');
    assert.deepEqual(
      element('source-tools').children.map((node) => node.id),
      order,
    );
    assert.deepEqual(
      element('playback').children.map((node) => node.id),
      playback,
    );
    assert.equal(element('kind').value, 'type');
    resize(true);
    assert.equal(element('runtime-inputs').open, true);
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
    assert(!('workflowWidth' in desktop));
    assert(!('workflowCollapsed' in desktop));
    assert.deepEqual(desktop.weights, saved.weights);
    const originalPreference = storage.get(storageKey);
    assert.equal(controller.showPane('history'), false);
    resize(true);
    controller.showPane('details');
    for (const id of [
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

test('explicit event selection opens Details even without a followable AST node', () => {
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
      renderSelection() {},
    });
    view.selectEvent(0);
    assert.deepEqual(destinations, ['details']);
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

test('settings focus stays reachable between the phone menu and desktop sidebar', () => {
  workspace({ mobile: false }, ({ element, resize }) => {
    element('language').parent = element('header-options');
    element('language').focus();
    resize(true);
    assert.equal(document.activeElement.id, 'more-actions');
    resize(false);
    assert.equal(document.activeElement.id, 'language');
  });
});

test('existing Details navigation follows a new node and preserves reading position otherwise', () => {
  workspace({}, ({ controller, element, buttons }) => {
    const node = { id: 7 };
    controller.setDetailContext('node', node);
    buttons[2].onclick();
    assert.equal(document.activeElement.id, 'node-panel');
    assert.equal(element('node-panel').scrolled, true);
    element('inspector-panel').scrollTop = 330;
    buttons[0].onclick();
    controller.setDetailContext('node', node);
    buttons[2].onclick();
    assert.equal(element('inspector-panel').scrollTop, 330);
    controller.setDetailContext('node', { id: 8 });
    buttons[2].onclick();
    assert.equal(element('inspector-panel').scrollTop, 0);
    controller.setDetailContext('event', { index: 4 });
    buttons[2].onclick();
    assert.equal(document.activeElement.id, 'event-panel');
  });
});
