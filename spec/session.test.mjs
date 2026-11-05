import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkSession } from '../web/runtime/session.js';
import { WorkerClient, CancelledError, TimeoutError } from '../web/runtime/worker-client.js';

class FakeWorker {
  constructor(url) {
    this.kind = url.pathname.split('/').pop();
    this.terminated = false;
  }
  postMessage(payload) {
    this.payload = payload;
  }
  emit(data) {
    this.onmessage?.({ data });
  }
  terminate() {
    this.terminated = true;
  }
}
function fixture() {
  const workers = [],
    states = [];
  const session = new WorkSession({
    onState: (state) => states.push(state),
    createWorker: (url) => {
      const worker = new FakeWorker(url);
      workers.push(worker);
      return worker;
    },
  });
  return { session, workers, states };
}

test('cancelling a program preserves the loaded compiler, but discards program memory', async () => {
  const { session, workers } = fixture();
  try {
    const first = session.compile('puts 1');
    workers[0].emit({ trace: { source: 'puts 1' } });
    await first;
    const run = session.run({ wasm: new Uint8Array(), args: [], stdin: '' });
    const rejected = assert.rejects(run, CancelledError);
    session.cancel();
    await rejected;
    assert.equal(workers[0].terminated, false);
    assert.equal(workers[1].terminated, true);
    const second = session.compile('puts 2');
    workers[0].emit({ trace: { source: 'puts 2' } });
    assert.equal((await second).trace.source, 'puts 2');
    assert.equal(workers.length, 2);
  } finally {
    session.dispose();
  }
});

test('switching from syntax to compilation ignores queued messages from the old Worker', async () => {
  const { session, workers, states } = fixture();
  try {
    const syntax = session.parse('old'),
      rejected = assert.rejects(syntax, CancelledError);
    const late = workers[0].onmessage;
    assert.equal(session.busy, true);
    const compile = session.compile('new');
    await rejected;
    late({ data: { trace: { source: 'old' } } });
    assert.equal(session.busy, true);
    assert.equal(states.at(-1), 'compile');
    workers[1].emit({ trace: { source: 'new' } });
    assert.equal((await compile).trace.source, 'new');
    assert.equal(session.busy, false);
  } finally {
    session.dispose();
  }
});

test('a late record load cannot replace a newer compile even when its decoder cannot be aborted', async () => {
  const { session, workers } = fixture();
  let resolveFile, signal;
  try {
    const file = session.load((s) => {
      signal = s;
      return new Promise((resolve) => {
        resolveFile = resolve;
      });
    });
    const rejected = assert.rejects(file, CancelledError);
    const compile = session.compile('new');
    assert.equal(signal.aborted, true);
    resolveFile({ source: 'old record' });
    await rejected;
    assert.equal(session.busy, true);
    workers[0].emit({ trace: { source: 'new' } });
    await compile;
  } finally {
    session.dispose();
  }
});

test('Worker crashes and startup failures recover to an idle, retryable session', async () => {
  let attempts = 0,
    worker;
  const session = new WorkSession({
    createWorker: (url) => {
      if (!attempts++) throw new Error('startup blocked');
      worker = new FakeWorker(url);
      return worker;
    },
  });
  try {
    await assert.rejects(session.compile('a'), /startup blocked/);
    assert.equal(session.busy, false);
    const crashed = session.compile('b'),
      rejected = assert.rejects(crashed, /crashed/);
    worker.onerror({ message: 'crashed' });
    await rejected;
    assert.equal(worker.terminated, true);
    assert.equal(session.busy, false);
    const recovered = session.compile('c');
    worker.emit({ trace: { source: 'c' } });
    assert.equal((await recovered).trace.source, 'c');
  } finally {
    session.dispose();
  }
});

test('deadline terminates a blocked guest and rejects exactly once', async () => {
  let worker;
  const client = new WorkerClient(new URL('file:///compiler.js'), {
    reusable: true,
    createWorker: (url) => (worker = new FakeWorker(url)),
  });
  try {
    const result = client.request({}, { timeout: 10 });
    const late = worker.onmessage;
    await assert.rejects(result, TimeoutError);
    assert.equal(worker.terminated, true);
    late({ data: { trace: {} } });
    assert.equal(client.pending, null);
  } finally {
    client.dispose();
  }
});
