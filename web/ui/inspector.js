import { t } from '../i18n/index.js';
import { $ } from './dom.js';
import { icon, summaryLabel } from './icons.js';
import { renderCrystal } from '../core/crystal-highlight.js';
import { renderLLVM } from '../core/llvm-highlight.js';
import { sourceChange, crystalDiffHTML } from '../core/code-diff.js';
import {
  eventLabel,
  sourceFiles,
  shortVisitor,
  explanation,
  visitorKey,
  visitorRole,
  activitySummary,
  activityLabel,
} from './event-labels.js';
import { activityVisitors, coverageFor } from '../core/activities.js';
import { compilerStage } from '../core/compiler-stages.js';
import { compilerSourceURL } from '../core/compiler-version.js';
import { renderStageContext } from './stage-context.js';

// Node selection can move independently of playback. The lower inspector follows
// model.event, including its compiler stage context.
export function renderInspector(
  model,
  selected,
  onSelect,
  onDeclaration = () => {},
  onSeek = () => {},
  onIR = () => {},
  onSource = () => {},
) {
  const node = model.nodes.get(selected),
    event = model.event,
    stage = compilerStage(event),
    nodeEvents = node ? model.eventsFor(selected) : [];
  $('node-id').textContent = node ? `#${node.id}` : '—';
  $('node-id').hidden = !node;
  $('node-title').textContent = node?.kind || (model.trace.mode === 'empty' ? '' : t('node.empty'));
  $('node-title').hidden = !node && model.trace.mode === 'empty';
  $('node-location').textContent = node?.line
    ? `${node.filename || model.trace.filename}:${node.line}:${node.column}`
    : '';
  $('node-summary').textContent = node
    ? t('count.events', { count: nodeEvents.length.toLocaleString() })
    : '';
  $('node-facts').hidden = !node;
  $('node-source').hidden = !node;
  $('node-type-badge').hidden = !node;
  $('node-type').textContent = model.types.get(selected) || t('unknown');
  $('node-type-at').textContent = model.index >= 0 ? t('node.typeAt', { index: model.index }) : '';
  const lines = (node?.text || '—').split('\n');
  const renderCode = () => {
    const expanded = $('node-expand-code').ariaExpanded === 'true';
    renderCrystal($('node-code'), (expanded ? lines : lines.slice(0, 3)).join('\n'));
    $('node-source').dataset.expanded = String(expanded);
    $('node-expand-code').textContent = t(
      expanded ? 'node.collapseCode' : lines.length > 3 ? 'node.showLines' : 'node.showCode',
      { count: lines.length },
    );
  };
  renderCode();
  $('node-expand-code').hidden = lines.length <= 3 && lines.every((line) => line.length <= 32);
  $('node-expand-code').onclick = () => {
    $('node-expand-code').ariaExpanded = String($('node-expand-code').ariaExpanded !== 'true');
    renderCode();
  };
  $('node-open-source').disabled =
    !node?.line || Boolean(node.filename && node.filename !== model.trace.filename);
  $('node-open-source').title = $('node-open-source').disabled ? t('node.sourceUnavailable') : '';
  $('node-open-source').onclick = () => onSource(node);
  $('node-location').title = $('node-location').textContent;
  const declarations = [...model.declarations.values()].filter(
    (state) =>
      state.declarations.some((event) => event.node_id === selected) ||
      nodeEvents.some(
        (event) =>
          event.index <= model.index &&
          event.kind === 'declaration' &&
          event.declaration_action === 'method' &&
          event.type_id === state.info.id,
      ),
  );
  $('node-declarations').replaceChildren(
    ...declarations.map((state) => {
      const button = document.createElement('button');
      button.className = 'link-button';
      button.textContent = `${t('decl.title')}: ${state.info.name}`;
      button.onclick = () => onDeclaration(state.info.id);
      return button;
    }),
  );
  renderNodeOverview(model, node, nodeEvents, declarations, onSeek);
  renderNodeIR(node, nodeEvents, model.index, onIR);
  renderActivities(model, node, onSeek);
  $('node-activity-count').textContent = String((model.activities.get(selected) || []).length);
  for (const id of ['node-prev', 'node-next', 'node-filter']) $(id).disabled = !node;

  $('event-id').textContent = event ? `#${event.index}` : '—';
  $('event-id').hidden = !event;
  renderStageContext(event, stage);
  $('visitor-title').textContent = event
    ? shortVisitor(event.visitor) || stage?.driver.split(' → ')[0] || t('event.noVisitor')
    : stage?.driver || '—';
  $('visitor-title').dataset.visitor = visitorKey(event?.visitor);
  $('visitor-role').textContent = visitorRole(event, model);
  const activity = event?.kind === 'activity';
  const diagnostic = event?.kind === 'error';
  $('event-kind').textContent = activity ? activityLabel(event.activity) : eventLabel(event?.kind);
  // The activity's name is in the heading and its value belongs in the result.
  // Keep the complete diagnostic below, with a short first paragraph above it.
  $('explanation').hidden = activity || !event;
  $('explanation').textContent = diagnostic
    ? (event.detail || '')
        .split(/\n\s*\n/)[0]
        .split('\n')
        .slice(0, 5)
        .join('\n')
    : activity
      ? ''
      : explanation(event, model);
  $('explanation').dataset.diagnostic = String(diagnostic);
  renderLinkDetails(event);
  $('event-declaration').hidden = event?.kind !== 'declaration';
  $('event-declaration').textContent = t('decl.title');
  $('event-declaration').onclick = () => onDeclaration(event.type_id);
  const target = model.nodes.get(event?.node_id);
  $('event-node').hidden = !target;
  $('event-node').textContent = target
    ? t('event.target', { id: target.id, kind: target.kind })
    : '';
  $('event-node').onclick = () => {
    if (target) onSelect(target.id);
  };
  const phase = stage ? t(`pipeline.stage.${stage.id}`) : event?.phase;
  $('event-phase').hidden = !phase;
  $('event-phase').textContent = phase ? t('event.phase', { phase }) : '';
  $('event-phase').title = event?.phase || '';
  $('raw-event').hidden =
    !event?.detail || (diagnostic && event.detail === $('explanation').textContent);
  $('event-detail-label').dataset.i18n = diagnostic ? 'event.diagnostic' : 'event.raw';
  $('event-detail-label').textContent = t($('event-detail-label').dataset.i18n);
  $('event-detail').textContent = event?.detail || '';
  $('activity-details').hidden = !activity;
  $('activity-observed').hidden = !activity;
  $('activity-observed').textContent = t('activity.observed');
  $('activity-reason-details').hidden = !activity || !event.reason;
  $('activity-reason').textContent = activity ? event.reason || '' : '';
  $('activity-context').textContent =
    activity && visitorKey(event.visitor) === 'HasSelfVisitor'
      ? event.parent_visitor
        ? t('activity.context', { visitor: shortVisitor(event.parent_visitor) })
        : t('activity.contextUnknown')
      : activity && visitorKey(event.visitor) === 'ToSVisitor'
        ? `${t('activity.formatting')}${event.parent_visitor ? ` · ${shortVisitor(event.parent_visitor)}` : ''}`
        : '';
  $('activity-context').hidden = !$('activity-context').textContent;
  $('activity-ir-note').hidden = !activity || event.activity !== 'emit_instructions';
  $('activity-ir-note').textContent = t('activity.ir');
  $('activity-related').hidden = !activity || !event.related_id;
  $('activity-related').textContent = activity
    ? t('activity.related', { id: event.related_id })
    : '';
  $('activity-related').onclick = () => onSelect(event.related_id);
  $('activity-ir-link').hidden = !activity || !event.llvm_function;
  $('activity-ir-link').textContent = t('activity.openIR');
  $('activity-ir-link').onclick = () => onIR(event);
  const change = sourceChange(event);
  $('event-diff').hidden = !change;
  $('event-diff-unchanged').hidden = !change || change.before !== change.after;
  $('event-diff-unchanged').textContent = t('event.sourceUnchanged');
  $('code-diff').innerHTML = change ? crystalDiffHTML(change.before, change.after) : '';
  $('change').hidden =
    Boolean(change) ||
    !event ||
    !['activity', 'type', 'rewrite', 'expand', 'dispatch', 'ir'].includes(event.kind) ||
    (activity && !event.before && !event.after);
  $('event-before').hidden = activity && !event.before;
  const resultLabel = activity && !event.before ? 'event.observedResult' : 'after';
  $('event-result-label').dataset.i18n = resultLabel;
  $('event-result-label').textContent = t(resultLabel);
  const short = [event?.before || t('unset'), event?.after || '—'].every(
    (value) => value.length <= 55 && !value.includes('\n'),
  );
  $('change').dataset.layout = short && !$('event-before').hidden ? 'pair' : 'stack';
  for (const [id, value] of [
    ['before', event?.before || t('unset')],
    ['after', event?.after || '—'],
  ]) {
    if (change) continue;
    if (
      ['rewrite', 'expand'].includes(event?.kind) ||
      (activity &&
        ['rewrite', 'replace_untyped', 'simplify_condition', 'emit_macro_source'].includes(
          event.activity,
        ))
    )
      renderCrystal($(id), value);
    else if (event?.kind === 'ir' || (activity && event.activity === 'emit_instructions'))
      renderLLVM($(id), value);
    else $(id).textContent = value;
  }
  const stack = model.stack;
  $('event-stack-count').textContent = String(stack.length);
  $('stack').replaceChildren(
    ...stack.map((frame, i) => {
      const button = document.createElement('button');
      button.className = 'stack-frame';
      button.dataset.visitor = visitorKey(frame.visitor);
      button.style.marginLeft = `${Math.min(i, 15) * 4}px`;
      button.textContent = `${shortVisitor(frame.visitor)} → #${frame.node_id}`;
      button.onclick = () => onSelect(frame.node_id);
      return button;
    }),
  );
  if (!stack.length) $('stack').textContent = '—';
  renderLinks(model.trace, event);
}

function renderLinkDetails(event) {
  const root = $('link-details');
  root.hidden = event?.kind !== 'link';
  root.replaceChildren();
  if (root.hidden) return;
  const link = event.link;
  const bytes = (value) => t('link.bytes', { bytes: value.toLocaleString() });
  const field = (label, value, code = false) => {
    const heading = document.createElement('h4');
    heading.textContent = t(label);
    const content = document.createElement(code ? 'pre' : 'p');
    content.textContent = value;
    root.append(heading, content);
  };
  field('pipeline.input', `out.o.wasm · ${bytes(link.objectBytes)}`);
  field(
    'link.libraries',
    link.args.filter((arg) => arg.startsWith('-l') || arg.endsWith('.a')).join('\n') || '—',
    true,
  );
  field(
    'pipeline.output',
    link.outputBytes === null ? t('link.noOutput') : `out.wasm · ${bytes(link.outputBytes)}`,
  );
  field('link.elapsed', t('link.seconds', { seconds: (link.elapsedMs / 1000).toFixed(3) }));
  field('link.exitCode', String(link.exitCode));
  field(
    'link.diagnostics',
    [link.stdout, link.stderr].filter(Boolean).join('\n') || t('link.noDiagnostics'),
    true,
  );
  const command = document.createElement('details');
  const summary = document.createElement('summary');
  summaryLabel(summary, t('link.command'));
  const code = document.createElement('pre');
  // Quote arguments for display only; nothing here is evaluated as shell code.
  code.textContent = link.args
    .map((arg) => (/^[A-Za-z0-9_./=:+,-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`))
    .join(' ');
  command.append(summary, code);
  root.append(command);
}
function renderNodeOverview(model, node, events, declarations, onSeek) {
  $('node-at-event').textContent = node
    ? t(model.index >= 0 ? 'node.atEvent' : 'node.beforeRecording', { index: model.index })
    : '';
  $('node-incomplete').hidden = !node || !(model.trace.truncated || model.trace.errors?.length);
  $('node-incomplete').textContent = t('activity.incomplete');
  const root = $('node-overview');
  root.replaceChildren();
  if (!node) return;
  const observed = events.filter((event) => event.index <= model.index);
  const facts = ['expand', 'dispatch', 'rewrite', 'type']
    .map((kind) => observed.findLast((event) => event.kind === kind))
    .filter(Boolean);
  const latest = observed.findLast(
    (event) =>
      event.kind === 'activity' &&
      !['emit_instructions', 'assign_type', 'rewrite', 'resolve_target'].includes(event.activity) &&
      !(declarations.length && event.activity === 'declare_type'),
  );
  if (latest) facts.push(latest);
  for (const event of facts.slice(0, 3)) {
    const button = document.createElement('button');
    button.className = 'node-overview-link link-button';
    const label = document.createElement('span');
    label.className = 'node-fact-label';
    label.textContent =
      event.kind === 'activity' ? activityLabel(event.activity) : eventLabel(event.kind);
    const value = document.createElement('span');
    value.className = 'node-fact-value';
    value.textContent =
      event.kind === 'type'
        ? `${event.before || t('unknown')} → ${event.after || '—'}`
        : event.after || '—';
    const index = document.createElement('small');
    index.textContent = `#${event.index}`;
    button.append(label, value, index);
    button.onclick = () => onSeek(event.index);
    root.append(button);
  }
  if (!facts.length && !declarations.length) {
    const empty = document.createElement('p');
    empty.className = 'node-context';
    empty.textContent = t('node.noFacts');
    root.append(empty);
  }
}

function renderNodeIR(node, events, index, onIR) {
  // Like source, show the selected node's records from the whole compilation,
  // independently of the event currently being replayed in the lower inspector.
  const activities = events.filter(
    (event) => event.kind === 'activity' && event.activity === 'emit_instructions',
  );
  const entries = activities.length ? activities : events.filter((event) => event.kind === 'ir');
  $('node-ir-count').textContent = String(entries.length);
  $('node-ir-note').hidden = entries.length === 0;
  $('node-ir-note').textContent = t(activities.length ? 'activity.ir' : 'node.irNote');
  if (!entries.length) {
    $('node-ir').textContent = node ? t('node.irMissing') : '—';
    return;
  }
  $('node-ir').replaceChildren(
    ...entries.map((event) => {
      const entry = document.createElement('section');
      entry.className = 'node-ir-entry';
      const location = document.createElement('p');
      location.className = 'node-ir-location';
      location.textContent = [event.llvm_function, event.llvm_block].filter(Boolean).join(' · ');
      const code = document.createElement('pre');
      code.className = 'llvm-code';
      if (event.after) renderLLVM(code, event.after);
      else code.textContent = t('node.irEmpty');
      entry.append(location, code);
      const action = document.createElement('button');
      action.className = 'link-button node-ir-open';
      action.textContent = `#${event.index} · ${t('activity.openIR')}`;
      action.onclick = () => onIR(event);
      entry.append(action);
      if (event.index > index) {
        const future = document.createElement('small');
        future.className = 'node-future';
        future.textContent = t('node.future');
        entry.append(future);
      }
      return entry;
    }),
  );
}
export function renderActivities(
  model,
  node,
  onSeek,
  container = $('node-activities'),
  typeOnly = false,
) {
  container.replaceChildren();
  if (!node) return;
  if (model.trace.truncated || model.trace.errors?.length) {
    const note = document.createElement('p');
    note.textContent = t('activity.incomplete');
    container.append(note);
  }
  const events = (model.activities.get(node.id) || []).filter(
    (event) =>
      !typeOnly ||
      [
        'guess_type',
        'merge_guess',
        'declare_var',
        'assign_type',
        'fix_missing_type',
        'narrow_type',
        'autocast',
      ].includes(event.activity),
  );
  const phases = new Map();
  for (const event of events) {
    const phase = event.phase || '';
    if (!phases.has(phase)) phases.set(phase, []);
    phases.get(phase).push(event);
  }
  for (const [phase, entries] of phases) {
    const section = document.createElement('details');
    section.open = entries.length <= 6;
    const title = document.createElement('summary');
    summaryLabel(title, `${phase} (${entries.length})`);
    section.append(title);
    for (const event of entries) {
      const button = document.createElement('button');
      button.className = 'activity-link link-button';
      button.dataset.index = String(event.index);
      const helper = visitorKey(event.visitor) === 'HasSelfVisitor';
      button.dataset.visitor = visitorKey(event.visitor);
      button.dataset.future = String(event.index > model.index);
      button.dataset.current = String(event.index === model.index);
      const action = document.createElement('span');
      action.className = 'activity-action';
      action.textContent = `#${event.index} · ${activitySummary(event)}`;
      const context = document.createElement('small');
      context.className = 'activity-context';
      context.textContent = `${shortVisitor(helper && event.parent_visitor ? event.parent_visitor : event.visitor)}${helper ? ' / HasSelfVisitor' : ''}${event.node_id !== node.id ? ` · ${t('activity.related', { id: event.node_id })}` : ''}`;
      button.append(action, context);
      if (event.index > model.index) {
        const future = document.createElement('small');
        future.className = 'node-future';
        future.textContent = t('node.future');
        button.append(future);
      }
      button.title = `${t('activity.observed')} · ${event.reason || ''}`;
      button.onclick = () => onSeek(event.index);
      section.append(button);
    }
    container.append(section);
  }
  if (typeOnly) return;
  // Unrecorded visitors are context, not findings: keep them in one collapsed list.
  const coverage = document.createElement('details');
  coverage.className = 'activity-coverage-list';
  const title = document.createElement('summary');
  coverage.append(title);
  let missing = 0;
  for (const name of activityVisitors) {
    const visitor = `Crystal::${name}`;
    if (events.some((event) => event.visitor === visitor)) continue;
    const covered = coverageFor(model.trace, visitor, node.kind);
    const status = document.createElement('p');
    status.className = 'activity-coverage tiny';
    status.textContent = `${name} · ${t(covered.length ? 'activity.none' : 'activity.unmeasured')}`;
    if (covered.length)
      status.title = t('activity.coverage', {
        activities: [...new Set(covered.flatMap((entry) => entry.activities))]
          .map(activityLabel)
          .join(', '),
      });
    coverage.append(status);
    missing++;
  }
  if (!missing) return;
  summaryLabel(title, t('activity.unrecorded', { count: missing }));
  container.append(coverage);
}
function renderLinks(trace, event) {
  const name = visitorKey(event?.visitor);
  const files = new Set([compilerStage(event)?.file, sourceFiles[name]]);
  if (event?.kind === 'expand' || event?.kind === 'dispatch') files.add('semantic/call.cr');
  if (['type', 'bind', 'unbind'].includes(event?.kind)) files.add('semantic/bindings.cr');
  files.delete(undefined);
  files.delete(null);
  $('compiler-link').replaceChildren();
  for (const file of files) {
    const url = compilerSourceURL(trace, file),
      link = document.createElement(url ? 'a' : 'code');
    if (url) {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noreferrer';
    }
    link.textContent = file;
    if (url) link.insertAdjacentHTML('beforeend', icon('external', { size: 10 }));
    $('compiler-link').append(link);
  }
  if (!files.size)
    $('compiler-link').textContent =
      name === 'SyntaxWalkVisitor' ? 'src/lab/syntax_engine.cr' : '—';
}
