import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createContext, runInContext } from 'node:vm';
import { sourceChange, diffLines, crystalDiffHTML } from '../web/core/code-diff.js';

test('only recorded source transformations become diffs, including deleted AST nodes', () => {
  for (const kind of ['rewrite', 'expand']) {
    assert.deepEqual(sourceChange({ kind, before: 'foo', after: 'bar' }), {
      before: 'foo',
      after: 'bar',
    });
    assert(sourceChange({ kind, before: '', after: 'foo' }));
    assert.equal(sourceChange({ kind, after: 'foo' }), null);
  }
  for (const activity of ['rewrite', 'replace_untyped', 'simplify_condition']) {
    assert(sourceChange({ kind: 'activity', activity, before: 'foo', after: 'bar' }));
    assert.equal(sourceChange({ kind: 'activity', activity, before: '', after: 'bar' }), null);
  }
  for (const kind of ['type', 'dispatch', 'ir'])
    assert.equal(sourceChange({ kind, before: 'foo', after: 'bar' }), null);
  for (const activity of ['assign_type', 'merge_guess', 'narrow_type', 'emit_instructions'])
    assert.equal(sourceChange({ kind: 'activity', activity, before: 'foo', after: 'bar' }), null);
  assert.equal(sourceChange(null), null);
  assert.deepEqual(sourceChange({ kind: 'rewrite', before: 'foo', after: '∅' }), {
    before: 'foo',
    after: '',
  });
});

function assertReconstructs(before, after) {
  const rows = diffLines(before, after);
  const reconstruct = (excluded) => rows.filter((row) => row.kind !== excluded).map((r) => r.text);
  assert.deepEqual(reconstruct('added'), before ? before.split('\n') : []);
  assert.deepEqual(reconstruct('removed'), after ? after.split('\n') : []);
  return rows;
}

test('line alignment preserves both versions, shared context, blank lines and final newlines', () => {
  const rows = assertReconstructs('def foo\n  1\nend\n', 'def foo\n  2\nend\n');
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['context', 'removed', 'added', 'context', 'context'],
  );
  for (const [before, after] of [
    ['', ''],
    ['', 'foo'],
    ['foo', ''],
    ['foo', 'foo'],
    ['a\n\nb\n', 'a\nb\n'],
    ['a\n', 'a'],
    ['a\nb\na\nc', 'b\na\nc\na'],
    ['あ\r\nい', 'あ\r\nう'],
    ['head\n' + 'old\n'.repeat(600) + 'tail', 'head\n' + 'new\n'.repeat(600) + 'tail'],
  ])
    assertReconstructs(before, after);
});

test('real compiler transformations retain every recorded line', () => {
  const root = new URL('../web/traces/', import.meta.url);
  let count = 0;
  for (const file of readdirSync(root).filter((file) => file.endsWith('.json.gz'))) {
    const trace = JSON.parse(gunzipSync(readFileSync(new URL(file, root))));
    for (const event of trace.events) {
      const change = sourceChange(event);
      if (!change) continue;
      assertReconstructs(change.before, change.after);
      count++;
    }
  }
  assert(count > 20);
});

const uncolored = (html) =>
  html
    .replace(/<\/?span\b[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

test('diff rows keep multiline Prism tokens balanced, preserve code and escape source HTML', () => {
  const context = createContext({});
  for (const name of ['core', 'clike', 'ruby', 'crystal'])
    runInContext(
      readFileSync(new URL(`../web/vendor/prismjs/prism-${name}.min.js`, import.meta.url), 'utf8'),
      context,
    );
  const original = globalThis.Prism;
  globalThis.Prism = context.Prism;
  try {
    const before = 'value = %q{hello\nold <script>&</script>\nworld}\nputs value';
    const after = 'value = %q{hello\nnew <img src=x onerror=alert(1)>\nworld}\nputs value';
    const html = crystalDiffHTML(before, after);
    assert.match(html, /class="token string"/);
    assert(!html.includes('<script>') && !html.includes('<img'));
    const renderedRows = html.split(/(?=<span class="diff-line )/).filter(Boolean);
    const rows = diffLines(before, after);
    assert.equal(renderedRows.length, rows.length);
    renderedRows.forEach((rendered, i) => {
      assert.equal(
        uncolored(rendered),
        { removed: '-', added: '+', context: ' ' }[rows[i].kind] + rows[i].text,
      );
      let depth = 0;
      for (const [tag] of rendered.matchAll(/<\/?span\b[^>]*>/g)) {
        depth += tag.startsWith('</') ? -1 : 1;
        assert(depth >= 0);
      }
      assert.equal(depth, 0);
    });
    assert.match(
      renderedRows.find((row) => row.includes('new &lt;img')),
      /token string/,
    );
    assert(!crystalDiffHTML('foo', 'foo').includes('diff-added'));
    assert(!crystalDiffHTML('foo', 'foo').includes('diff-removed'));
  } finally {
    if (original) globalThis.Prism = original;
    else delete globalThis.Prism;
  }
});

test('diffs remain escaped and readable when Prism is unavailable', () => {
  const html = crystalDiffHTML('<old>&', '<new>&');
  assert(html.includes('&lt;old&gt;&amp;') && html.includes('&lt;new&gt;&amp;'));
  assert(!html.includes('<old>') && !html.includes('<new>'));
});
