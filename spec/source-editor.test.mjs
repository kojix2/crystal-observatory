import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceEditor } from '../web/ui/source-editor.js';

test('a selection made in another view reveals its source line once, preserving edits and later scrolling', () => {
  const previousDocument = globalThis.document,
    previousWindow = globalThis.window;
  const elements = new Map();
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
  globalThis.document = { getElementById: element };
  globalThis.window = { getComputedStyle: () => ({ lineHeight: '24px', paddingTop: '14px' }) };
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
    source.value += '\nputs "editing"';
    editor.highlight({ id: 8, line: 95, column: 1 });
    assert.equal(source.scrollTop, 1000);
    assert.equal(element('highlight').style.display, 'none');
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});
