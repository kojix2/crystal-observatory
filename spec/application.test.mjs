import test from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../web/ui/application.js';
import { t, setLocale } from '../web/i18n/index.js';

async function fixture(run) {
  const oldDocument = globalThis.document;
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '' });
    return elements.get(id);
  };
  globalThis.document = { getElementById: get };
  get('prelude').value = 'empty';
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
    assert.equal(get('compile-run').disabled, true);
    assert.equal(get('compile-only').disabled, false);
    assert.equal(get('rerun').disabled, true);
    assert.equal(get('download-wasm').disabled, true);
    assert.equal(get('prelude-hint').hidden, false);
    await app.execute();
    assert.equal(get('notice').textContent, t('notice.needCompile'));
    get('prelude').value = 'prelude';
    app.updateControls();
    assert.equal(get('rerun').disabled, false);
    assert.equal(get('prelude-hint').hidden, true);
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
    get('prelude').value = 'prelude';
    app.updateControls();
    assert.equal(app.trace.recording.prelude, 'empty');
  });
});

test('missing compiler outputs and diagnostics cannot be shown as IR success', async () => {
  await fixture(async ({ app, get }) => {
    for (const prelude of ['prelude', 'empty']) {
      get('prelude').value = prelude;
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
