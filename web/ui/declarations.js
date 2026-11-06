import { t } from '../i18n/index.js';
import { $, esc } from './dom.js';

export function declarationSummary(event, model) {
  const type = model.semanticTypes.get(event.type_id)?.name || '';
  const related = model.semanticTypes.get(event.related_type_id)?.name || '';
  const definition = model.definitions.get(event.definition_id);
  const action = t(`decl.${event.declaration_action}`);
  if (definition)
    return `${action}: ${type}${definition.class_method ? '.' : '#'}${definition.signature}${event.replaced_definition_id ? ` (${t('decl.replaces')})` : ''}`;
  return `${action}: ${type}${related ? ` → ${related}` : ''}${event.implicit ? ` (${t('decl.implicit')})` : ''}`;
}

export function renderDeclarations(model, selectedType, { onType, onNode, onSeek }) {
  const root = $('declarations');
  const warning = model.trace.truncated ? ` ${t('notice.truncated')}` : '';
  const note = `${t('decl.coverage')}${warning}`;
  $('declarations-caption').textContent =
    `${t('decl.caption', { count: model.declarations.size })}${warning}`;
  if (model.trace.declarations_version !== 1) {
    root.innerHTML = `<p class="empty">${esc(t('decl.unobserved'))}</p>`;
    return;
  }
  const states = [...model.declarations.values()];
  if (!states.length) {
    root.innerHTML = `<p class="empty">${esc(t('decl.empty'))}</p>`;
    return;
  }
  const selected = model.declarations.get(selectedType);
  const typeButton = (id) =>
    `<button class="link-button" data-semantic-type="${id}">${esc(model.semanticTypes.get(id).name)}</button>`;
  const eventButton = (event) =>
    `<button class="quiet" data-declaration-event="${event.index}">#${event.index} ${esc(t('decl.operation'))}</button>`;
  const nodeButton = (id, label = t('decl.source')) =>
    `<button class="link-button" data-declaration-node="${id}">${esc(label)}</button>`;
  const source = (event) => {
    const node = model.nodes.get(event.node_id);
    return `${nodeButton(event.node_id, `${t('decl.source')} ${node.filename}:${node.line}`)} <button class="link-button" data-declaration-ast="${event.node_id}">AST</button> ${eventButton(event)}${event.origin_id ? ` · ${nodeButton(event.origin_id, t('decl.origin'))}` : ''}`;
  };
  const relation = (label, event) =>
    `<li class="${model.event === event ? 'declaration-changed' : ''}"><span>${esc(label)}</span> ${typeButton(event.related_type_id)} ${event.implicit ? `<span class="tiny">${esc(t('decl.implicit'))}</span>` : ''}<div>${source(event)}</div></li>`;
  let details = `<p class="empty">${esc(t('decl.select'))}</p>`;
  if (selected) {
    const state = selected;
    details = `<h3>${esc(state.info.name)}</h3><p class="tiny">${esc(state.info.kind)}</p>
      ${!state.created ? `<p>${esc(t('decl.boundary'))}</p>` : ''}
      ${state.scope ? `<p>${esc(t('decl.scope'))}: ${typeButton(state.scope)}</p>` : ''}
      <ul class="declaration-relations">
        ${state.parent ? relation(t('decl.inherit'), state.parent) : ''}
        ${state.includes.map((event) => relation(t('decl.include'), event)).join('')}
        ${state.extends.map((event) => relation(t('decl.extend'), event)).join('')}
      </ul>
      <h4>${esc(t('decl.sites'))}</h4>
      <ul>${state.declarations.map((event) => `<li class="${model.event === event ? 'declaration-changed' : ''}">${esc(t(`decl.${event.declaration_action}`))}<div>${source(event)}</div></li>`).join('')}</ul>
      <h4>${esc(t('decl.methods'))}</h4>
      ${!state.methods.size ? `<p class="tiny">${esc(t('decl.noMethods'))}</p>` : ''}
      <ul>${[...state.methods.values()]
        .map((event) => {
          const definition = model.definitions.get(event.definition_id);
          return `<li class="${model.event === event ? 'declaration-changed' : ''}"><code>${definition.class_method ? '.' : '#'}${esc(definition.signature)}</code>${event.replaced_definition_id ? ` <span class="tiny">${esc(t('decl.replaces'))}</span>` : ''}<div>${source(event)}</div></li>`;
        })
        .join('')}</ul>`;
  }
  root.innerHTML = `<p class="declaration-note">${esc(note)}</p>
    <div class="declaration-layout"><nav aria-label="${esc(t('decl.title'))}">${states.map((state) => `<button class="declaration-type ${state.info.id === selectedType ? 'selected' : ''} ${model.event?.type_id === state.info.id && model.event?.kind === 'declaration' ? 'declaration-changed' : ''}" data-semantic-type="${state.info.id}" aria-pressed="${state.info.id === selectedType}"><strong>${esc(state.info.name)}</strong><span class="tiny">${esc(state.info.kind)} · ${state.methods.size} ${esc(t('decl.methods'))}${!state.declarations.length ? ` · ${esc(t('decl.context'))}` : ''}</span></button>`).join('')}</nav>
    <section class="declaration-details">${details}</section></div>`;
  root.querySelectorAll('[data-semantic-type]').forEach((button) => {
    button.onclick = () => {
      const id = Number(button.dataset.semanticType);
      onType(id);
      root.querySelector(`.declaration-type[data-semantic-type="${id}"]`)?.focus();
    };
  });
  root.querySelectorAll('[data-declaration-node]').forEach((button) => {
    button.onclick = () => {
      onNode(Number(button.dataset.declarationNode));
      $('source').focus();
    };
  });
  root.querySelectorAll('[data-declaration-ast]').forEach((button) => {
    button.onclick = () => {
      onNode(Number(button.dataset.declarationAst), 'ast');
      $('graph').focus();
    };
  });
  root.querySelectorAll('[data-declaration-event]').forEach((button) => {
    button.onclick = () => {
      const index = Number(button.dataset.declarationEvent);
      onSeek(index);
      root.querySelector(`[data-declaration-event="${index}"]`)?.focus();
    };
  });
}
