import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import {
  parseSourceLink,
  embeddedSourceURL,
  externalSourceURL,
  decodeSourceLink,
  SOURCE_LINK_LIMIT,
} from '../web/core/source-link.js';
import { LIMITS } from '../web/core/limits.js';

const base = 'https://example.com/crystal-observatory/ja/';
const errorKey = (key) => (error) => error.key === key;
const packed = (source) => ({
  kind: 'code',
  encoding: 'gzip',
  code: gzipSync(source).toString('base64url'),
});

test('source links preserve exact Unicode, punctuation, whitespace and empty code', async () => {
  for (const source of ['', 'puts 42', 'puts "日本語 + / # & % <script>"\r\n\t\n', 'puts "�"']) {
    const url = await embeddedSourceURL(`${base}?gist=abcde&file=old.cr&page=api`, source);
    assert.equal(url.pathname, '/crystal-observatory/ja/');
    assert.equal(url.search, '');
    assert.equal(await decodeSourceLink(parseSourceLink(url)), source);
  }
  assert.equal(await decodeSourceLink(parseSourceLink(`${base}#code=puts%2042`)), 'puts 42');
  const source = '# 結晶\nputs "a + b"\n'.repeat(300);
  const url = await embeddedSourceURL(base, source);
  assert.equal(parseSourceLink(url).encoding, 'gzip');
  assert.equal(await decodeSourceLink(parseSourceLink(url)), source);
});

test('source selectors are exclusive, structurally valid and unambiguous', () => {
  assert.equal(parseSourceLink(base), null);
  assert.equal(parseSourceLink(`${base}?page=api#app`), null);
  assert.deepEqual(parseSourceLink(`${base}?gist=abcde`), {
    kind: 'gist',
    gist: 'abcde',
    file: null,
    rev: null,
  });
  const ref = 'feature/a+b&c#d';
  const link = { kind: 'github', repo: 'owner/repo', file: '例/main file.cr', ref };
  assert.deepEqual(parseSourceLink(externalSourceURL(base, link)), link);
  for (const suffix of ['?gist=abcde#code=', '?gist=abcde&repo=a/b&file=x.cr'])
    assert.throws(() => parseSourceLink(base + suffix), errorKey('share.conflict'));
  for (const suffix of [
    '?gist=abcde&gist=12345',
    '#code=a&code=b',
    '#code=a&v=2',
    '#code=a&encoding=zip',
    '#code=%FF',
    '#code=%GG',
    '?code=puts42',
    '?repo=a/b',
    '?repo=a/b&file=',
    '?repo=a/b&file=../main.cr',
    '?repo=a/b&file=/main.cr',
    '?repo=a/b&file=a//b.cr',
    '?repo=a/b&file=main.cr&ref=',
    '?gist=not-an-id',
    '?gist=abcde&ref=main',
    '?gist=abcde&rev=main',
    '?file=main.cr',
    '#v=1',
  ])
    assert.throws(() => parseSourceLink(base + suffix), errorKey('share.invalid'), suffix);
});

test('fixed source links preserve revision and remove previous source selectors', () => {
  const rev = 'a'.repeat(40);
  const url = externalSourceURL(`${base}?repo=old/repo&ref=main&file=old.cr&page=api#code=old`, {
    kind: 'gist',
    gist: 'abcde',
    file: 'main + &.cr',
    rev,
  });
  assert.deepEqual(parseSourceLink(url), {
    kind: 'gist',
    gist: 'abcde',
    file: 'main + &.cr',
    rev,
  });
  assert.equal(url.hash, '');
  assert.equal(url.searchParams.has('repo'), false);
  assert.equal(url.searchParams.has('page'), false);
});

test('invalid compression, invalid UTF-8 and resource limits reject complete imports', async () => {
  for (const code of ['!', 'a', '%%%%', Buffer.from('not gzip').toString('base64url')])
    await assert.rejects(
      decodeSourceLink({ kind: 'code', encoding: 'gzip', code }),
      errorKey('share.invalid'),
    );
  await assert.rejects(decodeSourceLink(packed(Buffer.from([0xff]))), errorKey('share.invalid'));
  await assert.rejects(
    decodeSourceLink(packed('x'.repeat(LIMITS.sourceBytes + 1))),
    errorKey('error.sourceLimit'),
  );
  await assert.rejects(
    embeddedSourceURL(base, 'x'.repeat(LIMITS.sourceBytes + 1)),
    errorKey('error.sourceLimit'),
  );
  assert.throws(
    () => parseSourceLink(`${base}#code=${'x'.repeat(SOURCE_LINK_LIMIT)}`),
    errorKey('share.linkLimit'),
  );
  const random = Array.from({ length: 20000 }, (_, i) =>
    String.fromCharCode(32 + ((i * 3515245 + i ** 2 * 729) % 90)),
  ).join('');
  // Disable compression to verify the fallback's URL limit independently of ratio.
  const compression = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  try {
    await assert.rejects(embeddedSourceURL(base, random), errorKey('share.linkLimit'));
    const url = await embeddedSourceURL(base, 'puts "結晶"');
    assert.equal(await decodeSourceLink(parseSourceLink(url)), 'puts "結晶"');
  } finally {
    globalThis.CompressionStream = compression;
  }
});
