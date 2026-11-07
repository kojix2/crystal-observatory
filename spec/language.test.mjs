import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { locales, getLocale, setLocale } from '../web/i18n/index.js';
import { localeFromURL, localizedURL, setupLanguage } from '../web/ui/language.js';

test('language URLs work at the domain root and under a GitHub Pages project', () => {
  for (const path of ['/', '/crystal-observatory/']) {
    const root = new URL(path, 'https://example.com');
    for (const locale of locales) {
      for (const suffix of ['', '/', '/index.html']) {
        const url = new URL(`${locale}${suffix}?example=1#app`, root);
        assert.equal(localeFromURL(url, root), locale);
        const changed = localizedURL(url, 'ja', root);
        assert.equal(changed.pathname, `${path}ja/`);
        assert.equal(changed.search, '?example=1');
        assert.equal(changed.hash, '#app');
      }
    }
    for (const suffix of ['', 'index.html', 'unsupported/', 'ja/unknown', 'other/ja/'])
      assert.equal(localeFromURL(new URL(suffix, root), root), null);
    assert.equal(localeFromURL('https://example.com/elsewhere/ja/', root), null);
  }
});

test('language entry points load shared assets from the project root', () => {
  const root = new URL('../web/', import.meta.url);
  const original = readFileSync(new URL('index.html', root), 'utf8');
  for (const locale of locales) {
    const entry = new URL(`${locale}/index.html`, root);
    const html = readFileSync(entry, 'utf8');
    assert(html.includes(`<html lang="${locale}">`));
    assert.equal(
      html.replace(`<html lang="${locale}">`, '<html lang="en">').replaceAll('="../', '="./'),
      original,
    );
    for (const [, reference] of html.matchAll(/(?:src|href)="(\.\.\/[^\"]+)"/g)) {
      const asset = new URL(reference, entry);
      assert(asset.href.startsWith(root.href), reference);
      assert(existsSync(asset), reference);
    }
  }
});

test('URL language overrides storage and switching updates the share URL without navigation', () => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
  };
  const root = new URL('../web/', import.meta.url);
  const selector = {};
  const state = { editor: 'puts 42', event: 12 };
  let saved = 'fr';
  let storageBlocked = false;
  const location = { href: new URL('ja/?example=1#app', root).href };
  globalThis.window = {
    location,
    history: {
      state,
      replaceState(value, title, url) {
        assert.equal(value, state);
        location.href = String(url);
      },
    },
  };
  globalThis.document = {
    documentElement: {},
    getElementById: () => selector,
    querySelectorAll: () => [],
  };
  globalThis.localStorage = {
    getItem() {
      if (storageBlocked) throw new Error('Storage disabled');
      return saved;
    },
    setItem(key, value) {
      if (storageBlocked) throw new Error('Storage disabled');
      saved = value;
    },
  };
  try {
    setupLanguage();
    assert.equal(getLocale(), 'ja');
    assert.equal(selector.value, 'ja');
    assert.equal(saved, 'fr');
    selector.onchange({ target: { value: 'de' } });
    assert.equal(location.href, new URL('de/?example=1#app', root).href);
    assert.equal(getLocale(), 'de');
    assert.equal(document.documentElement.lang, 'de');
    assert.equal(saved, 'de');

    location.href = root.href;
    setupLanguage();
    assert.equal(getLocale(), 'de');

    storageBlocked = true;
    location.href = new URL('zh-CN/', root).href;
    setupLanguage();
    assert.equal(getLocale(), 'zh-CN');
    selector.onchange({ target: { value: 'en' } });
    assert.equal(location.href, new URL('en/', root).href);
    assert.equal(getLocale(), 'en');
  } finally {
    setLocale('en');
    Object.assign(globalThis, previous);
  }
});
