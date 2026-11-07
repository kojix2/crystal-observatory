import { compilerStages } from '../core/compiler-stages.js';
import { astFamily, astNodeKinds } from '../core/ast-colors.js';
import { t, onLocaleChange } from '../i18n/index.js';
import { $, esc } from './dom.js';
import { sourceFiles, visitorRole } from './event-labels.js';

// Learning pages share the compiler's existing stage, node and Visitor metadata.
// Switching pages never replaces the editor or the current recording.
export function setupLearningNavigation({ onLeave, onReturn }) {
  const navigation = $('learning-navigation');
  const buttons = [...navigation.querySelectorAll('[data-learning-view]')];
  const panel = $('learning-panel');
  const search = $('learning-search');
  const content = $('learning-content');
  const positions = new Map();
  const queries = new Map();
  let current = 'observatory';

  function render() {
    if (current === 'observatory') return;
    $('learning-title').textContent = t(`learning.${current}`);
    $('learning-intro').textContent = t(`learning.${current}.intro`);
    $('learning-search-tools').hidden = current === 'workflow';
    if (current === 'workflow') {
      content.innerHTML = `<ol class="learning-workflow">${compilerStages
        .map(
          (
            stage,
            index,
          ) => `<li class="learning-stage"><span class="learning-step">${index + 1}</span>
            <h3>${esc(t(`pipeline.stage.${stage.id}`))}</h3>
            <p>${esc(t(`pipeline.action.${stage.id}`))}</p><code>${esc(stage.driver)}</code>
            <dl class="learning-artifacts"><div><dt>${esc(t('pipeline.input'))}</dt><dd>${esc(t(`pipeline.artifact.${stage.input}`))}</dd></div><div><dt>${esc(t('pipeline.output'))}</dt><dd>${esc(t(`pipeline.artifact.${stage.output}`))}</dd></div></dl></li>`,
        )
        .join('')}</ol>`;
      return;
    }

    const query = search.value.trim().toLocaleLowerCase();
    const entries =
      current === 'nodes'
        ? astNodeKinds.map((name) => ({ name, family: astFamily(name) }))
        : Object.entries(sourceFiles).map(([name, file]) => ({ name, file }));
    const matches = entries
      .filter((entry) =>
        `${entry.name} ${entry.family ? t(`ast.family.${entry.family}`) : visitorRole({ visitor: entry.name })}`
          .toLocaleLowerCase()
          .includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    $('learning-count').textContent = `${matches.length} / ${entries.length}`;
    content.innerHTML = matches.length
      ? `<div class="learning-catalog">${matches
          .map((entry) =>
            entry.family
              ? `<article class="learning-card learning-node" data-node-family="${entry.family}"><h3>${esc(entry.name)}</h3><p>${esc(t(`ast.family.${entry.family}`))}</p></article>`
              : `<article class="learning-card"><h3>${esc(entry.name)}</h3><p>${esc(visitorRole({ visitor: entry.name }))}</p><code class="learning-file">${esc(entry.file)}</code></article>`,
          )
          .join('')}</div>`
      : `<p class="empty">${esc(t('learning.noMatches'))}</p>`;
  }

  function show(name) {
    if (name === current) return;
    positions.set(current, panel.scrollTop);
    queries.set(current, search.value);
    if (current === 'observatory') onLeave();
    current = name;
    const observing = current === 'observatory';
    $('app').hidden = !observing;
    panel.hidden = observing;
    for (const button of buttons) {
      if (button.dataset.learningView === current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    if (observing) {
      onReturn();
      $('app').focus({ preventScroll: true });
    } else {
      search.value = queries.get(current) || '';
      render();
      panel.scrollTop = positions.get(current) || 0;
      $('learning-title').focus({ preventScroll: true });
    }
  }

  for (const button of buttons) button.onclick = () => show(button.dataset.learningView);
  for (const id of ['compile-run', 'compile-only', 'analyze'])
    $(id).addEventListener('click', () => show('observatory'), { capture: true });
  search.oninput = () => {
    render();
    panel.scrollTop = 0;
  };
  onLocaleChange(render);
}
