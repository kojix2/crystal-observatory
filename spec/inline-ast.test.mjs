import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutInlineAST, inlineBranch } from '../web/core/inline-ast.js';
import { flattenAST, TraceModel } from '../web/core/trace-model.js';
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
const measure = () => ({ width: 100, height: 28 });
const topology = (rows) =>
  rows.map(({ node, parent, edge, reference }) => [node.id, parent, edge, reference]);

test('inline cards follow source lines and indentation, then wrap within a line', () => {
  const snapshot = {
    roots: [1],
    nodes: [
      node(1, [2, 3], {
        kind: 'Def',
        label: 'def square(x)',
        line: 1,
        column: 1,
        filename: 'sample.cr',
      }),
      node(2, [], { kind: 'Arg', label: 'x', line: 1, column: 12, filename: 'sample.cr' }),
      node(3, [4, 5], { label: 'x * x', line: 2, column: 3, filename: 'sample.cr' }),
      node(4, [], { kind: 'Var', label: 'x', line: 2, column: 3, filename: 'sample.cr' }),
      node(5, [], { kind: 'Var', label: 'x', line: 2, column: 7, filename: 'sample.cr' }),
    ],
  };
  const source = { filename: 'sample.cr', source: 'def square(x)\n  x * x\nend\n' };
  const original = structuredClone(snapshot);
  const wide = layoutInlineAST(snapshot, new Set(), measure, 900, source);
  assert.deepEqual(
    wide.rows.map((row) => row.node.id),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    wide.rows.map((row) => row.lineIndex),
    [0, 0, 1, 1, 1],
  );
  assert.deepEqual(
    wide.headings.map(({ label, code }) => [label, code]),
    [
      ['1', 'def square(x)'],
      ['2', '  x * x'],
    ],
  );
  assert(wide.rows[2].x > wide.rows[0].x);
  assert(wide.height >= wide.rows.at(-1).lineBottom + 36);
  assert.match(inlineBranch(wide.rows, 1), /^M\d+ \d+ H\d+$/);
  const leftSibling = inlineBranch(wide.rows, 3);
  const rightSibling = inlineBranch(wide.rows, 4);
  const bus = / V([\d.]+) H/.exec(leftSibling)[1];
  assert(Number(bus) > wide.rows[2].lineBottom);
  assert(rightSibling.includes(`V${bus} H`));
  assert(leftSibling.startsWith(rightSibling.slice(0, rightSibling.indexOf(' H'))));
  assert(leftSibling.endsWith(`V${wide.rows[3].y + wide.rows[3].height}`));
  assert(rightSibling.endsWith(`V${wide.rows[4].y + wide.rows[4].height}`));
  const narrow = layoutInlineAST(snapshot, new Set(), measure, 400, source);
  assert.deepEqual(
    narrow.rows.map((row) => row.lineIndex),
    [0, 0, 1, 1, 2],
  );
  assert.equal(narrow.rows[2].x, 62);
  assert.equal(narrow.width, 400);
  assert(narrow.labelRight < narrow.width);
  assert(
    narrow.rows.every(
      (row) => row.x + row.width <= narrow.width && row.y + row.height <= narrow.height,
    ),
  );
  assert(inlineBranch(narrow.rows, 2).includes('H28'));
  assert.equal(
    inlineBranch(narrow.rows, 2),
    `M${narrow.rows[0].x} ${narrow.rows[0].y + narrow.rows[0].height / 2} H28 V${narrow.rows[2].y + narrow.rows[2].height / 2} H${narrow.rows[2].x}`,
  );
  assert(inlineBranch(narrow.rows, 4).includes('H34'));
  assert.deepEqual(snapshot, original);
});

test('inline layout keeps every edge kind and reference while folding branches', () => {
  const snapshot = {
    roots: [1],
    nodes: [
      node(1, [2], { expanded: 3, hook_expansions: [4], targets: [5] }),
      node(2),
      node(3),
      node(4),
      node(5, [1]),
    ],
  };
  for (const collapsed of [new Set(), new Set([1]), new Set([5])]) {
    const layout = layoutInlineAST(snapshot, collapsed, measure, 380);
    assert.deepEqual(topology(layout.rows), topology(flattenAST(snapshot, collapsed)));
    for (let i = 0; i < layout.rows.length; i++) {
      const row = layout.rows[i];
      if (row.parent < 0) continue;
      const path = inlineBranch(layout.rows, i);
      assert(!/NaN|Infinity/.test(path));
      if (row.lineIndex !== layout.rows[row.parent].lineIndex) {
        assert(row.gutter);
        assert.match(path, / H[\d.]+ V[\d.]+ H/);
      }
    }
  }
});

test('cross-line connections stay clear of cards and enter sibling cards equally', () => {
  const at = (line, column = 1) => ({ line, column, filename: 'sample.cr' });
  const snapshot = {
    roots: [1],
    nodes: [
      node(1, [2], { kind: 'Expressions' }),
      node(2, [3, 4], { kind: 'Assign', ...at(1) }),
      node(3, [], { kind: 'Var', ...at(1) }),
      node(4, [5, 6], { kind: 'If', ...at(1), targets: [7] }),
      node(5, [], { kind: 'NumberLiteral', ...at(2, 3) }),
      node(6, [], { kind: 'StringLiteral', ...at(2, 7) }),
      node(7, [], { kind: 'Def', line: 400, column: 1, filename: 'native.cr' }),
    ],
  };
  for (const width of [900, 600, 390, 320]) {
    const { rows } = layoutInlineAST(snapshot, new Set(), measure, width);
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const commands = [...inlineBranch(rows, i).matchAll(/([MHV])([\d.]+)(?: ([\d.]+))?/g)];
      let x = 0,
        y = 0;
      for (const [, command, a, b] of commands) {
        const nextX = command === 'V' ? x : Number(a);
        const nextY = command === 'H' ? y : Number(command === 'V' ? a : b);
        if (command !== 'M')
          rows.forEach((card, j) => {
            if (j === i || j === row.parent) return;
            const crosses =
              (y === nextY &&
                y > card.y &&
                y < card.y + card.height &&
                Math.min(x, nextX) < card.x + card.width &&
                Math.max(x, nextX) > card.x) ||
              (x === nextX &&
                x > card.x &&
                x < card.x + card.width &&
                Math.min(y, nextY) < card.y + card.height &&
                Math.max(y, nextY) > card.y);
            assert(
              !crosses,
              `edge to ${row.node.id} crosses card ${card.node.id} at width ${width}`,
            );
          });
        x = nextX;
        y = nextY;
      }
    }
    const siblings = rows.filter((row) => [5, 6].includes(row.node.id));
    for (const sibling of siblings)
      assert(
        inlineBranch(rows, rows.indexOf(sibling)).endsWith(`V${sibling.y + sibling.height}`),
        'siblings connect from below, including after wrapping',
      );
  }
});

test('foreign and structural nodes do not create enormous source-line gaps', () => {
  const snapshot = {
    roots: [1],
    nodes: [
      node(1, [2, 4], { kind: 'Expressions', line: 1, column: 1, filename: 'sample.cr' }),
      node(2, [], { label: 'square(1)', line: 2, column: 1, filename: 'sample.cr', targets: [3] }),
      node(3, [], {
        kind: 'Def',
        label: 'def square(x)',
        line: 428,
        column: 1,
        filename: 'primitives.cr',
      }),
      node(4, [], { label: 'square(2)', line: 3, column: 1, filename: 'sample.cr' }),
    ],
  };
  const layout = layoutInlineAST(snapshot, new Set(), measure, 600, {
    filename: 'sample.cr',
    source: '# comment\nsquare(1)\nsquare(2)\n',
  });
  assert.deepEqual(
    layout.headings.map(({ label }) => label),
    ['AST', '2', 'primitives.cr:428', '3'],
  );
  assert.equal(layout.headings[2].x, 46);
  assert(layout.height < 500);
  assert.deepEqual(topology(layout.rows), topology(flattenAST(snapshot)));
  assert(layout.rows[2].gutter !== layout.rows[1].gutter);
  assert(!inlineBranch(layout.rows, 2).includes(`H${layout.labelRight}`));
});

test('unrelated nested branches never share a horizontal or vertical wire', () => {
  const sameLine = { filename: 'sample.cr', line: 1, column: 1 };
  const wide = {
    roots: [1],
    nodes: [
      node(1, [2, 9], sameLine),
      node(2, [3, 8], sameLine),
      node(3, [4, 7], sameLine),
      node(4, [5, 6], sameLine),
      ...[5, 6, 7, 8, 9].map((id) => node(id, [], sameLine)),
    ],
  };
  const deep = structuredClone(wide);
  deep.nodes.forEach((n) => (n.line = n.id));
  const special = {
    roots: [1],
    nodes: [
      node(1, [2], sameLine),
      node(2, [3, 4], { ...sameLine, expanded: 5, hook_expansions: [6], targets: [7] }),
      ...[3, 4, 5, 6, 7].map((id) => node(id, [], { ...sameLine, line: id })),
    ],
  };
  for (const snapshot of [wide, deep, special]) {
    const layout = layoutInlineAST(snapshot, new Set(), () => ({ width: 60, height: 28 }), 1200);
    const segments = [];
    layout.rows.forEach((row, i) => {
      if (row.parent < 0) return;
      let x = 0,
        y = 0;
      for (const [, command, a, b] of inlineBranch(layout.rows, i).matchAll(
        /([MHV])([\d.]+)(?: ([\d.]+))?/g,
      )) {
        const nx = command === 'V' ? x : Number(a),
          ny = command === 'H' ? y : Number(command === 'V' ? a : b);
        if (command !== 'M')
          segments.push({
            parent: row.parent,
            child: i,
            edge: row.edge,
            x1: Math.min(x, nx),
            x2: Math.max(x, nx),
            y1: Math.min(y, ny),
            y2: Math.max(y, ny),
            vertical: x === nx,
          });
        x = nx;
        y = ny;
      }
    });
    for (let i = 0; i < segments.length; i++)
      for (const b of segments.slice(i + 1)) {
        const a = segments[i];
        if (
          (a.parent === b.parent && a.edge === b.edge) ||
          a.parent === b.child ||
          a.child === b.parent
        )
          continue;
        const overlap =
          a.vertical && b.vertical && a.x1 === b.x1
            ? Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
            : !a.vertical && !b.vertical && a.y1 === b.y1
              ? Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
              : 0;
        assert(overlap <= 0, `unrelated branches overlap: ${JSON.stringify({ a, b })}`);
      }
    assert(layout.rows.every((row) => row.lineBottom + 24 < layout.height));
  }
});

test('inline rendering preserves card details, edge styles, selection, and folding', () => {
  const original = globalThis.document;
  const nodes = [
    node(1, [2], { label: 'square(x)', expanded: 3, line: 1, column: 1, filename: 'sample.cr' }),
    node(2, [], {
      kind: 'Var',
      label: 'x',
      inferred_type: 'Int32',
      line: 1,
      column: 8,
      filename: 'sample.cr',
    }),
    node(3, [4, 5], {
      kind: 'Multiply',
      label: 'x * x',
      line: 2,
      column: 3,
      filename: 'sample.cr',
    }),
    node(4, [], { kind: 'Var', label: 'x', line: 2, column: 3, filename: 'sample.cr' }),
    node(5, [], { kind: 'Var', label: 'x', line: 2, column: 7, filename: 'sample.cr' }),
  ];
  const trace = {
    schema_version: 1,
    filename: 'sample.cr',
    source: 'square(x) # <&>\n  x * x\n',
    nodes,
    events: [],
    snapshots: [{ name: 'Snapshot', at_event: 0, roots: [1], nodes }],
  };
  const selected = [],
    folded = [],
    listeners = new Map();
  const graph = {
    clientWidth: 950,
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector !== '[data-node]') return [];
      return [
        ...this.innerHTML.matchAll(
          /class="node inline-node card-node [^"]*"[^>]*data-node="(\d+)"/g,
        ),
      ].map(([, id]) => ({
        dataset: { node: id },
        addEventListener: (name, fn) => listeners.set(`${id}/${name}`, fn),
        querySelector: () => ({ dataset: { fold: id } }),
      }));
    },
  };
  const elements = new Map([
    ['graph', graph],
    ['follow', { checked: false }],
    ['ast-caption', {}],
  ]);
  globalThis.document = { getElementById: (id) => elements.get(id) };
  try {
    setLocale('en');
    const model = new TraceModel(trace),
      collapsed = new Set();
    const render = () =>
      renderGraph(
        {
          model,
          selected: 2,
          snapshot: 0,
          view: 'ast',
          collapsed,
          reveal: false,
        },
        (id) => selected.push(id),
        (id) => folded.push(id),
      );
    render();
    assert(graph.innerHTML.includes('class="ast-svg inline-svg"'));
    assert(graph.innerHTML.includes('class="inline-source-code"'));
    assert(graph.innerHTML.includes('square(x) # &lt;&amp;&gt;'));
    assert.equal((graph.innerHTML.match(/class="node inline-node card-node/g) || []).length, 5);
    assert(graph.innerHTML.includes('class="edge expanded"'));
    assert(graph.innerHTML.includes('Expanded AST'));
    assert(graph.innerHTML.includes('Int32'));
    assert(graph.innerHTML.includes('aria-expanded="true"'));
    assert(graph.innerHTML.includes('node inline-node card-node selected'));
    listeners.get('2/click')({ target: { dataset: {} } });
    assert.deepEqual(selected, [2]);
    const event = { key: '-', target: { dataset: {} }, preventDefault() {}, stopPropagation() {} };
    listeners.get('1/keydown')(event);
    assert.deepEqual(folded, [1]);
    collapsed.add(1);
    render();
    assert.equal((graph.innerHTML.match(/class="node inline-node card-node/g) || []).length, 1);
    assert(graph.innerHTML.includes('2 branches'));
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});
