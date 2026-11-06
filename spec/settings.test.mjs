import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings } from '../web/core/settings.js';

test('saved colors retain valid overrides while ignoring corrupt and unknown preferences', () => {
  const stored = {
    colors: {
      paper: '#123ABC',
      'visitor-main': '#456789',
      'syntax-keyword': '#AaBBcc',
      ink: 'red',
      accent: 'url(https://example.com)',
      bg: '#abc',
      selection: 123456,
      'unknown-color': '#abcdef',
    },
    unknownSetting: true,
  };
  const original = structuredClone(stored);
  assert.deepEqual(normalizeSettings(stored), {
    colors: { paper: '#123abc', 'visitor-main': '#456789', 'syntax-keyword': '#aabbcc' },
  });
  assert.deepEqual(stored, original);
});

test('missing or malformed settings fall back to the default palette', () => {
  for (const stored of [
    null,
    undefined,
    false,
    42,
    'invalid',
    [],
    {},
    { colors: null },
    { colors: [] },
  ])
    assert.deepEqual(normalizeSettings(stored), { colors: {} });
});
