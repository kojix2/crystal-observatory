import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tokenDisplay, tokenFamily, tokenSourceParts } from '../web/ui/tokens.js';

const recording = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL(`../web/traces/${name}.json.gz`, import.meta.url))));

test('recorded lexer output keeps names, numeric values and spacing distinct from source text', () => {
  const trace = recording('01_specialization');
  const lines = trace.source.split('\n');
  const word = trace.tokens.find((token) => token.kind === 'IDENT' && token.value === 'twice');
  const number = trace.tokens.find((token) => token.kind === 'NUMBER');
  const space = trace.tokens.find((token) => token.kind === 'SPACE');
  const newline = trace.tokens.find((token) => token.kind === 'NEWLINE');

  assert.equal(tokenDisplay(word), 'twice');
  assert.equal(tokenFamily(word), 'name');
  assert.deepEqual(tokenSourceParts(word, lines[word.line - 1]), {
    before: 'def ',
    match: 'twice',
    after: '(x)',
  });
  assert.equal(tokenDisplay(number), '1');
  assert.equal(tokenFamily(number), 'literal');
  assert.equal(number.number_kind, 'i32');
  assert.equal(tokenDisplay(space), '·');
  assert.equal(tokenSourceParts(space, lines[space.line - 1]).match, ' ');
  assert.equal(tokenDisplay(newline), '↵');
});

test('macro text, delimiters and Unicode source positions remain inspectable', () => {
  const macro = recording('03_macro_expansion');
  const token = macro.tokens.find((item) => item.kind === 'MACRO_LITERAL');
  assert.equal(tokenFamily(token), 'macro');
  assert.equal(tokenDisplay(token), '"  "');
  assert.equal(tokenSourceParts(token, macro.source.split('\n')[token.line - 1]).match, '  ');

  const source = 'x結晶 = 1';
  assert.deepEqual(tokenSourceParts({ kind: 'IDENT', value: '結晶', column: 2 }, source), {
    before: 'x',
    match: '結晶',
    after: ' = 1',
  });

  const declarations = JSON.parse(
    gunzipSync(readFileSync(new URL('./fixtures/traces/09_declarations.json.gz', import.meta.url))),
  );
  const delimiter = declarations.tokens.find((item) => item.kind === 'DELIMITER_START');
  const line = declarations.source.split('\n')[delimiter.line - 1];
  assert.equal(tokenDisplay(delimiter, line), '"');
  assert.equal(tokenSourceParts(delimiter, line).match, '"');
});
