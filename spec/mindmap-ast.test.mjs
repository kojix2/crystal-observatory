import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { layoutMindmapAST, mindmapBranch } from '../web/core/mindmap-ast.js';
import { flattenAST } from '../web/core/trace-model.js';
import { renderGraph } from '../web/ui/graphs.js';
import { TraceView } from '../web/ui/trace-view.js';
import { setLocale } from '../web/i18n/index.js';

const node = (id, children = [], extra = {}) => ({
  id,
  kind: 'Call',
  label: `node ${id}`,
  children,
  targets: [],
  ...extra,
});
const topology = (rows) =>
  rows.map(({ node, parent, edge, reference }) => [node.id, parent, edge, reference]);
const checkBounds = ({ rows, width, height }) => {
  assert(Number.isFinite(width) && Number.isFinite(height));
  for (const row of rows) {
    assert(Number.isFinite(row.x) && Number.isFinite(row.y));
    assert(row.x >= 0 && row.y >= 0);
    assert(row.x + row.width <= width + 1e-8 && row.y + row.height <= height + 1e-8);
    if (row.parent >= 0) {
      const parent = rows[row.parent];
      assert(row.side > 0 ? row.x > parent.x + parent.width : row.x + row.width < parent.x);
      assert(!/NaN|Infinity/.test(mindmapBranch(parent, row)));
    }
  }
};

test('mind map separates subtrees on both sides of the roots without overlapping nodes', () => {
  const snapshot = {
    roots: [1, 10],
    nodes: [
      node(1, [2, 3, 4]),
      node(2, [5, 6]),
      node(3),
      node(4, [7]),
      node(5),
      node(6),
      node(7),
      node(10, [11]),
      node(11),
    ],
  };
  const original = structuredClone(snapshot),
    layout = layoutMindmapAST(snapshot),
    { rows } = layout;
  checkBounds(layout);
  assert.deepEqual(topology(rows), topology(flattenAST(snapshot)));
  assert.deepEqual(
    new Set(rows.filter((row) => row.parent === 0).map((row) => row.side)),
    new Set([-1, 1]),
  );
  for (let i = 0; i < rows.length; i++) {
    for (const other of rows.slice(i + 1)) {
      const row = rows[i];
      assert(
        row.x + row.width <= other.x ||
          other.x + other.width <= row.x ||
          row.y + row.height <= other.y ||
          other.y + other.height <= row.y,
      );
    }
  }
  assert.deepEqual(snapshot, original);
});

test('folds and every expansion, hook, target and repeated reference preserve AST topology', () => {
  const snapshot = {
    roots: [1, 7],
    nodes: [
      node(1, [2], { expanded: 3, hook_expansions: [4], targets: [5] }),
      node(2),
      node(3),
      node(4),
      node(5, [1]),
      node(7, [2]),
    ],
  };
  for (const collapsed of [new Set(), new Set([1]), new Set([5])]) {
    const layout = layoutMindmapAST(snapshot, collapsed);
    assert.deepEqual(topology(layout.rows), topology(flattenAST(snapshot, collapsed)));
    checkBounds(layout);
  }
  assert.equal(layoutMindmapAST(snapshot).rows.filter((row) => row.reference).length, 2);
  assert(layoutMindmapAST(snapshot, new Set([1])).height < layoutMindmapAST(snapshot).height);
});

test('empty, single, wide and 20,000-level trees stay finite without recursive traversal', () => {
  assert.equal(layoutMindmapAST({ roots: [], nodes: [] }).rows.length, 0);
  checkBounds(layoutMindmapAST({ roots: [1], nodes: [node(1)] }));
  const count = 20000,
    nodes = Array.from({ length: count }, (_, i) => node(i + 1, i < count - 1 ? [i + 2] : [])),
    chain = layoutMindmapAST({ roots: [1], nodes });
  assert.equal(chain.rows.length, count);
  checkBounds(chain);
  const wide = layoutMindmapAST({
    roots: [1],
    nodes: [
      node(
        1,
        nodes.slice(1).map((n) => n.id),
      ),
      ...nodes.slice(1).map((n) => ({ ...n, children: [] })),
    ],
  });
  assert.equal(wide.rows.length, count);
  checkBounds(wide);
});

test('bundled snapshots retain all node occurrences, edge kinds and bounds', () => {
  for (const directory of ['../web/traces/', './fixtures/traces/']) {
    const root = new URL(directory, import.meta.url);
    for (const file of readdirSync(root).filter((name) => name.endsWith('.json.gz'))) {
      const trace = JSON.parse(gunzipSync(readFileSync(new URL(file, root))));
      for (const snapshot of trace.snapshots) {
        const layout = layoutMindmapAST(snapshot);
        assert.deepEqual(topology(layout.rows), topology(flattenAST(snapshot)), file);
        checkBounds(layout);
      }
    }
  }
});

test('mind map renders escaped labels and types, supports selection and keyboard folding, and respects folds', () => {
  const original = globalThis.document,
    listeners = {},
    fold = { dataset: { fold: '1' } },
    element = {
      dataset: { node: '1' },
      addEventListener: (name, fn) => (listeners[name] = fn),
      querySelector: () => fold,
    },
    graph = {
      clientWidth: 600,
      clientHeight: 400,
      querySelector: () => null,
      querySelectorAll: (selector) => (selector === '[data-node]' ? [element] : [fold]),
    },
    elements = { graph, follow: { checked: false }, 'ast-caption': {} },
    nodes = [
      node(1, [2], { label: '<script>"&"</script>', inferred_type: 'SnapshotType' }),
      node(2),
    ],
    model = {
      trace: { snapshots: [{ name: 'Snapshot', roots: [1], nodes }] },
      types: new Map([[1, 'CurrentType']]),
      activities: new Map(),
    },
    context = {
      model,
      selected: 1,
      snapshot: 0,
      view: 'ast',
      collapsed: new Set(),
      astLayout: 'mindmap',
    };
  globalThis.document = { getElementById: (id) => elements[id] };
  let selected, folded;
  const render = (extra = {}) =>
    renderGraph(
      { ...context, ...extra },
      (id) => (selected = id),
      (id) => (folded = id),
    );
  try {
    render();
    assert.equal((graph.innerHTML.match(/class="node mindmap-node/g) || []).length, 2);
    assert(graph.innerHTML.includes('SnapshotType') && graph.innerHTML.includes('&lt;script&gt;'));
    assert(!graph.innerHTML.includes('<script>'));
    assert(graph.innerHTML.includes('aria-expanded="true"'));
    const event = (key) => ({ key, target: element, preventDefault() {}, stopPropagation() {} });
    listeners.keydown(event('Enter'));
    assert.equal(selected, 1);
    listeners.keydown(event('-'));
    assert.equal(folded, 1);
    folded = null;
    listeners.keydown(event('+'));
    assert.equal(folded, null);
    fold.onkeydown({ ...event(' '), target: fold });
    assert.equal(folded, 1);
    context.collapsed.add(1);
    render({ astZoom: 2 });
    assert.equal((graph.innerHTML.match(/class="node mindmap-node/g) || []).length, 1);
    assert(graph.innerHTML.includes('aria-expanded="false"'));
    folded = null;
    listeners.keydown(event('+'));
    assert.equal(folded, 1);
    const [, width, height, viewWidth, viewHeight] =
      /<svg[^>]+width="([\d.]+)" height="([\d.]+)" viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(
        graph.innerHTML,
      );
    assert.equal(Number(width), Number(viewWidth) * 2);
    assert.equal(Number(height), Number(viewHeight) * 2);
    elements.follow.checked = true;
    render();
    assert(graph.innerHTML.includes('CurrentType') && !graph.innerHTML.includes('SnapshotType'));
  } finally {
    globalThis.document = original;
  }
});

test('mind map uses card semantics and keeps measured positions stable through type playback', () => {
  const original = globalThis.document,
    graph = {
      clientWidth: 700,
      clientHeight: 500,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    nodes = [
      node(1, [2, 3, 4, 5, 7], {
        kind: 'Call',
        label: 'run(1)',
        expanded: 8,
        hook_expansions: [9],
        targets: [6],
      }),
      node(2, [], { kind: 'Expressions', label: '\nredundant subtree' }),
      node(3, [], { kind: 'StringLiteral', label: '"a  b"', inferred_type: 'String' }),
      node(4, [], { kind: 'Def', label: 'def twice(x)', inferred_type: 'Nil' }),
      node(5, [], { kind: 'NumberLiteral', label: '1', inferred_type: 'Int32' }),
      node(6, [1], { kind: 'Def', label: 'def resolved(x)', inferred_type: 'Int32' }),
      node(7, [], { kind: 'Var', label: 'value' }),
      node(8, [], { kind: 'Var', label: 'expanded' }),
      node(9, [], { kind: 'Var', label: 'hook' }),
    ],
    trace = {
      nodes,
      events: [{ kind: 'type', node_id: 7, before: '', after: 'Int32 | String' }],
      snapshots: [{ name: 'Snapshot', roots: [1], nodes }],
    },
    model = {
      trace,
      types: new Map(nodes.filter((n) => n.inferred_type).map((n) => [n.id, n.inferred_type])),
      activities: new Map(),
    };
  globalThis.document = {
    getElementById: (id) => ({ graph, follow: { checked: true }, 'ast-caption': {} })[id],
  };
  const render = () => {
    renderGraph(
      {
        model,
        selected: 0,
        snapshot: 0,
        view: 'ast',
        collapsed: new Set(),
        astLayout: 'mindmap',
        reveal: false,
      },
      () => {},
      () => {},
    );
    return graph.innerHTML
      .split('<g class="node mindmap-node ')
      .slice(1)
      .map((html) => {
        const id = Number(/data-node="(\d+)"/.exec(html)[1]),
          [, x, y] = /transform="translate\(([\d.]+) ([\d.]+)\)"/.exec(html),
          [, width, height] = /class="tile" width="([\d.]+)" height="([\d.]+)"/.exec(html);
        return {
          id,
          x: Number(x),
          y: Number(y),
          width: Number(width),
          height: Number(height),
          html,
        };
      });
  };
  try {
    setLocale('en');
    const rows = render(),
      byId = (id) => rows.find((row) => row.id === id),
      heading = (id) => /class="svg-card-heading"[^>]*>(.*?)<\/text>/.exec(byId(id).html)[1],
      geometry = (items) => items.map(({ x, y, width, height }) => [x, y, width, height]);
    assert(!heading(2).includes('redundant subtree'));
    assert(heading(3).includes('&quot;a  b&quot;'));
    assert(heading(4).includes('twice(x)') && !heading(4).includes('def twice'));
    assert.equal(byId(4).height, 28);
    assert(!byId(4).html.includes('class="svg-type"'));
    assert(!byId(4).html.includes('Nil'));
    assert(byId(6).html.includes('class="svg-type">Int32</text>'));
    assert(byId(7).html.includes('Unobserved'));
    assert(!byId(7).html.includes('Int32 | String'));
    assert.equal(rows.filter((row) => row.id === 1).length, 2);
    assert(rows.find((row) => row.id === 1 && row.html.includes('reference')));
    assert(graph.innerHTML.includes('Expanded AST'));
    assert(graph.innerHTML.includes('Hook expansion'));
    assert(graph.innerHTML.includes('Resolved method'));
    assert(!graph.innerHTML.includes('class="svg-id"'));
    for (let i = 0; i < rows.length; i++)
      for (const other of rows.slice(i + 1)) {
        const row = rows[i];
        assert(
          row.x + row.width <= other.x ||
            other.x + other.width <= row.x ||
            row.y + row.height <= other.y ||
            other.y + other.height <= row.y,
        );
      }
    model.types.set(7, 'Int32 | String');
    const later = render();
    assert.deepEqual(geometry(rows), geometry(later));
    assert(later.find((row) => row.id === 7).html.includes('Int32 | String'));
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});

test('mind map zoom supports fitting below 100% and keeps the viewport center anchored', () => {
  const original = globalThis.document,
    graph = { clientWidth: 400, clientHeight: 200, scrollLeft: 600, scrollTop: 300 },
    view = Object.create(TraceView.prototype);
  globalThis.document = { getElementById: () => graph };
  view.astLayout = 'mindmap';
  view.astZoom = 2;
  view.renderObservation = () => {};
  try {
    view.zoomAST(1);
    assert.equal(view.astZoom, 1);
    assert.equal(graph.scrollLeft, 200);
    assert.equal(graph.scrollTop, 100);
    view.zoomAST(0.5);
    assert.equal(view.astZoom, 0.5);
    assert.equal(graph.scrollLeft, 0);
    assert.equal(graph.scrollTop, 0);
    view.zoomAST(0.004);
    assert.equal(view.astZoom, 0.004);
    view.astLayout = 'radial';
    view.zoomAST(0.5);
    assert.equal(view.astZoom, 1);
  } finally {
    globalThis.document = original;
  }
});
