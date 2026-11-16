import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceEditor } from '../web/ui/source-editor.js';

test('a selection made in another view reveals its source line once, preserving edits and later scrolling', () => {
  const previousDocument = globalThis.document,
    previousWindow = globalThis.window;
  const elements = new Map();
  const listeners = new Map();
  let lineHeight = 24;
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: '',
        style: {},
        scrollTop: 0,
        scrollLeft: 0,
        clientHeight: 200,
      });
    return elements.get(id);
  };
  globalThis.document = {
    getElementById: element,
    addEventListener: (type, listener) => listeners.set(type, listener),
    dispatchEvent: (event) => listeners.get(event.type)?.(event),
  };
  globalThis.window = {
    getComputedStyle: () => ({ lineHeight: `${lineHeight}px`, paddingTop: '14px' }),
  };
  try {
    const editor = new SourceEditor(() => {});
    editor.setRecord(Array.from({ length: 100 }, (_, i) => String(i)).join('\n'));
    const source = element('source');
    element('source-view').hidden = true;
    source.clientHeight = 0;
    editor.highlight({ id: 7, line: 80, column: 1 });
    assert.equal(source.scrollTop, 0);
    element('source-view').hidden = false;
    source.clientHeight = 200;
    editor.scroll();
    assert.equal(source.scrollTop, 1836);
    assert.equal(element('highlight').style.top, '74px');
    source.scrollTop = 1000;
    editor.highlight({ id: 7, line: 80, column: 1 });
    editor.scroll();
    assert.equal(source.scrollTop, 1000);
    lineHeight = 30;
    document.dispatchEvent(new Event('source-font-size-change'));
    assert.equal(element('highlight').style.top, '1384px');
    source.value += '\nputs "editing"';
    editor.highlight({ id: 8, line: 95, column: 1 });
    assert.equal(source.scrollTop, 1000);
    assert.equal(element('highlight').style.display, 'none');
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test('foreign-file AST locations do not highlight unrelated lines in the recorded source', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', style: {}, scrollTop: 0, scrollLeft: 0 });
    return elements.get(id);
  };
  globalThis.document = { getElementById: get, addEventListener() {} };
  globalThis.window = { getComputedStyle: () => ({ lineHeight: '24px', paddingTop: '14px' }) };
  try {
    const editor = new SourceEditor(() => {});
    editor.setRecord('puts 42\n', false, true, '/main.cr');
    editor.highlight({ id: 1, filename: '/main.cr', line: 1, column: 1 });
    assert.equal(get('highlight').style.display, 'block');
    editor.highlight({ id: 2, filename: '/src/object.cr', line: 1, column: 1 });
    assert.equal(get('highlight').style.display, 'none');
    assert.equal(get('source-location').textContent, '');
    editor.highlight({ line: 1, column: 2 }); // Lexer selections have no filename.
    assert.equal(get('highlight').style.display, 'block');
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});
