import test from 'node:test';
import assert from 'node:assert/strict';
import { TraceModel } from '../web/core/trace-model.js';
import { renderInspector } from '../web/ui/inspector.js';
import { setLocale, t } from '../web/i18n/index.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// Only the DOM operations used by the inspector; no browser globals at import time.
class Element {
  children = [];
  dataset = {};
  style = {};
  set textContent(value) {
    this.text = value;
    this.children = [];
  }
  get textContent() {
    return this.text || '';
  }
  replaceChildren(...children) {
    this.text = '';
    this.children = children;
  }
  append(...children) {
    this.children.push(...children);
  }
  insertAdjacentHTML() {}
}

test('operation results preserve recorded values, activity limits and complete diagnostics across events', () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const original = globalThis.document;
  globalThis.document = { getElementById: get, createElement: () => new Element() };
  const ir = '  %1 = add i32 %x, 1 ; <script>&\n  ret i32 %1';
  const diagnostic =
    'input.cr:2:3\nError: incompatible types <script>\n\nOverloads are:\n - foo(Int32)\n - foo(String)';
  const model = new TraceModel({
    schema_version: 1,
    compiler_version: 'WASI',
    source: '',
    snapshots: [],
    nodes: [{ id: 1, kind: 'Call', text: 'foo(1)' }],
    events: [
      {
        index: 0,
        kind: 'activity',
        node_id: 1,
        visitor: 'Crystal::CodeGenVisitor',
        activity: 'emit_instructions',
        before: '',
        after: ir,
        reason: 'final_insertion_block_delta',
        llvm_function: 'foo',
        phase: 'Codegen (crystal → LLVM IR)',
      },
      {
        index: 1,
        kind: 'activity',
        node_id: 1,
        visitor: 'Crystal::HasSelfVisitor',
        activity: 'check_self',
        before: '',
        after: '',
        reason: 'self_not_detected',
      },
      { index: 2, kind: 'type', node_id: 1, before: '', after: 'Int32 | String' },
      { index: 3, kind: 'expand', node_id: 1, before: 'square(3)', after: '3 * 3' },
      { index: 4, kind: 'error', detail: diagnostic },
    ],
  });
  try {
    setLocale('ja');
    model.seek(0);
    let opened;
    renderInspector(
      model,
      0,
      () => {},
      () => {},
      () => {},
      (event) => (opened = event),
    );
    assert.equal(get('explanation').hidden, true);
    assert.equal(get('visitor-badge').hidden, false);
    assert.equal(get('visitor-badge').dataset.visitor, 'CodeGenVisitor');
    assert.equal(get('visitor-badge-letter').textContent, 'C');
    assert.equal(get('event-before').hidden, true);
    assert.equal(get('change').hidden, false);
    assert.equal(get('event-diff').hidden, true);
    assert.equal(get('event-result-label').textContent, t('event.observedResult'));
    assert.equal(get('activity-ir-note').hidden, false);
    assert.equal(get('activity-ir-link').hidden, false);
    get('activity-ir-link').onclick();
    assert.equal(opened.index, 0);
    assert.match(get('after').innerHTML, /&lt;script&gt;&amp;/);
    assert.equal(get('activity-reason').textContent, 'final_insertion_block_delta');
    assert.equal(get('change').dataset.layout, 'stack');
    model.seek(1);
    renderInspector(model, 0, () => {});
    assert.equal(get('change').hidden, true); // No invented "before" or "after" value.
    assert.equal(get('code-diff').innerHTML, '');
    assert.equal(get('activity-ir-note').hidden, true);
    model.seek(2);
    renderInspector(model, 0, () => {});
    assert.equal(get('visitor-badge').hidden, true);
    assert.equal(get('change').hidden, false);
    assert.equal(get('event-before').hidden, false);
    assert.equal(get('event-result-label').textContent, t('after'));
    assert.equal(get('before').textContent, t('unset'));
    assert.equal(get('after').textContent, 'Int32 | String');
    assert.equal(get('change').dataset.layout, 'pair');
    assert.equal(get('activity-observed').hidden, true);
    model.seek(3);
    renderInspector(model, 0, () => {});
    assert.equal(get('change').hidden, true);
    assert.equal(get('event-diff').hidden, false);
    assert.match(get('code-diff').innerHTML, /diff-removed.*square\(3\)/);
    assert.match(get('code-diff').innerHTML, /diff-added.*3 \* 3/);
    assert.equal(get('event-diff-unchanged').hidden, true);
    model.seek(4);
    renderInspector(model, 0, () => {});
    assert.equal(get('change').hidden, true);
    assert.equal(get('event-diff').hidden, true);
    assert.equal(get('code-diff').innerHTML, '');
    assert.equal(get('explanation').textContent, diagnostic.split('\n\n')[0]);
    assert.equal(get('explanation').dataset.diagnostic, 'true');
    assert.equal(get('event-detail').textContent, diagnostic);
    assert.equal(get('raw-event').hidden, false);
    assert.equal(get('event-detail-label').textContent, t('event.diagnostic'));
    setLocale('en');
    renderInspector(model, 1, () => {});
    assert.equal(get('event-detail').textContent, diagnostic);
    assert.equal(get('event-detail-label').textContent, 'Full diagnostic');
    model.seek(2);
    renderInspector(model, 0, () => {});
    assert.equal(get('raw-event').hidden, true);
    assert.equal(get('explanation').dataset.diagnostic, 'false');
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});

test('source activities use diffs while one-sided results and type transitions keep their meaning', () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const original = globalThis.document;
  globalThis.document = { getElementById: get, createElement: () => new Element() };
  const model = new TraceModel({
    schema_version: 1,
    compiler_version: 'WASI',
    source: '',
    snapshots: [],
    nodes: [{ id: 1, kind: 'If', text: 'if true; 1; end' }],
    events: [
      { kind: 'activity', activity: 'rewrite', before: 'foo(1)', after: 'bar(1)' },
      { kind: 'activity', activity: 'replace_untyped', before: 'foo(1)', after: 'nil' },
      { kind: 'activity', activity: 'simplify_condition', before: '', after: '1' },
      { kind: 'rewrite', before: 'foo(1)', after: 'foo(1)' },
      { kind: 'rewrite', before: 'foo(1)', after: '∅' },
      { kind: 'activity', activity: 'merge_guess', before: 'Int32', after: 'Int32 | String' },
    ].map((event, index) => ({
      index,
      node_id: 1,
      visitor: 'Crystal::CleanupTransformer',
      ...event,
    })),
  });
  const render = (index) => renderInspector(model.seek(index), 1, () => {});
  try {
    for (const index of [0, 1]) {
      render(index);
      assert.equal(get('event-diff').hidden, false);
      assert.equal(get('change').hidden, true);
      assert.match(get('code-diff').innerHTML, /diff-removed/);
      assert.match(get('code-diff').innerHTML, /diff-added/);
    }
    render(2);
    assert.equal(get('event-diff').hidden, true);
    assert.equal(get('code-diff').innerHTML, '');
    assert.equal(get('event-before').hidden, true);
    assert.equal(get('event-result-label').textContent, t('event.observedResult'));
    assert.equal(get('after').innerHTML, '1');
    render(3);
    assert.equal(get('event-diff-unchanged').hidden, false);
    assert(!get('code-diff').innerHTML.includes('diff-added'));
    assert(!get('code-diff').innerHTML.includes('diff-removed'));
    setLocale('ja');
    render(3);
    assert.equal(get('event-diff-unchanged').textContent, t('event.sourceUnchanged'));
    render(4);
    assert.equal(get('event-diff-unchanged').hidden, true);
    assert.match(get('code-diff').innerHTML, /diff-removed/);
    assert(!get('code-diff').innerHTML.includes('diff-added'));
    assert(!get('code-diff').innerHTML.includes('∅'));
    render(5);
    assert.equal(get('event-diff').hidden, true);
    assert.equal(get('change').hidden, false);
    assert.equal(get('change').dataset.layout, 'pair');
    assert.equal(get('before').textContent, 'Int32');
    assert.equal(get('after').textContent, 'Int32 | String');
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});

test('overview excludes future findings while whole-recording activities label them and keep related nodes', () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const original = globalThis.document;
  globalThis.document = { getElementById: get, createElement: () => new Element() };
  const load = (name) =>
    new TraceModel(
      JSON.parse(
        gunzipSync(readFileSync(new URL(`../web/traces/${name}.json.gz`, import.meta.url))),
      ),
    );
  const contents = (el) => [el.textContent, ...el.children.map(contents)].join('\n');
  try {
    setLocale('en');
    const model = load('03_macro_expansion').seek(62);
    let seek;
    const render = () =>
      renderInspector(
        model,
        12,
        () => {},
        () => {},
        (index) => (seek = index),
      );
    render();
    assert.equal(get('node-type').textContent, t('unknown'));
    assert.equal(get('node-activity-count').textContent, '4');
    assert.match(contents(get('node-overview')), /3 \* 3/);
    assert(!contents(get('node-overview')).includes('Int32'));
    const buttons = get('node-activities')
      .children.flatMap((el) => el.children)
      .filter((el) => el.dataset.index);
    assert.deepEqual(
      buttons.filter((el) => el.dataset.future === 'true').map((el) => el.dataset.index),
      ['171', '219'],
    );
    buttons.find((el) => el.dataset.index === '171').onclick();
    assert.equal(seek, 171);
    assert.equal(model.index, 62);
    model.seek(171);
    render();
    assert.equal(get('node-type').textContent, 'Int32');
    assert.match(contents(get('node-overview')), /Int32/);
    assert.match(get('node-type-at').textContent, /171/);
    const union = load('02_union_and_narrowing').seek(218);
    renderInspector(union, 3, () => {});
    assert(contents(get('node-activities')).includes(t('activity.related', { id: 2 })));
    const broken = load('08_type_error').seek(85);
    renderInspector(broken, 1, () => {});
    assert.equal(get('node-incomplete').hidden, false);
    assert.equal(get('node-incomplete').textContent, t('activity.incomplete'));
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});

test('long node code is previewed without losing generated text and source navigation requires a loaded file', () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const original = globalThis.document;
  globalThis.document = { getElementById: get, createElement: () => new Element() };
  const text = 'def generated\n  a = 1\n  b = 2\n  "<script>"\nend';
  const model = new TraceModel({
    schema_version: 1,
    compiler_version: 'WASI',
    source: '',
    filename: 'input.cr',
    snapshots: [],
    events: [],
    nodes: [{ id: 1, kind: 'Def', text, filename: 'input.cr', line: 1 }],
  });
  try {
    let sourceNode;
    renderInspector(
      model,
      1,
      () => {},
      () => {},
      () => {},
      () => {},
      (node) => (sourceNode = node),
    );
    assert.equal(get('node-code').innerHTML.split('\n').length, 3);
    assert.equal(get('node-open-source').disabled, false);
    get('node-open-source').onclick();
    assert.equal(sourceNode.id, 1);
    get('node-expand-code').onclick();
    assert.equal(get('node-code').innerHTML.split('\n').length, 5);
    assert.match(get('node-code').innerHTML, /&lt;script&gt;/);
    get('node-expand-code').onclick();
    assert.equal(get('node-code').innerHTML.split('\n').length, 3);
    model.nodes.get(1).filename = 'stdlib.cr';
    model.nodes.get(1).text = 'a_very_long_generated_call(' + 'argument, '.repeat(30) + ')';
    renderInspector(model, 1, () => {});
    assert.equal(get('node-open-source').disabled, true);
    assert.equal(get('node-expand-code').hidden, false);
    get('node-expand-code').onclick();
    assert.equal(get('node-code').innerHTML, model.nodes.get(1).text);
  } finally {
    globalThis.document = original;
  }
});

test('node IR follows selection independently of playback and keeps all codegen contexts', () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  globalThis.document = { getElementById: get, createElement: () => new Element() };
  const node = (id) => ({ id, kind: 'Call', text: `call${id}`, inferred_type: 'Int32' });
  const model = new TraceModel({
    schema_version: 1,
    compiler_version: 'WASI',
    source: 'call1; call2',
    nodes: [node(1), node(2), node(3)],
    snapshots: [],
    events: [
      { index: 0, kind: 'type', node_id: 2, before: '', after: 'Int32' },
      {
        index: 1,
        kind: 'ir',
        node_id: 1,
        llvm_function: '*call1<Int32>:Int32',
        llvm_block: 'entry',
        after: '  %1 = add i32 %x, 1 ; <script>&',
      },
      {
        index: 2,
        kind: 'ir',
        node_id: 1,
        llvm_function: '*call1<Float64>:Float64',
        llvm_block: 'exit',
        after: '  ret double %result',
      },
      { index: 3, kind: 'ir', node_id: 3, llvm_function: 'empty', after: '' },
    ],
  });
  try {
    setLocale('en');
    model.seek(0);
    renderInspector(model, 1, () => {});
    assert.equal(get('node-id').textContent, '#1');
    assert.equal(get('node-ir-note').hidden, false);
    assert.equal(get('node-ir').children.length, 2);
    const [intIR, floatIR] = get('node-ir').children;
    assert.equal(intIR.children[0].textContent, '*call1<Int32>:Int32 · entry');
    assert.match(intIR.children[1].innerHTML, /&lt;script&gt;&amp;/);
    assert.equal(floatIR.children[0].textContent, '*call1<Float64>:Float64 · exit');
    assert.match(floatIR.children[1].innerHTML, /ret double/);
    assert.equal(get('event-id').textContent, '#0');
    assert.equal(get('event-node').textContent, t('event.target', { id: 2, kind: 'Call' }));
    assert.equal(model.index, 0);

    // Localization and replay do not change the selected node's IR records.
    setLocale('ja');
    model.seek(3);
    renderInspector(model, 1, () => {});
    assert.equal(get('node-ir-note').textContent, t('node.irNote'));
    assert.equal(get('node-ir').children.length, 2);
    assert.equal(get('event-id').textContent, '#3');

    renderInspector(model, 2, () => {});
    assert.equal(get('node-ir').textContent, t('node.irMissing'));
    assert.equal(get('node-ir').children.length, 0);
    assert.equal(get('node-ir-note').hidden, true);

    renderInspector(model, 3, () => {});
    assert.equal(get('node-ir').children[0].children[1].textContent, t('node.irEmpty'));
    renderInspector(model, 0, () => {});
    assert.equal(get('node-ir').textContent, '—');
    assert.equal(get('node-ir-note').hidden, true);
  } finally {
    delete globalThis.document;
    setLocale('en');
  }
});

test('a replaced method still links its historical node to the observed owner', () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  globalThis.document = { getElementById: get, createElement: () => new Element() };
  const model = new TraceModel({
    schema_version: 1,
    declarations_version: 1,
    compiler_version: 'WASI',
    source: 'def value; end',
    nodes: [
      { id: 1, kind: 'Def', text: 'def value; 1; end' },
      { id: 2, kind: 'Def', text: 'def value; 2; end' },
    ],
    semantic_types: [{ id: 1, name: 'Owner', kind: 'class' }],
    definitions: [1, 2].map((id) => ({
      id,
      node_id: id,
      owner_id: 1,
      name: 'value',
      signature: 'value()',
      class_method: false,
    })),
    snapshots: [],
    events: [1, 2].map((id, index) => ({
      index,
      kind: 'declaration',
      declaration_action: 'method',
      node_id: id,
      type_id: 1,
      related_type_id: 0,
      definition_id: id,
      replaced_definition_id: index ? 1 : 0,
      implicit: false,
      visitor: 'Crystal::TopLevelVisitor',
      phase: 'Semantic (top level)',
    })),
  });
  try {
    setLocale('en');
    model.seek(1);
    let selectedType;
    renderInspector(
      model,
      1,
      () => {},
      (id) => (selectedType = id),
    );
    assert.equal(get('node-declarations').children.length, 1);
    get('node-declarations').children[0].onclick();
    assert.equal(selectedType, 1);
    assert.match(get('explanation').textContent, /replaces a previous definition/);
    assert.equal(model.index, 1);
    model.seek(-1);
    renderInspector(model, 1, () => {});
    assert.equal(get('node-declarations').children.length, 0);
  } finally {
    delete globalThis.document;
    setLocale('en');
  }
});

test('stage handoff follows playback independently of the selected node, including phases without Visitors', () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const original = globalThis.document;
  globalThis.document = { getElementById: get, createElement: () => new Element() };
  const model = new TraceModel({
    schema_version: 1,
    compiler_version: 'WASI',
    source: '',
    snapshots: [],
    nodes: [{ id: 1, kind: 'Def', text: 'def initialize; end' }],
    events: [
      { index: 0, kind: 'phase_enter', phase: 'Semantic (new)', detail: 'Semantic (new)' },
      {
        index: 1,
        kind: 'visit_enter',
        phase: 'Semantic (type declarations)',
        visitor: 'Crystal::TypeGuessVisitor',
        node_id: 1,
      },
      {
        index: 2,
        kind: 'phase_leave',
        phase: 'Semantic (type declarations)',
        detail: 'Semantic (type declarations)',
      },
      { index: 3, kind: 'complete', phase: '' },
    ],
  });
  try {
    setLocale('ja');
    model.seek(0);
    renderInspector(model, 1, () => {});
    assert.equal(get('visitor-title').textContent, 'Program#define_new_methods');
    assert.equal(get('visitor-badge').hidden, true);
    assert.equal(get('event-kind').hidden, true);
    assert.equal(get('event-kind').textContent, '');
    assert.equal(get('explanation').hidden, true);
    assert.equal(get('raw-event').hidden, true);
    assert(get('stage-context').innerHTML.includes(t('pipeline.stage.new')));
    assert.equal(get('compiler-link').children[0].textContent, 'semantic/new.cr');
    model.seek(1);
    renderInspector(model, 0, () => {});
    assert.equal(get('node-id').textContent, '—');
    assert(get('stage-context').innerHTML.includes(t('pipeline.stage.declarations')));
    assert.equal(get('visitor-title').textContent, 'TypeGuessVisitor');
    assert.equal(get('visitor-badge').hidden, false);
    assert.equal(get('visitor-badge').dataset.visitor, 'TypeGuessVisitor');
    assert.equal(get('visitor-badge-letter').textContent, 'G');
    assert.equal(get('event-kind').hidden, false);
    assert.equal(get('explanation').hidden, false);
    assert.equal(model.index, 1);
    model.seek(2);
    renderInspector(model, 1, () => {});
    assert.equal(get('event-kind').hidden, true);
    assert.equal(get('explanation').hidden, true);
    assert.equal(get('raw-event').hidden, true);
    assert(get('stage-context').innerHTML.includes(t('pipeline.stage.declarations')));
    model.seek(3);
    renderInspector(model, 1, () => {});
    assert.equal(get('event-kind').hidden, false);
    assert.equal(get('stage-context').hidden, true);
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});

test('link details survive localization and node selection, then clear when seeking away', () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const original = globalThis.document;
  globalThis.document = { getElementById: get, createElement: () => new Element() };
  const trace = {
    schema_version: 1,
    compiler_version: 'WASI',
    source: 'puts 1',
    nodes: [{ id: 1, kind: 'Call', text: 'puts 1' }],
    snapshots: [],
    events: [
      { index: 0, kind: 'complete', phase: '', visitor: '' },
      {
        index: 1,
        kind: 'link',
        phase: 'Link (LLD)',
        visitor: 'LLD',
        node_id: 0,
        link: {
          args: ['wasm-ld', 'out.o.wasm', '-lc', 'lib/libclang_rt.builtins.a', '-o', 'out.wasm'],
          objectBytes: 2000,
          outputBytes: 3000,
          elapsedMs: 125,
          exitCode: 0,
          stdout: '',
          stderr: '<script>diagnostic</script>',
        },
      },
    ],
  };
  const model = new TraceModel(trace).seek(1);
  const contents = (element) => [element.textContent, ...element.children.map(contents)].join('\n');
  try {
    setLocale('ja');
    renderInspector(model, 1, () => {});
    assert.equal(get('visitor-title').textContent, 'LLD');
    assert.equal(get('link-details').hidden, false);
    assert.equal(get('event-node').hidden, true);
    assert.equal(get('explanation').textContent, t('link.success'));
    assert(get('stage-context').innerHTML.includes(t('pipeline.stage.link')));
    const details = contents(get('link-details'));
    assert.match(details, /out\.o\.wasm/);
    assert.match(details, /out\.wasm/);
    assert.match(details, /0\.125/);
    assert.match(details, /-lc\nlib\/libclang_rt\.builtins\.a/);
    assert.match(details, /wasm-ld out\.o\.wasm -lc/);
    assert.match(details, /<script>diagnostic<\/script>/); // Text, never innerHTML.
    assert.equal(model.index, 1);

    setLocale('en');
    renderInspector(model, 0, () => {});
    assert.equal(model.index, 1);
    assert.equal(get('node-id').textContent, '—');
    assert(contents(get('link-details')).includes(t('link.command')));

    trace.events[1].link.exitCode = 1;
    trace.events[1].link.outputBytes = null;
    renderInspector(model, 1, () => {});
    assert.equal(get('explanation').textContent, t('link.failed'));
    assert(contents(get('link-details')).includes(t('link.noOutput')));
    assert(get('stage-context').innerHTML.includes(t('link.noOutput')));

    model.seek(0);
    renderInspector(model, 1, () => {});
    assert.equal(get('link-details').hidden, true);
    assert.equal(get('link-details').children.length, 0);
    const invalid = structuredClone(trace);
    delete invalid.events[1].link;
    assert.throws(() => new TraceModel(invalid));
    invalid.events[1].link = { ...trace.events[1].link, args: [null] };
    assert.throws(() => new TraceModel(invalid));
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});

test('stage context follows recorded events without separate navigation', () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const original = globalThis.document;
  globalThis.document = { getElementById: get, createElement: () => new Element() };
  const model = new TraceModel({
    schema_version: 1,
    compiler_version: 'WASI',
    source: 'puts 1',
    snapshots: [],
    nodes: [{ id: 1, kind: 'Call', text: 'puts 1' }],
    events: [{ index: 0, kind: 'phase_enter', phase: 'Semantic (new)' }],
  }).seek(0);
  const initial = JSON.stringify(model.trace);
  const render = () => renderInspector(model, 1, () => {});
  try {
    setLocale('ja');
    render();
    assert.equal(get('node-id').textContent, '#1');
    assert.equal(get('event-id').textContent, '#0');
    assert.equal(get('visitor-title').textContent, 'Program#define_new_methods');
    assert(get('stage-context').innerHTML.includes(t('pipeline.stage.new')));
    assert(get('stage-context').innerHTML.includes(t('pipeline.action.new')));
    assert.equal(get('link-details').hidden, true);
    assert.equal(get('event-node').hidden, true);
    assert.equal(get('stack').textContent, '—');
    assert.equal(model.index, 0);
    assert.equal(JSON.stringify(model.trace), initial);
    setLocale('en');
    render();
    assert(get('stage-context').innerHTML.includes(t('pipeline.stage.new')));
    model.event.phase = 'Unknown phase';
    render();
    assert.equal(get('stage-context').hidden, true);
    assert.equal(get('stage-context').children.length, 0);
    assert.equal(get('event-id').textContent, '#0');
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});
