import { flattenAST } from './trace-model.js';

export const radialPoint = (radius, angle) => ({
  x: 500 + radius * Math.cos(angle),
  y: 500 + radius * Math.sin(angle),
});

// A circular cladogram: leaves share the outer ring and each subtree occupies a
// contiguous angular interval. References remain leaf occurrences, never cycles.
export function layoutRadialAST(snapshot) {
  const rows = flattenAST(snapshot);
  const children = rows.map(() => []);
  const roots = [];
  rows.forEach((row, i) => {
    if (row.parent >= 0) children[row.parent].push(i);
    else roots.push(i);
  });
  const first = [],
    last = [],
    height = [];
  let leaves = 0;
  rows.forEach((row, i) => {
    if (!children[i].length) first[i] = last[i] = leaves++;
  });
  for (let i = rows.length - 1; i >= 0; i--) {
    height[i] = 0;
    for (const child of children[i]) height[i] = Math.max(height[i], height[child] + 1);
    if (children[i].length) {
      first[i] = first[children[i][0]];
      last[i] = last[children[i].at(-1)];
    }
  }
  const totalHeight = roots.reduce(
    (max, i) => Math.max(max, height[i] + (roots.length > 1 ? 1 : 0)),
    1,
  );
  return rows.map((row, i) => {
    const angle = (((first[i] + last[i]) / 2 + 0.5) / leaves) * 2 * Math.PI - Math.PI / 2;
    const radius = rows.length === 1 ? 0 : (1 - height[i] / totalHeight) * 460;
    return { ...row, angle, radius, ...radialPoint(radius, angle) };
  });
}

export function radialBranch(parent, child) {
  const bend = radialPoint(parent.radius, child.angle);
  return parent.radius > 0
    ? `M${parent.x} ${parent.y} A${parent.radius} ${parent.radius} 0 0 ${child.angle >= parent.angle ? 1 : 0} ${bend.x} ${bend.y} L${child.x} ${child.y}`
    : `M${parent.x} ${parent.y} L${child.x} ${child.y}`;
}
