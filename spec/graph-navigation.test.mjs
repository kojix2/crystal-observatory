import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindGraphNavigation, zoomGraphAt } from '../web/ui/graph-navigation.js';

function fixture() {
  const handlers = new Map(),
    classes = new Set(),
    captures = new Set();
  const graph = {
    clientHeight: 400,
    scrollLeft: 300,
    scrollTop: 200,
    querySelector: () => ({}),
    addEventListener(type, handler, options) {
      handlers.set(type, { handler, options });
    },
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    setPointerCapture: (id) => captures.add(id),
    hasPointerCapture: (id) => captures.has(id),
    releasePointerCapture: (id) => captures.delete(id),
  };
  const emit = (type, values = {}) => {
    const event = {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 150,
      target: { closest: () => null },
      preventDefault() {
        this.prevented = true;
      },
      ...values,
    };
    handlers.get(type).handler(event);
    return event;
  };
  return { graph, emit, handlers, classes, captures };
}

test('wheel zooms in and out, normalizes scroll units and cancels native scrolling', () => {
  const { graph, emit, handlers } = fixture(),
    calls = [];
  bindGraphNavigation(graph, { zoom: (...args) => calls.push(args) });
  assert.equal(handlers.get('wheel').options.passive, false);
  assert.equal(emit('wheel', { deltaY: -80, deltaMode: 0 }).prevented, true);
  assert(calls[0][0] > 1);
  assert.deepEqual(calls[0][1], { x: 100, y: 150 });
  emit('wheel', { deltaY: 80, deltaMode: 0 });
  assert(calls[1][0] < 1);
  emit('wheel', { deltaY: 5, deltaMode: 1 });
  assert.equal(calls[1][0], calls[2][0]);
  emit('wheel', { deltaY: 100000, deltaMode: 2 });
  assert(Number.isFinite(calls[3][0]) && calls[3][0] > 0);
});

test('disabled layouts, empty diagrams and activity history retain native scrolling', () => {
  const { graph, emit } = fixture();
  let enabled = false,
    count = 0;
  bindGraphNavigation(graph, { enabled: () => enabled, zoom: () => count++ });
  assert(!emit('wheel', { deltaY: 50 }).prevented);
  enabled = true;
  assert(
    !emit('wheel', {
      deltaY: 50,
      target: { closest: (selector) => selector === '.type-activities' },
    }).prevented,
  );
  graph.querySelector = () => null;
  assert(!emit('wheel', { deltaY: 50 }).prevented);
  assert.equal(count, 0);
});

test('background drag pans with pointer capture and cancellation ends the gesture', () => {
  const { graph, emit, classes, captures } = fixture();
  bindGraphNavigation(graph, { zoom() {} });
  assert(emit('pointerdown').prevented);
  assert(classes.has('panning') && captures.has(1));
  emit('pointermove', { clientX: 60, clientY: 130 });
  assert.equal(graph.scrollLeft, 340);
  assert.equal(graph.scrollTop, 220);
  emit('pointermove', { pointerId: 2, clientX: 0 });
  assert.equal(graph.scrollLeft, 340);
  emit('pointercancel');
  assert(!classes.has('panning') && !captures.has(1));
  emit('pointermove', { clientX: 0 });
  assert.equal(graph.scrollLeft, 340);
});

test('node selection, secondary mouse buttons and touch gestures do not start a pan', () => {
  const { graph, emit, captures } = fixture();
  bindGraphNavigation(graph, { zoom() {} });
  assert(
    !emit('pointerdown', { target: { closest: (selector) => selector === '.node' } }).prevented,
  );
  assert(!emit('pointerdown', { button: 2 }).prevented);
  assert(!emit('pointerdown', { pointerType: 'touch' }).prevented);
  assert.equal(captures.size, 0);
});

test('zoom keeps the same SVG point under the pointer despite margins and reflow', () => {
  let rect = { left: -180, top: -70 };
  const graph = {
    scrollLeft: 300,
    scrollTop: 200,
    querySelector: () => ({ getBoundingClientRect: () => rect }),
  };
  const point = { x: 160, y: 190 },
    ratio = 1.5;
  const localX = point.x - rect.left,
    localY = point.y - rect.top;
  zoomGraphAt(
    graph,
    'svg',
    ratio,
    () => {
      rect = { left: -160, top: -50 };
    },
    point,
  );
  const movementX = graph.scrollLeft - 300,
    movementY = graph.scrollTop - 200;
  assert.equal(rect.left - movementX + localX * ratio, point.x);
  assert.equal(rect.top - movementY + localY * ratio, point.y);
});
