// These are observations of external state, not a reconstructed symbol table.
// Match explicit hooks; ordinary AST set_type events do not describe a store.
export const stateCategories = ['constants', 'variables', 'initializers', 'specializations'];

export function stateObservation(event) {
  if (event.kind !== 'activity') return null;
  const visitor = event.visitor.replace(/^Crystal::/, '');
  const { activity, reason } = event;
  let category, holder;
  if (visitor === 'TopLevelVisitor' && activity === 'declare_const') {
    category = 'constants';
    holder = 'types';
  } else if (visitor === 'MainVisitor' && reason === 'constant_initialized') {
    category = 'constants';
    holder = 'program';
  } else if (visitor === 'TypeDeclarationVisitor' && activity === 'declare_var') {
    category = 'variables';
    holder = 'types';
  } else if (
    (visitor === 'TypeGuessVisitor' &&
      ['guess_type', 'merge_guess', 'reject_guess'].includes(activity)) ||
    (visitor === 'MainVisitor' &&
      (activity === 'narrow_type' ||
        (activity === 'assign_type' && reason === 'local_assignment'))) ||
    (visitor === 'MacroInterpreter' && activity === 'bind_macro_var')
  ) {
    category = 'variables';
    holder = 'visitor';
  } else if (
    ([
      'TopLevelVisitor',
      'TypeGuessVisitor',
      'InstanceVarsInitializerVisitor',
      'ClassVarsInitializerVisitor',
    ].includes(visitor) &&
      ['register_initializer', 'discard_initializer'].includes(activity)) ||
    (['InstanceVarsInitializerVisitor', 'ClassVarsInitializerVisitor'].includes(visitor) &&
      ['initializer_typed', 'declared_type'].includes(reason))
  ) {
    category = 'initializers';
    holder = visitor === 'TypeGuessVisitor' ? 'visitor' : 'initializers';
  } else if (visitor === 'MainVisitor' && activity === 'instantiate_def') {
    category = 'specializations';
    holder = 'specializations';
  } else return null;
  return { event, category, holder };
}

export function indexStateObservations(trace) {
  return trace.events.map(stateObservation).filter(Boolean);
}

export function stateObservationsAt(observations, index) {
  const groups = new Map(stateCategories.map((category) => [category, []]));
  for (const observation of observations) {
    if (observation.event.index > index) break;
    groups.get(observation.category).push(observation);
  }
  return groups;
}
