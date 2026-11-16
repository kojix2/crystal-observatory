import test from 'node:test';
import assert from 'node:assert/strict';
import { TraceView } from '../web/ui/trace-view.js';

async function fixture(run) {
  const original = globalThis.document;
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        dataset: {},
        querySelector: () => null,
        setAttribute() {},
        prepend() {},
      });
    return elements.get(id);
  };
  globalThis.document = {
    getElementById: get,
    querySelector: () => ({ value: '100' }),
    createElement: () => ({ content: { firstChild: {} } }),
  };
  const view = Object.assign(Object.create(TraceView.prototype), {
    model: { index: 0, trace: { events: [{}, {}, {}, {}] } },
    layout: { has: () => false },
    astRecorder: { stop() {} },
    updateRecordButton() {},
    seek(index) {
      this.model.index = index;
    },
  });
  try {
    await run(view, get);
  } finally {
    view.stop();
    globalThis.document = original;
  }
}

test('automatic playback reaches the final event, stops, and can replay from the beginning', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  await fixture(async (view, get) => {
    view.togglePlay();
    for (let i = 0; i < 4; i++) t.mock.timers.tick(100);
    assert.equal(view.model.index, 3);
    assert.equal(view.playTimer, null);
    assert.equal(get('play').dataset.i18nAria, 'play');
    view.togglePlay();
    assert.equal(view.model.index, 0);
    t.mock.timers.tick(100);
    assert.equal(view.model.index, 1);
  });
});

test('an in-flight recorded frame cannot schedule playback after stop and restart', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  await fixture(async (view) => {
    let release;
    view.astRecorder = {
      recorder: { state: 'recording' },
      stopping: false,
      stop() {
        this.stopping = true;
      },
      capture: () => new Promise((resolve) => (release = resolve)),
    };
    view.togglePlay();
    t.mock.timers.tick(240);
    assert.equal(typeof release, 'function');
    view.stop();
    view.togglePlay();
    const timer = view.playTimer;
    release();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(view.playTimer, timer);
    t.mock.timers.tick(100);
    assert.equal(view.model.index, 2);
  });
});
