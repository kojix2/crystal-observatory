import test from 'node:test';
import assert from 'node:assert/strict';
import { AstRecorder, astMarker } from '../web/ui/ast-recorder.js';

function fixture(run) {
  const names = [
    'document',
    'getComputedStyle',
    'XMLSerializer',
    'Image',
    'HTMLCanvasElement',
    'MediaRecorder',
  ];
  const original = new Map(
    names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  const drawn = [];
  const track = {
    stopped: false,
    stop() {
      this.stopped = true;
    },
    requestFrame() {},
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const ctx = {
    fillRect() {},
    drawImage() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fillText(letter, x, y) {
      drawn.push({ letter, x, y });
    },
  };
  const canvas = { getContext: () => ctx, captureStream: () => stream };
  globalThis.HTMLCanvasElement = function () {};
  globalThis.HTMLCanvasElement.prototype.captureStream = () => stream;
  globalThis.document = { createElement: () => canvas };
  globalThis.getComputedStyle = () => ({
    getPropertyValue: () => 'black',
    backgroundColor: 'white',
    fill: 'red',
    stroke: 'white',
    strokeWidth: '1px',
    borderTopColor: 'red',
    borderTopWidth: '1.5px',
    borderTopLeftRadius: '12px',
    color: 'black',
    fontStyle: 'normal',
    fontWeight: '400',
    fontSize: '12px',
    fontFamily: 'sans-serif',
  });
  globalThis.XMLSerializer = class {
    serializeToString() {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"/>';
    }
  };
  globalThis.Image = class {
    set src(value) {
      assert.equal(value, 'blob:ast');
      queueMicrotask(() => this.onload());
    }
  };
  URL.createObjectURL = () => 'blob:ast';
  URL.revokeObjectURL = () => {};
  globalThis.MediaRecorder = class {
    static isTypeSupported(type) {
      return type === 'video/webm';
    }
    constructor(source, options) {
      assert.equal(source, stream);
      this.mimeType = options.mimeType;
      this.state = 'inactive';
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({ data: new Blob(['video bytes']) });
      queueMicrotask(() => this.onstop());
    }
  };
  let position = 60;
  let bubble = null;
  const svg = {
    cloneNode: () => ({
      querySelectorAll: () => [],
      querySelector: () => null,
      setAttribute() {},
      style: { setProperty() {} },
    }),
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 240 }),
  };
  const ball = {
    dataset: { visitor: 'MainVisitor', visitNode: '1' },
    ownerSVGElement: { dataset: { snapshot: '0' }, getAttribute: () => 'ast-svg cards-svg' },
    querySelector(selector) {
      if (selector === '.visitor-ball-letter') return { textContent: 'M' };
      if (selector === '.visitor-ball-body')
        return {
          getBoundingClientRect: () => ({ left: position - 10, top: 90, width: 20, height: 20 }),
        };
      return null;
    },
  };
  const graph = {
    clientWidth: 400,
    clientHeight: 240,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    querySelector: (selector) =>
      selector === '.ast-svg'
        ? svg
        : selector === '.visitor-ball-current'
          ? ball
          : selector === '.visitor-speech'
            ? bubble
            : null,
  };
  const restore = () => {
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
  };
  return Promise.resolve()
    .then(() =>
      run({
        graph,
        ball,
        drawn,
        track,
        setBubble(value) {
          bubble = value;
        },
        move() {
          position = 300;
          ball.dataset.visitNode = '2';
        },
      }),
    )
    .finally(restore);
}

test('AST video draws intermediate Visitor positions and saves the recorded canvas', async () => {
  await fixture(async ({ graph, drawn, track, move }) => {
    let saved;
    let stopped;
    const done = new Promise((resolve) => {
      stopped = resolve;
    });
    const recorder = new AstRecorder({
      onSave(blob, extension) {
        saved = { blob, extension };
      },
      onStop: stopped,
      onError(error) {
        throw error;
      },
    });
    assert.equal(await recorder.start(graph), true);
    const before = astMarker(graph);
    move();
    await recorder.capture(graph, before, 30);
    await recorder.stop();
    await done;
    assert.deepEqual(
      drawn.map((item) => item.x),
      [60, 60, 108, 156, 204, 252, 300],
    );
    assert.equal(await saved.blob.text(), 'video bytes');
    assert.equal(saved.extension, 'webm');
    assert.equal(track.stopped, true);
  });
});

test('a cancelled AST video request does not create a recorder', async () => {
  await fixture(async ({ graph }) => {
    let saved = false;
    const recorder = new AstRecorder({
      onSave() {
        saved = true;
      },
      onStop() {},
      onError(error) {
        throw error;
      },
    });
    assert.equal(await recorder.start(graph, () => false), false);
    assert.equal(recorder.recorder, undefined);
    assert.equal(saved, false);
  });
});

test('Visitor destinations are measured without stopping the live SVG animation', async () => {
  await fixture(async ({ graph, ball }) => {
    let appended = false;
    let removed = false;
    const copy = {
      style: {},
      querySelector: () => ({
        getBoundingClientRect: () => ({ left: 290, top: 90, width: 20, height: 20 }),
      }),
      remove() {
        removed = true;
      },
    };
    ball.querySelector = (selector) => {
      if (selector === '.visitor-orb')
        return {
          cloneNode: () => copy,
          parentNode: {
            append() {
              appended = true;
            },
          },
        };
      if (selector === '.visitor-ball-letter') return { textContent: 'M' };
      if (selector === '.visitor-ball-body')
        return {
          getBoundingClientRect: () => ({ left: 50, top: 90, width: 20, height: 20 }),
        };
      return null;
    };
    assert.equal(astMarker(graph).x, 300);
    assert.equal(appended, true);
    assert.equal(removed, true);
  });
});

test('AST video includes the speech bubble beside the Visitor', async () => {
  await fixture(async ({ graph, drawn, setBubble }) => {
    setBubble({
      textContent: 'Found the call target!',
      firstChild: null,
      dataset: { side: 'left' },
      style: { getPropertyValue: () => '20px' },
      getBoundingClientRect: () => ({ left: 180, top: 48, width: 160, height: 40 }),
    });
    const recorder = new AstRecorder({
      onSave() {},
      onStop() {},
      onError(error) {
        throw error;
      },
    });
    assert.equal(await recorder.start(graph), true);
    assert(drawn.some((item) => item.letter === 'Found the call target!' && item.x === 191));
    await recorder.stop();
  });
});
