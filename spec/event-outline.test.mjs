import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { eventRows, groupStages } from '../web/core/event-groups.js';
import { eventOutline } from '../web/core/event-outline.js';

const flatten = (items) => items.flatMap(({ row, children }) => [row, ...flatten(children)]);
const leaves = (items) => flatten(items).filter((row) => row.event);
const sample = () => {
  const events = Array.from({ length: 8 }, (_, index) => ({ index, kind: 'type' }));
  const visitor = { start: 1, end: 4, event: events[1] };
  const phase = { start: 0, end: 6, event: events[0], kind: 'phase', children: [visitor] };
  return eventRows(events, [phase], new Set([0, 1]));
};

test('outline nests operations under their recorded Visitor and stage without changing order', () => {
  const rows = sample(),
    original = structuredClone(rows),
    outline = eventOutline(rows);
  assert.equal(outline.length, 2);
  assert.equal(outline[0].row.group.kind, 'phase');
  const visitor = outline[0].children.find((item) => item.row.group);
  assert.equal(visitor.row.group.start, 1);
  assert.deepEqual(
    visitor.children.map((item) => item.row.event.index),
    [1, 2, 3, 4],
  );
  assert.equal(outline[1].row.event.index, 7);
  assert.deepEqual(flatten(outline), rows);
  assert.deepEqual(rows, original);
});

test('a page beginning inside a Visitor repeats both parents and only that page’s operations', () => {
  const rows = sample(),
    outline = eventOutline(rows, 5, 8);
  assert.equal(outline.length, 1);
  assert.equal(outline[0].row.group.kind, 'phase');
  assert.equal(outline[0].children[0].row.group.start, 1);
  assert.deepEqual(
    leaves(outline).map((row) => row.event.index),
    [3, 4, 5],
  );
  assert.equal(outline[0].children[1].row.event.index, 5);
  assert.deepEqual(eventOutline(rows, rows.length, rows.length + 70), []);
  assert.deepEqual(eventOutline([], 0, 70), []);
});

test('every page preserves event order and parent ranges across real recordings and failures', () => {
  for (const directory of ['../web/traces/', './fixtures/traces/']) {
    const root = new URL(directory, import.meta.url);
    for (const name of readdirSync(root).filter((file) => file.endsWith('.json.gz'))) {
      const trace = JSON.parse(gunzipSync(readFileSync(new URL(name, root)))),
        groups = groupStages(trace.events),
        expanded = new Set(
          groups.flatMap((group) => [
            group.start,
            ...(group.children || []).map((child) => child.start),
          ]),
        ),
        rows = eventRows(trace.events, groups, expanded),
        actual = [];
      const check = (items, parent) => {
        for (const { row, children } of items) {
          const index = row.group?.start ?? row.event.index;
          if (parent) assert(index >= parent.start && index <= parent.end, name);
          if (row.group) check(children, row.group);
          else assert.equal(children.length, 0, name);
        }
      };
      for (let start = 0; start < rows.length; start += 70) {
        const outline = eventOutline(rows, start, start + 70),
          operations = leaves(outline);
        assert.deepEqual(
          operations,
          rows.slice(start, start + 70).filter((row) => row.event),
          name,
        );
        actual.push(...operations.map((row) => row.event));
        check(outline);
      }
      assert.deepEqual(
        actual,
        trace.events.filter((event) => !['phase_enter', 'phase_leave'].includes(event.kind)),
        name,
      );
    }
  }
});

test('ungrouped filtered operations retain their original order without invented parents', () => {
  const rows = [
    { event: { index: 5, kind: 'declaration' } },
    { event: { index: 9, kind: 'error' } },
  ];
  const outline = eventOutline(rows);
  assert.deepEqual(
    outline.map((item) => item.row),
    rows,
  );
  assert(outline.every((item) => item.children.length === 0));
});
