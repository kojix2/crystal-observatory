import { createCrystalDiff } from '../core/code-diff.js';
import { t } from '../i18n/index.js';
import { $ } from './dom.js';

// Retain only the current diff. Adjacent rewrite/activity records often contain
// identical source: reuse their alignment and DOM, including the chosen page.
const views = new WeakMap();

export function renderCodeDiff(change) {
  const code = $('code-diff'),
    controls = $('diff-pages'),
    input = $('diff-page');
  if (!change) {
    views.delete(code);
    code.innerHTML = '';
    controls.hidden = true;
    $('diff-previous').onclick = $('diff-next').onclick = input.onchange = null;
    return;
  }
  let view = views.get(code);
  if (!view || view.before !== change.before || view.after !== change.after) {
    view = { ...change, diff: createCrystalDiff(change.before, change.after), page: 0 };
    views.set(code, view);
  }
  const show = (page) => {
    view.page = Math.max(0, Math.min(view.diff.pageCount - 1, Math.trunc(page) || 0));
    if (view.renderedPage !== view.page) {
      code.innerHTML = view.diff.pageHTML(view.page);
      code.scrollTop = code.scrollLeft = 0;
      view.renderedPage = view.page;
    }
    controls.hidden = view.diff.pageCount <= 1;
    input.value = view.page + 1;
    input.max = view.diff.pageCount;
    $('diff-page-count').textContent = `/ ${view.diff.pageCount.toLocaleString()}`;
    $('diff-page-note').textContent = t('event.diffPaged');
    $('diff-previous').disabled = view.page === 0;
    $('diff-next').disabled = view.page === view.diff.pageCount - 1;
  };
  $('diff-previous').onclick = () => show(view.page - 1);
  $('diff-next').onclick = () => show(view.page + 1);
  input.onchange = () => show(Number(input.value) - 1);
  show(view.page);
}
