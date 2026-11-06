import test from 'node:test';
import assert from 'node:assert/strict';
import { TraceModel, validateTrace, flattenAST } from '../web/core/trace-model.js';
import { renderDeclarations, declarationSummary } from '../web/ui/declarations.js';
import { renderGraph } from '../web/ui/graphs.js';
import { TraceView } from '../web/ui/trace-view.js';
import { setLocale, t, locales } from '../web/i18n/index.js';

function fixture() {
  const operations = [
    ['type_create', 2, 1, 0],
    ['inherit', 2, 3, 0],
    ['include', 2, 4, 0],
    ['extend', 2, 4, 0],
    ['method', 2, 0, 5],
    ['method', 2, 0, 6],
    ['type_reopen', 2, 1, 0],
  ];
  return {
    schema_version: 1,
    declarations_version: 1,
    source: 'class Child; end',
    nodes: Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      kind: 'ClassDef',
      text: 'class Child; end',
      filename: 'main.cr',
      line: index + 1,
    })),
    snapshots: [],
    semantic_types: [
      { id: 1, name: 'Program', kind: 'program' },
      { id: 2, name: 'Outer::Child', kind: 'class' },
      { id: 3, name: 'Reference', kind: 'class' },
      { id: 4, name: 'Named', kind: 'module' },
    ],
    definitions: [
      {
        id: 5,
        owner_id: 2,
        node_id: 5,
        name: 'value',
        signature: 'value(x : Int32)',
        class_method: false,
      },
      {
        id: 6,
        owner_id: 2,
        node_id: 6,
        name: 'value',
        signature: 'value(x : String)',
        class_method: true,
      },
    ],
    events: operations.map(
      ([declaration_action, type_id, related_type_id, definition_id], index) => ({
        index,
        kind: 'declaration',
        visitor: 'Crystal::TopLevelVisitor',
        phase: 'Semantic (top level)',
        node_id: index + 1,
        declaration_action,
        type_id,
        related_type_id,
        definition_id,
        implicit: index === 1,
        origin_id: index === 6 ? 1 : 0,
      }),
    ),
  };
}

test('declarations replay only observed state and backwards seeks remove future changes', () => {
  const model = new TraceModel(fixture());
  assert.equal(model.declarations.size, 0);
  model.seek(0);
  const child = model.declarations.get(2);
  assert.equal(child.info.name, 'Outer::Child');
  assert.equal(child.created, true);
  assert.equal(child.methods.size, 0);
  assert.equal(model.declarations.has(3), false);
  model.seek(6);
  const complete = model.declarations.get(2);
  assert.equal(complete.declarations.length, 2);
  assert.equal(complete.parent.implicit, true);
  assert.equal(complete.includes.length, 1);
  assert.equal(complete.extends.length, 1);
  assert.deepEqual([...complete.methods.keys()], [5, 6]);
  assert.equal(model.declarations.get(3).created, undefined);
  model.seek(0);
  assert.equal(model.declarations.get(2).parent, undefined);
  assert.equal(model.declarations.get(2).methods.size, 0);
  model.seek(-1);
  assert.equal(model.declarations.size, 0);
  model.seek(6);
  assert.deepEqual(model.declarations, new TraceModel(fixture()).seek(6).declarations);
  assert.deepEqual(
    new TraceModel(JSON.parse(JSON.stringify(model.trace))).seek(6).declarations,
    model.declarations,
  );
});

test('invalid declaration versions, identities, references and actions are rejected', () => {
  for (const corrupt of [
    (trace) => {
      trace.declarations_version = 2;
    },
    (trace) => {
      trace.semantic_types.push(trace.semantic_types[0]);
    },
    (trace) => {
      trace.definitions[0].owner_id = 99;
    },
    (trace) => {
      trace.events[0].related_type_id = 99;
    },
    (trace) => {
      trace.events[0].origin_id = 99;
    },
    (trace) => {
      trace.events[0].declaration_action = 'invented';
    },
    (trace) => {
      trace.events[4].definition_id = 6;
    },
    (trace) => {
      trace.events[4].related_type_id = 99;
    },
    (trace) => {
      trace.events[0].definition_id = 5;
    },
    (trace) => {
      trace.events[4].replaced_definition_id = 99;
    },
    (trace) => {
      trace.events[4].replaced_definition_id = 6;
    },
    (trace) => {
      trace.events[0].replaced_definition_id = 5;
    },
    (trace) => {
      trace.events[4].replaced_definition_id = -1;
    },
    (trace) => {
      delete trace.declarations_version;
    },
  ]) {
    const trace = fixture();
    corrupt(trace);
    assert.throws(() => validateTrace(trace));
  }
  for (const field of ['semantic_types', 'definitions']) {
    const old = { ...fixture(), events: [] };
    delete old.declarations_version;
    old[field] = {};
    assert.throws(() => validateTrace(old), { key: 'error.traceSchema' });
    old[field] = [null];
    assert.throws(() => validateTrace(old), { key: 'error.traceReference' });
  }
});

test('repeated include operations do not duplicate the effective relationship', () => {
  const trace = fixture();
  trace.semantic_types.push({ id: 5, name: 'Other', kind: 'module' });
  trace.events.push({ ...trace.events[2], index: trace.events.length, related_type_id: 5 });
  trace.events.push({ ...trace.events[2], index: trace.events.length });
  const model = new TraceModel(trace).seek(trace.events.length - 1);
  assert.deepEqual(
    model.declarations.get(2).includes.map((event) => [event.related_type_id, event.index]),
    [
      [5, 7],
      [4, 2],
    ],
  );
  model.seek(2);
  assert.equal(model.declarations.get(2).includes[0].index, 2);
});

test('method replacement preserves overloads and class methods when replaying and rewinding', () => {
  const trace = fixture();
  trace.definitions.push({
    id: 8,
    owner_id: 2,
    node_id: 7,
    name: 'value',
    signature: 'value(x : Int32)',
    class_method: false,
  });
  trace.events.push({
    ...trace.events[4],
    index: 7,
    node_id: 7,
    definition_id: 8,
    replaced_definition_id: 5,
  });
  const model = new TraceModel(trace).seek(6);
  assert.deepEqual([...model.declarations.get(2).methods.keys()], [5, 6]);
  model.seek(7);
  assert.deepEqual([...model.declarations.get(2).methods.keys()], [6, 8]);
  assert.match(declarationSummary(model.event, model), /replaces a previous definition/);
  model.seek(6);
  assert.deepEqual([...model.declarations.get(2).methods.keys()], [5, 6]);
  model.seek(7);
  assert.deepEqual([...model.declarations.get(2).methods.keys()], [6, 8]);
});

test('declaration AST navigation reveals a generated node without seeking', () => {
  const trace = fixture();
  const node = (id, children = [], hook_expansions = []) => ({
    id,
    children,
    targets: [],
    hook_expansions,
  });
  trace.snapshots = [
    { name: 'Parse', at_event: 1, roots: [1], nodes: [node(1)] },
    {
      name: 'Semantic (top level)',
      at_event: 5,
      roots: [1],
      nodes: [node(1, [2]), node(2, [], [3]), node(3, [4]), node(4)],
    },
    {
      name: 'Later',
      at_event: 7,
      roots: [1],
      nodes: [node(1, [2]), node(2, [], [3]), node(3, [4]), node(4)],
    },
  ];
  const model = new TraceModel(trace).seek(0);
  const view = Object.create(TraceView.prototype);
  view.model = model;
  view.snapshot = 0;
  view.collapsed = new Set([1, 2, 3, 7]);
  view.selectNode = (id) => {
    view.selected = id;
  };
  view.setView = (name) => {
    view.view = name;
  };
  const elements = {
    follow: { checked: true },
    snapshot: { value: 0 },
    graph: {
      querySelector: (selector) => ({
        scrollIntoView: () => {
          elements.graph.scrolled = selector;
        },
      }),
    },
  };
  const originalDocument = globalThis.document;
  globalThis.document = { getElementById: (id) => elements[id] };
  try {
    const event = model.event;
    view.selectDeclarationNode(4, 'ast');
    assert.equal(view.snapshot, 1);
    assert.equal(elements.snapshot.value, 1);
    assert.equal(elements.follow.checked, false);
    assert.deepEqual([...view.collapsed], [7]);
    assert(flattenAST(trace.snapshots[1], view.collapsed).some((row) => row.node.id === 4));
    assert.equal(elements.graph.scrolled, '.node[data-node="4"]');
    assert.equal(view.selected, 4);
    assert.equal(view.view, 'ast');
    assert.equal(model.event, event);

    model.seek(6);
    assert.equal(model.snapshotForNode(4, 0), 2);
    elements.follow.checked = true;
    view.selectDeclarationNode(4, 'ast');
    assert.equal(view.snapshot, 1);
    assert.equal(elements.follow.checked, true);
    assert.equal(model.index, 6);
    assert.equal(model.snapshotForNode(7, 0), -1);
  } finally {
    globalThis.document = originalDocument;
  }
  const broken = structuredClone(trace);
  broken.snapshots[1].nodes[1].hook_expansions = [99];
  assert.throws(() => validateTrace(broken));
  broken.snapshots[1].nodes[1].hook_expansions = 'invalid';
  assert.throws(() => validateTrace(broken));
});

test('hook expansion edges are labeled in every supported locale', () => {
  const graph = {
    clientWidth: 600,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const elements = { graph, follow: { checked: false }, 'ast-caption': {} };
  const oldDocument = globalThis.document;
  globalThis.document = { getElementById: (id) => elements[id] };
  const node = (id, hook_expansions = []) => ({
    id,
    kind: 'Def',
    label: `node ${id}`,
    children: [],
    targets: [],
    hook_expansions,
  });
  const model = {
    trace: {
      snapshots: [{ name: 'Semantic', roots: [1], nodes: [node(1, [2]), node(2)] }],
    },
    types: new Map(),
    activities: new Map(),
  };
  try {
    for (const locale of locales) {
      setLocale(locale);
      renderGraph({ model, selected: 0, snapshot: 0, view: 'ast', collapsed: new Set() }, () => {});
      assert(graph.innerHTML.includes(`${t('decl.hookExpansion')} ↘`), locale);
      assert(graph.innerHTML.includes('class="edge hook"'));
    }
  } finally {
    globalThis.document = oldDocument;
    setLocale('en');
  }
});

class Element {
  html = '';
  groups = new Map();
  set innerHTML(value) {
    this.html = value;
    this.groups.clear();
  }
  get innerHTML() {
    return this.html;
  }
  textContent = '';
  focus() {}
  querySelector() {
    return null;
  }
  querySelectorAll(selector) {
    if (this.groups.has(selector)) return this.groups.get(selector);
    const attribute = selector.slice(1, -1);
    const key = attribute
      .replace(/^data-/, '')
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const buttons = [...this.innerHTML.matchAll(new RegExp(`${attribute}="(\\d+)"`, 'g'))].map(
      (match) => ({
        dataset: { [key]: match[1] },
      }),
    );
    this.groups.set(selector, buttons);
    return buttons;
  }
}

test('declaration UI distinguishes missing observation, empty state and referenced context', () => {
  const root = new Element(),
    caption = new Element();
  globalThis.document = { getElementById: (id) => (id === 'declarations' ? root : caption) };
  const model = new TraceModel(fixture());
  const calls = [];
  const callbacks = {
    onType: (id) => calls.push(['type', id]),
    onNode: (id, view) => calls.push(['node', id, view]),
    onSeek: (index) => calls.push(['seek', index]),
  };
  try {
    for (const locale of locales) {
      setLocale(locale);
      renderDeclarations(model, 2, callbacks);
      assert(root.innerHTML.includes(t('decl.empty')));
      model.seek(6);
      renderDeclarations(model, 2, callbacks);
      assert(root.innerHTML.includes('Outer::Child'));
      assert(root.innerHTML.includes('value(x : Int32)'));
      assert(root.innerHTML.includes('value(x : String)'));
      assert(root.innerHTML.includes(t('decl.origin')));
      assert(root.innerHTML.includes('declaration-changed'));
      root.querySelectorAll('[data-declaration-event]')[0].onclick();
      assert.deepEqual(calls.at(-1), ['seek', 1]);
      root.querySelectorAll('[data-declaration-node]')[0].onclick();
      assert.deepEqual(calls.at(-1), ['node', 2, undefined]);
      root.querySelectorAll('[data-declaration-ast]')[0].onclick();
      assert.deepEqual(calls.at(-1), ['node', 2, 'ast']);
      root.querySelectorAll('[data-semantic-type]')[0].onclick();
      assert.deepEqual(calls.at(-1), ['type', 2]);
      renderDeclarations(model, 3, callbacks);
      assert(root.innerHTML.includes(t('decl.boundary')));
      model.seek(-1);
    }
    const old = { ...fixture(), events: [] };
    delete old.declarations_version;
    renderDeclarations(new TraceModel(old), 0, callbacks);
    assert(root.innerHTML.includes(t('decl.unobserved')));
    const malicious = fixture();
    malicious.semantic_types[1].name = '<img src=x onerror=alert(1)>';
    renderDeclarations(new TraceModel(malicious).seek(6), 2, callbacks);
    assert(!root.innerHTML.includes('<img'));
    assert(root.innerHTML.includes('&lt;img'));
  } finally {
    delete globalThis.document;
    setLocale('en');
  }
});

test('type selection does not seek or replace the selected operation', () => {
  const view = Object.create(TraceView.prototype);
  view.model = new TraceModel(fixture()).seek(5);
  view.setView = (name) => {
    view.view = name;
  };
  view.renderSelection = () => {};
  const event = view.model.event;
  view.selectType(2);
  assert.equal(view.view, 'declarations');
  assert.equal(view.selected, 1);
  assert.equal(view.model.event, event);
  view.selectNode(6);
  assert.equal(view.selectedType, 2);
  assert.equal(view.model.event, event);
  assert.match(declarationSummary(event, view.model), /Outer::Child\.value/);
});
