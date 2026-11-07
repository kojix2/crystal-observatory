import { t } from '../i18n/index.js';
import { $, esc } from './dom.js';
import { setupTableColumns } from './table-columns.js';

const KEY = 'crystal-observatory.token-columns.v1';
const controllers = new WeakMap();

export function resetTokenColumns() {
  controllers.get($('token-view'))?.reset();
}

export function renderTokens(trace, highlightSource) {
  const container = $('token-view');
  controllers.get(container)?.destroy();
  const headings = ['value', 'kind', 'position', 'mode'];
  container.innerHTML = `<table id="token-table"><colgroup>${headings.map(() => '<col>').join('')}</colgroup><thead><tr>${headings.map((key, index) => `<th scope="col"><span class="table-column-label">${esc(t(`token.${key}`))}</span>${index < headings.length - 1 ? `<span class="table-column-divider" role="separator" aria-orientation="vertical" aria-controls="token-table" aria-label="${esc(t('token.resize', { column: t(`token.${key}`) }))}" title="${esc(t('history.resize.help'))}"></span>` : ''}</th>`).join('')}</tr></thead><tbody>${(
    trace.tokens || []
  )
    .slice(0, 4000)
    .map(
      (t) =>
        `<tr data-line="${t.line}"><td>${esc(t.value ? JSON.stringify(t.value) : '—')}</td><td>${esc(t.kind)}</td><td>${t.line}:${t.column}</td><td>${esc(t.mode)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  controllers.set(
    container,
    setupTableColumns(container.querySelector('table'), {
      key: KEY,
      minimums: [80, 80, 64, 64],
      defaults: () => [37, 28, 14, 21],
    }),
  );
  $('token-view')
    .querySelectorAll('[data-line]')
    .forEach(
      (row) =>
        (row.onclick = () => {
          highlightSource({ line: Number(row.dataset.line), column: 1 });
        }),
    );
}
