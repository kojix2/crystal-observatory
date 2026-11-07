import { t } from '../i18n/index.js';
import { $, esc } from './dom.js';
import { compilerStateHTML, bindCompilerState } from './compiler-state.js';
import { stateCategories, stateObservationsAt } from '../core/compiler-state.js';
import { icon } from './icons.js';

export function declarationSummary(event, model) {
  const type = model.semanticTypes.get(event.type_id)?.name || '';
  const related = model.semanticTypes.get(event.related_type_id)?.name || '';
  const definition = model.definitions.get(event.definition_id);
  const action = t(`decl.${event.declaration_action}`);
  if (definition)
    return `${action}: ${type}${definition.class_method ? '.' : '#'}${definition.signature}${event.replaced_definition_id ? ` (${t('decl.replaces')})` : ''}`;
  return `${action}: ${type}${related ? ` → ${related}` : ''}${event.implicit ? ` (${t('decl.implicit')})` : ''}`;
}

export function renderDeclarations(model, selectedType, callbacks) {
  const { onType, onNode, onSeek, onSection, section = 'types', expanded = new Set() } = callbacks;
  const root = $('declarations');
  const sameTrace = root.stateTrace === model.trace;
  const aboutOpen = sameTrace && (root.querySelector('.state-about')?.open || false);
  for (const item of sameTrace ? root.querySelectorAll('[data-state-entry]') : []) {
    const index = Number(item.dataset.stateEntry);
    if (item.open) expanded.add(index);
    else expanded.delete(index);
  }
  root.stateTrace = model.trace;
  const groups = stateObservationsAt(model.stateObservations, model.index);
  const counts = new Map([
    ['types', model.declarations.size],
    ...[...groups].map(([key, entries]) => [key, entries.length]),
  ]);
  const observationCount = [...groups.values()].reduce((sum, entries) => sum + entries.length, 0);
  const categories = ['types', ...stateCategories];
  const current = categories.includes(section) ? section : 'types';
  const content =
    current === 'types'
      ? typeDeclarationsHTML(model, selectedType)
      : compilerStateHTML(model, current, expanded);
  root.innerHTML = `<nav class="state-sections" aria-label="${esc(t('decl.title'))}">${categories.map((key) => `<button class="state-section ${key === current ? 'selected' : ''}" data-state-section="${key}" aria-pressed="${key === current}"><span>${esc(t(`state.${key}`))}</span><span class="state-count">${counts.get(key)}</span></button>`).join('')}</nav>
    <div class="state-content"><div class="state-section-heading"><h3>${esc(t(`state.${current}`))}</h3><details class="state-about" ${aboutOpen ? 'open' : ''}><summary>${icon('info', { size: 12 })}<span>${esc(t('state.about'))}</span></summary><p>${esc(current === 'types' ? t('decl.coverage') : t('state.coverage'))}</p></details></div>${content}</div>`;
  $('declarations-caption').textContent =
    t('state.caption', { types: model.declarations.size, count: observationCount }) +
    (model.trace.truncated ? ` ${t('notice.truncated')}` : '');
  root.querySelectorAll('[data-state-section]').forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.stateSection;
      if (onSection) onSection(key);
      else renderDeclarations(model, selectedType, { ...callbacks, section: key, expanded });
      root.scrollTop = 0;
      root.querySelector(`[data-state-section="${key}"]`)?.focus({ preventScroll: true });
    };
  });
  bindCompilerState(root, { onNode, onSeek });
  bindDeclarations(root, { onType, onNode, onSeek });
}

function typeDeclarationsHTML(model, selectedType) {
  if (model.trace.declarations_version !== 1) {
    return `<p class="empty">${esc(t('decl.unobserved'))}</p>`;
  }
  const states = [...model.declarations.values()];
  if (!states.length) {
    return `<p class="empty">${esc(t('decl.empty'))}</p>`;
  }
  const selected =
    model.declarations.get(selectedType) || states.find((state) => state.created) || states[0];
  selectedType = selected.info.id;
  const typeButton = (id) =>
    `<button class="link-button" data-semantic-type="${id}">${esc(model.semanticTypes.get(id).name)}</button>`;
  const eventButton = (event) =>
    `<button class="quiet" data-declaration-event="${event.index}" aria-label="${esc(t('decl.operation'))} #${event.index}" title="${esc(t('decl.operation'))} #${event.index}">${icon('history', { size: 12 })}<span>#${event.index}</span></button>`;
  const nodeButton = (id, label = t('decl.source')) =>
    `<button class="link-button" data-declaration-node="${id}">${esc(label)}</button>`;
  const source = (event) => {
    const node = model.nodes.get(event.node_id);
    return `<div class="declaration-actions">${eventButton(event)}${nodeButton(event.node_id)}<button class="link-button" data-declaration-ast="${event.node_id}">AST</button>${event.origin_id ? nodeButton(event.origin_id, t('decl.origin')) : ''}</div><p class="state-source">${esc(node.filename)}:${node.line}</p>`;
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
  return `<div class="declaration-layout"><nav aria-label="${esc(t('state.types'))}">${states.map((state) => `<button class="declaration-type ${state.info.id === selectedType ? 'selected' : ''} ${model.event?.type_id === state.info.id && model.event?.kind === 'declaration' ? 'declaration-changed' : ''}" data-semantic-type="${state.info.id}" aria-pressed="${state.info.id === selectedType}"><strong>${esc(state.info.name)}</strong><span class="tiny">${esc(state.info.kind)} · ${state.methods.size} ${esc(t('decl.methods'))}${!state.declarations.length ? ` · ${esc(t('decl.context'))}` : ''}</span></button>`).join('')}</nav>
    <section class="declaration-details">${details}</section></div>`;
}

function bindDeclarations(root, { onType, onNode, onSeek }) {
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
