import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { layoutRadialAST, radialBranch } from '../web/core/radial-ast.js';
import { flattenAST } from '../web/core/trace-model.js';
import { renderGraph } from '../web/ui/graphs.js';
import { setLocale } from '../web/i18n/index.js';

const node = (id, children = [], extra = {}) => ({
  id,
  kind: 'Call',
  label: `node ${id}`,
  children,
  targets: [],
  ...extra,
});
const close = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('radial clades preserve topology, keep descendant intervals together and put tips on the rim', () => {
  const snapshot = {
    roots: [1],
    nodes: [node(1, [2, 3]), node(2, [4, 5]), node(3), node(4), node(5)],
  };
  const original = structuredClone(snapshot);
  const rows = layoutRadialAST(snapshot);
  assert.deepEqual(
    rows.map(({ node }) => node.id),
    [1, 2, 4, 5, 3],
  );
  assert.deepEqual(
    rows.map(({ parent }) => parent),
    [-1, 0, 1, 1, 0],
  );
  assert.equal(rows[0].radius, 0);
  close(rows[0].x, 500);
  close(rows[0].y, 500);
  for (const i of [2, 3, 4]) close(rows[i].radius, 460);
  assert(rows[2].angle < rows[1].angle && rows[1].angle < rows[3].angle);
  close(rows[3].angle - rows[2].angle, rows[4].angle - rows[3].angle);
  for (const row of rows) {
    assert(Number.isFinite(row.x) && Number.isFinite(row.y));
    if (row.parent >= 0) {
      assert(rows[row.parent].radius < row.radius);
      assert(!/NaN|Infinity/.test(radialBranch(rows[row.parent], row)));
    }
  }
  assert.deepEqual(snapshot, original);
});

test('all recorded child, expansion, hook, method and repeated-reference edges survive projection', () => {
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
  const rows = layoutRadialAST(snapshot);
  assert.deepEqual(
    rows.map(({ node }) => node.id),
    [1, 2, 3, 4, 5, 1, 7, 2],
  );
  assert.deepEqual(
    rows.map(({ edge }) => edge),
    ['root', 'child', 'expanded', 'hook', 'target', 'child', 'root', 'child'],
  );
  assert(rows[5].reference && rows[7].reference);
  assert(rows.filter((row) => row.parent < 0).every((row) => row.radius > 0));
  const folded = flattenAST(snapshot, new Set([1]));
  assert.deepEqual(
    folded.map(({ node }) => node.id),
    [1, 7, 2],
  );
  assert.equal(layoutRadialAST(snapshot).length, rows.length);
});

test('empty, single-node, wide and 20,000-level trees stay finite without recursive traversal', () => {
  assert.deepEqual(layoutRadialAST({ roots: [], nodes: [] }), []);
  const single = layoutRadialAST({ roots: [1], nodes: [node(1)] });
  assert.deepEqual([single[0].x, single[0].y, single[0].radius], [500, 500, 0]);
  const count = 20000;
  const chain = {
    roots: [1],
    nodes: Array.from({ length: count }, (_, i) => node(i + 1, i < count - 1 ? [i + 2] : [])),
  };
  const rows = layoutRadialAST(chain);
  assert.equal(rows.length, count);
  assert.equal(rows.at(-1).depth, count - 1);
  assert.equal(rows.at(-1).radius, 460);
  assert(rows.every((row) => Number.isFinite(row.x) && Number.isFinite(row.y)));
  const forest = layoutRadialAST({
    roots: chain.nodes.map((node) => node.id),
    nodes: chain.nodes.map((n) => ({ ...n, children: [] })),
  });
  assert.equal(forest.length, count);
  assert(forest.every((row) => row.radius === 460 && Number.isFinite(row.angle)));
});

test('bundled snapshots retain the same occurrences and parent indices in both layouts', () => {
  for (const directory of ['../web/traces/', './fixtures/traces/']) {
    const root = new URL(directory, import.meta.url);
    for (const file of readdirSync(root).filter((name) => name.endsWith('.json.gz'))) {
      const trace = JSON.parse(gunzipSync(readFileSync(new URL(file, root))));
      for (const snapshot of trace.snapshots) {
        const rows = layoutRadialAST(snapshot);
        assert.deepEqual(
          rows.map(({ node, parent, edge, reference }) => [node.id, parent, edge, reference]),
          flattenAST(snapshot).map(({ node, parent, edge, reference }) => [
            node.id,
            parent,
            edge,
            reference,
          ]),
          file,
        );
        assert(
          rows.every((row) => Number.isFinite(row.x) && Number.isFinite(row.y)),
          file,
        );
      }
    }
  }
});

test('radial rendering shows folded descendants, escapes tooltip code and supports keyboard selection', () => {
  const original = globalThis.document;
  const listeners = {};
  const element = {
    dataset: { node: '2' },
    addEventListener: (name, fn) => (listeners[name] = fn),
  };
  const graph = {
    clientWidth: 600,
    clientHeight: 400,
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === '[data-node]' ? [element] : []),
  };
  const elements = { graph, follow: { checked: false }, 'ast-caption': {} };
  globalThis.document = { getElementById: (id) => elements[id] };
  const nodes = [
    node(1, [2]),
    node(2, [], { label: '<script>alert("&")</script>', inferred_type: 'SnapshotType' }),
  ];
  const model = {
    trace: { snapshots: [{ name: 'Snapshot', roots: [1], nodes }] },
    types: new Map(),
    activities: new Map(),
  };
  let selected;
  try {
    setLocale('en');
    const context = {
      model,
      selected: 2,
      snapshot: 0,
      view: 'ast',
      collapsed: new Set([1]),
      astLayout: 'radial',
    };
    renderGraph(
      context,
      (id) => (selected = id),
      () => assert.fail('Overview does not fold'),
    );
    assert.equal((graph.innerHTML.match(/class="node radial-node/g) || []).length, 2);
    assert(!graph.innerHTML.includes('<rect') && !graph.innerHTML.includes('<text'));
    assert(graph.innerHTML.includes('SnapshotType') && graph.innerHTML.includes('&lt;script&gt;'));
    assert(!graph.innerHTML.includes('<script>'));
    assert(graph.innerHTML.includes('width="376" height="376"'));
    listeners.keydown({ key: ' ', target: { dataset: {} }, preventDefault() {} });
    assert.equal(selected, 2);
    renderGraph(
      { ...context, astZoom: 2 },
      () => {},
      () => {},
    );
    assert(graph.innerHTML.includes('width="752" height="752"'));
    graph.clientHeight = 102;
    renderGraph(
      context,
      () => {},
      () => {},
    );
    assert(graph.innerHTML.includes('width="78" height="78"'));
    assert.deepEqual([...context.collapsed], [1]);
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});
