import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { compilerStage, compilerStages, indexCompilerStages } from '../web/core/compiler-stages.js';
import { renderCompilerMap } from '../web/ui/compiler-map.js';
import { setLocale, t } from '../web/i18n/index.js';

const recording = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL(`../web/traces/${name}.json.gz`, import.meta.url))));

// CI regenerates the bundled samples before testing. Select the compiler-only
// prefix explicitly when testing recordings from before browser-side link events.
const legacyRecording = (name) => {
  const trace = recording(name);
  const link = trace.events.findIndex((event) => event.kind === 'link');
  if (link >= 0) trace.events = trace.events.slice(0, link);
  return trace;
};

test('pipeline order follows actual compiler boundaries, including stages with no Visitor', () => {
  const trace = recording('02_union_and_narrowing');
  const records = indexCompilerStages(trace);
  const observed = trace.events.filter((event) => event.kind === 'phase_enter');
  assert.deepEqual(
    observed.map((event) => compilerStage(event)?.id),
    compilerStages.filter((stage) => stage.id !== 'link').map((stage) => stage.id),
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
  assert.equal(compilerStage({ phase: 'Link (LLD)' }).id, 'link');
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

test('link result is selectable in the workflow and follows normal history navigation', () => {
  const root = { contains: (element) => !!element, querySelector: () => null };
  const original = globalThis.document;
  globalThis.document = { getElementById: () => root };
  const event = { index: 0, kind: 'link', phase: 'Link (LLD)' };
  const trace = { mode: 'full', events: [event] };
  const records = indexCompilerStages(trace);
  try {
    setLocale('ja');
    let selected;
    renderCompilerMap({ trace, event }, records, (index) => (selected = index));
    assert.match(root.innerHTML, /data-index="0" aria-current="step"/);
    assert(root.innerHTML.includes(t('pipeline.group.link')));
    root.onclick({ target: { closest: () => ({ dataset: { index: '0' } }) } });
    assert.equal(selected, 0);
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});

test('legacy recordings allow inspecting link without inventing an event or seeking history', () => {
  const root = { contains: (element) => !!element, querySelector: () => null };
  const original = globalThis.document;
  globalThis.document = { getElementById: () => root };
  const trace = legacyRecording('02_union_and_narrowing');
  const records = indexCompilerStages(trace);
  const model = { trace, event: trace.events[records.get('main').first] };
  const initial = JSON.stringify(trace);
  let selectedStage;
  const onSeek = () => assert.fail('Stage overview must not seek history');
  const options = () => ({ selectedStage, onSelectStage: (id) => (selectedStage = id) });
  try {
    setLocale('ja');
    renderCompilerMap(model, records, onSeek, options());
    const button = root.innerHTML.match(/<button[^>]*data-stage="link"[^>]*>/)?.[0];
    assert(button, 'Link should have a stage description button');
    assert(!button.includes('disabled'));
    assert(!button.includes('data-index'));
    root.onclick({ target: { closest: () => ({ dataset: { stage: 'link' } }) } });
    assert.equal(selectedStage, 'link');
    renderCompilerMap(model, records, onSeek, options());
    assert.match(root.innerHTML, /data-stage="link" aria-current="step"/);
    setLocale('en');
    renderCompilerMap(model, records, onSeek, options());
    assert.match(root.innerHTML, /data-stage="link" aria-current="step"/);
    assert.equal(JSON.stringify(trace), initial);
    assert.equal(model.event.index, records.get('main').first);
    assert(!records.has('link'));
  } finally {
    globalThis.document = original;
    setLocale('en');
  }
});
