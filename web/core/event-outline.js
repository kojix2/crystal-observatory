// Turn a page of flat, ordered trace rows into nested lists. Ancestors that
// started on an earlier page are repeated so every event keeps its context.
export function eventOutline(rows, start = 0, end = rows.length) {
  const roots = [],
    ancestors = [],
    attached = new Set();
  for (let i = 0; i < Math.min(end, rows.length); i++) {
    const row = rows[i],
      index = row.group?.start ?? row.event.index;
    while (ancestors.length && index > ancestors.at(-1).row.group.end) ancestors.pop();
    if (i >= start) {
      for (let depth = 0; depth < ancestors.length; depth++) {
        const ancestor = ancestors[depth];
        if (!attached.has(ancestor)) {
          (depth ? ancestors[depth - 1].children : roots).push(ancestor);
          attached.add(ancestor);
        }
      }
      const item = { row, children: [] };
      (ancestors.length ? ancestors.at(-1).children : roots).push(item);
      attached.add(item);
      if (row.group) ancestors.push(item);
    } else if (row.group) ancestors.push({ row, children: [] });
  }
  return roots;
}
