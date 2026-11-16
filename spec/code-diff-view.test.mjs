import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCodeDiff } from '../web/ui/code-diff.js';
import { setLocale, t } from '../web/i18n/index.js';

test('diff navigation replaces one page, reuses adjacent identical rewrites and clears when seeking away', () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, {});
    return elements.get(id);
  };
  const original = globalThis.document;
  globalThis.document = { getElementById: get };
  let html,
    writes = 0;
  Object.defineProperty(get('code-diff'), 'innerHTML', {
    get: () => html,
    set: (value) => {
      html = value;
      writes++;
    },
  });
  const change = {
    before: '',
    after: Array.from({ length: 450 }, (_, i) => `line${i}`).join('\n'),
  };
  try {
    renderCodeDiff(change);
    assert.equal(get('diff-pages').hidden, false);
    assert.equal(get('diff-page').max, 3);
    assert.equal(get('diff-previous').disabled, true);
    assert.equal(get('diff-next').disabled, false);
    assert.match(html, /line0</);
    assert(!html.includes('line200'));
    get('code-diff').scrollTop = 123;
    renderCodeDiff({ ...change });
    assert.equal(writes, 1);
    assert.equal(get('code-diff').scrollTop, 123);

    get('diff-next').onclick();
    assert.equal(get('diff-page').value, 2);
    assert.equal(get('code-diff').scrollTop, 0);
    assert.match(html, /line200</);
    assert(!html.includes('line0<'));
    renderCodeDiff({ ...change });
    assert.equal(writes, 2);
    assert.equal(get('diff-page').value, 2);
    setLocale('ja');
    renderCodeDiff(change);
    assert.equal(writes, 2);
    assert.equal(get('diff-page-note').textContent, t('event.diffPaged'));

    get('diff-page').value = 999;
    get('diff-page').onchange();
    assert.equal(get('diff-page').value, 3);
    assert.equal(get('diff-next').disabled, true);
    assert.match(html, /line449</);
    get('diff-previous').onclick();
    assert.equal(get('diff-page').value, 2);
    get('diff-page').value = '';
    get('diff-page').onchange();
    assert.equal(get('diff-page').value, 1);

    renderCodeDiff({ before: 'old', after: 'new' });
    assert.equal(get('diff-pages').hidden, true);
    assert.equal(get('diff-page').value, 1);
    assert.match(html, /old/);
    renderCodeDiff(null);
    assert.equal(html, '');
    assert.equal(get('diff-pages').hidden, true);
    assert.equal(get('diff-next').onclick, null);
    assert.equal(get('diff-previous').onclick, null);
    assert.equal(get('diff-page').onchange, null);
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});
