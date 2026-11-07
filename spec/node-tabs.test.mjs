import test from 'node:test';
import assert from 'node:assert/strict';
import { setupNodeTabs } from '../web/ui/node-tabs.js';

test('node tabs support keyboard navigation and preserve reading state only within the same selection', () => {
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
          return get('content');
        },
      });
    return elements.get(id);
  };
  const original = globalThis.document;
  globalThis.document = { getElementById: get };
  try {
    const tabs = setupNodeTabs();
    const trace = {},
      model = { trace };
    tabs.update(model, 1);
    const keys = (tab, key) => {
      let prevented = false,
        stopped = false;
      get(`node-tab-${tab}`).onkeydown({
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
    keys('overview', 'ArrowLeft');
    assert.equal(tabs.current, 'ir');
    assert.equal(focused, 'node-tab-ir');
    assert.equal(get('node-ir-panel').hidden, false);
    assert.equal(get('node-overview-panel').hidden, true);
    assert.equal(get('node-tab-ir').tabIndex, 0);
    assert.equal(get('node-tab-overview').tabIndex, -1);
    keys('ir', 'ArrowRight');
    assert.equal(tabs.current, 'overview');
    keys('overview', 'End');
    keys('ir', 'Home');
    assert.equal(tabs.current, 'overview');
    get('node-tab-activities').onclick();
    get('node-activities-panel').scrollTop = 140;
    get('node-expand-code').ariaExpanded = 'true';
    tabs.update(model, 1); // Replay/localization must not reset the same node.
    assert.equal(tabs.current, 'activities');
    assert.equal(get('node-activities-panel').scrollTop, 140);
    assert.equal(get('node-expand-code').ariaExpanded, 'true');
    tabs.update(model, 2);
    assert.equal(tabs.current, 'overview');
    assert.equal(get('node-activities-panel').scrollTop, 0);
    assert.equal(get('node-expand-code').ariaExpanded, 'false');
    tabs.show('ir');
    tabs.update({ trace: {} }, 2); // A new trace can reuse the same node ID.
    assert.equal(tabs.current, 'overview');
    tabs.show('unknown');
    assert.equal(tabs.current, 'overview');
  } finally {
    globalThis.document = original;
  }
});
