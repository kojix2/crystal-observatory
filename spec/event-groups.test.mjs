import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { groupEvents, eventRows } from '../web/core/event-groups.js';
import { TraceModel } from '../web/core/trace-model.js';
import { EventList } from '../web/ui/event-list.js';
import { setLocale } from '../web/i18n/index.js';

const load = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL(`../web/traces/${name}.json.gz`, import.meta.url))));

const sample = () =>
  [
    ['phase_enter', 0, '', 0],
    ['visit_enter', 0, 'Crystal::MainVisitor', 1],
    ['visit_enter', 1, 'Crystal::MainVisitor', 2],
    ['bind', 2, 'ASTNode', 2],
    ['visit_enter', 2, 'Crystal::TypeGuessVisitor', 2],
    ['visit_leave', 2, 'Crystal::TypeGuessVisitor', 2],
    ['visit_leave', 1, 'Crystal::MainVisitor', 2],
    ['dispatch', 1, 'Crystal::Call#recalculate', 2],
    ['visit_leave', 0, 'Crystal::MainVisitor', 1],
    ['visit_enter', 0, 'Crystal::MainVisitor', 1],
    ['visit_leave', 0, 'Crystal::MainVisitor', 1],
    ['phase_leave', 0, '', 0],
  ].map(([kind, depth, visitor, node_id], index) => ({
    kind,
    depth,
    visitor,
    node_id,
    index,
    phase: 'Semantic (main)',
  }));

test('top-level calls include callbacks and nested visitors but keep repeated calls separate', () => {
  const events = sample(),
    groups = groupEvents(events);
  assert.deepEqual(
    groups.map(({ start, end }) => [start, end]),
    [
      [1, 8],
      [9, 10],
    ],
  );
  const rows = eventRows(events, groups, new Set([1]));
  assert.deepEqual(
    rows.filter((row) => row.event).map((row) => row.event.index),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 11],
  );
  assert.equal(rows.filter((row) => row.group).length, 2);
});

test('filtering retains group context even when entry and exit events do not match', () => {
  const events = sample(),
    groups = groupEvents(events),
    filtered = events.filter((event) => event.kind === 'bind' || event.kind === 'dispatch');
  const collapsed = eventRows(filtered, groups);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].group.start, 1);
  assert.equal(collapsed[0].count, 2);
  assert.deepEqual(
    eventRows(filtered, groups, new Set([1]))
      .filter((row) => row.event)
      .map((row) => row.event),
    filtered,
  );
  assert.deepEqual(eventRows([], groups), []);
});

test('truncated, mismatched and depth-free ranges remain flat', () => {
  const truncated = sample().slice(0, 8);
  assert.deepEqual(groupEvents(truncated), []);
  assert.deepEqual(
    eventRows(truncated, []),
    truncated.map((event) => ({ event })),
  );
  for (const damage of [
    (events) => {
      events[5].kind = 'transform_leave';
    },
    (events) => {
      events[5].node_id = 100;
    },
    (events) => {
      events[5].visitor = 'OtherVisitor';
    },
    (events) => {
      events[5].depth = 0;
    },
    (events) => {
      events[5].phase = 'Other phase';
    },
    (events) => {
      events[7].kind = 'error';
    },
    (events) => {
      events[7].kind = 'phase_leave';
    },
  ]) {
    const events = sample();
    damage(events);
    assert.deepEqual(
      groupEvents(events).map((group) => group.start),
      [9],
    );
  }
  assert.deepEqual(groupEvents(sample().map(({ depth, ...event }) => event)), []);
});

test('all bundled traces expand back to the original event order with no nested groups', () => {
  const root = new URL('../web/traces/', import.meta.url);
  for (const file of readdirSync(root).filter((name) => name.endsWith('.json.gz'))) {
    const trace = JSON.parse(gunzipSync(readFileSync(new URL(file, root)))),
      original = structuredClone(trace),
      groups = groupEvents(trace.events);
    assert(groups.length > 0, file);
    let end = -1;
    for (const group of groups) {
      assert(group.start > end, file);
      assert.equal(group.event.depth, 0, file);
      end = group.end;
    }
    const expanded = new Set(groups.map((group) => group.start));
    assert.deepEqual(
      eventRows(trace.events, groups, expanded)
        .filter((row) => row.event)
        .map((row) => row.event),
      trace.events,
      file,
    );
    assert.deepEqual(trace, original, file);
  }
  const cleanup = load('06_cleanup'),
    group = groupEvents(cleanup.events).find(
      (group) => group.event.visitor === 'Crystal::CleanupTransformer',
    );
  assert.deepEqual([group.start, group.end], [141, 151]);
});

// Keep paging/filtering tests independent of browser setup; this small fixture
// supplies the DOM fields EventList uses, without emulating native button events.
function withList(trace, run) {
  const originalDocument = globalThis.document,
    elements = new Map(),
    seeks = [];
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', querySelector: () => null });
    return elements.get(id);
  };
  globalThis.document = { getElementById: element };
  setLocale('en');
  try {
    const list = new EventList((index) => seeks.push(index));
    list.load(new TraceModel(trace));
    run(list, element, seeks);
  } finally {
    globalThis.document = originalDocument;
    setLocale('en');
  }
}

test('opening, closing, filtering and localizing keep playback position and expanded state', () => {
  withList(load('06_cleanup'), (list, element, seeks) => {
    list.model.seek(150);
    list.follow();
    assert.equal(list.rows.length, 39);
    assert.equal(element('page-state').textContent, '1 / 1');
    assert.match(element('events').innerHTML, /Current: #150/);
    assert(!element('events').innerHTML.includes('data-index="150"'));

    const button = { dataset: { group: '141' } },
      target = { closest: (selector) => (selector === '[data-group]' ? button : null) };
    element('events').onclick({ target });
    assert(list.expanded.has(141));
    assert.match(element('events').innerHTML, /data-index="150"/);
    assert.match(element('events').innerHTML, /aria-expanded="true"/);
    assert.equal(list.model.index, 150);
    assert.deepEqual(seeks, []);

    element('kind').value = 'rewrite';
    element('search').value = 'CleanupTransformer';
    element('kind').onchange();
    assert.equal(list.rows.length, 2);
    assert.match(element('events').innerHTML, /1 of 11 events match/);
    setLocale('ja');
    list.render();
    assert.match(element('events').innerHTML, /11件中1件が一致/);
    assert.equal(list.model.index, 150);
    assert(list.expanded.has(141));
    list.toggle(141);
    assert.equal(list.rows.length, 1);
    assert.equal(list.model.index, 150);
    assert.deepEqual(seeks, []);

    list.load(new TraceModel(load('01_specialization')));
    assert.equal(list.expanded.size, 0);
    assert.equal(element('kind').value, '');
  });
});

test('node/search filters retain parent context, while original event rows still seek', () => {
  withList(load('01_specialization'), (list, element, seeks) => {
    const event = list.model.trace.events.find((event) => event.kind === 'dispatch');
    element('search').value = 'Call#recalculate';
    element('search').oninput();
    assert(list.rows.every((row) => row.group));
    const group = list.rows[0].group;
    list.toggle(group.start);
    assert(list.rows.some((row) => row.event?.index === event.index));
    list.filter(event.node_id);
    assert(list.filtered.every((item) => item.node_id === event.node_id));
    assert(list.rows.some((row) => row.group?.start === group.start));
    const target = {
      closest: (selector) =>
        selector === '[data-index]' ? { dataset: { index: String(event.index) } } : null,
    };
    element('events').onclick({ target });
    assert.deepEqual(seeks, [event.index]);
    element('clear-filter').onclick();
    assert.equal(list.filtered.length, list.model.trace.events.length);
    assert.equal(list.nodeFilter, 0);
  });
});

test('paging follows visible rows and a collapsed group tracks its hidden current event', () => {
  withList(load('07_struct'), (list, element) => {
    assert.equal(list.rows.length, 99);
    assert.equal(element('page-state').textContent, '1 / 2');
    list.toggle(393);
    list.model.seek(570);
    list.follow();
    assert.equal(
      list.page,
      Math.floor(list.rows.findIndex((row) => row.event?.index === 570) / 70),
    );
    assert.match(element('events').innerHTML, /data-index="570"/);
    list.toggle(393);
    assert.equal(list.model.index, 570);
    assert.match(element('events').innerHTML, /Current: #570/);
    assert.equal(element('page-state').textContent, '1 / 2');
    list.model.seek(1169);
    list.follow();
    assert.equal(element('page-state').textContent, '2 / 2');
    assert.match(element('events').innerHTML, /Current: #1169/);
  });
});
