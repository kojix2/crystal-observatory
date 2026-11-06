import { getLocale, t } from '../i18n/index.js';
import { $, esc } from './dom.js';
import { compilerStage, compilerStages, pipelineGroups } from '../core/compiler-stages.js';

const renderedMaps = new WeakMap();

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
  root.onclick = (event) => {
    const button = event.target.closest('button[data-index], button[data-stage]');
    if (!button || !root.contains(button)) return;
    if (button.dataset.stage) onSelectStage?.(button.dataset.stage);
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
    .map((group, i) => {
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
      const children =
        stages.length > 1
          ? `<ol class="semantic-map">${stages
              .map((stage) => {
                const first = records.get(stage.id)?.first;
                return `<li><button type="button" ${first === undefined ? 'disabled' : `data-index="${first}"`} ${stage.id === current?.id ? 'aria-current="step"' : ''} title="${esc(stage.phase)}">${esc(t(`pipeline.stage.${stage.id}`))}</button></li>`;
              })
              .join('')}</ol>`
          : '';
      return `<li><button type="button" ${overview ? 'data-stage="link"' : first === undefined ? 'disabled' : `data-index="${first}"`} ${active ? 'aria-current="step"' : ''} title="${esc(note)}"><span>${i + 1} · ${esc(t(`pipeline.group.${group.id}`))}</span><small>${esc(t(`pipeline.artifact.${group.output}`))}${group.outsideTrace ? ` · ${esc(t('pipeline.outsideShort'))}` : first === undefined ? ` · ${esc(t('pipeline.unrecordedShort'))}` : ''}</small></button>${children}</li>`;
    })
    .join('')}</ol>`;
  if (focused?.index !== undefined)
    root.querySelector(`button[data-index="${focused.index}"]`)?.focus({ preventScroll: true });
  else if (focused?.stage)
    root.querySelector('button[data-stage="link"]')?.focus({ preventScroll: true });
  const active =
    root.querySelector('.semantic-map [aria-current="step"]') ||
    root.querySelector('.compiler-pipeline > li > [aria-current="step"]');
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
    <details class="stage-driver"><summary>${esc(t('pipeline.driver'))}</summary><code>${esc(stage.driver)}</code><p>${esc(t(`pipeline.action.${stage.id}`))}</p></details>`;
}
