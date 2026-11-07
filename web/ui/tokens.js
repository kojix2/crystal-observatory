import { t } from '../i18n/index.js';
import { $, esc } from './dom.js';

export function renderTokens(trace, highlightSource) {
  $('token-view').innerHTML =
    `<table><thead><tr><th>${esc(t('token.value'))}</th><th>${esc(t('token.kind'))}</th><th>${esc(t('token.position'))}</th><th>${esc(t('token.mode'))}</th></tr></thead><tbody>${(
      trace.tokens || []
    )
      .slice(0, 4000)
      .map(
        (t) =>
          `<tr data-line="${t.line}"><td>${esc(t.value ? JSON.stringify(t.value) : '—')}</td><td>${esc(t.kind)}</td><td>${t.line}:${t.column}</td><td>${esc(t.mode)}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  $('token-view')
    .querySelectorAll('[data-line]')
    .forEach(
      (row) =>
        (row.onclick = () => {
          highlightSource({ line: Number(row.dataset.line), column: 1 });
        }),
    );
}
