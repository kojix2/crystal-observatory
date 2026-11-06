import { getLocale, t } from '../i18n/index.js';
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { compilerStage, compilerStages, pipelineGroups } from '../core/compiler-stages.js';

const renderedMaps = new WeakMap();
const disclosures = new WeakMap();

export function renderCompilerMap(model, records, onSeek, { selectedStage, onSelectStage } = {}) {
  const root = $('compiler-map');
  const current = selectedStage
    ? compilerStages.find((stage) => stage.id === selectedStage)
    : compilerStage(model?.event);
  // The syntax engine is separate and does not run this semantic pipeline.
  root.hidden = model?.trace.mode !== 'full';
  $('workflow-column').hidden = root.hidden;
  $('workflow-splitter').hidden = root.hidden;
  if (root.hidden) return;
  if (disclosures.get(root)?.records !== records)
    disclosures.set(root, { records, groups: new Map() });
  const expandedGroups = disclosures.get(root).groups;
  root.onclick = (event) => {
    const button = event.target.closest(
      'button[data-index], button[data-stage], button[data-toggle-group]',
    );
    if (!button || !root.contains(button)) return;
    if (button.dataset.toggleGroup) {
      expandedGroups.set(
        button.dataset.toggleGroup,
        button.getAttribute('aria-expanded') !== 'true',
      );
      renderedMaps.delete(root);
      renderCompilerMap(model, records, onSeek, { selectedStage, onSelectStage });
    } else if (button.dataset.stage) onSelectStage?.(button.dataset.stage);
    else onSeek(Number(button.dataset.index));
  };
  const previous = renderedMaps.get(root);
  if (
    previous?.records === records &&
    previous?.stage === current?.id &&
    previous?.locale === getLocale()
  )
    return;
  const focused = root.contains(document.activeElement)
    ? document.activeElement.dataset
    : undefined;
  renderedMaps.set(root, { records, stage: current?.id, locale: getLocale() });
  root.title = t('pipeline.navigation');
  root.innerHTML = `<ol class="compiler-pipeline">${pipelineGroups
    .map((group) => {
      const first = group.stages
        .map((stage) => records.get(stage.id)?.first)
        .find((index) => index !== undefined);
      const active = group.id === current?.group;
      // Stage descriptions remain useful when an older trace has no result.
      const overview = group.id === 'link' && first === undefined;
      const note = group.outsideTrace
        ? t('pipeline.outside')
        : overview
          ? t('link.inspect')
          : first === undefined
            ? t('pipeline.unrecorded')
            : t('pipeline.jump');
      const stages = group.stages;
      const expanded = expandedGroups.get(group.id) ?? active;
      const children =
        stages.length > 1
          ? `<ol class="semantic-map" id="pipeline-${group.id}" ${expanded ? '' : 'hidden'}>${stages
              .map((stage) => {
                const first = records.get(stage.id)?.first;
                return `<li><button type="button" ${first === undefined ? 'disabled' : `data-index="${first}"`} ${expanded && stage.id === current?.id ? 'aria-current="step"' : ''} title="${esc(stage.phase)}">${esc(t(`pipeline.stage.${stage.id}`))}</button></li>`;
              })
              .join('')}</ol>`
          : '';
      const name = t(`pipeline.${children ? 'section' : 'group'}.${group.id}`);
      const title = `${t(`pipeline.group.${group.id}`)} · ${t(`pipeline.artifact.${group.output}`)} · ${note}`;
      const toggle = children
        ? `<button type="button" class="pipeline-disclosure" data-toggle-group="${group.id}" aria-expanded="${expanded}" aria-controls="pipeline-${group.id}" aria-label="${esc(t('pipeline.details', { stage: name }))}">${icon('disclosure', { size: 12 })}</button>`
        : '';
      return `<li class="pipeline-group" data-pipeline-group="${group.id}"><div class="pipeline-row"><button type="button" ${overview ? 'data-stage="link"' : first === undefined ? 'disabled' : `data-index="${first}"`} ${active && (!children || !expanded) ? 'aria-current="step"' : ''} title="${esc(title)}">${icon(group.id, { className: 'pipeline-icon' })}<span>${esc(name)}</span></button>${toggle}</div>${children}</li>`;
    })
    .join('')}</ol>`;
  if (focused?.toggleGroup)
    root
      .querySelector(`button[data-toggle-group="${focused.toggleGroup}"]`)
      ?.focus({ preventScroll: true });
  else if (focused?.index !== undefined)
    root.querySelector(`button[data-index="${focused.index}"]`)?.focus({ preventScroll: true });
  else if (focused?.stage)
    root.querySelector('button[data-stage="link"]')?.focus({ preventScroll: true });
  const active =
    root.querySelector('.semantic-map [aria-current="step"]') ||
    root.querySelector('.pipeline-row [aria-current="step"]');
  active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function renderStageContext(event, stage = compilerStage(event)) {
  const root = $('stage-context');
  root.hidden = !stage;
  if (!stage) {
    root.replaceChildren();
    return;
  }
  const output =
    event?.kind === 'link' && (event.link.exitCode !== 0 || event.link.outputBytes === null)
      ? t('link.noOutput')
      : t(`pipeline.artifact.${stage.output}`);
  root.innerHTML = `<div class="stage-context-heading">${esc(t('pipeline.current'))} · ${esc(t(`pipeline.group.${stage.group}`))}</div>
    <strong>${esc(t(`pipeline.stage.${stage.id}`))}</strong><code>${esc(stage.phase)}</code>
    <div class="stage-handoff"><div><small>${esc(t('pipeline.input'))}</small><span>${esc(t(`pipeline.artifact.${stage.input}`))}</span></div><b aria-hidden="true">→</b><div><small>${esc(t('pipeline.output'))}</small><span>${esc(output)}</span></div></div>
    <details class="stage-driver"><summary>${icon('disclosure', { size: 12 })}<span>${esc(t('pipeline.driver'))}</span></summary><code>${esc(stage.driver)}</code><p>${esc(t(`pipeline.action.${stage.id}`))}</p></details>`;
}
