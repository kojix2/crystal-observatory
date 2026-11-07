import { t } from '../i18n/index.js';
import { messages } from '../i18n/messages.js';
import { stateObservationsAt } from '../core/compiler-state.js';
import { $, esc } from './dom.js';
import { icon } from './icons.js';

const PAGE_SIZE = 60;
const activityLabel = (value) => (messages[`activity.${value}`] ? t(`activity.${value}`) : value);

export function compilerStateHTML(model, category = 'constants', expanded = new Set()) {
  const observations = model.stateObservations;
  const covered = model.trace.activity_coverage?.some((entry) =>
    entry.activities.some((activity) =>
      [
        'declare_const',
        'declare_var',
        'guess_type',
        'narrow_type',
        'register_initializer',
        'instantiate_def',
        'bind_macro_var',
      ].includes(activity),
    ),
  );
  if (!observations.length && !covered) return `<p class="empty">${esc(t('state.unobserved'))}</p>`;
  const entries = stateObservationsAt(observations, model.index).get(category) || [];
  const rows = entries
    .slice(-PAGE_SIZE)
    .map(({ event, holder }) => {
      const node = model.nodes.get(event.node_id);
      const source = node.filename && node.line ? `${node.filename}:${node.line}` : `#${node.id}`;
      const preview = event.detail || node.label || node.text || `#${node.id}`;
      const active = event === model.event;
      return `<details class="state-entry ${active ? 'declaration-changed' : ''}" data-state-entry="${event.index}" ${active || expanded.has(event.index) ? 'open' : ''}>
      <summary>${icon('disclosure', { size: 12 })}<span class="state-entry-heading">
        <span class="state-entry-title"><strong>${esc(activityLabel(event.activity))}${event.reason === 'begin_instantiation' || event.reason === 'end_instantiation' ? `<span class="state-step">${esc(t(event.reason === 'begin_instantiation' ? 'state.start' : 'state.end'))}</span>` : ''}</strong><span class="state-event-number">#${event.index}</span></span>
        <code class="state-preview">${esc(preview)}</code>
        ${event.after ? `<code class="state-result">${esc(event.after)}</code>` : ''}
      </span></summary>
      <div class="state-entry-body">
        <dl class="state-facts">
          <dt>${esc(t(holder === 'specializations' ? 'state.subject' : 'state.holder'))}</dt><dd>${esc(t(`state.holder.${holder}`))}</dd>
          <dt>Visitor</dt><dd>${esc(event.visitor.replace(/^Crystal::/, ''))}</dd>
          ${event.reason ? `<dt>${esc(t('activity.reason'))}</dt><dd><code>${esc(event.reason)}</code></dd>` : ''}
          ${event.detail ? `<dt>${esc(t('state.context'))}</dt><dd><code>${esc(event.detail)}</code></dd>` : ''}
        </dl>
        <div class="state-values">
          ${event.before ? `<div><span>${esc(t('before'))}</span><pre>${esc(event.before)}</pre></div>` : ''}
          ${event.after ? `<div><span>${esc(t('after'))}</span><pre>${esc(event.after)}</pre></div>` : ''}
        </div>
        <div class="state-actions">
          <button class="quiet" data-state-event="${event.index}">${icon('history', { size: 12 })}<span>#${event.index} ${esc(t('state.operation'))}</span></button>
          <button class="link-button" data-state-node="${event.node_id}" title="${esc(source)}">${esc(t('decl.source'))}</button>
          <button class="link-button" data-state-ast="${event.node_id}">AST #${event.node_id}</button>
          ${event.related_id ? `<button class="link-button" data-state-ast="${event.related_id}">${esc(t('state.related'))} #${event.related_id}</button>` : ''}
        </div>
        <p class="state-source">${esc(source)}</p>
      </div>
    </details>`;
    })
    .join('');
  return `<section class="compiler-state" aria-label="${esc(t(`state.${category}`))}">
    ${entries.length > PAGE_SIZE ? `<p class="state-page">${esc(t('state.page', { shown: PAGE_SIZE, count: entries.length }))} <button class="link-button" data-state-event="${entries[entries.length - PAGE_SIZE - 1].event.index}">${esc(t('state.earlier'))}</button></p>` : ''}
    ${rows || `<p class="empty">${esc(t('state.empty'))}</p>`}
  </section>`;
}

export function bindCompilerState(root, { onNode, onSeek }) {
  for (const [attribute, callback] of [
    ['stateEvent', (index) => onSeek(index)],
    ['stateNode', (id) => onNode(id)],
    ['stateAst', (id) => onNode(id, 'ast')],
  ]) {
    const selector = attribute.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    root.querySelectorAll(`[data-${selector}]`).forEach((button) => {
      button.onclick = () => {
        const value = button.dataset[attribute];
        callback(Number(value));
        if (attribute === 'stateEvent')
          root.querySelector(`[data-${selector}="${value}"]`)?.focus();
        else $(attribute === 'stateAst' ? 'graph' : 'source').focus();
      };
    });
  }
}
