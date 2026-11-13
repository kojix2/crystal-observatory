const enters = new Set(['visit_enter', 'transform_enter']);
const leaves = new Set(['visit_leave', 'transform_leave']);
const boundaries = new Set(['phase_enter', 'phase_leave', 'error', 'complete', 'link']);
const recordedFrame = (event) => event?.node_id > 0 && Boolean(event.visitor);

// Dispatch frames describe compiler calls, not necessarily AST parent/child
// edges. An event's actor (e.g. ASTNode#bind) can differ from its active Visitor.
export function visitation(model) {
  const event = model.event;
  if (!event || boundaries.has(event.kind)) return { mode: 'idle', parents: new Map() };
  const stack = (model.stack || []).filter(
    (frame) =>
      recordedFrame(frame) && (!event.phase || !frame.phase || frame.phase === event.phase),
  );
  const entering = enters.has(event.kind);
  const leaving = leaves.has(event.kind);
  const focus = entering || leaving ? event : stack.at(-1);
  if (!recordedFrame(focus)) return { mode: 'idle', parents: new Map() };
  const parents = new Map(
    stack
      .filter((frame) => frame.node_id !== focus.node_id)
      .map((frame) => [frame.node_id, frame.visitor]),
  );
  return {
    focus,
    index: model.index,
    mode: leaving ? 'leave' : entering ? 'enter' : 'inside',
    parents,
    stack: leaving ? [...stack, event] : stack.length ? stack : [event],
  };
}

// Stay in the selected recorded stage, including stages with no user-node
// visits. Never use the pipeline's nominal driver as evidence of a dispatch.
export function nextVisit(model) {
  const events = model.trace.events;
  const current = model.event;
  if (current && ['phase_leave', 'error', 'complete', 'link'].includes(current.kind)) return -1;
  for (let i = model.index + 1; i < events.length; i++) {
    const event = events[i];
    if (boundaries.has(event.kind)) return -1;
    if (current?.phase && event.phase && current.phase !== event.phase) return -1;
    if (enters.has(event.kind) && recordedFrame(event)) return i;
  }
  return -1;
}

const actionKinds = new Map([
  ['type', 'type'],
  ['dispatch', 'resolve'],
  ['expand', 'expand'],
  ['rewrite', 'rewrite'],
]);
const activityActions = new Map([
  ['assign_type', 'type'],
  ['fix_missing_type', 'type'],
  ['resolve_target', 'resolve'],
  ['instantiate_def', 'specialize'],
  ['rewrite', 'rewrite'],
  ['replace_untyped', 'rewrite'],
  ['narrow_type', 'narrow'],
  ['simplify_condition', 'simplify'],
  ['remove_dead_code', 'remove'],
  ['emit_instructions', 'emit'],
]);

// Keep a recent observation readable within its recorded dispatch frame. Older
// events need parent/depth evidence; a nested Visitor's work is not its caller's.
export function visitorAction(model, visit = visitation(model)) {
  if (!visit.focus) return undefined;
  const focus = visit.focus;
  const start = Math.max(
    0,
    model.index - 12,
    visit.mode === 'leave' ? 0 : (focus.index ?? model.index),
  );
  for (let i = model.index; i >= start; i--) {
    const event = model.trace.events[i];
    if (boundaries.has(event.kind) || (focus.phase && event.phase && focus.phase !== event.phase))
      break;
    if (
      i !== model.index &&
      (event.parent_id !== focus.node_id ||
        !Number.isInteger(focus.depth) ||
        event.depth !== focus.depth + 1)
    )
      continue;
    const callback = event.kind === 'dispatch' || event.kind === 'expand';
    if (!callback && event.visitor !== focus.visitor) continue;
    const kind =
      event.kind === 'activity' ? activityActions.get(event.activity) : actionKinds.get(event.kind);
    if (!kind) continue;
    if (
      ['type', 'resolve', 'specialize', 'emit'].includes(kind) &&
      (typeof event.after !== 'string' || !event.after.trim())
    ) {
      if (i === model.index) return undefined;
      continue;
    }
    if (kind === 'type') {
      if (event.before === event.after) continue;
      const nodeKind = model.nodes.get(event.node_id)?.kind || '';
      if (
        event.after === 'Nil' &&
        (nodeKind.endsWith('Def') ||
          ['Macro', 'Include', 'Extend', 'Alias', 'TypeDeclaration'].includes(nodeKind))
      )
        continue;
    }
    return { kind, event };
  }
  return undefined;
}
