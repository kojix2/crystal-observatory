import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { TraceModel, validateTrace } from '../web/core/trace-model.js';
import { activityVisitors, coverageFor, groupActivitySummary } from '../web/core/activities.js';
import { groupEvents } from '../web/core/event-groups.js';
import { renderInspector } from '../web/ui/inspector.js';
import { setLocale, t } from '../web/i18n/index.js';

const trace = () => ({
  schema_version: 1,
  compiler_version: 'WASI',
  source: 'example',
  nodes: [
    { id: 1, kind: 'Call', text: 'example', inferred_type: 'NoReturn' },
    { id: 2, kind: 'Block' },
  ],
  snapshots: [],
  activity_coverage: [
    {
      visitor: 'Crystal::FixMissingTypes',
      node_kinds: ['Call', 'Block'],
      activities: ['fix_missing_type'],
    },
  ],
  events: [
    {
      index: 0,
      kind: 'activity',
      phase: 'Semantic (main)',
      visitor: 'Crystal::FixMissingTypes',
      node_id: 1,
      related_id: 2,
      activity: 'fix_missing_type',
      before: '',
      after: 'NoReturn',
      reason: 'unused_or_no_return_block',
    },
  ],
});

test('activities validate references and optional strings without rejecting future vocabulary', () => {
  assert.equal(validateTrace(trace()).events[0].activity, 'fix_missing_type');
  for (const mutate of [
    (t) => (t.events[0].node_id = 0),
    (t) => (t.events[0].related_id = 99),
    (t) => (t.events[0].visitor = ''),
    (t) => (t.events[0].reason = {}),
    (t) => (t.events[0].activity = ''),
    (t) => (t.activity_coverage = {}),
    (t) => (t.activity_coverage[0].node_kinds = ['Call', null]),
    (t) => (t.activity_coverage[0].activities = []),
  ]) {
    const input = trace();
    mutate(input);
    assert.throws(() => validateTrace(input));
  }
  const future = trace();
  future.events[0].activity = 'future_operation';
  assert.doesNotThrow(() => validateTrace(future));
});

test('direct type completion rewinds, and node activity indexes include evidence without duplication', () => {
  const model = new TraceModel(trace());
  assert.equal(model.types.get(1), '');
  assert.equal(model.activities.get(1).length, 1);
  assert.equal(model.activities.get(2)[0].node_id, 1);
  model.seek(0);
  assert.equal(model.types.get(1), 'NoReturn');
  model.seek(-1);
  assert.equal(model.types.get(1), '');
  assert.equal(model.activities.get(1).length, 1);
  assert.equal(coverageFor(model.trace, 'Crystal::FixMissingTypes', 'Call').length, 1);
  assert.equal(coverageFor(model.trace, 'Crystal::FixMissingTypes', 'Var').length, 0);
  assert.equal(coverageFor(model.trace, 'Crystal::Other', 'Call').length, 0);
  const legacy = trace();
  delete legacy.activity_coverage;
  legacy.events = [];
  assert.doesNotThrow(() => new TraceModel(legacy));
  assert.deepEqual(coverageFor(legacy, 'Crystal::FixMissingTypes', 'Call'), []);
});

test('collapsed summaries prefer direct activity and retain child node attribution', () => {
  const events = [
    { kind: 'visit_enter', visitor: 'Crystal::MainVisitor', node_id: 1, depth: 0, phase: 'main' },
    {
      kind: 'activity',
      visitor: 'Crystal::MainVisitor',
      node_id: 2,
      activity: 'assign_type',
      after: 'Int32',
      phase: 'main',
    },
    {
      kind: 'activity',
      visitor: 'Crystal::MainVisitor',
      node_id: 1,
      activity: 'resolve_target',
      after: 'twice(Int32)',
      phase: 'main',
    },
    { kind: 'visit_leave', visitor: 'Crystal::MainVisitor', node_id: 1, depth: 0, phase: 'main' },
  ].map((e, index) => ({ ...e, index }));
  const group = groupEvents(events)[0];
  assert.deepEqual(
    groupActivitySummary(events, group).map((e) => e.node_id),
    [1, 2],
  );
});

class Element {
  children = [];
  dataset = {};
  style = {};
  set textContent(value) {
    this.text = value;
    this.children = [];
  }
  get textContent() {
    return this.text || '';
  }
  replaceChildren(...children) {
    this.text = '';
    this.children = children;
  }
  append(...children) {
    this.children.push(...children);
  }
  insertAdjacentHTML() {}
}

test('node activities navigate history independently and distinguish missing coverage from no record', () => {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  globalThis.document = { getElementById: get, createElement: () => new Element() };
  setLocale('en');
  try {
    const input = trace();
    input.activity_coverage.push({
      visitor: 'Crystal::MainVisitor',
      node_kinds: ['Block'],
      activities: ['assign_type'],
    });
    const model = new TraceModel(input);
    let seek, selected;
    renderInspector(
      model,
      2,
      (id) => (selected = id),
      () => {},
      (index) => (seek = index),
    );
    const section = get('node-activities').children[0];
    section.children[1].onclick();
    assert.equal(seek, 0);
    assert.equal(model.index, -1);
    assert.equal(selected, undefined);
    const flatten = (element) => [element.textContent, ...element.children.map(flatten)].join('\n');
    const texts = flatten(get('node-activities'));
    assert(texts.includes(`MainVisitor · ${t('activity.none')}`));
    assert(texts.includes(`RestrictionsAugmenter · ${t('activity.unmeasured')}`));
    model.seek(0);
    renderInspector(model, 2, (id) => (selected = id));
    assert.equal(get('activity-reason').textContent, 'unused_or_no_return_block');
    assert.equal(get('activity-reason-details').hidden, false);
    get('activity-related').onclick();
    assert.equal(selected, 2);
    model.trace.truncated = true;
    renderInspector(model, 2, () => {});
    assert.equal(get('node-activities').children[0].textContent, t('activity.incomplete'));
  } finally {
    delete globalThis.document;
    setLocale('en');
  }
});

const sample = (name, directory = './fixtures/traces/') =>
  JSON.parse(gunzipSync(readFileSync(new URL(`${directory}${name}.json.gz`, import.meta.url))));
test('recordings expose all fifteen real visitors and specific decisions', () => {
  const traces = ['../web/traces/', './fixtures/traces/'].flatMap((directory) =>
    readdirSync(new URL(directory, import.meta.url))
      .filter((name) => name.endsWith('.json.gz'))
      .map((name) => sample(name.slice(0, -8), directory)),
  );
  const activities = traces.flatMap((t) => t.events.filter((e) => e.kind === 'activity'));
  const coverage = [
    ...readFileSync(new URL('../src/lab/activity_hooks.cr', import.meta.url), 'utf8').matchAll(
      /cover\("([^"]+)", (\[[^\n]+?\]), (\[[^\n]+?\])\)/g,
    ),
  ].map(([, visitor, nodeKinds, kinds]) => ({
    visitor: `Crystal::${visitor}`,
    node_kinds: JSON.parse(nodeKinds),
    activities: JSON.parse(kinds),
  }));
  assert(coverage.length > 0);
  for (const trace of traces) assert.deepEqual(trace.activity_coverage, coverage);
  for (const visitor of activityVisitors) {
    assert(
      activities.some((e) => e.visitor === `Crystal::${visitor}`),
      visitor,
    );
  }
  const decisions = sample('11_restrictions').events.filter((e) => e.kind === 'activity');
  for (const reason of [
    'unconditional_assignment',
    'generated_new',
    'conditional_assignment',
    'argument_reassigned',
  ])
    assert(
      decisions.some((e) => e.reason === reason),
      reason,
    );
  const initializers = sample('10_initializers').events.filter((e) => e.kind === 'activity');
  for (const reason of ['replaced_by_later_initializer', 'generic_deferred', 'declared_type'])
    assert(
      initializers.some((e) => e.reason === reason),
      reason,
    );
  const guesses = sample('12_guess_and_self').events.filter((e) => e.kind === 'activity');
  assert(
    guesses.some(
      (e) =>
        e.activity === 'merge_guess' && e.after.includes('Float64') && e.before.includes('Int32'),
    ),
  );
  assert(guesses.some((e) => e.reason === 'self_class_excluded'));
  assert(
    guesses.some(
      (e) => e.reason === 'self_detected' && e.parent_visitor === 'Crystal::TypeGuessVisitor',
    ),
  );
  assert(guesses.some((e) => e.detail === 'excluded_after_self'));
  const macros = sample('14_macro_control').events.filter((e) => e.kind === 'activity');
  assert.equal(macros.filter((e) => e.activity === 'macro_iteration').length, 3);
  assert(macros.some((e) => e.activity === 'macro_branch' && e.detail === 'then'));
  assert(macros.some((e) => e.activity === 'emit_macro_source' && e.after.includes('puts')));
  assert(
    activities
      .filter((e) => e.activity === 'emit_instructions')
      .every((e) => e.llvm_function && e.detail.includes('child')),
  );
  const missing = sample('13_missing_types').events.filter((e) => e.kind === 'activity');
  assert(missing.some((e) => e.activity === 'fix_missing_type'));
  assert(
    missing.some((e) => e.activity === 'remove_dead_code' && e.visitor === 'Crystal::Normalizer'),
  );
  assert(
    activities.some(
      (e) => e.activity === 'remove_dead_code' && e.visitor === 'Crystal::CleanupTransformer',
    ),
  );
});
