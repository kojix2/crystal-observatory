import { t } from '../i18n/index.js';
import { $ } from './dom.js';
import { renderCrystal } from '../core/crystal-highlight.js';
import {
  eventLabel,
  sourceFiles,
  shortVisitor,
  explanation,
  visitorKey,
  visitorRole,
} from './event-labels.js';

// Node selection can move independently of playback. The lower inspector always
// describes model.event, even when another node is clicked in the graph or stack.
export function renderInspector(model, selected, onSelect) {
  const node = model.nodes.get(selected),
    event = model.event;
  $('node-id').textContent = node ? `#${node.id}` : '—';
  $('node-title').textContent = node?.kind || t('node.empty');
  $('node-location').textContent = node?.line
    ? `${node.filename || model.trace.filename}:${node.line}:${node.column}`
    : '';
  $('node-summary').textContent = node
    ? t('node.summary', { count: model.eventsFor(selected).length })
    : '';
  $('type-card').hidden = !node;
  $('node-type').textContent = model.types.get(selected) || t('unknown');
  renderCrystal($('node-code'), node?.text || '—');
  for (const id of ['node-prev', 'node-next', 'node-filter']) $(id).disabled = !node;

  $('event-id').textContent = event ? `#${event.index}` : '—';
  $('visitor-title').textContent = event
    ? shortVisitor(event.visitor) || t('event.noVisitor')
    : '—';
  $('visitor-title').dataset.visitor = visitorKey(event?.visitor);
  $('visitor-role').textContent = visitorRole(event);
  $('event-kind').textContent = eventLabel(event?.kind);
  $('explanation').textContent = explanation(event);
  const target = model.nodes.get(event?.node_id);
  $('event-node').hidden = !target;
  $('event-node').textContent = target
    ? t('event.target', { id: target.id, kind: target.kind })
    : '';
  $('event-node').onclick = () => {
    if (target) onSelect(target.id);
  };
  $('event-phase').textContent = event ? t('event.phase', { phase: event.phase }) : '';
  $('raw-event').hidden = !event?.detail;
  $('event-detail').textContent = event?.detail || '';
  $('change').hidden =
    !event || !['type', 'rewrite', 'expand', 'dispatch', 'ir'].includes(event.kind);
  for (const [id, value] of [
    ['before', event?.before || t('unset')],
    ['after', event?.after || '—'],
  ]) {
    if (['rewrite', 'expand'].includes(event?.kind)) renderCrystal($(id), value);
    else $(id).textContent = value;
  }
  const stack = model.stack.slice(-15);
  $('stack').replaceChildren(
    ...stack.map((frame, i) => {
      const button = document.createElement('button');
      button.className = 'stack-frame';
      button.dataset.visitor = visitorKey(frame.visitor);
      button.style.marginLeft = `${i * 4}px`;
      button.textContent = `${shortVisitor(frame.visitor)} → #${frame.node_id}`;
      button.onclick = () => onSelect(frame.node_id);
      return button;
    }),
  );
  if (!stack.length) $('stack').textContent = '—';
  renderLinks(model.trace, event);
}
function renderLinks(trace, event) {
  const name = visitorKey(event?.visitor);
  const files = new Set([sourceFiles[name]]);
  if (event?.kind === 'expand' || event?.kind === 'dispatch') files.add('semantic/call.cr');
  if (['type', 'bind', 'unbind'].includes(event?.kind)) files.add('semantic/bindings.cr');
  files.delete(undefined);
  $('compiler-link').replaceChildren();
  for (const file of files) {
    const link = document.createElement('a');
    const browserVersion = trace.compiler_version.includes('WASI');
    link.href = `https://github.com/crystal-lang/crystal/blob/${browserVersion ? '1.22.0' : 'master'}/src/compiler/crystal/${file}`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = `${file} ↗`;
    $('compiler-link').append(link);
  }
  if (!files.size)
    $('compiler-link').textContent =
      name === 'SyntaxWalkVisitor' ? 'src/lab/syntax_engine.cr' : '—';
}
