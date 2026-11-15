import { flattenAST } from './trace-model.js';

const inset = 12;
const gutter = 34;
const cardGap = 56;
const rowGap = 36;
const headingHeight = 24;
const trackGap = 6;
const bottomPorts = { expanded: -12, hook: -24, target: 12 };
const sidePorts = { expanded: -8, hook: -4, target: 8 };

// Reuse a track only after the previous interval ends, so unrelated branches
// never share a stretch of wire. Longer enclosing intervals get the first track.
function assignTracks(ranges) {
  const ends = [];
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  for (const range of ranges) {
    let track = ends.findIndex((end) => end < range.start);
    if (track < 0) track = ends.length;
    ends[track] = range.end;
    range.track = track;
  }
  return ends.length;
}

function routeRows(rows) {
  const gutters = new Map(),
    buses = new Map(),
    localBranches = new Set();
  for (const [index, row] of rows.entries()) {
    if (row.parent < 0) continue;
    const parent = rows[row.parent];
    row.directLink =
      parent.lineIndex === row.lineIndex && index === row.parent + 1 && row.siblingCount === 1;
    if (parent.lineIndex === row.lineIndex && !row.directLink)
      localBranches.add(`${row.parent}:${row.edge}:${row.key}`);
  }
  const bus = (line, key, start, end) => {
    if (!buses.has(line)) buses.set(line, new Map());
    const groups = buses.get(line);
    const range = groups.get(key) || { start: Infinity, end: -Infinity };
    range.start = Math.min(range.start, start, end);
    range.end = Math.max(range.end, start, end);
    groups.set(key, range);
    return range;
  };
  for (const row of rows) {
    if (row.parent < 0 || row.directLink) continue;
    const parent = rows[row.parent],
      key = `${row.parent}:${row.edge}`,
      fromX = parent.x + parent.width / 2 + (bottomPorts[row.edge] || 0),
      toX = row.x + row.width / 2;
    if (parent.lineIndex === row.lineIndex) {
      row.sourceBus = row.targetBus = bus(row.lineIndex, key, fromX, toX);
      continue;
    }
    const range = gutters.get(key) || { start: parent.lineIndex, end: row.lineIndex };
    range.end = Math.max(range.end, row.lineIndex);
    gutters.set(key, range);
    row.gutter = range;
    if (!parent.firstInLine || localBranches.has(`${row.parent}:${row.edge}:${row.key}`))
      row.sourceBus = bus(parent.lineIndex, key, 28, fromX);
    if (!row.firstInLine || row.siblingCount > 1) row.targetBus = bus(row.lineIndex, key, 28, toX);
  }
  const tracks = assignTracks([...gutters.values()]);
  const gaps = new Map();
  for (const [line, groups] of buses) {
    const ranges = [...groups.values()];
    const count = assignTracks(ranges);
    // Enclosing branches run below inner branches, reducing crossings of
    // their vertical legs while keeping all equivalent siblings on one bus.
    for (const range of ranges) range.track = count - 1 - range.track;
    gaps.set(line, Math.max(0, count - 3) * trackGap);
  }
  return { gutter: gutter + Math.max(0, tracks - 3) * trackGap, gaps };
}

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
  const flat = flattenAST(snapshot, collapsed);
  let gutterWidth = gutter;
  for (;;) {
    const cardLimit = Math.max(96, limit - gutterWidth - maxIndent);
    const rows = flat.map((row) => {
      const size = measure(row, cardLimit);
      return {
        ...row,
        ...position(row, filename),
        width: size.width,
        height: size.height,
        metrics: size,
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
      const startX = inset + gutterWidth + indent;
      const code = group.source ? sourceLines[group.line - 1] || '' : '';
      headings.push({
        y: y + 12,
        x: group.filename && !group.source ? inset + gutterWidth : inset,
        lineIndex: lines.length,
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
    const routing = routeRows(rows);
    if (routing.gutter > gutterWidth) {
      gutterWidth = routing.gutter;
      continue;
    }
    const shifts = [];
    let shift = 0;
    for (const [index, line] of lines.entries()) {
      shifts[index] = shift;
      for (const i of line) {
        rows[i].y += shift;
        rows[i].lineTop += shift;
        rows[i].lineBottom += shift;
      }
      shift += routing.gaps.get(index) || 0;
    }
    for (const heading of headings) heading.y += shifts[heading.lineIndex] || 0;
    const contentRight = Math.max(0, ...rows.map((row) => row.x + row.width));
    return {
      rows,
      headings,
      width: Math.max(availableWidth, contentRight + 56),
      height: rows.length ? y + shift : inset * 2,
      labelRight: contentRight + 16,
      sourceX: inset + gutterWidth,
    };
  }
}

// Adjacent nodes use a short link. Siblings share a bus below the cards.
// Cross-line links use the left gutter, leaving/entering below a row when
// another card blocks its side. Siblings from one source line use bottom ports,
// including when that line wraps onto several card rows.
export function inlineBranch(rows, index) {
  const child = rows[index],
    parent = rows[child.parent];
  if (child.directLink)
    return `M${parent.x + parent.width} ${parent.y + parent.height / 2} H${child.x}`;
  const fromX = parent.x + parent.width / 2 + (bottomPorts[child.edge] || 0),
    fromY = parent.y + parent.height,
    toX = child.x + child.width / 2;
  if (parent.lineIndex === child.lineIndex) {
    const lane = parent.lineBottom + 12 + child.sourceBus.track * trackGap;
    return `M${fromX} ${fromY} V${lane} H${toX} V${child.y + child.height}`;
  }
  const laneX = 28 + child.gutter.track * trackGap;
  const start = child.sourceBus
    ? `M${fromX} ${fromY} V${parent.lineBottom + 12 + child.sourceBus.track * trackGap} H${laneX}`
    : `M${parent.x} ${parent.y + parent.height / 2 + (sidePorts[child.edge] || 0)} H${laneX}`;
  const end = child.targetBus
    ? `V${child.lineBottom + 12 + child.targetBus.track * trackGap} H${toX} V${child.y + child.height}`
    : `V${child.y + child.height / 2} H${child.x}`;
  return `${start} ${end}`;
}
