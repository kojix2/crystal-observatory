import { UIError } from '../i18n/index.js';
import { applyDeclaration, validateDeclarations } from './declarations.js';

export function validateTrace(t) {
  if (
    !t ||
    t.schema_version !== 1 ||
    !Array.isArray(t.events) ||
    !Array.isArray(t.nodes) ||
    !Array.isArray(t.snapshots) ||
    typeof t.source !== 'string'
  )
    throw new UIError('error.traceSchema');
  if (t.events.length > 100000 || t.nodes.length > 20000 || t.source.length > 262144)
    throw new UIError('error.traceSize');
  if (t.events.some((e, i) => e.index !== i || typeof e.kind !== 'string'))
    throw new UIError('error.traceOrder');
  const ids = new Set(t.nodes.map((n) => n.id));
  if (
    ids.size !== t.nodes.length ||
    t.nodes.some((n) => !Number.isInteger(n.id) || n.id <= 0 || typeof n.kind !== 'string')
  )
    throw new UIError('error.traceNode');
  for (const e of t.events)
    if ((e.node_id && !ids.has(e.node_id)) || (e.related_id && !ids.has(e.related_id)))
      throw new UIError('error.traceReference');
  for (const s of t.snapshots) {
    if (!Array.isArray(s.nodes) || !Array.isArray(s.roots) || s.nodes.length > 20000)
      throw new UIError('error.traceAST');
    const local = new Set(s.nodes.map((n) => n.id));
    if (
      s.roots.some((n) => !local.has(n)) ||
      s.nodes.some(
        (n) =>
          !Array.isArray(n.children) ||
          !Array.isArray(n.targets) ||
          (n.hook_expansions != null && !Array.isArray(n.hook_expansions)) ||
          [
            ...n.children,
            ...n.targets,
            ...(n.hook_expansions || []),
            ...(n.expanded ? [n.expanded] : []),
          ].some((id) => !local.has(id)),
      )
    )
      throw new UIError('error.traceEdge');
  }
  validateDeclarations(t);
  return t;
}

export class TraceModel {
  constructor(trace) {
    this.trace = validateTrace(trace);
    this.nodes = new Map(trace.nodes.map((n) => [n.id, n]));
    this.semanticTypes = new Map((trace.semantic_types || []).map((type) => [type.id, type]));
    this.definitions = new Map(
      (trace.definitions || []).map((definition) => [definition.id, definition]),
    );
    this.initialTypes = new Map(trace.nodes.map((n) => [n.id, n.inferred_type || '']));
    const seen = new Set();
    for (const e of trace.events)
      if (e.kind === 'type' && !seen.has(e.node_id)) {
        this.initialTypes.set(e.node_id, e.before);
        seen.add(e.node_id);
      }
    this.seek(-1);
  }
  seek(index) {
    index = Math.max(-1, Math.min(index, this.trace.events.length - 1));
    if (this.index === undefined || index < this.index) {
      this.index = -1;
      this.types = new Map(this.initialTypes);
      this.edges = new Map();
      this.stack = [];
      this.declarations = new Map();
    }
    for (let i = this.index + 1; i <= index; i++) {
      const e = this.trace.events[i];
      if (e.kind === 'declaration') applyDeclaration(this, e);
      if (e.kind === 'type') this.types.set(e.node_id, e.after);
      if (e.kind === 'bind')
        this.edges.set(`${e.related_id}:${e.node_id}`, [e.related_id, e.node_id]);
      if (e.kind === 'unbind') this.edges.delete(`${e.related_id}:${e.node_id}`);
      if (e.kind === 'visit_enter' || e.kind === 'transform_enter') this.stack.push(e);
      if (e.kind === 'visit_leave' || e.kind === 'transform_leave') this.stack.pop();
    }
    this.index = index;
    this.event = this.trace.events[index];
    return this;
  }
  snapshotAt(index = this.index) {
    let found = 0;
    this.trace.snapshots.forEach((s, i) => {
      if (s.at_event <= index + 1) found = i;
    });
    return found;
  }
  snapshotForNode(id, current = this.snapshotAt()) {
    if (this.trace.snapshots[current]?.nodes.some((node) => node.id === id)) return current;
    let before = -1,
      after = -1;
    this.trace.snapshots.forEach((snapshot, index) => {
      if (!snapshot.nodes.some((node) => node.id === id)) return;
      if (snapshot.at_event <= this.index + 1) {
        if (before < 0 || snapshot.at_event > this.trace.snapshots[before].at_event) before = index;
      } else if (after < 0 || snapshot.at_event < this.trace.snapshots[after].at_event)
        after = index;
    });
    return before >= 0 ? before : after;
  }
  next(kind, from = this.index) {
    return this.trace.events.findIndex((e) => e.index > from && e.kind === kind);
  }
  eventsFor(id) {
    return this.trace.events.filter((e) => e.node_id === id);
  }
}

export function flattenAST(snapshot, collapsed = new Set()) {
  const nodes = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const rows = [],
    seen = new Set();
  function walk(id, depth, parent, edge) {
    const node = nodes.get(id);
    if (!node) return;
    if (seen.has(id)) {
      rows.push({ node, depth, parent, edge, reference: true });
      return;
    }
    seen.add(id);
    const row = rows.length;
    rows.push({ node, depth, parent, edge, reference: false });
    if (collapsed.has(id)) return;
    for (const child of node.children) walk(child, depth + 1, row, 'child');
    if (node.expanded) walk(node.expanded, depth + 1, row, 'expanded');
    for (const hook of node.hook_expansions || []) walk(hook, depth + 1, row, 'hook');
    for (const target of node.targets) walk(target, depth + 1, row, 'target');
  }
  for (const id of snapshot.roots) walk(id, 0, -1, 'root');
  return rows;
}

export function revealASTNode(snapshot, id, collapsed) {
  const rows = flattenAST(snapshot);
  let index = rows.findIndex((row) => row.node.id === id);
  while (index >= 0) {
    collapsed.delete(rows[index].node.id);
    index = rows[index].parent;
  }
}

export function indexIR(ir) {
  const functions = [];
  const lines = ir.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('define ')) continue;
    const name = lines[i].match(/@(?:"([^"]+)"|([^ (]+))\(/);
    if (!name) continue;
    const start = i;
    while (i + 1 < lines.length && lines[i] !== '}') i++;
    functions.push({
      name: name[1] || name[2],
      text: lines.slice(start, i + 1).join('\n'),
    });
  }
  return functions;
}
