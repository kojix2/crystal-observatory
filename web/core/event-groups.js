const leaves = new Map([
  ['visit_enter', 'visit_leave'],
  ['transform_enter', 'transform_leave'],
]);

// Group recorded dispatch ranges, never just adjacent events with the same actor.
// Incomplete or inconsistent ranges stay flat, including older imported traces
// without depth information. IDs identify AST nodes, so pair calls with a stack.
export function groupEvents(events) {
  const groups = [],
    stack = [];
  let valid = false;
  for (const event of events) {
    if (stack.length && event.phase !== stack[0].phase) valid = false;
    if (leaves.has(event.kind)) {
      valid = stack.length ? valid && event.depth === stack.length : event.depth === 0;
      stack.push(event);
    } else if (event.kind === 'visit_leave' || event.kind === 'transform_leave') {
      const start = stack.pop();
      valid =
        valid &&
        start &&
        leaves.get(start.kind) === event.kind &&
        start.node_id === event.node_id &&
        start.visitor === event.visitor &&
        event.depth === stack.length;
      if (valid && !stack.length)
        groups.push({ start: start.index, end: event.index, event: start });
    } else if (
      event.kind === 'error' ||
      event.kind === 'complete' ||
      event.kind.startsWith('phase_')
    ) {
      valid = false;
    }
  }
  return groups;
}

// Filter the original events first, then project them into display rows using
// ranges built from the full trace. Expanded children remain a flat event list.
export function eventRows(filtered, groups, expanded = new Set()) {
  const rows = [];
  let groupIndex = 0;
  for (let i = 0; i < filtered.length; ) {
    const event = filtered[i];
    while (groups[groupIndex]?.end < event.index) groupIndex++;
    const group = groups[groupIndex];
    if (group && group.start <= event.index && event.index <= group.end) {
      const start = i;
      while (i < filtered.length && filtered[i].index <= group.end) i++;
      rows.push({ group, count: i - start });
      if (expanded.has(group.start))
        for (let j = start; j < i; j++) rows.push({ event: filtered[j] });
    } else {
      rows.push({ event });
      i++;
    }
  }
  return rows;
}
