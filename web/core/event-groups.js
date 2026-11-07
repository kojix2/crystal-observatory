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

// Only completed, consistently named stages can hide their events. Failed or
// truncated stages stay visible, including the error that interrupted them.
export function groupStages(events, visitors = groupEvents(events)) {
  const stages = [];
  let start;
  const name = (event) => event.phase || event.detail;
  for (const event of events) {
    if (event.kind === 'phase_enter') start = event;
    else if (event.kind === 'phase_leave') {
      if (start && name(start) && name(start) === name(event))
        stages.push({ start: start.index, end: event.index, event: start, kind: 'phase' });
      start = undefined;
    } else if (
      event.kind === 'error' ||
      event.kind === 'complete' ||
      (start && event.phase && event.phase !== name(start))
    )
      start = undefined;
  }
  const roots = [...stages];
  let stageIndex = 0;
  for (const visitor of visitors) {
    while (stages[stageIndex]?.end < visitor.start) stageIndex++;
    const stage = stages[stageIndex];
    if (stage && stage.start < visitor.start && visitor.end < stage.end) {
      stage.children ??= [];
      stage.children.push(visitor);
    } else roots.push(visitor);
  }
  return roots.sort((a, b) => a.start - b.start);
}

// Filter original events first, then project them into stage/Visitor rows using
// ranges built from the full trace. Opening every group restores the exact order.
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
      if (expanded.has(group.start)) {
        if (group.children)
          for (const row of eventRows(filtered.slice(start, i), group.children, expanded))
            rows.push(row);
        else for (let j = start; j < i; j++) rows.push({ event: filtered[j] });
      }
    } else {
      rows.push({ event });
      i++;
    }
  }
  return rows;
}
