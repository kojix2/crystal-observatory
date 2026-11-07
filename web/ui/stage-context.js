import { t } from '../i18n/index.js';
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { compilerStage } from '../core/compiler-stages.js';

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
