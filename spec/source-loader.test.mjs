import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSharedSource } from '../web/runtime/source-loader.js';
import { LIMITS } from '../web/core/limits.js';

const sha = 'a'.repeat(40);
const gistLink = { kind: 'gist', gist: 'abcde', file: null, rev: null };
const repoLink = { kind: 'github', repo: 'owner/repo', file: 'examples/main + &.cr', ref: null };
const errorKey = (key) => (error) => error.key === key;
const response = (data, options) => new Response(JSON.stringify(data), options);
const entry = (content) => ({ content, size: Buffer.byteLength(content), truncated: false });
const gistData = (files) => ({ files, history: [{ version: sha }], truncated: false });
const githubData = (source) => ({
  type: 'file',
  size: Buffer.byteLength(source),
  encoding: 'base64',
  content:
    Buffer.from(source)
      .toString('base64')
      .match(/.{1,60}/g)
      ?.join('\n') || '',
});

test('embedded sources are loaded without network access', async () => {
  const result = await loadSharedSource(
    { kind: 'code', code: 'puts "結晶"', encoding: 'plain' },
    {
      fetcher() {
        assert.fail('embedded code must not fetch');
      },
    },
  );
  assert.deepEqual(result, { source: 'puts "結晶"', origin: null });
});

test('Gist auto-selection and explicit files retain the loaded revision', async () => {
  const data = gistData({ 'README.md': entry('read me'), 'main.cr': entry('puts "結晶"') });
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(url);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return response(data);
  };
  const result = await loadSharedSource(gistLink, { fetcher });
  assert.equal(result.source, 'puts "結晶"');
  assert.deepEqual(result.origin, { ...gistLink, file: 'main.cr', rev: sha });
  await loadSharedSource(result.origin, { fetcher });
  assert.deepEqual(calls, [
    'https://api.github.com/gists/abcde',
    `https://api.github.com/gists/abcde/${sha}`,
  ]);

  const choices = await loadSharedSource(gistLink, {
    fetcher: async () => response(gistData({ 'a.cr': entry('1'), 'b.cr': entry('2') })),
  });
  assert.deepEqual(choices.choices, ['a.cr', 'b.cr']);
  assert.equal(choices.origin.rev, sha);
  assert.equal(Object.hasOwn(choices, 'source'), false);
});

test('repository branch, tag and default branch are resolved before file loading', async () => {
  for (const ref of [null, 'main', 'v1.0', 'feature/a+b&c']) {
    const calls = [];
    const result = await loadSharedSource(
      { ...repoLink, ref },
      {
        fetcher: async (url) => {
          const target = new URL(url);
          calls.push(target);
          if (calls.length === 1) {
            assert.equal(target.pathname, '/repos/owner/repo/commits');
            assert.equal(target.searchParams.get('per_page'), '1');
            assert.equal(target.searchParams.get('sha'), ref);
            return response([{ sha }]);
          }
          assert.equal(target.pathname, '/repos/owner/repo/contents/examples/main%20%2B%20%26.cr');
          assert.equal(target.searchParams.get('ref'), sha);
          return response(githubData('puts "日本語"\r\n'));
        },
      },
    );
    assert.equal(result.source, 'puts "日本語"\r\n');
    assert.equal(result.origin.ref, sha);
    assert.equal(calls.length, 2);
  }
  let requests = 0;
  await loadSharedSource(
    { ...repoLink, ref: sha },
    {
      fetcher: async () => {
        requests++;
        return response(githubData(''));
      },
    },
  );
  assert.equal(requests, 1);
});

test('HTTP failures distinguish not found, throttling, permissions and network errors', async () => {
  for (const [status, headers, key] of [
    [404, {}, 'share.notFound'],
    [429, {}, 'share.rateLimit'],
    [403, { 'x-ratelimit-remaining': '0' }, 'share.rateLimit'],
    [403, { 'retry-after': '60' }, 'share.rateLimit'],
    [403, {}, 'share.httpError'],
    [500, {}, 'share.httpError'],
  ])
    await assert.rejects(
      loadSharedSource(gistLink, {
        fetcher: async () => response({}, { status, headers }),
      }),
      errorKey(key),
    );
  await assert.rejects(
    loadSharedSource(gistLink, {
      fetcher: async () => {
        throw new TypeError('offline');
      },
    }),
    errorKey('share.network'),
  );
});

test('incomplete, oversized, binary and non-file responses never become partial source', async () => {
  for (const [data, key] of [
    [gistData({ 'main.cr': { ...entry('puts 42'), truncated: true } }), 'share.incomplete'],
    [gistData({ 'main.cr': { ...entry('x'), size: LIMITS.sourceBytes + 1 } }), 'error.sourceLimit'],
    [gistData({ 'main.cr': { ...entry('x'), size: 30 } }), 'share.incomplete'],
    [gistData({ 'main.cr': entry('a\0b') }), 'share.invalid'],
    [gistData({ 'README.md': entry('read me') }), 'share.notFound'],
  ])
    await assert.rejects(
      loadSharedSource(gistLink, { fetcher: async () => response(data) }),
      errorKey(key),
    );
  for (const [data, key] of [
    [{ type: 'dir' }, 'share.notFile'],
    [{ ...githubData('x'), size: LIMITS.sourceBytes + 1 }, 'error.sourceLimit'],
    [{ ...githubData('x'), size: 10 }, 'share.incomplete'],
    [{ ...githubData('x'), encoding: 'none' }, 'share.incomplete'],
    [{ ...githubData('x'), content: '/w==' }, 'share.invalid'],
  ])
    await assert.rejects(
      loadSharedSource({ ...repoLink, ref: sha }, { fetcher: async () => response(data) }),
      errorKey(key),
    );
  await assert.rejects(
    loadSharedSource(gistLink, { fetcher: async () => new Response('not JSON') }),
    errorKey('share.invalid'),
  );
  await assert.rejects(
    loadSharedSource(gistLink, {
      fetcher: async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)),
    }),
    errorKey('share.responseLimit'),
  );
});

test('loading is abortable and external requests have a total timeout', async () => {
  let requested = false;
  const fetcher = (url, { signal }) =>
    new Promise((resolve, reject) => {
      requested = true;
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  await assert.rejects(
    loadSharedSource(gistLink, { fetcher, timeoutMs: 5 }),
    errorKey('share.timeout'),
  );
  const controller = new AbortController();
  const pending = loadSharedSource(gistLink, { fetcher, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  requested = false;
  await assert.rejects(loadSharedSource(gistLink, { fetcher, signal: controller.signal }), {
    name: 'AbortError',
  });
  assert.equal(requested, false);
});
