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
} from '../web/i18n/index.js';
import { WorkerClient } from '../web/runtime/worker-client.js';
import { explanation, eventLabel } from '../web/ui/event-labels.js';
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every UI message has matching JA/EN placeholders and English has no Japanese UI text', () => {
  for (const [key, value] of Object.entries(messages)) {
    assert(value.ja?.trim() && value.en?.trim(), key);
    assert.deepEqual(placeholders(value.ja), placeholders(value.en), key);
    assert(!/[ぁ-んァ-ン一-龯]/.test(value.en), key);
  }
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
