import { UIError } from '../i18n/index.js';

export const activityVisitors = [
  'TopLevelVisitor',
  'TypeDeclarationVisitor',
  'TypeGuessVisitor',
  'HasSelfVisitor',
  'RestrictionsAugmenter',
  'InstanceVarsInitializerVisitor',
  'ClassVarsInitializerVisitor',
  'MainVisitor',
  'FixMissingTypes',
  'CleanupTransformer',
  'Normalizer',
  'MacroInterpreter',
  'ToSVisitor',
  'CodeGenVisitor',
  'CodeGenVisitor::CodegenWellKnownFunctions',
];

export function validateActivities(trace, ids) {
  const coverage = trace.activity_coverage;
  if (
    coverage != null &&
    (!Array.isArray(coverage) ||
      coverage.length > 1000 ||
      coverage.some(
        (entry) =>
          !entry ||
          typeof entry.visitor !== 'string' ||
          !entry.visitor ||
          !Array.isArray(entry.node_kinds) ||
          !Array.isArray(entry.activities) ||
          !entry.node_kinds.length ||
          !entry.activities.length ||
          [...entry.node_kinds, ...entry.activities].some(
            (value) => typeof value !== 'string' || !value,
          ),
      ))
  )
    throw new UIError('error.traceActivity');
  for (const event of trace.events) {
    if (event.kind !== 'activity') continue;
    if (
      !ids.has(event.node_id) ||
      (event.parent_id && !ids.has(event.parent_id)) ||
      typeof event.visitor !== 'string' ||
      !event.visitor ||
      typeof event.activity !== 'string' ||
      !event.activity ||
      ['before', 'after', 'reason', 'detail', 'parent_visitor', 'llvm_function', 'llvm_block'].some(
        (field) => event[field] != null && typeof event[field] !== 'string',
      )
    )
      throw new UIError('error.traceActivity');
  }
}

export function coverageFor(trace, visitor, kind) {
  return (trace.activity_coverage || []).filter(
    (entry) =>
      entry.visitor === visitor &&
      (entry.node_kinds.includes(kind) || entry.node_kinds.includes('*')),
  );
}

export function groupActivitySummary(events, group, matchingIndices) {
  const activities = events
    .slice(group.start, group.end + 1)
    .filter(
      (event) =>
        event.kind === 'activity' && (!matchingIndices || matchingIndices.has(event.index)),
    );
  const direct = activities.filter(
    (event) => event.node_id === group.event.node_id && event.visitor === group.event.visitor,
  );
  const candidates = [
    ...direct.reverse(),
    ...activities.filter((event) => !direct.includes(event)),
  ];
  const seen = new Set();
  return candidates
    .filter((event) => {
      const key = event.activity;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2);
}
