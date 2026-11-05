import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { messages } from '../web/i18n/messages.js';
import {
  t,
  setLocale,
  onLocaleChange,
  UIError,
  errorPayload,
  errorText,
  locales,
  getLocale,
} from '../web/i18n/index.js';
import { WorkerClient } from '../web/runtime/worker-client.js';
import { explanation, eventLabel } from '../web/ui/event-labels.js';
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every UI message covers all locales with matching placeholders', () => {
  for (const [key, value] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(value).sort(), [...locales].sort(), key);
    for (const locale of locales) {
      assert(value[locale]?.trim(), `${locale}/${key}`);
      assert.deepEqual(placeholders(value[locale]), placeholders(value.en), `${locale}/${key}`);
    }
    assert(!/[ぁ-んァ-ン一-龯]/.test(value.en), key);
  }
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const selector = html.match(/<select id="language"[^>]*>(.*?)<\/select>/s)[1];
  assert.deepEqual(
    [...selector.matchAll(/value="([^"]+)"/g)].map((m) => m[1]),
    locales,
  );
  const root = new URL('../web/', import.meta.url);
  const sources = readdirSync(root, { recursive: true }).filter(
    (file) => /\.(js|html)$/.test(file) && !file.startsWith('vendor/'),
  );
  for (const file of sources) {
    const source = readFileSync(new URL(file, root), 'utf8');
    for (const match of source.matchAll(
      /\bt\('([^']+)'|data-i18n(?:-title|-aria|-placeholder|-content)?="([^"]+)"|new UIError\('([^']+)'/g,
    )) {
      const key = match[1] || match[2] || match[3];
      assert(messages[key], `${file}: missing ${key}`);
    }
  }
});
test('additional languages translate UI text and preserve compiler-provided values', () => {
  const source = 'puts "結晶 <&>"';
  const diagnostic = new Error('input.cr:1: undefined method あいう');
  const event = {
    kind: 'type',
    visitor: 'Crystal::MainVisitor',
    node_id: 3,
    before: 'Int32',
    after: 'Int32 | String',
  };
  const original = structuredClone(event);
  try {
    for (const [locale, history] of [
      ['es', 'Historial'],
      ['zh-CN', '历史'],
      ['fr', 'Historique'],
      ['de', 'Verlauf'],
      ['ru', 'История'],
    ]) {
      setLocale(locale);
      assert.equal(getLocale(), locale);
      assert.equal(t('trace'), history);
      assert.equal(eventLabel('type'), messages['event.type'][locale]);
      assert.match(explanation(event), /Int32 \| String/);
      assert(t('notice.recorded', { origin: source }).includes(source));
      assert.equal(errorText(diagnostic), diagnostic.message);
      const timeout = new UIError('error.timeout', { seconds: 10 });
      assert.equal(
        errorText(timeout),
        messages['error.timeout'][locale].replace('{seconds}', '10'),
      );
      assert.deepEqual(event, original);
      setLocale('unsupported');
      assert.equal(getLocale(), locale);
    }
  } finally {
    setLocale('en');
  }
});
test('locale switching retains compiler-provided values and raw diagnostics', () => {
  assert.equal(eventLabel('type'), messages['event.type'].en); // Fresh sessions default to English.
  setLocale('ja');
  const source = 'puts "結晶"';
  const diagnostic = new Error('input.cr:1: undefined method あいう');
  const event = {
    kind: 'type',
    visitor: 'Crystal::MainVisitor',
    node_id: 3,
    before: 'Int32',
    after: 'Int32 | String',
  };
  const original = structuredClone(event);
  let changed = 0;
  const off = onLocaleChange(() => changed++);
  setLocale('en');
  assert.match(explanation(event), /Int32 \| String/);
  assert.equal(eventLabel('type'), messages['event.type'].en);
  assert.equal(errorText(diagnostic), diagnostic.message);
  assert.equal(
    t('notice.recorded', { origin: source }),
    `${source} · a previously recorded compiler trace.`,
  );
  setLocale('en'); // no duplicate rerender notifications
  setLocale('unsupported');
  assert.equal(changed, 1);
  assert.deepEqual(event, original);
  off();
  setLocale('ja');
});
test('worker errors are localized when received and can change language afterwards', async () => {
  setLocale('ja');
  const payload = errorPayload(new UIError('error.timeout', { seconds: 10 }));
  const worker = { postMessage() {}, terminate() {} };
  const client = new WorkerClient('test-worker', { createWorker: () => worker });
  const job = client.request({}, { timeout: 1000 });
  setLocale('en');
  worker.onmessage({ data: structuredClone(payload) });
  await assert.rejects(job, (error) => {
    assert.equal(errorText(error), 'Stopped after 10 seconds.');
    setLocale('ja');
    assert.equal(errorText(error), '10秒で処理を停止しました。');
    return true;
  });
});
