import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { compilerStage, compilerStages, indexCompilerStages } from '../web/core/compiler-stages.js';
import { renderCompilerMap } from '../web/ui/compiler-map.js';
import { setLocale, t } from '../web/i18n/index.js';

const recording = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL(`../web/traces/${name}.json.gz`, import.meta.url))));

test('pipeline order follows actual compiler boundaries, including stages with no Visitor', () => {
  const trace = recording('02_union_and_narrowing');
  const records = indexCompilerStages(trace);
  const observed = trace.events.filter((event) => event.kind === 'phase_enter');
  assert.deepEqual(
    observed.map((event) => compilerStage(event)?.id),
    compilerStages.map((stage) => stage.id),
  );
  for (const event of observed)
    assert.equal(records.get(compilerStage(event).id).first, event.index);
  const constructorEvents = trace.events.filter((event) => event.phase === 'Semantic (new)');
  assert.deepEqual(
    constructorEvents.map((event) => event.kind),
    ['phase_enter', 'phase_leave'],
  );
  assert.equal(compilerStage(constructorEvents[0]).driver, 'Program#define_new_methods');
  assert.equal(compilerStage({ phase: 'Semantic (type declarations)' }).output, 'variableTypes');
  assert.equal(compilerStage({ phase: 'Codegen (crystal)' }).id, 'codegen');
});

test('partial, error and syntax recordings do not invent later compiler stages', () => {
  const trace = recording('08_type_error');
  const records = indexCompilerStages(trace);
  assert(records.has('main'));
  assert(!records.has('codegen'));
  assert(!records.has('object'));
  assert.equal(compilerStage({ phase: 'Syntax walk (inspection)' }), undefined);
  assert.equal(
    compilerStage({ phase: 'Future phase', visitor: 'Crystal::MainVisitor' }),
    undefined,
  );
  assert.equal(compilerStage({ kind: 'complete', phase: '', detail: 'Parse' }), undefined);
  const sparse = indexCompilerStages({
    events: [{ index: 0, phase: 'Semantic (main)', kind: 'type' }],
  });
  assert.deepEqual([...sparse.keys()], ['main']);
});

test('map follows event phase, jumps to recorded indices, localizes and marks external steps', () => {
  const trace = recording('02_union_and_narrowing');
  const records = indexCompilerStages(trace);
  const root = {
    contains: (element) => !!element,
    querySelector: () => null,
  };
  const original = globalThis.document;
  globalThis.document = { getElementById: () => root };
  let selected;
  const model = { trace, event: trace.events[records.get('new').first] };
  try {
    setLocale('en');
    renderCompilerMap(model, records, (index) => (selected = index));
    assert.equal(root.hidden, false);
    assert.match(root.innerHTML, /aria-current="step"[^>]*title="Semantic \(new\)"/);
    assert(root.innerHTML.includes(t('pipeline.outsideShort')));
    const index = records.get('declarations').first;
    root.onclick({ target: { closest: () => ({ dataset: { index: String(index) } }) } });
    assert.equal(selected, index);

    model.event = trace.events[index];
    setLocale('ja');
    renderCompilerMap(model, records, () => {});
    assert.match(root.innerHTML, /aria-current="step"[^>]*title="Semantic \(type declarations\)"/);
    assert(root.innerHTML.includes(t('pipeline.stage.declarations')));
    renderCompilerMap({ trace: { mode: 'syntax' } }, new Map(), () => {});
    assert.equal(root.hidden, true);
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});

test('workflow stays visible alongside history during playback and ignores old visibility preferences', () => {
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.localStorage;
  const root = { contains: () => false, querySelector: () => null };
  const column = {};
  const splitter = {};
  globalThis.document = {
    getElementById: (id) =>
      id === 'compiler-map' ? root : id === 'workflow-splitter' ? splitter : column,
  };
  globalThis.localStorage = {
    getItem: () => 'false',
    setItem: () => assert.fail('No visibility preference should be written'),
  };
  const trace = recording('02_union_and_narrowing');
  const records = indexCompilerStages(trace);
  const model = { trace, event: trace.events[records.get('new').first] };
  const refresh = () =>
    renderCompilerMap(model, records, () => assert.fail('Visibility must not seek'));
  try {
    refresh();
    assert.equal(root.hidden, false);
    assert.equal(column.hidden, false);
    assert.equal(splitter.hidden, false);
    model.event = trace.events[records.get('declarations').first];
    setLocale('ja');
    refresh();
    assert.equal(root.hidden, false);
    assert.equal(column.hidden, false);
    assert.match(root.innerHTML, /aria-current="step"[^>]*title="Semantic \(type declarations\)"/);
    renderCompilerMap({ trace: { mode: 'syntax' } }, new Map(), () => {});
    assert.equal(root.hidden, true);
    assert.equal(column.hidden, true);
    assert.equal(splitter.hidden, true);
  } finally {
    globalThis.document = originalDocument;
    globalThis.localStorage = originalStorage;
    setLocale('en');
  }
});
