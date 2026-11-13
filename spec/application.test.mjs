import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../web/ui/application.js';
import { t, setLocale } from '../web/i18n/index.js';
import { WorkSession } from '../web/runtime/session.js';

async function fixture(run) {
  const oldDocument = globalThis.document;
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: '',
        textContent: '',
        dataset: {},
        querySelector: () => null,
        prepend() {},
      });
    return elements.get(id);
  };
  globalThis.document = {
    getElementById: get,
    createElement: () => ({ content: { firstChild: {} } }),
  };
  get('prelude').checked = false;
  const app = Object.assign(Object.create(Application.prototype), {
    artifact: null,
    manifest: [],
    editor: { value: '42' },
    session: { busy: false, cancel() {} },
    trace: {
      stop() {},
      load(trace) {
        this.recording = trace;
      },
      setView(view) {
        this.view = view;
      },
    },
  });
  setLocale('en');
  try {
    await run({ app, get });
  } finally {
    globalThis.document = oldDocument;
  }
}

test('empty prelude allows IR compilation and disables execution of a standard-prelude artifact', async () => {
  await fixture(async ({ app, get }) => {
    app.artifact = { source: '42', prelude: 'prelude', wasm: new Uint8Array([1]) };
    app.updateControls();
    assert.equal(get('compile-run').disabled, false);
    assert.equal(get('compile-run').ariaLabel, t('compile'));
    assert.equal(get('compile-run').title, t('compile'));
    assert.equal(get('compile-only').disabled, false);
    assert.equal(get('rerun').disabled, true);
    assert.equal(get('download-wasm').disabled, true);
    assert.equal(get('prelude-hint').hidden, false);
    await app.execute();
    assert.equal(get('notice').textContent, t('notice.needCompile'));
    get('prelude').checked = true;
    app.updateControls();
    assert.equal(get('compile-run').ariaLabel, t('run'));
    assert.equal(get('compile-run').title, t('run.title'));
    assert.equal(get('rerun').disabled, false);
    assert.equal(get('prelude-hint').hidden, true);
    app.session.busy = true;
    app.updateControls();
    assert.equal(get('compile-run').disabled, true);
    assert.equal(get('prelude').disabled, true);
  });
});

test('successful empty-prelude IR does not require an executable and uses the submitted option', async () => {
  await fixture(async ({ app, get }) => {
    app.session.compile = async (source, onMessage, prelude) => {
      assert.equal(source, '42');
      assert.equal(prelude, 'empty');
      return { trace: { source, prelude, errors: [], llvm_ir: 'define void @main() {}' } };
    };
    await app.compile(false);
    assert.equal(app.artifact, null);
    assert.equal(app.trace.view, 'ir');
    assert.equal(app.trace.recording.prelude, 'empty');
    assert.equal(get('run-state').textContent, t('state.irReady'));
    get('prelude').checked = true;
    app.updateControls();
    assert.equal(app.trace.recording.prelude, 'empty');
  });
});

test('missing compiler outputs and diagnostics cannot be shown as IR success', async () => {
  await fixture(async ({ app, get }) => {
    for (const prelude of ['prelude', 'empty']) {
      get('prelude').checked = prelude === 'prelude';
      app.session.compile = async (source) => ({ trace: { source, errors: [], llvm_ir: '' } });
      await app.compile(false);
      assert.equal(get('run-state').textContent, t('state.failed'));
      assert.match(get('notice').textContent, /expected output/);
    }
    app.session.compile = async (source) => ({
      trace: { source, errors: ['undefined method puts'], llvm_ir: '' },
    });
    await app.compile(false);
    assert.equal(get('run-state').textContent, t('state.compileFailed'));
    assert.equal(app.artifact, null);
  });
});

test('opening UTF-8 source validates size before replacing the current document', async () => {
  await fixture(async ({ app, get }) => {
    app.session = new WorkSession();
    const opened = [];
    app.showInput = (source, name) => opened.push({ source, name });
    await app.openSource(new File(['puts "結晶"\n'], 'unicode.cr'));
    assert.deepEqual(opened, [{ source: 'puts "結晶"\n', name: 'unicode.cr' }]);
    let read = false;
    await app.openSource({
      size: 256 * 1024 + 1,
      arrayBuffer() {
        read = true;
      },
    });
    assert.equal(read, false);
    assert.equal(opened.length, 1);
    assert.equal(get('notice').textContent, t('error.sourceLimit'));
    assert.equal(app.session.busy, false);
    await app.openSource(new File([new Uint8Array([0xff])], 'invalid.cr'));
    assert.equal(opened.length, 1);
    assert.equal(app.session.busy, false);
  });
});

test('a pending local source read cannot replace a newer document after cancellation', async () => {
  await fixture(async ({ app }) => {
    app.session = new WorkSession();
    let complete;
    const opened = [];
    app.showInput = (source) => opened.push(source);
    const pending = app.openSource({
      name: 'old.cr',
      size: 2,
      arrayBuffer: () => new Promise((resolve) => (complete = resolve)),
    });
    assert.equal(app.session.busy, true);
    app.prepare();
    complete(new TextEncoder().encode('42').buffer);
    await pending;
    assert.deepEqual(opened, []);
    assert.equal(app.session.busy, false);
  });
});
