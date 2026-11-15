import test from 'node:test';
import assert from 'node:assert/strict';
import { TraceModel, validateTrace, flattenAST } from '../web/core/trace-model.js';

function recording() {
  const node = (id, children = []) => ({ id, kind: 'Expressions', children, targets: [] });
  const nodes = [node(1, [2, 2]), node(2, [1])];
  return {
    schema_version: 1,
    source: '',
    nodes,
    events: [
      { index: 0, kind: 'phase_enter', phase: 'Parse' },
      { index: 1, kind: 'phase_leave', phase: 'Parse' },
    ],
    snapshots: [{ name: 'Parse', at_event: 2, roots: [1], nodes: structuredClone(nodes) }],
  };
}

test('snapshot identities and timestamps are checked before reconstructing compiler state', () => {
  for (const mutate of [
    (t) => t.snapshots[0].nodes.push(structuredClone(t.snapshots[0].nodes[0])),
    (t) => t.snapshots[0].nodes.push({ id: 3, children: [], targets: [] }),
    (t) => (t.snapshots[0].at_event = -1),
    (t) => (t.snapshots[0].at_event = 3),
    (t) => (t.snapshots[0].at_event = 0.5),
    (t) => delete t.snapshots[0].at_event,
    (t) => (t.snapshots[0].nodes[0] = null),
    (t) => (t.snapshots[0] = null),
    (t) => (t.nodes[0] = null),
    (t) => (t.events[0] = null),
    (t) => (t.events[0].parent_id = 3),
    (t) => (t.events[0].related_id = '1'),
    (t) => (t.events[0].node_id = -1),
    (t) => (t.events[0].parent_id = 0.5),
    (t) => (t.events[0].node_id = false),
    (t) => (t.events[0].after = 42),
    (t) => (t.events[0].depth = -1),
  ]) {
    const trace = recording();
    mutate(trace);
    assert.throws(
      () => validateTrace(trace),
      (error) => typeof error.key === 'string' && error.key.startsWith('error.trace'),
    );
  }
});

test('legacy truncated events with missing identities do not create phantom types or dependencies', () => {
  const trace = recording();
  trace.truncated = true;
  trace.events = [
    { index: 0, kind: 'type', node_id: 0, before: '', after: 'Int32' },
    { index: 1, kind: 'bind', node_id: 1, related_id: 0 },
  ];
  const model = new TraceModel(trace).seek(1);
  assert.equal(model.types.has(0), false);
  assert.equal(model.edges.size, 0);
});

test('valid shared nodes and cycles retain their actual edges', () => {
  const trace = validateTrace(recording());
  const rows = flattenAST(trace.snapshots[0]);
  assert.deepEqual(
    rows.map(({ node, reference }) => [node.id, reference]),
    [
      [1, false],
      [2, false],
      [1, true],
      [2, true],
    ],
  );
});

test('snapshot replay uses recorded time even when snapshots are stored out of order', () => {
  const trace = recording();
  trace.snapshots.push({ ...structuredClone(trace.snapshots[0]), name: 'Earlier', at_event: 0 });
  const model = new TraceModel(trace);
  assert.equal(model.snapshotAt(-1), 1);
  assert.equal(model.snapshotAt(0), 1);
  assert.equal(model.snapshotAt(1), 0);
});

test('recorded Unicode source uses the same byte limit as the compiler entrypoints', () => {
  const trace = recording();
  trace.source = '結'.repeat(Math.floor(262144 / 3));
  assert.equal(validateTrace(trace), trace);
  trace.source += '結';
  assert.throws(
    () => validateTrace(trace),
    (error) => error.key === 'error.traceSize',
  );
});
