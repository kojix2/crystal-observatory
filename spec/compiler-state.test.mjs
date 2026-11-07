import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { TraceModel } from '../web/core/trace-model.js';
import { stateObservation, stateObservationsAt } from '../web/core/compiler-state.js';
import { compilerStateHTML, bindCompilerState } from '../web/ui/compiler-state.js';
import { setLocale, locales, t } from '../web/i18n/index.js';

const fixture = (name) =>
  JSON.parse(
    gunzipSync(readFileSync(new URL(`./fixtures/traces/${name}.json.gz`, import.meta.url))),
  );

test('real recordings expose external stores, without treating AST type updates as stores', () => {
  const trace = fixture('10_initializers');
  const model = new TraceModel(trace).seek(trace.events.length - 1);
  const groups = stateObservationsAt(model.stateObservations, model.index);
  for (const category of ['constants', 'variables', 'initializers', 'specializations'])
    assert(groups.get(category).length > 0, category);
  const constant = groups
    .get('constants')
    .find(({ event }) => event.reason === 'constant_registered');
  assert.equal(constant.event.after, 'LIMIT');
  assert.equal(constant.event.detail, 'main');
  assert.equal(constant.holder, 'types');
  const local = groups.get('variables').find(({ event }) => event.reason === 'local_assignment');
  assert.equal(local.holder, 'visitor');
  assert(local.event.detail.includes('cumulative='));
  assert(
    groups
      .get('initializers')
      .some(({ event }) => event.reason === 'replaced_by_later_initializer'),
  );
  assert(groups.get('initializers').some(({ event }) => event.reason === 'typing_order'));
  const specialized = groups
    .get('specializations')
    .find(({ event }) => event.reason === 'begin_instantiation');
  assert(model.nodes.has(specialized.event.related_id));
  for (const event of trace.events.filter((event) => event.reason === 'set_type'))
    assert.equal(stateObservation(event), null);
  assert.equal(
    stateObservation({
      kind: 'activity',
      visitor: 'FutureVisitor',
      activity: 'register_initializer',
    }),
    null,
  );
});

test('state observations replay the prefix, retain separate sites and never merge equal context names', () => {
  const trace = fixture('10_initializers');
  const model = new TraceModel(trace);
  const [first, second] = model.stateObservations;
  const original = structuredClone(trace);
  assert(
    [...stateObservationsAt(model.stateObservations, -1).values()].every(
      (entries) => !entries.length,
    ),
  );
  model.seek(first.event.index);
  assert.equal(
    [...stateObservationsAt(model.stateObservations, model.index).values()].flat().length,
    1,
  );
  assert(!compilerStateHTML(model).includes(`data-state-event="${second.event.index}"`));
  model.seek(trace.events.length - 1);
  const complete = stateObservationsAt(model.stateObservations, model.index);
  const replaced = complete
    .get('initializers')
    .find(({ event }) => event.activity === 'discard_initializer');
  model.seek(replaced.event.index - 1);
  assert(
    !stateObservationsAt(model.stateObservations, model.index)
      .get('initializers')
      .includes(replaced),
  );
  model.seek(trace.events.length - 1);
  assert.deepEqual(stateObservationsAt(model.stateObservations, model.index), complete);
  assert.deepEqual(trace, original);

  const observations = [0, 1].map((index) =>
    stateObservation({
      ...first.event,
      index,
      detail: 'same context',
      node_id: index + 1,
    }),
  );
  const constants = stateObservationsAt(observations, 1).get('constants');
  assert.equal(constants.length, 2);
  assert.notEqual(constants[0].event.node_id, constants[1].event.node_id);
});

test('state UI localizes, escapes compiler data, preserves expanded entries and bounds rendering', () => {
  const trace = fixture('10_initializers');
  const model = new TraceModel(trace).seek(trace.events.length - 1);
  const constant = model.stateObservations.find(({ category }) => category === 'constants');
  constant.event.detail = '<img src=x onerror=alert(1)>';
  constant.event.after = '<script>bad()</script>';
  constant.event.reason = '<bad>';
  model.nodes.get(constant.event.node_id).filename = '<filename>';
  const expanded = new Set([constant.event.index]);
  try {
    for (const locale of locales) {
      setLocale(locale);
      const html = compilerStateHTML(model, 'constants', expanded);
      assert(html.includes(t('state.constants')), locale);
      assert(html.includes(`data-state-entry="${constant.event.index}" open`));
      assert(html.includes(`data-state-event="${constant.event.index}"`));
      assert(html.includes('&lt;img'));
      assert(html.includes('&lt;script&gt;'));
      assert(html.includes('&lt;bad&gt;'));
      assert(html.includes('&lt;filename&gt;'));
      assert(!html.includes('<img'));
    }
    setLocale('en');
    model.stateObservations = Array.from({ length: 65 }, (_, index) => ({
      ...constant,
      event: { ...constant.event, index },
    }));
    model.index = 64;
    const html = compilerStateHTML(model);
    assert(html.includes(t('state.page', { shown: 60, count: 65 })));
    assert(html.includes('data-state-event="4"'));
    assert(!html.includes('data-state-event="3"'));
    assert.equal((html.match(/data-state-node=/g) || []).length, 60);
  } finally {
    setLocale('en');
  }
});

test('missing metadata, empty prefixes and truncated traces remain distinct', () => {
  const trace = fixture('10_initializers');
  const model = new TraceModel(trace);
  assert(compilerStateHTML(model).includes(t('state.empty')));
  assert(!compilerStateHTML(model).includes(t('state.unobserved')));
  trace.truncated = true;
  assert(compilerStateHTML(model).includes(t('state.empty')));
  const old = new TraceModel({
    schema_version: 1,
    source: '',
    nodes: [],
    events: [],
    snapshots: [],
  });
  assert(compilerStateHTML(old).includes(t('state.unobserved')));
});

test('operation navigation seeks while source and related AST navigation only select nodes', () => {
  const calls = [];
  const event = { dataset: { stateEvent: '17' } };
  const site = { dataset: { stateNode: '3' } };
  const related = { dataset: { stateAst: '8' } };
  const root = {
    querySelectorAll: (selector) =>
      ({
        '[data-state-event]': [event],
        '[data-state-node]': [site],
        '[data-state-ast]': [related],
      })[selector],
    querySelector: () => null,
  };
  bindCompilerState(root, {
    onSeek: (index) => calls.push(['seek', index]),
    onNode: (id, view) => calls.push(['node', id, view]),
  });
  const originalDocument = globalThis.document;
  const focused = [];
  globalThis.document = { getElementById: (id) => ({ focus: () => focused.push(id) }) };
  try {
    event.onclick();
    site.onclick();
    related.onclick();
    assert.deepEqual(focused, ['source', 'graph']);
  } finally {
    globalThis.document = originalDocument;
  }
  assert.deepEqual(calls, [
    ['seek', 17],
    ['node', 3, undefined],
    ['node', 8, 'ast'],
  ]);
});
