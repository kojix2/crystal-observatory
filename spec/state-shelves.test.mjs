import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { TraceModel } from '../web/core/trace-model.js';
import { stateShelves } from '../web/core/state-shelves.js';
import { stateShelvesHTML } from '../web/ui/state-shelves.js';
import { TraceView } from '../web/ui/trace-view.js';
import { ViewLayout } from '../web/core/view-layout.js';
import { locales, setLocale, t } from '../web/i18n/index.js';

const fixture = (name) =>
  JSON.parse(
    gunzipSync(readFileSync(new URL(`./fixtures/traces/${name}.json.gz`, import.meta.url))),
  );

test('shelves exist before their contents, expose no future types, and rewind exactly', () => {
  const trace = fixture('09_declarations');
  const model = new TraceModel(trace);
  const ids = stateShelves(model).map(({ id }) => id);
  assert.equal(ids.length, 4);
  assert(stateShelves(model).every(({ entries, types }) => !entries.length && !types.length));
  assert(!stateShelvesHTML(model).includes('Generated'));
  const method = trace.events.find(
    (event) => event.kind === 'declaration' && event.declaration_action === 'method',
  );
  model.seek(method.index);
  const shelf = stateShelves(model).find(({ active }) => active);
  assert.equal(shelf.id, 'types');
  assert(
    shelf.types.find(({ info }) => info.id === method.type_id).methods.has(method.definition_id),
  );
  assert.match(stateShelvesHTML(model), new RegExp(`data-state-type="${method.type_id}"`));
  model.seek(method.index + 1);
  assert(stateShelvesHTML(model).includes(`data-declaration-event="${method.index}"`));
  model.seek(method.index);
  const prefix = stateShelves(model);
  model.seek(trace.events.length - 1);
  model.seek(method.index);
  assert.deepEqual(stateShelves(model), prefix);
  model.seek(-1);
  assert.deepEqual(
    stateShelves(model).map(({ id }) => id),
    ids,
  );
  assert(stateShelves(model).every(({ entries, types }) => !entries.length && !types.length));
});

test('a changed older type stays visible when the type shelf is bounded', () => {
  const trace = fixture('09_declarations');
  const first = trace.events.find(
    (event) => event.kind === 'declaration' && event.declaration_action === 'type_create',
  );
  for (let id = 8; id < 20; id++) {
    trace.semantic_types.push({ id, name: `Extra${id}`, kind: 'class' });
    trace.events.push({ ...first, index: trace.events.length, type_id: id });
  }
  trace.events.push({ ...first, index: trace.events.length, declaration_action: 'type_reopen' });
  const model = new TraceModel(trace).seek(trace.events.length - 1);
  const html = stateShelvesHTML(model);
  assert(html.includes(`data-state-type="${first.type_id}"`));
  assert.equal((html.match(/data-state-type=/g) || []).length, 7);
  assert(html.includes('state-type-slot declaration-changed'));
});

test('Program is separate from type objects and context names never merge operations', () => {
  const trace = fixture('10_initializers');
  const model = new TraceModel(trace).seek(trace.events.length - 1);
  const shelves = stateShelves(model);
  assert(
    shelves.find(({ id }) => id === 'program').types.every(({ info }) => info.kind === 'program'),
  );
  assert(
    shelves.find(({ id }) => id === 'types').types.every(({ info }) => info.kind !== 'program'),
  );
  assert(!shelves.some(({ id }) => id === 'visitor'));
  const observation = model.stateObservations.find(({ holder }) => holder === 'initializers');
  model.stateObservations = [0, 1].map((index) => ({
    ...observation,
    event: { ...observation.event, index, detail: 'same name', node_id: index + 1 },
  }));
  const entries = stateShelves(model).find(({ id }) => id === 'initializers').entries;
  assert.equal(entries.length, 2);
  assert.notEqual(entries[0].event.node_id, entries[1].event.node_id);
});

test('shelf rendering bounds operation lists, keeps current changes, and escapes compiler text', () => {
  const trace = fixture('10_initializers');
  const observation = new TraceModel(trace).stateObservations.find(
    ({ holder }) => holder === 'types',
  );
  const model = new TraceModel(trace).seek(observation.event.index);
  const event = model.event;
  event.detail = '<img src=x onerror=bad()>';
  event.after = '<script>bad()</script>';
  const html = stateShelvesHTML(model);
  assert.match(html, /state-shelf-active/);
  assert(html.includes(`data-state-entry="${event.index}"`));
  assert(html.includes('&lt;img'));
  assert(html.includes('&lt;script&gt;'));
  assert(!html.includes('<img'));
  assert(!html.includes('<script>'));
  assert(html.includes(t('state.actor')));
  const complete = new TraceModel(fixture('10_initializers')).seek(trace.events.length - 1);
  assert((stateShelvesHTML(complete).match(/data-state-entry=/g) || []).length <= 12);
  assert(stateShelvesHTML(complete).includes(t('state.inspectAll')));
});

test('missing observations and unobserved constructor generation are explicit in all locales', () => {
  const model = new TraceModel(fixture('09_declarations'));
  model.seek(model.trace.events.find((event) => event.phase === 'Semantic (new)').index);
  try {
    for (const locale of locales) {
      setLocale(locale);
      assert(stateShelvesHTML(model).includes(t('state.newUnobserved')));
      assert(
        stateShelvesHTML(model).includes(t('state.holders')) ||
          stateShelvesHTML(model).includes(t('state.store.types')),
      );
      const old = new TraceModel({
        schema_version: 1,
        source: '',
        nodes: [],
        snapshots: [],
        events: [],
      });
      assert(stateShelvesHTML(old).includes(t('state.unobserved')));
    }
  } finally {
    setLocale('en');
  }
});

test('playback preserves the storage overview across declaration and activity events', () => {
  const model = new TraceModel(fixture('09_declarations'));
  const elements = { follow: { checked: false }, snapshot: {}, scrubber: {}, position: {} };
  const original = globalThis.document;
  globalThis.document = { getElementById: (id) => elements[id] };
  const view = Object.assign(Object.create(TraceView.prototype), {
    model,
    layout: new ViewLayout('source'),
    stateSection: 'holders',
    events: { follow() {} },
    renderSelection() {},
  });
  try {
    const declaration = model.trace.events.find((event) => event.kind === 'declaration');
    const activity = model.stateObservations[0].event;
    for (const event of [declaration, activity]) {
      view.seek(event.index);
      assert.equal(view.stateSection, 'holders');
      assert.equal(view.model.index, event.index);
    }
  } finally {
    globalThis.document = original;
  }
});
