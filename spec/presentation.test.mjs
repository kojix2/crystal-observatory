import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { highlightCrystal } from '../web/core/crystal-highlight.js';
import { explanation, visitorRole, sourceFiles, visitorKey } from '../web/ui/event-labels.js';
import { setLocale, t } from '../web/i18n/index.js';

// Compare rendered text; Prism need not escape a standalone greater-than sign.
const uncolored = (html) =>
  html
    .replace(/<\/?span\b[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

test('the shipped Crystal grammar colors macros, annotations and interpolation without changing source', () => {
  const context = createContext({});
  for (const name of ['core', 'clike', 'ruby', 'crystal'])
    runInContext(
      readFileSync(new URL(`../web/vendor/prismjs/prism-${name}.min.js`, import.meta.url), 'utf8'),
      context,
    );
  globalThis.Prism = context.Prism;
  try {
    const source =
      '# 結晶\n@[AlwaysInline]\ndef square(x : Int32)\n  x * x\nend\nmacro twice(x)\n  {{x}} + {{x}}\nend\nputs "結果 #{twice(23)}"\nputs "<img src=x onerror=alert(1)> & </pre>"\n';
    const html = highlightCrystal(source);
    for (const token of ['comment', 'keyword', 'number', 'attribute', 'expansion', 'interpolation'])
      assert.match(html, new RegExp(`class="token ${token}`));
    assert.equal(uncolored(html), source);
    assert(!html.includes('<img') && !html.includes('</pre>'));
    const incomplete = 'puts "unfinished #{\n';
    assert.equal(uncolored(highlightCrystal(incomplete)), incomplete);
  } finally {
    delete globalThis.Prism;
  }
});

test('unavailable highlighting keeps code visible and escapes HTML', () => {
  const source = '<script>alert("&")</script>\n';
  assert.equal(highlightCrystal(source), '&lt;script&gt;alert("&amp;")&lt;/script&gt;\n');
});

test('visitor roles stay distinct from the measured operation, including callbacks and unknown actors', () => {
  setLocale('en');
  const event = {
    kind: 'type',
    visitor: 'Crystal::MainVisitor',
    node_id: 12,
    before: 'Int32',
    after: 'Int32 | String',
  };
  assert.match(visitorRole(event), /specializes methods/);
  assert.match(explanation(event), /Int32 to Int32 \| String/);
  assert.match(explanation({ ...event, kind: 'visit_enter' }), /#12/);
  assert.equal(explanation({ kind: 'phase_leave', detail: 'Semantic (main)' }), 'Semantic (main)');
  assert.equal(visitorKey('Crystal::CodeGenVisitor::CodegenWellKnownFunctions'), 'CodeGenVisitor');
  assert.equal(sourceFiles[visitorKey('Crystal::Call#recalculate')], 'semantic/call.cr');
  assert.equal(visitorRole({ visitor: 'Crystal::FutureVisitor' }), t('visitor.unknown'));
  assert.equal(visitorRole({ visitor: '' }), t('visitor.stage'));
});
