import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { icon, iconNames } from '../web/ui/icons.js';
import { lucideNames } from '../web/ui/icon-names.js';
import { messages } from '../web/i18n/messages.js';

const root = new URL('../web/', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const uiSources = () =>
  readdirSync(root, { recursive: true }).filter(
    (file) => /\.(js|html)$/.test(file) && !file.startsWith('vendor/') && !file.startsWith('i18n/'),
  );
// Glyphs that stood in for icons: play/pause/stop, chevrons, bar arrows, close, info.
const controlGlyphs = /[▶▼▾◀►■⏸⏹↺↻↤↦‹›×✕ⓘ↗↓]/u;

test('every icon placeholder and icon() call names a vocabulary entry', () => {
  const names = new Set(iconNames);
  for (const file of uiSources()) {
    if (file === 'ui/icons.js') continue;
    const source = read(file);
    for (const match of source.matchAll(/data-icon="([^"$]+)"|\bicon\('([^']+)'/g)) {
      const name = match[1] || match[2];
      assert(names.has(name), `${file}: unknown icon ${name}`);
    }
  }
  for (const name of Object.keys(lucideNames)) {
    const svg = icon(name, { size: 12 });
    assert.match(
      svg,
      /^<svg class="icon" data-icon="[^"]+" width="12" height="12" viewBox="0 0 24 24"/,
    );
    assert.match(svg, /aria-hidden="true">.+<\/svg>$/);
  }
  assert.match(icon('run', { className: 'pipeline-icon' }), /class="icon pipeline-icon"/);
  assert.throws(() => icon('missing'), /Unknown icon/);
});

test('translations and markup carry no control glyphs; icons come from icons.js only', () => {
  for (const [key, value] of Object.entries(messages))
    for (const [locale, text] of Object.entries(value))
      assert(!controlGlyphs.test(text), `${locale}/${key}: ${text}`);
  for (const file of uiSources()) {
    const source = read(file);
    assert(!controlGlyphs.test(source), `${file} draws an icon as text`);
    // Static SVG markup belongs in icons.js (or placeholders filled by it) or is a chart.
    for (const match of source.matchAll(/<svg\b[^>]*>/g)) {
      const tag = match[0];
      const allowed =
        file === 'ui/icons.js' ||
        /data-icon="/.test(tag) ||
        /class="(ast-svg|dep-svg)(?:\s|")/.test(tag);
      assert(allowed, `${file}: inline <svg> outside the icon vocabulary: ${tag}`);
    }
  }
});
