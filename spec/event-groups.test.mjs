import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { groupEvents, groupStages, eventRows } from '../web/core/event-groups.js';
import { TraceModel } from '../web/core/trace-model.js';
import { EventList } from '../web/ui/event-list.js';
import { TraceView } from '../web/ui/trace-view.js';
import { setLocale } from '../web/i18n/index.js';

const load = (name, directory = '../web/traces/') =>
  JSON.parse(gunzipSync(readFileSync(new URL(`${directory}${name}.json.gz`, import.meta.url))));

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
  assert.equal(cleanup.events[group.start].kind, 'transform_enter');
  assert.equal(cleanup.events[group.end].kind, 'transform_leave');
});

test('stage boundaries collapse Visitors together and both levels restore every original event', () => {
  for (const directory of ['../web/traces/', './fixtures/traces/']) {
    const root = new URL(directory, import.meta.url);
    for (const file of readdirSync(root).filter((name) => name.endsWith('.json.gz'))) {
      const trace = JSON.parse(gunzipSync(readFileSync(new URL(file, root)))),
        original = structuredClone(trace),
        groups = groupStages(trace.events),
        phases = groups.filter((group) => group.kind === 'phase'),
        expanded = new Set(
          groups.flatMap((group) => [group.start, ...(group.children || []).map((g) => g.start)]),
        );
      assert(phases.length > 0, file);
      assert(eventRows(trace.events, groups).length < 70, file);
      for (const phase of phases) {
        assert.equal(trace.events[phase.start].kind, 'phase_enter', file);
        assert.equal(trace.events[phase.end].kind, 'phase_leave', file);
        assert.equal(trace.events[phase.start].phase, trace.events[phase.end].phase, file);
        for (const child of phase.children || [])
          assert(child.start > phase.start && child.end < phase.end, file);
      }
      assert.deepEqual(
        eventRows(trace.events, groups, expanded)
          .filter((row) => row.event)
          .map((row) => row.event),
        trace.events,
        file,
      );
      assert.deepEqual(trace, original, file);
    }
  }
});

test('stages require matching recorded boundaries and never conceal compiler errors', () => {
  const events = sample();
  assert.equal(groupStages(events).length, 1);
  assert.deepEqual(groupStages(events)[0].children, groupEvents(events));
  for (const damage of [
    (items) => items.pop(),
    (items) => (items.at(-1).phase = 'Other phase'),
    (items) => (items[3].phase = 'Other phase'),
    (items) => (items[7].kind = 'error'),
    (items) => (items[7].kind = 'complete'),
  ]) {
    const damaged = structuredClone(events);
    damage(damaged);
    assert(!groupStages(damaged).some((group) => group.kind === 'phase'));
  }
  assert.deepEqual(groupStages([]), []);
  assert.deepEqual(groupStages(events.slice(1, -1)), groupEvents(events.slice(1, -1)));
  const repeated = [...events, ...events.map((event) => ({ ...event, index: event.index + 12 }))];
  assert.deepEqual(
    groupStages(repeated).map(({ start, end }) => [start, end]),
    [
      [0, 11],
      [12, 23],
    ],
  );

  const failed = load('08_type_error'),
    rows = eventRows(failed.events, groupStages(failed.events));
  assert(rows.some((row) => row.event?.kind === 'error'));
  assert(
    rows.some((row) => row.event?.kind === 'phase_enter' && row.event.phase === 'Semantic (main)'),
  );
});

// Keep paging/filtering tests independent of browser setup; this small fixture
// supplies the DOM fields EventList uses, without emulating native button events.
function withList(trace, run) {
  const originalDocument = globalThis.document,
    elements = new Map(),
    seeks = [],
    browses = [];
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: '',
        dataset: {},
        querySelector: () => null,
        classList: { toggle() {} },
        addEventListener() {},
      });
    return elements.get(id);
  };
  globalThis.document = { getElementById: element };
  setLocale('en');
  try {
    const list = new EventList(
      (index) => seeks.push(index),
      () => browses.push(true),
    );
    list.load(new TraceModel(trace));
    run(list, element, seeks, browses);
  } finally {
    globalThis.document = originalDocument;
    setLocale('en');
  }
}

test('stage disclosure preserves selection, nested state, localized names and filter counts', () => {
  withList(load('06_cleanup'), (list, element, seeks) => {
    assert.equal(list.rows.length, 15);
    assert.equal(list.rows.filter((row) => row.group?.kind === 'phase').length, 13);
    assert.deepEqual(
      list.rows.filter((row) => row.event).map((row) => row.event.kind),
      ['complete', 'link'],
    );
    assert.equal(element('page-state').textContent, '1 / 1');
    const visitor = list.groups.find(
        (group) => group.event.visitor === 'Crystal::CleanupTransformer',
      ),
      phase = list.historyGroups.find((group) => group.children?.includes(visitor)),
      current = visitor.start + 1;
    list.model.seek(current);
    list.follow();
    assert.equal(list.activeGroup, phase.start);
    assert(element('events').innerHTML.includes(`Current: #${current}`));
    const toggleTarget = {
      closest: (selector) =>
        selector === '[data-group]' ? { dataset: { group: String(phase.start) } } : null,
    };
    element('events').onclick({ target: toggleTarget });
    assert(list.expanded.has(phase.start));
    assert.equal(list.activeGroup, visitor.start);
    list.toggle(visitor.start);
    assert(list.rows.some((row) => row.event?.index === current));
    list.toggle(phase.start);
    assert.equal(list.activeGroup, phase.start);
    assert(list.expanded.has(visitor.start));
    list.toggle(phase.start);
    assert(list.rows.some((row) => row.event?.index === current));

    element('kind').value = 'rewrite';
    element('kind').onchange();
    // Current event is hidden by the filter; highlight only its deepest visible parent.
    const activeRows = [...element('events').innerHTML.matchAll(/aria-current="step"/g)];
    assert.equal(activeRows.length, 1);
    setLocale('ja');
    list.render();
    assert(element('events').innerHTML.includes('件中'));
    assert(element('events').innerHTML.includes(list.stageLabel(phase.event)));
    assert.equal(list.model.index, current);
    assert.deepEqual(seeks, []);

    const target = {
      closest: (selector) =>
        selector === '[data-index]' ? { dataset: { index: String(phase.start) } } : null,
    };
    element('events').onkeydown({ target, key: 'Enter', preventDefault() {} });
    assert.deepEqual(seeks, [phase.start]);
    list.load(new TraceModel(load('01_specialization')));
    assert.equal(list.expanded.size, 0);
  });
});

test('opening, closing, filtering and localizing keep playback position and expanded state', () => {
  withList(load('06_cleanup'), (list, element, seeks) => {
    const cleanupGroup = list.groups.find(
      (group) => group.event.visitor === 'Crystal::CleanupTransformer',
    );
    const current = cleanupGroup.end - 1;
    list.model.seek(current);
    list.follow();
    const collapsedRows = list.rows.length;
    assert.equal(element('page-state').textContent, '1 / 1');
    assert(element('events').innerHTML.includes(`Current: #${current}`));
    assert(!element('events').innerHTML.includes(`data-index="${current}"`));

    const button = { dataset: { group: String(cleanupGroup.start) } },
      target = { closest: (selector) => (selector === '[data-group]' ? button : null) };
    element('events').onclick({ target });
    assert(list.expanded.has(cleanupGroup.start));
    assert(list.rows.length > collapsedRows);
    assert(element('events').innerHTML.includes(`data-index="${current}"`));
    assert.match(element('events').innerHTML, /aria-expanded="true"/);
    assert.equal(list.model.index, current);
    assert.deepEqual(seeks, []);

    element('kind').value = 'rewrite';
    element('search').value = 'CleanupTransformer';
    element('kind').onchange();
    assert.equal(list.rows.length, 3);
    const groupSize = cleanupGroup.end - cleanupGroup.start + 1;
    assert(element('events').innerHTML.includes(`1 of ${groupSize} events match`));
    setLocale('ja');
    list.render();
    assert(element('events').innerHTML.includes(`${groupSize}件中1件が一致`));
    assert.equal(list.model.index, current);
    assert(list.expanded.has(cleanupGroup.start));
    list.toggle(cleanupGroup.start);
    assert.equal(list.rows.length, 2);
    assert.equal(list.model.index, current);
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
    const phase = list.rows[0].group;
    assert.equal(phase.kind, 'phase');
    list.toggle(phase.start);
    const group = list.rows.find((row) => row.group && row.group.kind !== 'phase').group;
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

test('Visitor headings select an event by click or keyboard, separately from disclosure', () => {
  withList(load('01_specialization'), (list, element, seeks) => {
    const group = list.groups[0];
    const html = list.renderRow({ group, count: group.end - group.start + 1 });
    assert(html.includes(`class="event-select event-group-select" data-index="${group.start}"`));
    assert.match(html, /<\/button><button type="button" class="event-select event-group-select"/);
    const target = {
      closest: (selector) =>
        selector === '[data-index]'
          ? { dataset: { index: String(group.start) } }
          : selector === 'button'
            ? {}
            : null,
    };
    element('events').onclick({ target });
    let prevented = false;
    element('events').onkeydown({
      target,
      key: 'Enter',
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, false);
    // Native buttons dispatch one click for Enter/Space; the delegated key
    // handler must not dispatch an additional selection.
    element('events').onclick({ target });
    assert.deepEqual(seeks, [group.start, group.start]);
    assert.equal(list.expanded.has(group.start), false);
  });
});

test('declaration filtering exposes operations directly and searches relationships by name', () => {
  withList(load('09_declarations'), (list, element, seeks) => {
    element('kind').value = 'declaration';
    element('kind').onchange();
    assert(list.rows.length > 0);
    assert(list.rows.every((row) => row.event?.kind === 'declaration'));
    element('search').value = 'Named';
    element('search').oninput();
    assert(list.filtered.some((event) => event.declaration_action === 'extend'));
    const operation = list.filtered.find((event) => event.declaration_action === 'extend');
    assert(element('events').innerHTML.includes('Extend (class side)'));
    const target = {
      closest: (selector) =>
        selector === '[data-index]' ? { dataset: { index: String(operation.index) } } : null,
    };
    element('events').onclick({ target });
    assert.deepEqual(seeks, [operation.index]);
  });
});

test('paging follows visible rows and a collapsed group tracks its hidden current event', () => {
  withList(load('10_initializers', './fixtures/traces/'), (list, element) => {
    assert(list.rows.length < 70);
    for (const group of list.historyGroups.filter((group) => group.kind === 'phase'))
      list.toggle(group.start);
    assert(list.rows.length > 70);
    const group = list.groups.find((group) => group.end - group.start > 100 && group.start > 100);
    assert(group);
    const current = group.start + 1;
    list.toggle(group.start);
    list.model.seek(current);
    list.follow();
    assert.equal(
      list.page,
      Math.floor(list.rows.findIndex((row) => row.event?.index === current) / 70),
    );
    assert(element('events').innerHTML.includes(`data-index="${current}"`));
    list.toggle(group.start);
    assert.equal(list.model.index, current);
    assert(element('events').innerHTML.includes(`Current: #${current}`));
    const pages = Math.ceil(list.rows.length / 70);
    assert(pages > 1);
    assert.equal(element('page-state').textContent, `1 / ${pages}`);
    const last = list.groups.at(-1).start + 1;
    list.model.seek(last);
    list.follow();
    assert.equal(element('page-state').textContent, `${pages} / ${pages}`);
    assert(element('events').innerHTML.includes(`Current: #${last}`));
  });
});

test('manual paging starts at the top and signals browsing without moving the selected event', () => {
  withList(load('07_struct'), (list, element, seeks, browses) => {
    for (const group of list.historyGroups) {
      list.expanded.add(group.start);
      for (const visitor of group.children || []) list.expanded.add(visitor.start);
    }
    list.filter();
    list.model.seek(195);
    element('trace-content').scrollTop = 3000;
    element('page-next').onclick();
    assert.equal(list.page, 1);
    assert.equal(element('trace-content').scrollTop, 0);
    assert.equal(list.model.index, 195);
    element('trace-content').scrollTop = 700;
    element('page-prev').onclick();
    assert.equal(list.page, 0);
    assert.equal(element('trace-content').scrollTop, 0);
    assert.deepEqual(browses, [true, true]);
    assert.deepEqual(seeks, []);
  });
});

test('a hash-prefixed node query matches exactly the displayed node ID', () => {
  withList(load('07_struct'), (list, element) => {
    element('search').value = '#7';
    element('search').oninput();
    assert(list.filtered.length > 0);
    assert(list.filtered.every((event) => event.node_id === 7));
    assert.equal(
      list.filtered.length,
      list.model.trace.events.filter((event) => event.node_id === 7).length,
    );
    const typedNode = list.model.trace.events.find((event) => event.kind === 'type').node_id;
    element('search').value = `#${typedNode}`;
    element('kind').value = 'type';
    element('kind').onchange();
    assert(list.filtered.length > 0);
    assert(list.filtered.every((event) => event.node_id === typedNode && event.kind === 'type'));
    element('search').value = '#700';
    element('search').oninput();
    assert.equal(list.filtered.length, 0);
  });
});

test('re-evaluating translated search results preserves playback, scroll and expanded groups', () => {
  withList(load('06_cleanup'), (list, element) => {
    setLocale('ja');
    element('search').value = '構文解析';
    list.filter();
    assert.equal(list.filtered.length, 25);
    list.toggle(0);
    list.model.seek(118);
    element('trace-content').scrollTop = 80;
    setLocale('en');
    list.filter(list.nodeFilter, { preservePosition: true });
    assert.equal(list.filtered.length, 0);
    assert.equal(element('trace-content').scrollTop, 80);
    assert.equal(list.model.index, 118);
    assert(list.expanded.has(0));
  });
});

test('next activity uses the current search, node and activity filters', () => {
  withList(load('06_cleanup'), (list, element) => {
    element('activity-kind').value = 'simplify_condition';
    list.filter();
    assert.equal(list.filtered.length, 1);
    const expected = list.filtered[0],
      view = Object.create(TraceView.prototype);
    let stopped = false;
    Object.assign(view, {
      model: list.model,
      events: list,
      stop() {
        stopped = true;
      },
      seek(index) {
        list.model.seek(index);
      },
    });
    list.model.seek(0);
    view.nextKind('activity');
    assert(stopped);
    assert.equal(list.model.index, expected.index);
    assert.equal(list.model.event.activity, 'simplify_condition');
    element('activity-kind').value = '';
    element('search').value = `#${expected.node_id}`;
    list.filter(expected.node_id);
    list.model.seek(0);
    view.nextKind('activity');
    assert.equal(list.model.event.node_id, expected.node_id);
    assert.equal(list.model.index, list.filtered.find((event) => event.kind === 'activity').index);
  });
});
