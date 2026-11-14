import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ViewLayout,
  comparisonTargets,
  comparisonWidths,
  comparisonRatio,
} from '../web/core/view-layout.js';
import { MIN_PANES, paneWidths, moveDivider } from '../web/core/layout.js';
import { IRView } from '../web/ui/ir-view.js';
import { renderGraph } from '../web/ui/graphs.js';
import { TraceView } from '../web/ui/trace-view.js';
import { TraceModel } from '../web/core/trace-model.js';

test('navigation to a displayed view preserves a pair; other navigation restores one view', () => {
  const layout = new ViewLayout('source');
  assert.equal(layout.compare('ast'), true);
  layout.show('ast');
  assert.deepEqual(layout.views, ['source', 'ast']);
  assert.equal(layout.compare('source'), false);
  assert.deepEqual(layout.views, ['source', 'ast']);
  layout.show('declarations');
  assert.deepEqual(layout.views, ['declarations']);
  assert.equal(layout.compare('ast'), true);
  assert.deepEqual(layout.views, ['declarations', 'ast']);
  layout.close();
  layout.show('ast');
  layout.compare('types');
  layout.close();
  assert.deepEqual(layout.views, ['ast']);
});

test('every pair of distinct observation views can be compared in either order', () => {
  const views = ['source', 'tokens', 'ast', 'declarations', 'types', 'ir'];
  for (const primary of views) {
    const layout = new ViewLayout(primary);
    assert.deepEqual(
      comparisonTargets(primary),
      views.filter((view) => view !== primary),
    );
    for (const secondary of views) {
      if (secondary === primary) continue;
      assert.equal(layout.compare(secondary), true);
      assert.deepEqual(layout.views, [primary, secondary]);
      layout.show(secondary);
      assert.deepEqual(layout.views, [primary, secondary]);
      assert.equal(layout.compare(primary), false);
      assert.equal(layout.compare('unknown'), false);
      assert.deepEqual(layout.views, [primary, secondary]);
      layout.close();
      assert.deepEqual(layout.views, [primary]);
    }
  }
  assert.deepEqual(comparisonTargets('unknown'), []);
  assert.equal(new ViewLayout('unknown').compare('source'), false);
});

test('History selection reveals its AST node when following, preserving an existing AST comparison', () => {
  const node = (id, children = []) => ({ id, kind: 'Var', children, targets: [] });
  const trace = {
    schema_version: 1,
    source: '',
    nodes: [node(1), node(2), node(3)],
    snapshots: [
      { at_event: 0, roots: [1], nodes: [node(1)] },
      { at_event: 2, roots: [1], nodes: [node(1, [2]), node(2)] },
    ],
    events: [
      { index: 0, kind: 'visit_enter', node_id: 2 },
      { index: 1, kind: 'phase_enter', node_id: 0 },
      { index: 2, kind: 'visit_enter', node_id: 3 },
    ],
  };
  const elements = { follow: { checked: true }, snapshot: {}, scrubber: {}, position: {} };
  const originalDocument = globalThis.document;
  globalThis.document = { getElementById: (id) => elements[id] };
  const createView = (primary, secondary) => {
    const view = Object.create(TraceView.prototype);
    view.model = new TraceModel(trace);
    view.layout = new ViewLayout(primary);
    if (secondary) view.layout.compare(secondary);
    view.collapsed = new Set([1, 99]);
    view.events = { follow() {} };
    view.stop = () => {};
    view.renderSelection = () => {};
    view.renderObservation = (options) => {
      view.observationOptions = options;
    };
    view.setView = (name) => view.layout.show(name);
    return view;
  };
  try {
    for (const primary of ['source', 'tokens', 'ast', 'types']) {
      const view = createView(primary);
      view.selectEvent(0);
      assert.deepEqual(view.layout.views, ['ast']);
      assert.equal(view.model.index, 0);
      assert.equal(view.selected, 2);
      assert.equal(view.snapshot, 1);
      assert.equal(elements.snapshot.value, 1);
      assert.equal(elements.follow.checked, true);
      assert.deepEqual([...view.collapsed], [99]);
      assert.equal(view.observationOptions.reveal, true);
    }
    for (const pair of [
      ['source', 'ast'],
      ['ast', 'tokens'],
    ]) {
      const view = createView(...pair);
      view.selectEvent(0);
      assert.deepEqual(view.layout.views, pair);
      assert.deepEqual([...view.collapsed], [99]);
      assert.equal(view.observationOptions.reveal, true);
    }
    const pinned = createView('source');
    elements.follow.checked = false;
    pinned.snapshot = 1;
    pinned.selectEvent(0);
    assert.deepEqual(pinned.layout.views, ['source']);
    assert.equal(pinned.model.index, 0);
    assert.equal(pinned.snapshot, 1);
    assert.deepEqual([...pinned.collapsed], [1, 99]);

    elements.follow.checked = true;
    for (const index of [1, 2]) {
      const view = createView('source');
      view.selectEvent(index);
      assert.deepEqual(view.layout.views, ['source']);
      assert.equal(view.model.index, index);
    }
    const playback = createView('source');
    playback.seek(0);
    assert.deepEqual(playback.layout.views, ['source']);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('comparison widths preserve readable panes, valid ratios, and the outer column minimums', () => {
  for (const invalid of [null, undefined, '0.7', 0, 1, -1, NaN, Infinity])
    assert.equal(comparisonRatio(invalid), 0.5);
  for (const available of [0, 400, 640, 1000, 2400]) {
    for (const ratio of [0.01, 0.5, 0.75, 0.99]) {
      const widths = comparisonWidths(available, ratio);
      assert(widths.every((width) => width >= 320));
      assert.equal(widths[0] + widths[1], Math.max(640, available));
    }
  }
  const minimums = [MIN_PANES[0], 646, MIN_PANES[2]];
  const widths = paneWidths(880, [25, 47, 28], minimums);
  assert.deepEqual(widths, minimums);
  for (const direction of [-10000, 10000]) {
    const weights = moveDivider(widths, 0, direction, minimums);
    const resized = paneWidths(
      minimums.reduce((sum, value) => sum + value, 0),
      weights,
      minimums,
    );
    resized.forEach((width, i) => assert(Math.abs(width - minimums[i]) < 1e-8));
  }
});

test('IR searches and manual function choices survive automatic following and resizing', () => {
  const elements = Object.fromEntries(
    ['ir-search', 'ir-function', 'ir-code', 'ir-caption', 'ir-prelude'].map((id) => [
      id,
      {
        value: '',
        textContent: '',
        innerHTML: '',
        scrollTop: 0,
        replaceChildren(...children) {
          this.children = children;
        },
      },
    ]),
  );
  const oldDocument = globalThis.document;
  const oldOption = globalThis.Option;
  globalThis.document = { getElementById: (id) => elements[id] };
  globalThis.Option = class {
    constructor(text, value) {
      this.text = text;
      this.value = value;
    }
  };
  try {
    const view = new IRView();
    view.load(
      'define void @alpha() {\nentry:\n  ret void\n}\ndefine void @beta() {\nentry:\n  ret void\n}\n',
      'empty',
    );
    assert.equal(elements['ir-prelude'].textContent, '--prelude empty');
    assert.equal(elements['ir-prelude'].hidden, false);
    view.render(true);
    elements['ir-search'].value = 'beta';
    elements['ir-search'].oninput();
    view.follow('alpha');
    assert.equal(view.selected, 'beta');
    assert.equal(elements['ir-search'].value, 'beta');
    elements['ir-code'].scrollTop = 75;
    view.render();
    assert.equal(elements['ir-code'].scrollTop, 75);
    view.follow('alpha', '', true);
    assert.equal(view.selected, 'alpha');
    assert.equal(elements['ir-search'].value, '');
    elements['ir-function'].value = 'beta';
    elements['ir-function'].onchange();
    view.follow('alpha');
    assert.equal(view.selected, 'beta');
    view.follow('missing_function', '', true);
    assert.equal(view.selected, 'beta');
    view.load('');
    assert.equal(elements['ir-prelude'].hidden, true);
    assert.equal(elements['ir-prelude'].textContent, '');
  } finally {
    globalThis.document = oldDocument;
    globalThis.Option = oldOption;
  }
});

test('a past AST snapshot does not change the current dependency types or overwrite its caption', () => {
  const graph = () => ({
    clientWidth: 600,
    querySelector: () => null,
    querySelectorAll: () => [],
    append() {},
  });
  const elements = {
    graph: graph(),
    types: graph(),
    follow: { checked: false },
    'ast-caption': {},
    'types-caption': {},
  };
  const node = (id, children = []) => ({
    id,
    kind: 'Var',
    label: `v${id}`,
    inferred_type: 'SnapshotType',
    children,
    targets: [],
  });
  const nodes = [node(1, [2]), node(2)];
  const model = {
    trace: { snapshots: [{ name: 'Past snapshot', roots: [1], nodes }] },
    nodes: new Map(nodes.map((n) => [n.id, n])),
    types: new Map([
      [1, 'CurrentType'],
      [2, 'DependentType'],
    ]),
    edges: new Map([['1:2', [1, 2]]]),
    activities: new Map(),
    index: 7,
  };
  const oldDocument = globalThis.document;
  globalThis.document = {
    getElementById: (id) => elements[id],
    createElement: () => ({ replaceChildren() {}, append() {} }),
  };
  try {
    const context = { model, selected: 1, snapshot: 0, collapsed: new Set() };
    renderGraph({ ...context, view: 'ast' }, () => {});
    const caption = elements['ast-caption'].textContent;
    assert(elements.graph.innerHTML.includes('SnapshotType'));
    renderGraph({ ...context, view: 'types' }, () => {});
    assert(elements.types.innerHTML.includes('CurrentType'));
    assert(!elements.types.innerHTML.includes('SnapshotType'));
    assert.equal(elements['ast-caption'].textContent, caption);
    assert.notEqual(elements['types-caption'].textContent, caption);
    assert(!elements.types.innerHTML.includes('class="fold"'));
  } finally {
    globalThis.document = oldDocument;
  }
});
