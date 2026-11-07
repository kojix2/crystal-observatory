import { flattenAST } from './trace-model.js';

export const mindmapNodeHeight = 62;
const gap = 18;
const branchGap = 56;
const padding = 24;

// Size whole subtrees first, then place them without recursion. Each occurrence
// keeps flattenAST's parent, edge kind and reference flag, including cyclic ASTs.
export function layoutMindmapAST(snapshot, collapsed = new Set()) {
  const rows = flattenAST(snapshot, collapsed).map((row) => ({
    ...row,
    width: Math.max(
      160,
      Math.min(
        248,
        46 + Math.max(row.node.kind.length, Math.min(28, (row.node.label || '').length)) * 7.2,
      ),
    ),
    height: mindmapNodeHeight,
    side: 0,
    x: 0,
    y: 0,
  }));
  const children = rows.map(() => []),
    roots = [],
    spans = rows.map(() => mindmapNodeHeight);
  rows.forEach((row, i) => {
    if (row.parent < 0) roots.push(i);
    else children[row.parent].push(i);
  });
  const span = (indices) => indices.reduce((sum, i) => sum + spans[i] + gap, -gap);
  for (let i = rows.length - 1; i >= 0; i--)
    if (children[i].length) spans[i] = Math.max(mindmapNodeHeight, span(children[i]));

  let top = padding;
  for (const root of roots) {
    const sides = [[], []],
      weights = [0, 0];
    for (const child of children[root]) {
      const side = weights[0] <= weights[1] ? 0 : 1;
      sides[side].push(child);
      weights[side] += spans[child] + gap;
    }
    const height = Math.max(mindmapNodeHeight, ...weights.map((weight) => weight - gap));
    rows[root].x = -rows[root].width / 2;
    rows[root].y = top + (height - mindmapNodeHeight) / 2;
    const pending = [];
    const placeChildren = (indices, parent, side, start) => {
      let cursor = start;
      for (const index of indices) {
        const row = rows[index];
        row.side = side;
        row.x = side > 0 ? parent.x + parent.width + branchGap : parent.x - branchGap - row.width;
        row.y = cursor + (spans[index] - mindmapNodeHeight) / 2;
        pending.push(index);
        cursor += spans[index] + gap;
      }
    };
    sides.forEach((indices, side) =>
      placeChildren(
        indices,
        rows[root],
        side === 0 ? 1 : -1,
        top + (height - Math.max(0, span(indices))) / 2,
      ),
    );
    while (pending.length) {
      const index = pending.pop(),
        row = rows[index];
      placeChildren(children[index], row, row.side, row.y + (mindmapNodeHeight - spans[index]) / 2);
    }
    top += height + gap * 2;
  }

  let left = 0,
    right = 0,
    bottom = 0;
  for (const row of rows) {
    left = Math.min(left, row.x);
    right = Math.max(right, row.x + row.width);
    bottom = Math.max(bottom, row.y + row.height);
  }
  for (const row of rows) row.x += padding - left;
  return { rows, width: right - left + padding * 2, height: bottom + padding };
}

export function mindmapBranch(parent, child) {
  const x1 = child.side > 0 ? parent.x + parent.width : parent.x,
    x2 = child.side > 0 ? child.x : child.x + child.width,
    y1 = parent.y + parent.height / 2,
    y2 = child.y + child.height / 2,
    bend = (x1 + x2) / 2;
  return `M${x1} ${y1} C${bend} ${y1} ${bend} ${y2} ${x2} ${y2}`;
}
