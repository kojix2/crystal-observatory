import { getLocale, t } from '../i18n/index.js';
import { $, esc } from './dom.js';
import { compilerStage, pipelineGroups } from '../core/compiler-stages.js';

const renderedMaps = new WeakMap();

export function renderCompilerMap(model, records, onSeek) {
  const root = $('compiler-map');
  const current = compilerStage(model?.event);
  // The syntax engine is separate and does not run this semantic pipeline.
  root.hidden = model?.trace.mode !== 'full';
  $('workflow-column').hidden = root.hidden;
  $('workflow-splitter').hidden = root.hidden;
  if (root.hidden) return;
  root.onclick = (event) => {
    const button = event.target.closest('button[data-index]');
    if (button && root.contains(button)) onSeek(Number(button.dataset.index));
  };
  const previous = renderedMaps.get(root);
  if (
    previous?.records === records &&
    previous?.stage === current?.id &&
    previous?.locale === getLocale()
  )
    return;
  const focused = root.contains(document.activeElement)
    ? document.activeElement.dataset.index
    : undefined;
  renderedMaps.set(root, { records, stage: current?.id, locale: getLocale() });
  root.title = t('pipeline.navigation');
  root.innerHTML = `<ol class="compiler-pipeline">${pipelineGroups
    .map((group, i) => {
      const first = group.stages
        .map((stage) => records.get(stage.id)?.first)
        .find((index) => index !== undefined);
      const active = group.id === current?.group;
      const note = group.outsideTrace
        ? t('pipeline.outside')
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
      return `<li><button type="button" ${first === undefined ? 'disabled' : `data-index="${first}"`} ${active ? 'aria-current="step"' : ''} title="${esc(note)}"><span>${i + 1} · ${esc(t(`pipeline.group.${group.id}`))}</span><small>${esc(t(`pipeline.artifact.${group.output}`))}${group.outsideTrace ? ` · ${esc(t('pipeline.outsideShort'))}` : first === undefined ? ` · ${esc(t('pipeline.unrecordedShort'))}` : ''}</small></button>${children}</li>`;
    })
    .join('')}</ol>`;
  if (focused !== undefined)
    root.querySelector(`button[data-index="${focused}"]`)?.focus({ preventScroll: true });
  const active =
    root.querySelector('.semantic-map [aria-current="step"]') ||
    root.querySelector('.compiler-pipeline > li > [aria-current="step"]');
  active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function renderStageContext(event) {
  const stage = compilerStage(event);
  const root = $('stage-context');
  root.hidden = !stage;
  if (!stage) {
    root.replaceChildren();
    return;
  }
  root.innerHTML = `<div class="stage-context-heading">${esc(t('pipeline.current'))} · ${esc(t(`pipeline.group.${stage.group}`))}</div>
    <strong>${esc(t(`pipeline.stage.${stage.id}`))}</strong><code>${esc(stage.phase)}</code>
    <div class="stage-handoff"><div><small>${esc(t('pipeline.input'))}</small><span>${esc(t(`pipeline.artifact.${stage.input}`))}</span></div><b aria-hidden="true">→</b><div><small>${esc(t('pipeline.output'))}</small><span>${esc(t(`pipeline.artifact.${stage.output}`))}</span></div></div>
    <details class="stage-driver"><summary>${esc(t('pipeline.driver'))}</summary><code>${esc(stage.driver)}</code><p>${esc(t(`pipeline.action.${stage.id}`))}</p></details>`;
}
