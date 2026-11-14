import test from 'node:test';
import assert from 'node:assert/strict';
import { TraceModel } from '../web/core/trace-model.js';
import { visitation, nextVisit, visitorAction } from '../web/core/visitation.js';
import { visitorSpeech, speechPlacement, renderVisitorSpeech } from '../web/ui/visitor-speech.js';
import { captureVisitorBall, animateVisitorBall } from '../web/ui/ast-visitation.js';
import { renderGraph } from '../web/ui/graphs.js';
import { TraceView } from '../web/ui/trace-view.js';
import { ViewLayout } from '../web/core/view-layout.js';
import { setLocale } from '../web/i18n/index.js';
import { readFileSync } from 'node:fs';

function trace() {
  const node = (id, kind, children = []) => ({
    id,
    kind,
    label: `node ${id}`,
    children,
    targets: [],
  });
  const nodes = [node(1, 'Expressions', [2, 3]), node(2, 'Call'), node(3, 'Var'), node(4, 'Def')];
  const events = [
    ['phase_enter', 0, ''],
    ['visit_enter', 1, 'Crystal::MainVisitor'],
    ['visit_enter', 2, 'Crystal::MainVisitor'],
    ['visit_enter', 2, 'Crystal::TypeGuessVisitor'],
    ['bind', 3, 'ASTNode'],
    ['visit_leave', 2, 'Crystal::TypeGuessVisitor'],
    ['type', 3, 'Crystal::MainVisitor'],
    ['visit_leave', 2, 'Crystal::MainVisitor'],
    ['transform_enter', 3, 'Crystal::CleanupTransformer'],
    ['transform_leave', 3, 'Crystal::CleanupTransformer'],
    ['visit_leave', 1, 'Crystal::MainVisitor'],
    ['phase_leave', 0, ''],
    ['phase_enter', 0, ''],
    ['phase_leave', 0, ''],
    ['phase_enter', 0, ''],
    ['visit_enter', 4, 'Crystal::CodeGenVisitor'],
    ['error', 0, ''],
  ].map(([kind, node_id, visitor], index) => ({
    index,
    kind,
    node_id,
    visitor,
    phase: index < 12 ? 'Semantic (main)' : index < 14 ? 'Semantic (new)' : 'Codegen (crystal)',
    ...(kind === 'type' ? { before: '', after: 'Int32' } : {}),
  }));
  return {
    schema_version: 1,
    source: '',
    nodes,
    events,
    snapshots: [
      { at_event: 0, name: 'Before codegen', roots: [1], nodes: nodes.slice(0, 3) },
      { at_event: 17, name: 'After codegen', roots: [1, 4], nodes },
    ],
  };
}

test('recorded dispatch frames distinguish entering, callbacks, nested Visitors, and returning', () => {
  const model = new TraceModel(trace());
  assert.equal(visitation(model).focus, undefined);
  model.seek(3);
  let visit = visitation(model);
  assert.equal(visit.mode, 'enter');
  assert.equal(visit.focus.visitor, 'Crystal::TypeGuessVisitor');
  assert.deepEqual([...visit.parents], [[1, 'Crystal::MainVisitor']]);
  model.seek(4); // ASTNode changes another node while TypeGuessVisitor remains inside node 2.
  visit = visitation(model);
  assert.equal(visit.mode, 'inside');
  assert.equal(visit.focus.node_id, 2);
  assert.equal(visit.focus.visitor, 'Crystal::TypeGuessVisitor');
  model.seek(5);
  visit = visitation(model);
  assert.equal(visit.mode, 'leave');
  assert.equal(visit.focus.visitor, 'Crystal::TypeGuessVisitor');
  assert.deepEqual(
    visit.stack.map((frame) => frame.visitor),
    ['Crystal::MainVisitor', 'Crystal::MainVisitor', 'Crystal::TypeGuessVisitor'],
  );
  model.seek(6);
  assert.equal(visitation(model).focus.visitor, 'Crystal::MainVisitor');
  assert.equal(visitation(model).focus.node_id, 2);
  model.seek(8);
  assert.equal(visitation(model).focus.visitor, 'Crystal::CleanupTransformer');
  model.seek(9);
  assert.equal(visitation(model).mode, 'leave');
  model.seek(2); // Rewinding must remove the nested Visitor and later transformer.
  assert.equal(visitation(model).focus.visitor, 'Crystal::MainVisitor');
  assert.equal(visitation(model).stack.length, 2);
});

test('stage boundaries, errors and absent dispatch evidence never invent a visiting Visitor', () => {
  const model = new TraceModel(trace());
  for (const index of [0, 11, 12, 13, 14, 16]) {
    model.seek(index);
    const visit = visitation(model);
    assert.equal(visit.mode, 'idle');
    assert.equal(visit.focus, undefined);
    assert.equal(visit.parents.size, 0);
  }
  model.seek(12);
  // The nominal driver for Semantic (new) is not a recorded AST dispatch.
  assert.equal(nextVisit(model), -1);
  assert.equal(
    visitation({
      event: { kind: 'activity', visitor: 'Crystal::ToSVisitor', node_id: 1 },
      stack: [],
    }).focus,
    undefined,
  );
  assert.equal(
    visitation({
      event: { kind: 'type', phase: 'another stage' },
      stack: [
        { kind: 'visit_enter', phase: 'old stage', node_id: 1, visitor: 'Crystal::MainVisitor' },
      ],
    }).focus,
    undefined,
  );
});

test('next visit follows recorded entries within the current stage and stops at failures', () => {
  const model = new TraceModel(trace());
  for (const [index, expected] of [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 8],
    [8, -1],
    [11, -1],
    [12, -1],
    [14, 15],
    [15, -1],
    [16, -1],
  ]) {
    model.seek(index);
    assert.equal(nextVisit(model), expected);
    assert.equal(model.index, index);
  }
});

function withDOM(run) {
  const original = globalThis.document;
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, { dataset: {} });
    return elements.get(id);
  };
  Object.assign(get('graph'), {
    clientWidth: 500,
    clientHeight: 400,
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  get('follow').checked = true;
  globalThis.document = { getElementById: get };
  try {
    setLocale('en');
    run(get);
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
}

test('all AST layouts mark the Visitor target and callers independently of selection and type changes', () =>
  withDOM((get) => {
    const model = new TraceModel(trace()).seek(6);
    const context = {
      model,
      selected: 3,
      snapshot: 0,
      view: 'ast',
      collapsed: new Set(),
      reveal: false,
    };
    for (const astLayout of ['cards', 'mindmap', 'radial']) {
      const render = () =>
        renderGraph(
          { ...context, astLayout },
          () => {},
          () => {},
        );
      render();
      const html = get('graph').innerHTML;
      const nodes = [...html.matchAll(/<g class="node ([^"]*)"([^>]*?)data-node="(\d+)"[^>]*>/g)];
      const active = nodes.find((match) => match[3] === '2');
      const parent = nodes.find((match) => match[3] === '1');
      const selected = nodes.find((match) => match[3] === '3');
      assert(active[1].includes('visit-current') && !active[1].includes('selected'));
      assert(active[2].includes('data-visitor="MainVisitor"'));
      assert(parent[1].includes('visit-parent'));
      assert(selected[1].includes('selected') && selected[1].includes('changed'));
      assert(!selected[1].includes('visit-current'));
      assert(html.includes('class="visitor-ball visitor-ball-current"'));
      assert(html.includes('class="visitor-ball visitor-ball-waiting"'));
      assert(!html.includes('visit-ring') && !html.includes('visit-cursor'));
      assert(/class="visitor-ball-letter"[^>]*>M<\/text>/.test(html));
      assert(!html.includes('radialGradient') && !html.includes('visitor-ball-shine'));
      if (astLayout === 'cards') {
        const nodeHTML = html.slice(html.indexOf(active[0]));
        const [, width] = /class="tile" width="([\d.]+)"/.exec(nodeHTML);
        const [, x, y] =
          /class="visitor-ball visitor-ball-current"[^>]+transform="translate\(([\d.]+) ([\d.]+)\)"/.exec(
            nodeHTML,
          );
        assert.equal(Number(x), Number(width) + 3);
        assert(Number(y) < 10);
      }
      model.seek(5);
      render();
      assert(get('graph').innerHTML.includes('visit-leave'));
      assert(get('graph').innerHTML.includes('data-visitor="TypeGuessVisitor"'));
      assert(/class="visitor-ball-letter"[^>]*>G<\/text>/.test(get('graph').innerHTML));
      model.seek(12);
      render();
      assert(!get('graph').innerHTML.includes('class="visitor-ball '));
      model.seek(6);
    }
  }));

test('follow keeps the Visitor ball visible when a zoomed node is wider than the viewport', () =>
  withDOM((get) => {
    const graph = get('graph');
    const ball = {
      getBoundingClientRect: () => ({ left: 900, right: 950, top: 120, bottom: 150 }),
    };
    const active = {
      getBoundingClientRect: () => ({ left: 100, right: 950, top: 100, bottom: 200 }),
      querySelector: (selector) => (selector === '.visitor-ball-current' ? ball : null),
    };
    graph.clientWidth = 400;
    graph.clientHeight = 300;
    graph.scrollLeft = 0;
    graph.scrollTop = 0;
    graph.getBoundingClientRect = () => ({ left: 0, right: 400, top: 0, bottom: 300, height: 300 });
    graph.querySelector = (selector) => (selector === '.node.visit-current' ? active : null);
    renderGraph(
      {
        model: new TraceModel(trace()).seek(6),
        selected: 0,
        snapshot: 0,
        view: 'ast',
        collapsed: new Set(),
        astLayout: 'mindmap',
        astZoom: 4,
      },
      () => {},
      () => {},
    );
    assert.equal(graph.scrollLeft, 884);
  }));

test('playback reveals the visiting node while preserving event selection, comparisons and pinned snapshots', () =>
  withDOM((get) => {
    const view = Object.create(TraceView.prototype);
    view.model = new TraceModel(trace());
    view.layout = new ViewLayout('source');
    view.layout.compare('ast');
    view.collapsed = new Set([1, 99]);
    view.events = { follow() {} };
    view.renderSelection = () => {};
    view.seek(6);
    assert.equal(view.selected, 3); // The event affects node 3 while the Visitor is at node 2.
    assert.equal(visitation(view.model).focus.node_id, 2);
    assert.deepEqual([...view.collapsed], [99]);
    assert.deepEqual(view.layout.views, ['source', 'ast']);
    view.seek(15);
    assert.equal(view.snapshot, 1); // The nearest recorded snapshot contains generated node 4.
    get('follow').checked = false;
    view.snapshot = 0;
    view.collapsed.add(1);
    view.seek(6);
    assert.equal(view.snapshot, 0);
    assert(view.collapsed.has(1));
    view.seek(15);
    assert.equal(view.snapshot, 0);
  }));

test('stage selection places the Visitor ball at its first recorded visit without an AST banner', () =>
  withDOM(() => {
    const view = Object.create(TraceView.prototype);
    view.model = new TraceModel(trace());
    view.layout = new ViewLayout('source');
    view.layout.compare('ast');
    view.collapsed = new Set([1]);
    view.events = { follow() {} };
    view.renderSelection = view.renderObservation = view.stop = () => {};
    view.selectEvent(0);
    assert.equal(view.model.index, 1);
    assert.equal(view.selected, 1);
    assert.equal(visitation(view.model).focus.visitor, 'Crystal::MainVisitor');
    assert.deepEqual(view.layout.views, ['source', 'ast']);
    assert.equal(view.collapsed.size, 0);
    view.selectEvent(12);
    assert.equal(view.model.index, 12);
    assert.equal(visitation(view.model).focus, undefined);
    view.selectEvent(14);
    assert.equal(view.model.index, 15);
    assert.equal(visitation(view.model).focus.node_id, 4);
    const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
    assert(!html.includes('id="ast-visitation"') && !html.includes('id="ast-next-visit"'));
  }));

function motionFixture() {
  const animations = [];
  const ball = {
    dataset: { visitor: 'MainVisitor', visitNode: '2', visitIndex: '1' },
    ownerSVGElement: { getAttribute: (name) => (name === 'class' ? 'ast-svg cards-svg' : '0') },
    getBoundingClientRect: () => ({ x: 50, y: 40, width: 22, height: 22 }),
    querySelector: () => ({
      animate: (frames, options) => animations.push({ frames, options }),
      getScreenCTM: () => ({ a: 2, b: 0, c: 0, d: 2 }),
    }),
  };
  const graph = { querySelector: () => ball };
  return { animations, ball, graph };
}

test('the Visitor ball moves between recorded nodes in SVG coordinates and pops when Visitors change', () => {
  const original = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  try {
    const { animations, ball, graph } = motionFixture();
    const previous = captureVisitorBall(graph);
    ball.dataset.visitNode = '3';
    ball.dataset.visitIndex = '2';
    ball.getBoundingClientRect = () => ({ x: 80, y: 120, width: 22, height: 22 });
    animateVisitorBall(graph, previous);
    assert.equal(animations.length, 1);
    assert.equal(animations[0].frames[0].transform, 'translate(-15px, -40px)');
    assert.equal(animations[0].frames[1].transform, 'translate(0, 0)');
    ball.dataset.visitor = 'TypeGuessVisitor';
    animateVisitorBall(graph, previous);
    assert.equal(animations[1].frames[0].transform, 'scale(.6)');
  } finally {
    globalThis.window = original;
  }
});

test('ball motion respects reduced motion and avoids flying on seeks, zooms or snapshot changes', () => {
  const original = globalThis.window;
  let reduced = true;
  globalThis.window = { matchMedia: () => ({ matches: reduced }) };
  try {
    const { animations, ball, graph } = motionFixture();
    const previous = captureVisitorBall(graph);
    ball.dataset.visitNode = '3';
    ball.dataset.visitIndex = '2';
    animateVisitorBall(graph, previous);
    assert.equal(animations.length, 0);
    reduced = false;
    ball.dataset.visitIndex = '10';
    animateVisitorBall(graph, previous);
    ball.dataset.visitIndex = '2';
    animateVisitorBall(graph, { ...previous, snapshot: 'another snapshot' });
    animateVisitorBall(graph, { ...previous, layout: 'ast-svg mindmap-svg' });
    ball.dataset.visitNode = previous.node;
    animateVisitorBall(graph, previous);
    assert.equal(animations.length, 0);
  } finally {
    globalThis.window = original;
  }
});

function speechTrace() {
  const recording = trace();
  const depths = [0, 0, 1, 2, 3, 2, 2, 1, 1, 1, 0];
  const parents = [0, 0, 1, 2, 2, 2, 2, 1, 1, 1, 0];
  recording.events.forEach((event, index) => {
    event.depth = depths[index] || 0;
    event.parent_id = parents[index] || 0;
  });
  return recording;
}

test('Visitors speak about observed changes, name other affected nodes, and clear on nested visits or rewind', () => {
  const model = new TraceModel(speechTrace());
  try {
    setLocale('ja');
    model.seek(6);
    assert.equal(visitorAction(model).kind, 'type');
    assert.equal(visitorSpeech(model, visitation(model)), '#3 は Int32 型になったよ');
    model.seek(7);
    assert.equal(visitorAction(model).event.index, 6); // Readable through the matching return.
    model.seek(8);
    assert.equal(visitorAction(model), undefined); // CleanupTransformer cannot repeat MainVisitor's work.
    model.seek(10);
    assert.equal(visitorAction(model), undefined); // Nor can the outer MainVisitor dispatch.
    model.seek(2);
    assert.equal(visitorAction(model), undefined); // No future observation while rewinding.
    model.seek(16);
    assert.equal(visitorAction(model), undefined);
  } finally {
    setLocale('en');
  }
});

test('only significant operations speak, and unsupported or unchanging observations stay silent', () => {
  const recording = speechTrace();
  const run = (event, nodeKind = 'Call') => {
    const sample = structuredClone(recording);
    sample.nodes[1].kind = nodeKind;
    sample.events[4] = {
      ...sample.events[4],
      node_id: 2,
      visitor: 'Crystal::TypeGuessVisitor',
      ...event,
    };
    const model = new TraceModel(sample).seek(4);
    return visitorAction(model)?.kind;
  };
  assert.equal(
    run({ kind: 'dispatch', visitor: 'Crystal::Call#recalculate', after: 'twice(Int32) : Int32' }),
    'resolve',
  );
  assert.equal(
    run({ kind: 'expand', visitor: 'Crystal::Call#expanded=', after: '1 + 1' }),
    'expand',
  );
  assert.equal(run({ kind: 'rewrite', before: 'old', after: 'new' }), 'rewrite');
  assert.equal(run({ kind: 'activity', activity: 'simplify_condition', after: '1' }), 'simplify');
  assert.equal(
    run({ kind: 'activity', activity: 'emit_instructions', after: 'ret i32 1' }),
    'emit',
  );
  assert.equal(run({ kind: 'activity', activity: 'serialize_source', after: 'source' }), undefined);
  assert.equal(run({ kind: 'dispatch', after: '' }), undefined);
  assert.equal(run({ kind: 'type', before: 'Int32', after: 'Int32' }), undefined);
  assert.equal(run({ kind: 'type', before: '', after: 'Nil' }, 'Def'), undefined);

  const cleared = speechTrace();
  cleared.events[7] = { ...cleared.events[6], index: 7, before: 'Int32', after: '' };
  assert.equal(visitorAction(new TraceModel(cleared).seek(7)), undefined);

  const aged = speechTrace();
  aged.events = aged.events.slice(0, 7);
  for (let index = 7; index < 20; index++)
    aged.events.push({ ...aged.events[4], visitor: 'ASTNode', index, depth: 2 });
  const model = new TraceModel(aged).seek(7);
  assert.equal(visitorAction(model).event.index, 6);
  model.seek(19);
  assert.equal(visitorAction(model), undefined);
});

test('speech bubbles prefer blank space and fit narrow viewports without covering the current node', () => {
  const viewport = { left: 0, top: 0, right: 500, bottom: 400 };
  const anchor = { x: 150, y: 120, radius: 13 };
  const target = { left: 20, right: 148, top: 112, bottom: 156 };
  const size = { width: 200, height: 48 };
  const beside = speechPlacement(viewport, anchor, target, size);
  assert.equal(beside.side, 'left');
  assert(beside.x > target.right);
  const above = speechPlacement(viewport, anchor, target, size, [
    { left: 173, right: 390, top: 90, bottom: 180 },
  ]);
  assert.equal(above.side, 'bottom');
  assert(above.y + size.height < target.top);
  const narrow = speechPlacement(
    { ...viewport, right: 300 },
    { x: 290, y: 188, radius: 13 },
    { left: 100, right: 285, top: 180, bottom: 224 },
    { width: 220, height: 60 },
  );
  assert(narrow.x >= 8 && narrow.x + 220 <= 292);
  assert(narrow.y + 60 < 180 || narrow.y > 224);
});

test('speech is attached to the Visitor as escaped text and positioned in scrolled graph coordinates', () => {
  const original = globalThis.document;
  const target = { left: 50, right: 168, top: 115, bottom: 159 };
  const targetElement = { getBoundingClientRect: () => target };
  const ball = {
    getScreenCTM: () => ({ a: 1, b: 0, e: 170, f: 120 }),
    querySelector: () => ({ getAttribute: () => '13' }),
    closest: () => ({ querySelector: () => targetElement }),
  };
  const bubbles = [];
  const graph = {
    clientWidth: 500,
    clientHeight: 300,
    scrollLeft: 20,
    scrollTop: 40,
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
    querySelector: () => ball,
    querySelectorAll: () => [targetElement],
    append: (bubble) => bubbles.push(bubble),
  };
  globalThis.document = {
    createElement: () => ({
      dataset: {},
      style: {
        setProperty(name, value) {
          this[name] = value;
        },
      },
      setAttribute() {},
      remove() {
        assert.fail('There is room beside the Visitor');
      },
      getBoundingClientRect: () => ({ width: 210, height: 52 }),
    }),
  };
  try {
    setLocale('ja');
    const model = new TraceModel(speechTrace()).seek(6);
    model.event.after = '<script>型</script>';
    renderVisitorSpeech(graph, model, visitation(model));
    assert.equal(bubbles.length, 1);
    assert.equal(bubbles[0].className, 'visitor-speech');
    assert.equal(bubbles[0].dataset.visitor, 'MainVisitor');
    assert.equal(bubbles[0].textContent, '#3 は <script>型</script> 型になったよ');
    assert.equal(bubbles[0].innerHTML, undefined);
    assert.equal(bubbles[0].style.left, '203px');
    assert.equal(bubbles[0].style.top, '114px');
    assert.equal(bubbles[0].style.width, '210px');
    assert.equal(bubbles[0].style.visibility, '');
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});

test('speech is hidden when its Visitor ball is outside the graph viewport', () => {
  const original = globalThis.document;
  const ball = {
    getScreenCTM: () => ({ a: 1, b: 0, e: 600, f: 120 }),
    querySelector: () => ({ getAttribute: () => '13' }),
  };
  const graph = {
    clientWidth: 500,
    clientHeight: 300,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    querySelector: () => ball,
  };
  globalThis.document = {
    createElement: () => assert.fail('No bubble should be created for an offscreen Visitor'),
  };
  try {
    const model = new TraceModel(speechTrace()).seek(6);
    renderVisitorSpeech(graph, model, visitation(model));
  } finally {
    globalThis.document = original;
  }
});

test('scrolling hides and restores speech as its Visitor ball crosses the viewport', () => {
  const original = globalThis.document;
  let x = 500,
    bubble = { remove: () => (bubble = null) },
    restored = 0;
  const graph = {
    clientWidth: 400,
    clientHeight: 300,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    querySelector: (selector) =>
      selector === '.visitor-ball-current' ? { getScreenCTM: () => ({ e: x, f: 150 }) } : bubble,
  };
  globalThis.document = { getElementById: () => graph };
  try {
    const view = Object.create(TraceView.prototype);
    view.refreshVisitorSpeech = () => restored++;
    view.syncVisitorSpeechVisibility();
    assert.equal(bubble, null);
    x = 200;
    view.syncVisitorSpeechVisibility();
    assert.equal(restored, 1);
  } finally {
    globalThis.document = original;
  }
});
