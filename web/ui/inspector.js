import { t } from '../i18n/index.js';
import { $ } from './dom.js';
import { renderCrystal } from '../core/crystal-highlight.js';
import { renderLLVM } from '../core/llvm-highlight.js';
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
import { compilerStage, compilerStages } from '../core/compiler-stages.js';
import { renderStageContext } from './compiler-map.js';

// Node selection can move independently of playback. The lower inspector follows
// model.event unless an unrecorded stage description is explicitly selected.
export function renderInspector(
  model,
  selected,
  onSelect,
  onDeclaration = () => {},
  onSeek = () => {},
  onIR = () => {},
  selectedStage = null,
) {
  const node = model.nodes.get(selected),
    event = selectedStage ? undefined : model.event,
    stage = selectedStage
      ? compilerStages.find((item) => item.id === selectedStage)
      : compilerStage(event),
    nodeEvents = node ? model.eventsFor(selected) : [];
  $('node-id').textContent = node ? `#${node.id}` : '—';
  $('node-title').textContent =
    node?.kind || t(model.trace.mode === 'empty' ? 'node.none' : 'node.empty');
  $('node-location').textContent = node?.line
    ? `${node.filename || model.trace.filename}:${node.line}:${node.column}`
    : '';
  $('node-summary').textContent = node ? t('node.summary', { count: nodeEvents.length }) : '';
  $('type-card').hidden = !node;
  $('node-type').textContent = model.types.get(selected) || t('unknown');
  renderCrystal($('node-code'), node?.text || '—');
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
  renderNodeIR(node, nodeEvents);
  renderActivities(model, node, onSeek);
  for (const id of ['node-prev', 'node-next', 'node-filter']) $(id).disabled = !node;

  $('event-id').textContent = event ? `#${event.index}` : '—';
  renderStageContext(event, stage);
  $('visitor-title').textContent = event
    ? shortVisitor(event.visitor) || stage?.driver.split(' → ')[0] || t('event.noVisitor')
    : stage?.driver || '—';
  $('visitor-title').dataset.visitor = visitorKey(event?.visitor);
  $('visitor-role').textContent = selectedStage
    ? t(`pipeline.action.${stage.id}`)
    : visitorRole(event, model);
  $('event-kind').textContent = selectedStage
    ? t('pipeline.unrecordedShort')
    : eventLabel(event?.kind);
  $('explanation').textContent = selectedStage ? t('link.unrecorded') : explanation(event, model);
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
  $('event-phase').textContent = event ? t('event.phase', { phase: event.phase }) : '';
  $('raw-event').hidden = !event?.detail;
  $('event-detail').textContent = event?.detail || '';
  const activity = event?.kind === 'activity';
  $('activity-details').hidden = !activity;
  $('activity-observed').textContent = t('activity.observed');
  $('activity-reason').textContent =
    activity && event.reason ? `${t('activity.reason')}: ${event.reason}` : '';
  $('activity-context').textContent =
    activity && visitorKey(event.visitor) === 'HasSelfVisitor'
      ? event.parent_visitor
        ? t('activity.context', { visitor: shortVisitor(event.parent_visitor) })
        : t('activity.contextUnknown')
      : activity && visitorKey(event.visitor) === 'ToSVisitor'
        ? `${t('activity.formatting')}${event.parent_visitor ? ` · ${shortVisitor(event.parent_visitor)}` : ''}`
        : '';
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
  $('change').hidden =
    !event || !['activity', 'type', 'rewrite', 'expand', 'dispatch', 'ir'].includes(event.kind);
  for (const [id, value] of [
    ['before', event?.before || t('unset')],
    ['after', event?.after || '—'],
  ]) {
    if (['rewrite', 'expand'].includes(event?.kind)) renderCrystal($(id), value);
    else $(id).textContent = value;
  }
  const stack = selectedStage ? [] : model.stack.slice(-15);
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
  summary.textContent = t('link.command');
  const code = document.createElement('pre');
  // Quote arguments for display only; nothing here is evaluated as shell code.
  code.textContent = link.args
    .map((arg) => (/^[A-Za-z0-9_./=:+,-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`))
    .join(' ');
  command.append(summary, code);
  root.append(command);
}
function renderNodeIR(node, events) {
  // Like source, show the selected node's records from the whole compilation,
  // independently of the event currently being replayed in the lower inspector.
  const activities = events.filter(
    (event) => event.kind === 'activity' && event.activity === 'emit_instructions',
  );
  const entries = activities.length ? activities : events.filter((event) => event.kind === 'ir');
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
    title.textContent = `${phase} (${entries.length})`;
    section.append(title);
    for (const event of entries) {
      const button = document.createElement('button');
      button.className = 'activity-link link-button';
      button.dataset.index = String(event.index);
      const helper = visitorKey(event.visitor) === 'HasSelfVisitor';
      button.dataset.visitor = visitorKey(event.visitor);
      button.textContent = `${helper ? '↳ ' : ''}${shortVisitor(helper && event.parent_visitor ? event.parent_visitor : event.visitor)}${helper ? ` / HasSelfVisitor` : ''} · #${event.node_id} ${activitySummary(event)}`;
      button.title = `${t('activity.observed')} · ${event.reason || ''}`;
      button.onclick = () => onSeek(event.index);
      section.append(button);
    }
    container.append(section);
  }
  if (typeOnly) return;
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
    container.append(status);
  }
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
