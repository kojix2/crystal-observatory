import test from 'node:test';
import assert from 'node:assert/strict';
import { TraceModel } from '../web/core/trace-model.js';
import { renderInspector } from '../web/ui/inspector.js';
import { setLocale, t } from '../web/i18n/index.js';

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
}

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
