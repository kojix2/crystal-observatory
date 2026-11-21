import { stateObservation } from './compiler-state.js';

// These fixed shelves describe recorded holders. Context strings never identify
// an object: old traces do not contain Visitor/store identities or cache writes.
export function stateShelves(model) {
  const shelves = ['program', 'types', 'visitor', 'initializers', 'specializations'].map((id) => ({
    id,
    entries: [],
    types: [],
  }));
  const byId = new Map(shelves.map((shelf) => [shelf.id, shelf]));
  for (const observation of model.stateObservations) {
    if (observation.event.index > model.index) break;
    byId.get(observation.holder).entries.push(observation);
  }
  for (const state of [...model.declarations.values()].sort(
    (left, right) => left.info.id - right.info.id,
  ))
    byId.get(state.info.kind === 'program' ? 'program' : 'types').types.push(state);
  const active =
    model.event?.kind === 'declaration'
      ? model.semanticTypes.get(model.event.type_id)?.kind === 'program'
        ? 'program'
        : 'types'
      : stateObservation(model.event || {})?.holder;
  for (const shelf of shelves) shelf.active = shelf.id === active;
  return shelves;
}
