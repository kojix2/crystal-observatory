import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PANES,
  MIN_PANES,
  workspaceLayout,
  workspaceMinimumWidth,
  paneWeights,
  paneWidths,
  moveDivider,
  detailHeights,
} from '../web/core/layout.js';
const sum = (values) => values.reduce((a, b) => a + b, 0);
const close = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);

test('three columns fill the desktop and retain minimum widths on narrow screens', () => {
  for (const width of [200, 862, 1000, 1340, 1855, 3500]) {
    for (const weights of [DEFAULT_PANES, [1, 98, 1], [70, 20, 10]]) {
      const panes = paneWidths(width, weights);
      panes.forEach((value, i) => assert(value >= MIN_PANES[i] - 1e-8));
      close(sum(panes), Math.max(width, sum(MIN_PANES)));
    }
  }
});
test('dragging any divider changes only its adjacent panes and clamps at both minimums', () => {
  const width = 1800,
    initial = paneWidths(width, DEFAULT_PANES);
  for (const i of [0, 1]) {
    for (const delta of [-10000, -40, 12, 10000]) {
      const panes = paneWidths(width, moveDivider(initial, i, delta));
      close(sum(panes), width);
      for (const j of [0, 1, 2]) {
        assert(panes[j] >= MIN_PANES[j] - 1e-8);
        if (j !== i && j !== i + 1) close(panes[j], initial[j]);
      }
      if (delta === 12) close(panes[i], initial[i] + 12);
      if (delta === -10000) close(panes[i], MIN_PANES[i]);
      if (delta === 10000) close(panes[i + 1], MIN_PANES[i + 1]);
    }
  }
});
test('invalid and old workspace settings fall back instead of corrupting the grid', () => {
  for (const bad of [
    null,
    {},
    { traceHeight: 240 },
    [1, 2, 3, 4],
    [0, 1, 2],
    [NaN, 1, 1],
    [Infinity, 1, 1],
  ])
    assert.deepEqual(paneWeights(bad), DEFAULT_PANES);
  assert.deepEqual(paneWeights([2, 5, 3]), [20, 50, 30]);
});

test('three panes fit the workspace with collapsed History and comparisons', () => {
  for (const available of [200, 900, 1440, 1879]) {
    for (const historyCollapsed of [false, true]) {
      for (const comparing of [false, true]) {
        const options = { historyCollapsed, comparing };
        const layout = workspaceLayout(available, DEFAULT_PANES, options);
        close(sum(layout.panes) + layout.gaps, Math.max(available, workspaceMinimumWidth(options)));
        assert.equal(layout.panes.length, 3);
        assert.equal(layout.gaps, 12);
        layout.panes.forEach((width, index) => assert(width >= layout.minimums[index] - 1e-8));
        if (historyCollapsed) assert.equal(layout.panes[0], 32);
        if (comparing) assert(layout.panes[1] >= 646);
      }
    }
  }
  assert.equal(workspaceMinimumWidth(), sum(MIN_PANES) + 12);
});

test('stacked details fill the column and keep both inspectors usable at either resize limit', () => {
  for (const height of [200, 340, 600, 1200]) {
    for (const ratio of [-2, 0, 0.42, 1, 2]) {
      const [node, event] = detailHeights(height, ratio);
      assert(node >= 150);
      assert(event >= 190);
      close(node + event, Math.max(340, height));
    }
  }
  assert.deepEqual(detailHeights(1000), [420, 580]);
});
