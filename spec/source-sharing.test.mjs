import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceSharing } from '../web/ui/source-sharing.js';
import { WorkSession } from '../web/runtime/session.js';
import { renderAPIReference } from '../web/ui/api-reference.js';
import { locales, setLocale } from '../web/i18n/index.js';
import { parseSourceLink, decodeSourceLink } from '../web/core/source-link.js';

async function fixture(run) {
  const old = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: '',
        open: false,
        textContent: '',
        close() {
          this.open = false;
        },
        showModal() {
          this.open = true;
        },
      });
    return elements.get(id);
  };
  globalThis.document = { getElementById: get };
  globalThis.window = { location: { href: 'https://example.com/ja/' } };
  const session = new WorkSession();
  const app = {
    session,
    editor: { value: 'my current work' },
    trace: { setView() {}, workspace: { showPane() {} } },
    showInput(source) {
      this.editor.value = source;
    },
    updateControls() {},
  };
  const sharing = Object.assign(Object.create(SourceSharing.prototype), {
    app,
    pending: null,
    origin: null,
  });
  try {
    await run({ sharing, app, get });
  } finally {
    sharing.cancel();
    session.dispose();
    Object.assign(globalThis, old);
  }
}

test('a late external response cannot replace edits, even after text is changed back', async () => {
  await fixture(async ({ sharing, app }) => {
    let finish;
    globalThis.fetch = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const pending = sharing.openURL('https://example.com/ja/?gist=abcde');
    assert.equal(app.session.busy, true);
    app.editor.value = 'new edits';
    sharing.cancel(); // The editor change callback invalidates the import.
    app.editor.value = 'my current work';
    finish(
      new Response(
        JSON.stringify({
          history: [{ version: 'a'.repeat(40) }],
          files: { 'main.cr': { content: 'puts 42', size: 7 } },
        }),
      ),
    );
    await pending;
    assert.equal(app.editor.value, 'my current work');
    assert.equal(app.session.busy, false);
  });
});

test('failed source loads preserve current work and report their actual cause', async () => {
  await fixture(async ({ sharing, app, get }) => {
    globalThis.fetch = async () => new Response('{}', { status: 404 });
    await sharing.openURL('https://example.com/ja/?gist=abcde');
    assert.equal(app.editor.value, 'my current work');
    assert.match(get('notice').textContent, /could not be found/);
    assert.equal(sharing.pending, null);
  });
});

test('fixed original links are available only while the external source is unchanged', async () => {
  await fixture(async ({ sharing, app, get }) => {
    sharing.origin = { source: app.editor.value };
    sharing.update();
    assert.equal(get('copy-origin-link').disabled, false);
    app.editor.value = 'edited';
    sharing.update();
    assert.equal(get('copy-origin-link').disabled, true);
  });
});

test('opening sharing displays the code link without accessing the clipboard', async () => {
  await fixture(async ({ sharing, app, get }) => {
    let copied;
    window.navigator = {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        },
      },
    };
    await sharing.showShare();
    assert.equal(get('source-share').open, true);
    assert.equal(
      await decodeSourceLink(parseSourceLink(get('share-link').value)),
      app.editor.value,
    );
    assert.equal(get('copy-source-link').disabled, false);
    assert.equal(copied, undefined);
    assert.match(get('share-gist-example').textContent, /\?gist=GIST_ID&file=main\.cr$/);
    const link = get('share-link').value;
    await sharing.copy(false);
    assert.equal(copied, link);
  });
});

test('a newer preview replaces an earlier compressed generation', async () => {
  await fixture(async ({ sharing, app, get }) => {
    app.editor.value = 'puts "old"\n'.repeat(2000);
    const old = sharing.showShare();
    app.editor.value = 'puts "new"';
    await Promise.all([old, sharing.showShare()]);
    assert.equal(await decodeSourceLink(parseSourceLink(get('share-link').value)), 'puts "new"');
  });
});

test('an unshareable source leaves copying disabled while retaining the Gist example', async () => {
  await fixture(async ({ sharing, app, get }) => {
    app.editor.value = 'x'.repeat(256 * 1024 + 1);
    await sharing.showShare();
    assert.equal(get('share-link').value, '');
    assert.equal(get('copy-source-link').disabled, true);
    assert(get('share-status').textContent);
    assert.match(get('share-gist-example').textContent, /gist=GIST_ID/);
  });
});

test('the API reference covers all source types and versions in every UI language', () => {
  try {
    for (const locale of locales) {
      setLocale(locale);
      const html = renderAPIReference();
      for (const fragment of [
        '#code=',
        'encoding=gzip',
        '?gist=',
        '?repo=',
        'rev=',
        'ref=',
        '16 KiB',
        '256 KiB',
      ])
        assert(html.includes(fragment), `${locale}: ${fragment}`);
      assert(!html.includes('<base64url>'));
      assert(html.includes('&lt;base64url&gt;'));
    }
  } finally {
    setLocale('en');
  }
});
