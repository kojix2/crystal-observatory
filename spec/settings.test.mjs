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
    astColors: true,
    editorFontSize: 12,
    irFontSize: 10,
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
    assert.deepEqual(normalizeSettings(stored), {
      colors: {},
      astColors: true,
      editorFontSize: 12,
      irFontSize: 10,
    });
});

test('AST color preferences load alongside older palettes and validate the opt-out', () => {
  const colors = { 'ast-literal': '#12AB34', paper: '#ffffff' };
  assert.deepEqual(normalizeSettings({ colors, astColors: false }), {
    colors: { 'ast-literal': '#12ab34', paper: '#ffffff' },
    astColors: false,
    editorFontSize: 12,
    irFontSize: 10,
  });
  for (const invalid of [null, 0, 'false', {}, []])
    assert.equal(normalizeSettings({ astColors: invalid }).astColors, true);
});

test('font sizes are independent and reject invalid saved values', () => {
  assert.deepEqual(normalizeSettings({ editorFontSize: 18, irFontSize: 9 }), {
    colors: {},
    astColors: true,
    editorFontSize: 18,
    irFontSize: 9,
  });
  for (const invalid of [0, 9, 25, 10.5, '14', null, NaN, Infinity])
    assert.equal(normalizeSettings({ editorFontSize: invalid }).editorFontSize, 12);
  for (const invalid of [0, 7, 23, 8.5, '10', null, NaN, Infinity])
    assert.equal(normalizeSettings({ irFontSize: invalid }).irFontSize, 10);
});
