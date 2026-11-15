import { flattenAST } from './trace-model.js';

const inset = 12;
const gutter = 34;
const cardGap = 56;
const rowGap = 36;
const headingHeight = 24;

function position(row, filename) {
  const { line, column, filename: nodeFile } = row.node;
  if (
    (row.parent < 0 && row.node.kind === 'Expressions') ||
    !Number.isInteger(line) ||
    line < 1 ||
    !nodeFile
  )
    return { key: 'unknown', line: 0, column: 1, filename: '' };
  return {
    key: `${nodeFile}:${line}`,
    line,
    column: Math.max(1, column || 1),
    filename: nodeFile,
    source: nodeFile === filename,
  };
}

// Source lines set the vertical rhythm; AST preorder sets the order within a
// line. Generated and foreign-file nodes still get a visible, bounded group.
export function layoutInlineAST(
  snapshot,
  collapsed = new Set(),
  measure,
  availableWidth = 600,
  { filename = '', source = '' } = {},
) {
  const limit = Math.max(96, Math.min(1100, availableWidth - 72));
  const maxIndent = Math.min(96, Math.floor(limit / 5));
  const cardLimit = Math.max(96, limit - gutter - maxIndent);
  const rows = flattenAST(snapshot, collapsed).map((row) => {
    const size = measure(row, cardLimit);
    return {
      ...row,
      ...position(row, filename),
      width: size.width,
      height: size.height,
      x: 0,
      y: 0,
      lineIndex: 0,
    };
  });
  const groups = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (groups.at(-1)?.key !== row.key)
      groups.push({
        key: row.key,
        line: row.line,
        filename: row.filename,
        source: row.source,
        indices: [],
      });
    groups.at(-1).indices.push(i);
  }
  const sourceLines = source.split(/\r?\n/);
  const lines = [];
  const headings = [];
  let y = inset;
  let previous;
  for (const group of groups) {
    if (previous?.filename === group.filename && group.source && previous.line > 0)
      y += Math.min(2, Math.max(0, group.line - previous.line - 1)) * 10;
    const first = rows[group.indices[0]];
    const indent = Math.min(maxIndent, (first.column - 1) * 8);
    const startX = inset + gutter + indent;
    const code = group.source ? sourceLines[group.line - 1] || '' : '';
    headings.push({
      y: y + 12,
      x: group.filename && !group.source ? inset + gutter : inset,
      label: group.source
        ? String(group.line)
        : group.filename
          ? `${group.filename}:${group.line}`
          : 'AST',
      code,
    });
    y += headingHeight;
    let current = [],
      used = 0;
    const finish = () => {
      if (!current.length) return;
      const height = Math.max(...current.map((i) => rows[i].height));
      for (const i of current) {
        rows[i].y = y + (height - rows[i].height) / 2;
        rows[i].lineTop = y;
        rows[i].lineBottom = y + height;
        rows[i].lineIndex = lines.length;
        rows[i].firstInLine = i === current[0];
      }
      lines.push(current);
      y += height + rowGap;
      current = [];
      used = 0;
    };
    for (const index of group.indices) {
      const row = rows[index];
      if (current.length && startX + used + cardGap + row.width > inset + limit) finish();
      row.x = startX + used + (current.length ? cardGap : 0);
      used += row.width + (current.length ? cardGap : 0);
      current.push(index);
    }
    finish();
    previous = group;
  }
  const siblings = new Map();
  for (const row of rows) {
    if (row.parent < 0) continue;
    // Wrapping a source line must not change equivalent siblings' ports.
    const key = `${row.parent}:${row.edge}:${row.key}`;
    if (!siblings.has(key)) siblings.set(key, []);
    siblings.get(key).push(row);
  }
  for (const group of siblings.values()) for (const row of group) row.siblingCount = group.length;
  const contentRight = Math.max(0, ...rows.map((row) => row.x + row.width));
  return {
    rows,
    headings,
    width: Math.max(availableWidth, contentRight + 56),
    height: rows.length ? y : inset * 2,
    labelRight: contentRight + 16,
  };
}

// Adjacent nodes use a short link. Siblings share a bus below the cards.
// Cross-line links use the left gutter, leaving/entering below a row when
// another card blocks its side. Siblings from one source line use bottom ports,
// including when that line wraps onto several card rows.
export function inlineBranch(rows, index) {
  const child = rows[index],
    parent = rows[child.parent];
  if (
    parent.lineIndex === child.lineIndex &&
    index === child.parent + 1 &&
    child.siblingCount === 1
  )
    return `M${parent.x + parent.width} ${parent.y + parent.height / 2} H${child.x}`;
  const fromX = parent.x + parent.width / 2,
    fromY = parent.y + parent.height,
    toX = child.x + child.width / 2;
  if (parent.lineIndex === child.lineIndex) {
    const lane = parent.lineBottom + 12 + (child.parent % 3) * 6;
    return `M${fromX} ${fromY} V${lane} H${toX} V${child.y + child.height}`;
  }
  const laneX = child.edge === 'child' ? 28 + Math.min(parent.depth, 2) * 6 : 40;
  const offset = 12 + (child.parent % 3) * 6;
  const start = parent.firstInLine
    ? `M${parent.x} ${parent.y + parent.height / 2} H${laneX}`
    : `M${fromX} ${fromY} V${parent.lineBottom + offset} H${laneX}`;
  const end =
    child.firstInLine && child.siblingCount === 1
      ? `V${child.y + child.height / 2} H${child.x}`
      : `V${child.lineBottom + offset} H${toX} V${child.y + child.height}`;
  return `${start} ${end}`;
}
