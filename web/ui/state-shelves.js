import { t } from '../i18n/index.js';
import { stateShelves } from '../core/state-shelves.js';
import { compilerStateHTML } from './compiler-state.js';
import { esc } from './dom.js';

const VISIBLE_ENTRIES = 3;
const VISIBLE_TYPES = 6;

export function stateShelvesHTML(model, expanded = new Set()) {
  const shelves = stateShelves(model);
  const current = shelves.find((shelf) => shelf.active);
  const event = model.event;
  const actor = event?.visitor?.replace(/^Crystal::/, '') || '';
  const covered = model.stateObservations.length || model.trace.activity_coverage?.length;
  const generated = event?.activity === 'complete_new' && event.generated_tree;
  const unobservedNew =
    event?.phase === 'Semantic (new)' &&
    !model.generatedChanges.some((e) => e.activity === 'complete_new');
  const selected = current
    ? `<span>${esc(t('state.actor'))}: <code>${esc(actor)}</code></span><span>${esc(t('state.holder'))}: <strong>${esc(t(`state.shelf.${current.id}`))}</strong></span>`
    : generated
      ? `<span>${esc(t('activity.complete_new'))} · <code>${esc(generated.name)}</code></span><button class="link-button" data-declaration-ast="${generated.roots[0]}">${esc(t('ast.generated'))} #${generated.roots[0]}</button>`
      : `<span>${esc(t(unobservedNew ? 'state.newUnobserved' : 'state.noStoreChange'))}</span>`;
  return `<div class="state-current-change" role="status">${selected}</div>
    <div class="state-shelves">${shelves
      .map((shelf) => {
        const { id, entries, types, active } = shelf;
        const count = entries.length + types.length;
        const category = entries.at(-1)?.category || 'types';
        const visibleTypes = types.slice(-VISIBLE_TYPES);
        const activeType = active && types.find((state) => state.info.id === event?.type_id);
        if (activeType && !visibleTypes.includes(activeType)) {
          visibleTypes[0] = activeType;
          visibleTypes.sort((left, right) => left.info.id - right.info.id);
        }
        const typeRows = visibleTypes
          .map((state) => {
            const changed = event?.kind === 'declaration' && event.type_id === state.info.id;
            const methods = [...state.methods.values()];
            const scope = model.semanticTypes.get(state.scope);
            const name = state.info.kind === 'program' ? 'Program' : state.info.name;
            const classMethods = methods.filter(
              (method) => model.definitions.get(method.definition_id).class_method,
            ).length;
            return `<div class="state-type-slot ${changed ? 'declaration-changed' : ''}" data-state-type="${state.info.id}">
            <button class="link-button" data-semantic-type="${state.info.id}"><strong>${esc(name)}</strong></button><span class="state-type-id">Type #${state.info.id}${changed ? ` · ${esc(t('state.changed'))}` : ''}</span>
            ${scope ? `<span class="state-type-id">${esc(t('decl.scope'))}: ${esc(scope.kind === 'program' ? 'Program' : scope.name)} · Type #${scope.id}</span>` : ''}
            <div class="state-type-members"><span>${esc(t('state.instanceMethods', { count: methods.length - classMethods }))}</span><span>${esc(t('state.classMethods', { count: classMethods }))}</span></div>
            <div class="state-method-list">${methods
              .slice(-4)
              .map((method) => {
                const definition = model.definitions.get(method.definition_id);
                return `<button class="link-button state-method-slot ${method === event ? 'declaration-changed' : ''}" data-declaration-event="${method.index}"><code>${definition.class_method ? '.' : '#'}${esc(definition.signature)}</code></button>`;
              })
              .join('')}</div>
          </div>`;
          })
          .join('');
        return `<section class="state-shelf ${active ? 'state-shelf-active' : ''}" data-state-shelf="${id}" aria-label="${esc(t(`state.shelf.${id}`))}">
          <div class="state-shelf-heading"><h4>${esc(t(`state.shelf.${id}`))}</h4><span class="state-count">${count}${active ? ` · ${esc(t('state.changed'))}` : ''}</span></div>
          <p class="state-shelf-description">${esc(t(`state.store.${id}`))}</p>
          ${typeRows ? `<div class="state-type-slots">${typeRows}</div>` : ''}
          ${entries.length ? `<p class="state-shelf-recent">${esc(t('state.recentChanges', { shown: Math.min(entries.length, VISIBLE_ENTRIES), count: entries.length }))}</p>${compilerStateHTML(model, 'holders', expanded, { entries: entries.slice(-VISIBLE_ENTRIES), compact: true })}` : !types.length ? `<p class="state-shelf-empty">${esc(t(covered || (id === 'types' && model.trace.declarations_version === 1) ? 'state.empty' : 'state.unobserved'))}</p>` : ''}
          ${entries.length > VISIBLE_ENTRIES || types.length ? `<button class="state-shelf-more link-button" data-state-section="${category}">${esc(t('state.inspectAll'))}</button>` : ''}
        </section>`;
      })
      .join('')}</div>`;
}
