import test from 'node:test';
import assert from 'node:assert/strict';
import { setupEventTabs } from '../web/ui/event-tabs.js';

test('operation tabs keep context during playback without intercepting History navigation elsewhere', () => {
  const elements = new Map();
  let focused;
  const get = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        scrollTop: 0,
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        focus() {
          focused = id;
        },
        querySelector() {
          return get('event-content');
        },
      });
    return elements.get(id);
  };
  const original = globalThis.document;
  globalThis.document = { getElementById: get };
  try {
    const tabs = setupEventTabs(),
      model = { trace: {}, index: 1 };
    tabs.update(model);
    const key = (tab, key) => {
      let prevented = false,
        stopped = false;
      get(`event-tab-${tab}`).onkeydown({
        key,
        preventDefault() {
          prevented = true;
        },
        stopPropagation() {
          stopped = true;
        },
      });
      assert.equal(prevented, true);
      assert.equal(stopped, true);
    };
    key('operation', 'ArrowLeft');
    assert.equal(tabs.current, 'source');
    assert.equal(focused, 'event-tab-source');
    assert.equal(get('event-source-panel').hidden, false);
    assert.equal(get('event-operation-panel').hidden, true);
    assert.equal(get('event-tab-source').tabIndex, 0);
    assert.equal(get('event-tab-operation').tabIndex, -1);
    key('source', 'ArrowRight');
    assert.equal(tabs.current, 'operation');
    key('operation', 'End');
    assert.equal(tabs.current, 'source');
    key('source', 'Home');
    assert.equal(tabs.current, 'operation');
    get('event-phase').onclick();
    assert.equal(tabs.current, 'context');
    assert.equal(focused, 'event-tab-context');
    get('event-context-panel').scrollTop = 140;
    get('raw-event').open = true;
    tabs.update(model); // Localization and independent node selection keep reading state.
    assert.equal(get('event-context-panel').scrollTop, 140);
    assert.equal(get('raw-event').open, true);
    model.index++;
    tabs.update(model);
    assert.equal(tabs.current, 'context');
    assert.equal(get('event-context-panel').scrollTop, 0);
    assert.equal(get('raw-event').open, false);
    tabs.update({ trace: {}, index: model.index });
    assert.equal(tabs.current, 'operation');
    tabs.show('invalid');
    assert.equal(tabs.current, 'operation');
  } finally {
    globalThis.document = original;
  }
});
