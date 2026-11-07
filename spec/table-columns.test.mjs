import test from 'node:test';
import assert from 'node:assert/strict';
import { setupTableColumns } from '../web/ui/table-columns.js';

const key = 'test.token-columns';
const close = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

function fixture(saved) {
  const original = {
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    ResizeObserver: globalThis.ResizeObserver,
  };
  const storage = new Map(saved === undefined ? [] : [[key, saved]]);
  const observers = [];
  globalThis.localStorage = {
    getItem: (name) => storage.get(name) ?? null,
    setItem: (name, value) => storage.set(name, value),
  };
  globalThis.document = { body: { classList: { add() {}, remove() {} } } };
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  };
  function createTable() {
    const columns = Array.from({ length: 4 }, () => ({ style: {} }));
    const handles = Array.from({ length: 3 }, () => ({
      handlers: new Map(),
      attrs: {},
      addEventListener(type, handler) {
        this.handlers.set(type, handler);
      },
      setAttribute(name, value) {
        this.attrs[name] = value;
      },
      setPointerCapture() {},
      classList: { add() {}, remove() {} },
    }));
    const table = {
      width: 1000,
      querySelectorAll: (selector) => (selector === 'col' ? columns : handles),
      getBoundingClientRect() {
        return { width: this.width };
      },
    };
    const controller = setupTableColumns(table, {
      key,
      minimums: [80, 80, 64, 64],
      defaults: () => [37, 28, 14, 21],
    });
    const widths = () => columns.map((col) => (parseFloat(col.style.width) * table.width) / 100);
    const fire = (i, type, data = {}) => {
      handles[i].handlers.get(type)({
        button: 0,
        pointerId: 1,
        clientX: 500,
        preventDefault() {},
        stopPropagation() {},
        ...data,
      });
    };
    return { table, handles, controller, widths, fire };
  }
  return {
    createTable,
    storage,
    observers,
    restore() {
      for (const [name, value] of Object.entries(original)) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      }
    },
  };
}

test('all three token dividers resize their adjacent columns and enforce minimum widths', () => {
  const env = fixture();
  try {
    const { widths, fire, handles, controller } = env.createTable();
    for (const index of [0, 1, 2]) {
      controller.reset();
      const before = widths();
      fire(index, 'pointerdown');
      fire(index, 'pointermove', { clientX: 530 });
      fire(index, 'pointerup');
      widths().forEach((width, i) =>
        close(width, before[i] + (i === index ? 30 : i === index + 1 ? -30 : 0)),
      );
      assert.equal(handles[index].tabIndex, 0);
      close(Number(handles[index].attrs['aria-valuenow']), Math.round(widths()[index]));
      fire(index, 'pointerdown');
      fire(index, 'pointermove', { clientX: -10000 });
      fire(index, 'pointercancel');
      close(widths()[index], index === 2 ? 64 : 80);
      close(
        widths().reduce((a, b) => a + b),
        1000,
      );
    }
  } finally {
    env.restore();
  }
});

test('keyboard resizing persists across replacement tables and all reset controls restore defaults', () => {
  const env = fixture();
  try {
    const first = env.createTable();
    first.fire(2, 'keydown', { key: 'ArrowRight', shiftKey: true });
    close(first.widths()[2], 180);
    close(first.widths()[3], 170);
    const second = env.createTable();
    second.widths().forEach((width, i) => close(width, first.widths()[i]));
    second.fire(1, 'keydown', { key: 'Home' });
    second.widths().forEach((width, i) => close(width, [370, 280, 140, 210][i]));
    second.fire(0, 'keydown', { key: 'ArrowLeft' });
    close(second.widths()[0], 358);
    second.fire(0, 'dblclick');
    close(second.widths()[0], 370);
    first.controller.destroy();
    assert.equal(env.observers[0].disconnected, true);
    assert.equal(JSON.parse(env.storage.get(key)), null);
  } finally {
    env.restore();
  }
});

test('invalid saved settings and unavailable browser storage keep token columns usable', () => {
  for (const saved of [
    'broken JSON',
    '[1,2,3]',
    '[0,2,3,4]',
    '[1,2,3,null]',
    '[1e308,1e308,1,1]',
  ]) {
    const env = fixture(saved);
    try {
      const { widths, controller, fire } = env.createTable();
      widths().forEach((width, i) => close(width, [370, 280, 140, 210][i]));
      globalThis.localStorage.setItem = () => {
        throw new Error('Storage unavailable');
      };
      fire(0, 'keydown', { key: 'ArrowRight' });
      close(widths()[0], 382);
      controller.reset();
      close(widths()[0], 370);
    } finally {
      env.restore();
    }
  }
});
