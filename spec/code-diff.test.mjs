import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createContext, runInContext } from 'node:vm';
import {
  sourceChange,
  diffLines,
  crystalDiffHTML,
  createCrystalDiff,
} from '../web/core/code-diff.js';

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

test('the cleanup rewrites that stalled playback render bounded pages without highlighting entire libraries', () => {
  const original = globalThis.Prism;
  let highlightCalls = 0;
  globalThis.Prism = {
    languages: { crystal: {} },
    highlight() {
      highlightCalls++;
      return '';
    },
  };
  try {
    for (const [name, index] of [
      ['01_specialization', 270],
      ['05_overloads', 322],
    ]) {
      const trace = JSON.parse(
        gunzipSync(readFileSync(new URL(`../web/traces/${name}.json.gz`, import.meta.url))),
      );
      const { before, after } = sourceChange(trace.events[index]);
      assert(after.length > 2_000_000);
      const diff = createCrystalDiff(before, after);
      assert(diff.pageCount > 1_000);
      for (const page of [0, 1, diff.pageCount - 1]) {
        const html = diff.pageHTML(page);
        assert(html.length < 240_000);
        assert([...html.matchAll(/<span\b/g)].length <= 600);
        assert(!html.includes('class="token'));
      }
      assert(
        diff
          .pageHTML(diff.pageCount - 1)
          .includes(name === '01_specialization' ? 'twice(1.0)' : 'scale(1.0)'),
      );
      assert.equal(trace.events[index].after, after);
    }
    assert.equal(highlightCalls, 0, 'Large serialized libraries must not be passed to Prism');
  } finally {
    if (original) globalThis.Prism = original;
    else delete globalThis.Prism;
  }
});

const pageTexts = (html) =>
  [...html.matchAll(/<span class="diff-code">(.*?)<\/span>/gs)].map((match) => uncolored(match[1]));

test('paging preserves every line, blank line, context and final newline', () => {
  const before = 'head\n' + 'old\n'.repeat(401) + 'tail\n';
  const after = 'head\n' + 'new\n'.repeat(401) + 'tail\n';
  const diff = createCrystalDiff(before, after);
  const texts = Array.from({ length: diff.pageCount }, (_, i) =>
    pageTexts(diff.pageHTML(i)),
  ).flat();
  assert.deepEqual(
    texts,
    diffLines(before, after).map((row) => row.text),
  );
  assert.equal(diff.pageHTML(-1), diff.pageHTML(0));
  assert.equal(diff.pageHTML(Infinity), diff.pageHTML(diff.pageCount - 1));
  assert.equal(createCrystalDiff('', '').pageCount, 1);
  assert.equal(createCrystalDiff('', '').pageHTML(), '');
});

test('a huge single line stays bounded and can be read completely across pages, including Unicode and HTML characters', () => {
  const after = 'a'.repeat(32_767) + '💎<&>'.repeat(20_000);
  const diff = createCrystalDiff('', after);
  let restored = '';
  for (let page = 0; page < diff.pageCount; page++) {
    const html = diff.pageHTML(page);
    const [text] = pageTexts(html);
    assert(text.length <= 32_768);
    assert(text.isWellFormed());
    assert(html.length < 240_000);
    assert(!html.includes('💎<&>'));
    restored += text;
  }
  assert.equal(restored, after);
});
