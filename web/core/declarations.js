import { UIError } from '../i18n/index.js';

export const declarationActions = [
  'type_create',
  'type_reopen',
  'inherit',
  'include',
  'extend',
  'method',
];

export function validateDeclarations(trace) {
  if (trace.declarations_version == null) {
    if (trace.events.some((event) => event.kind === 'declaration'))
      throw new UIError('error.traceReference');
    for (const field of ['semantic_types', 'definitions']) {
      if (trace[field] != null && (!Array.isArray(trace[field]) || trace[field].length > 8000))
        throw new UIError('error.traceSchema');
    }
  } else if (
    trace.declarations_version !== 1 ||
    !Array.isArray(trace.semantic_types) ||
    !Array.isArray(trace.definitions) ||
    trace.semantic_types.length > 8000 ||
    trace.definitions.length > 8000
  )
    throw new UIError('error.traceSchema');
  const types = new Set();
  for (const type of trace.semantic_types || []) {
    if (
      !type ||
      !Number.isInteger(type.id) ||
      type.id <= 0 ||
      types.has(type.id) ||
      typeof type.name !== 'string' ||
      typeof type.kind !== 'string'
    )
      throw new UIError('error.traceReference');
    types.add(type.id);
  }
  const nodes = new Set(trace.nodes.map((node) => node.id));
  const definitions = new Map();
  for (const definition of trace.definitions || []) {
    if (
      !definition ||
      !Number.isInteger(definition.id) ||
      definition.id <= 0 ||
      definitions.has(definition.id) ||
      !nodes.has(definition.node_id) ||
      !types.has(definition.owner_id) ||
      typeof definition.name !== 'string' ||
      typeof definition.signature !== 'string' ||
      typeof definition.class_method !== 'boolean'
    )
      throw new UIError('error.traceReference');
    definitions.set(definition.id, definition);
  }
  for (const event of trace.events) {
    if (event.kind !== 'declaration') continue;
    const action = event.declaration_action;
    const replacedId = event.replaced_definition_id ?? 0;
    if (
      !declarationActions.includes(action) ||
      !nodes.has(event.node_id) ||
      !types.has(event.type_id) ||
      (event.origin_id && !nodes.has(event.origin_id)) ||
      !Number.isInteger(replacedId) ||
      replacedId < 0 ||
      typeof event.implicit !== 'boolean'
    )
      throw new UIError('error.traceReference');
    if (action === 'method') {
      const definition = definitions.get(event.definition_id);
      const replaced = replacedId ? definitions.get(replacedId) : undefined;
      if (
        event.related_type_id !== 0 ||
        !definition ||
        definition.owner_id !== event.type_id ||
        definition.node_id !== event.node_id ||
        (replacedId &&
          (!replaced ||
            replaced.owner_id !== definition.owner_id ||
            replaced.class_method !== definition.class_method ||
            replaced.name !== definition.name))
      )
        throw new UIError('error.traceReference');
    } else if (event.definition_id !== 0 || replacedId || !types.has(event.related_type_id)) {
      throw new UIError('error.traceReference');
    }
  }
}

export function applyDeclaration(model, event) {
  const ensure = (id) => {
    if (!model.declarations.has(id))
      model.declarations.set(id, {
        info: model.semanticTypes.get(id),
        declarations: [],
        methods: new Map(),
        includes: [],
        extends: [],
      });
    return model.declarations.get(id);
  };
  const state = ensure(event.type_id);
  if (event.related_type_id) ensure(event.related_type_id);
  switch (event.declaration_action) {
    case 'type_create':
    case 'type_reopen':
      state.declarations.push(event);
      state.scope = event.related_type_id;
      if (event.declaration_action === 'type_create') state.created = true;
      break;
    case 'inherit':
      state.parent = event;
      break;
    case 'include':
    case 'extend':
      {
        const relations = event.declaration_action === 'include' ? state.includes : state.extends;
        const index = relations.findIndex(
          (relation) => relation.related_type_id === event.related_type_id,
        );
        if (index < 0) relations.unshift(event);
      }
      break;
    case 'method':
      if (event.replaced_definition_id) state.methods.delete(event.replaced_definition_id);
      state.methods.set(event.definition_id, event);
      break;
  }
}
