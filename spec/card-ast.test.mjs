import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { TraceModel, flattenAST } from '../web/core/trace-model.js';
import { renderGraph } from '../web/ui/graphs.js';
import { setLocale, locales } from '../web/i18n/index.js';

const node = (id, kind, label, extra = {}) => ({
  id,
  kind,
  label,
  text: label,
  children: [],
  targets: [],
  ...extra,
});
const traceFor = (nodes, events = [], roots = [nodes[0].id]) => ({
  schema_version: 1,
  source: '',
  nodes,
  events,
  snapshots: [{ name: 'Snapshot', at_event: 0, roots, nodes }],
});
const cards = (html) =>
  html
    .split('<g class="node card-node ')
    .slice(1)
    .map((html) => {
      const [, id] = /data-node="(\d+)"/.exec(html);
      const [, width, height] = /class="tile" width="([\d.]+)" height="([\d.]+)"/.exec(html);
      const [, x, y] = /transform="translate\(([\d.]+) ([\d.]+)\)"/.exec(html);
      const heading = /class="svg-card-heading"[^>]*>(.*?)<\/text>/.exec(html)[1];
      return {
        id: Number(id),
        width: Number(width),
        height: Number(height),
        x: Number(x),
        y: Number(y),
        heading,
        html,
      };
    });

function withCards(trace, run) {
  const original = globalThis.document;
  const elements = new Map(),
    listeners = new Map(),
    folds = new Map();
  const graph = {
    clientWidth: 600,
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === '[data-node]')
        return cards(this.innerHTML).map(({ id }) => {
          const element = {
            dataset: { node: String(id) },
            addEventListener: (name, callback) => listeners.set(`${id}/${name}`, callback),
            querySelector: () => folds.get(id),
          };
          return element;
        });
      return [...this.innerHTML.matchAll(/data-fold="(\d+)"/g)].map(([, id]) => {
        const fold = { dataset: { fold: id } };
        folds.set(Number(id), fold);
        return fold;
      });
    },
  };
  elements.set('graph', graph);
  elements.set('follow', { checked: true });
  elements.set('ast-caption', {});
  globalThis.document = { getElementById: (id) => elements.get(id) };
  const model = new TraceModel(trace);
  const context = {
    model,
    selected: 0,
    snapshot: 0,
    view: 'ast',
    collapsed: new Set(),
    reveal: false,
  };
  const selections = [],
    folded = [];
  const render = (extra = {}) => {
    renderGraph(
      { ...context, ...extra },
      (id) => selections.push(id),
      (id) => folded.push(id),
    );
    return cards(graph.innerHTML);
  };
  try {
    setLocale('en');
    run({ model, context, graph, elements, listeners, folds, render, selections, folded });
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
}

test('cards put kind and value together, keep literal spaces, and give declarations one line', () => {
  const nodes = [
    node(1, 'Expressions', '\nredundant subtree', { children: [2, 3, 4, 5] }),
    node(2, 'NumberLiteral', '1', { inferred_type: 'Int32' }),
    node(3, 'StringLiteral', '"a  b"', { inferred_type: 'String' }),
    node(4, 'Def', 'def twice(x)', { inferred_type: 'Nil' }),
    node(5, 'Var', 'value'),
  ];
  withCards(traceFor(nodes), ({ render, graph }) => {
    const original = structuredClone(nodes);
    const rows = render();
    assert.deepEqual(
      rows.map(({ id }) => id),
      [1, 2, 3, 4, 5],
    );
    assert(!rows[0].heading.includes('redundant subtree'));
    assert(rows[1].heading.includes('NumberLiteral') && rows[1].heading.includes('>1</tspan>'));
    assert(rows[1].html.includes('class="svg-type">Int32</text>'));
    assert(rows[2].heading.includes('&quot;a  b&quot;'));
    assert(rows[3].heading.includes('twice(x)') && !rows[3].heading.includes('def twice'));
    assert(!rows[3].html.includes('class="svg-type"'));
    assert(!rows[3].html.includes('Nil'));
    assert.deepEqual(
      rows.map(({ height }) => height),
      [28, 44, 44, 28, 28],
    );
    assert(rows[1].width < 220);
    assert(!graph.innerHTML.includes('class="svg-id"'));
    assert(graph.innerHTML.includes('aria-label="NumberLiteral Int32, node 2'));
    assert.deepEqual(nodes, original);
  });
});

test('playback changes displayed types without leaking future values or moving cards', () => {
  const trace = traceFor(
    [node(1, 'Var', 'value'), node(2, 'Def', 'def unused(x)', { inferred_type: 'Nil' })],
    [
      { index: 0, kind: 'type', node_id: 1, before: '', after: 'Int32' },
      { index: 1, kind: 'type', node_id: 1, before: 'Int32', after: 'Int32 | String' },
    ],
    [1, 2],
  );
  withCards(trace, ({ model, render, elements }) => {
    const initial = render();
    const geometry = (rows) => rows.map(({ x, y, width, height }) => [x, y, width, height]);
    assert(initial[0].html.includes('Unobserved'));
    assert(!initial[0].html.includes('Int32'));
    model.seek(0);
    const first = render({ selected: 1 });
    assert(first[0].html.includes('class="svg-type">Int32</text>'));
    model.seek(1);
    const later = render();
    assert(later[0].html.includes('Int32 | String'));
    assert.deepEqual(geometry(initial), geometry(first));
    assert.deepEqual(geometry(initial), geometry(later));
    model.seek(-1);
    assert.deepEqual(geometry(initial), geometry(render()));
    elements.get('follow').checked = false;
    assert(!render()[0].html.includes('Int32'));
  });
});

test('folding retains direct branch counts, method target types, reference markers and navigation', () => {
  const trace = traceFor([
    node(1, 'Call', 'twice(1)', { children: [2], expanded: 3, hook_expansions: [4], targets: [5] }),
    node(2, 'NumberLiteral', '1', { inferred_type: 'Int32' }),
    node(3, 'Var', 'x'),
    node(4, 'Var', 'hook'),
    node(5, 'Def', 'def twice(x)', { inferred_type: 'Int32', children: [1] }),
  ]);
  withCards(trace, ({ render, context, listeners, folds, selections, folded }) => {
    const rows = render();
    assert.deepEqual(
      rows.map(({ id }) => id),
      [1, 2, 3, 4, 5, 1],
    );
    assert(rows[4].html.includes('class="svg-type">Int32</text>'));
    assert(rows[5].html.includes('reference') && !rows[5].html.includes('data-fold='));
    assert(!rows[0].html.includes('branches</text>'));
    const event = (key, target = { dataset: {} }) => ({
      key,
      target,
      preventDefault() {},
      stopPropagation() {},
    });
    listeners.get('1/keydown')(event('Enter'));
    assert.deepEqual(selections, [1]);
    // Use the non-reference occurrence's fold control.
    listeners.get('5/keydown')(event('-'));
    assert.deepEqual(folded, [5]);
    folds.get(1).onkeydown(event(' ', folds.get(1)));
    assert.deepEqual(folded, [5, 1]);
    context.collapsed.add(1);
    const collapsed = render();
    assert.equal(collapsed.length, 1);
    assert(collapsed[0].html.includes('4 branches</text>'));
    assert(collapsed[0].html.includes('aria-expanded="false"'));
    assert.equal(collapsed[0].height, 44);
  });
});

test('long and Unicode labels stay escaped and bounded, including narrow panels and all locales', () => {
  const trace = traceFor(
    [
      node(1, 'StringLiteral', '"日本語😀 <script>&  長い文字列'.repeat(8), {
        inferred_type: 'Tuple(Int32, String, Array(String))',
      }),
      node(2, 'ClassDef', 'abstract class Example', { inferred_type: 'Nil' }),
    ],
    [],
    [1, 2],
  );
  withCards(trace, ({ render, graph }) => {
    graph.clientWidth = 200;
    for (const locale of locales) {
      setLocale(locale);
      const rows = render();
      assert(rows.every(({ width }) => width <= 176 && width >= 96));
      assert(rows[0].heading.includes('…'));
      assert(rows[0].html.includes('&lt;script&gt;'));
      assert(!graph.innerHTML.includes('<script>'));
      assert(rows[1].heading.includes('abstract'));
      assert(rows[0].height === 44 && rows[1].height === 28);
    }
  });
});

test('every bundled snapshot preserves topology, fits variable-height cards, and leaves recordings unchanged', () => {
  for (const directory of ['../web/traces/', './fixtures/traces/']) {
    const root = new URL(directory, import.meta.url);
    for (const file of readdirSync(root).filter((name) => name.endsWith('.json.gz'))) {
      const trace = JSON.parse(gunzipSync(readFileSync(new URL(file, root))));
      const original = structuredClone(trace);
      withCards(trace, ({ render, graph }) => {
        for (let snapshot = 0; snapshot < trace.snapshots.length; snapshot++) {
          const rows = render({ snapshot });
          assert.deepEqual(
            rows.map(({ id }) => id),
            flattenAST(trace.snapshots[snapshot]).map(({ node }) => node.id),
            file,
          );
          const [, width, height] = /<svg[^>]+width="([\d.]+)" height="([\d.]+)"/.exec(
            graph.innerHTML,
          );
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            assert(row.width <= 340 && row.width >= 96, file);
            assert(
              row.x + row.width <= Number(width) && row.y + row.height <= Number(height),
              file,
            );
            if (i) assert(rows[i - 1].y + rows[i - 1].height < row.y, file);
          }
        }
      });
      assert.deepEqual(trace, original, file);
    }
  }
});
