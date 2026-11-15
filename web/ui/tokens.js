import { t } from '../i18n/index.js';
import { $, esc } from './dom.js';
import { setupTableColumns } from './table-columns.js';

const KEY = 'crystal-observatory.token-columns.v1';
export const TOKEN_DISPLAY_LIMIT = 4000;
const controllers = new WeakMap();
const selections = new WeakMap();

const layoutKinds = new Set(['SPACE', 'NEWLINE', 'EOF']);
const nameKinds = new Set(['IDENT', 'CONST', 'INSTANCE_VAR', 'CLASS_VAR', 'GLOBAL']);

export function tokenFamily(token) {
  if (token.mode === 'macro' || token.kind.startsWith('MACRO_')) return 'macro';
  if (layoutKinds.has(token.kind)) return 'layout';
  if (token.mode?.startsWith('string') || /^(NUMBER|STRING|CHAR|DELIMITER_)/.test(token.kind))
    return 'literal';
  if (nameKinds.has(token.kind)) return 'name';
  return 'symbol';
}

export function tokenDisplay(token, sourceLine = '') {
  if (token.value) {
    if (token.kind === 'STRING' || token.kind === 'CHAR' || /\s/.test(token.value))
      return JSON.stringify(token.value);
    return token.value;
  }
  if (token.kind === 'NEWLINE') return '↵';
  if (token.kind === 'SPACE') return '·';
  if (token.kind.startsWith('DELIMITER_'))
    return Array.from(sourceLine)[Math.max(0, token.column - 1)] || token.kind;
  return token.kind;
}

export function tokenSourceParts(token, sourceLine = '') {
  const characters = Array.from(sourceLine);
  const offset = Math.max(0, token.column - 1);
  const before = characters.slice(0, offset).join('');
  const rest = characters.slice(offset).join('');
  const candidate =
    token.kind === 'SPACE' && rest.startsWith(' ')
      ? ' '
      : token.value && !token.value.includes('\n')
        ? token.value
        : token.kind;
  const match = rest.startsWith(candidate)
    ? candidate
    : token.kind.startsWith('DELIMITER_')
      ? characters[offset] || ''
      : '';
  return { before, match, after: rest.slice(match.length) };
}

export function resetTokenColumns() {
  controllers.get($('token-view'))?.reset();
}

export function renderTokens(trace, highlightSource, openSource) {
  const container = $('token-view');
  const previous = selections.get(container);
  const scrollTop = previous?.trace === trace ? container.scrollTop : 0;
  const focused = container.contains(document.activeElement)
    ? document.activeElement?.dataset?.tokenIndex
    : null;
  controllers.get(container)?.destroy();

  const all = Array.isArray(trace.tokens)
    ? trace.tokens.filter(
        (token) =>
          token &&
          typeof token.kind === 'string' &&
          typeof token.value === 'string' &&
          typeof token.mode === 'string' &&
          Number.isSafeInteger(token.line) &&
          token.line > 0 &&
          Number.isSafeInteger(token.column) &&
          token.column > 0,
      )
    : [];
  const shown = all.slice(0, TOKEN_DISPLAY_LIMIT);
  const sourceLines = trace.source.split(/\r\n|\r|\n/);
  $('token-total').textContent = all.length.toLocaleString();
  $('token-kinds').textContent = new Set(all.map((token) => token.kind)).size.toLocaleString();
  $('token-modes').textContent = new Set(all.map((token) => token.mode)).size.toLocaleString();
  $('token-intro').textContent = t(
    trace.mode === 'full' ? 'token.intro.full' : 'token.intro.syntax',
  );
  $('tokens-view').dataset.tokenMode = trace.mode;

  if (!shown.length) {
    container.innerHTML = `<p class="token-empty">${esc(t('token.empty'))}</p>`;
    $('token-inspector').innerHTML = '';
    selections.set(container, { trace, index: -1 });
    return;
  }

  const headings = ['value', 'kind', 'position', 'mode'];
  let lastLine;
  const rows = shown
    .map((token, index) => {
      const sourceLine = sourceLines[token.line - 1] || '';
      const group =
        token.line !== lastLine
          ? `<tr class="token-line"><th colspan="4"><span>L${token.line}</span><code>${esc(sourceLine)}</code></th></tr>`
          : '';
      lastLine = token.line;
      return `${group}<tr class="token-row" data-token-index="${index}" data-token-family="${tokenFamily(token)}" data-line="${token.line}" tabindex="0" aria-selected="false"><td><code>${esc(tokenDisplay(token, sourceLine))}</code></td><td><span class="token-kind">${esc(token.kind)}</span></td><td>${token.line}:${token.column}</td><td>${esc(token.mode)}</td></tr>`;
    })
    .join('');
  container.innerHTML = `<table id="token-table"><colgroup>${headings.map(() => '<col>').join('')}</colgroup><thead><tr>${headings.map((key, index) => `<th scope="col"><span class="table-column-label">${esc(t(`token.${key}`))}</span>${index < headings.length - 1 ? `<span class="table-column-divider" role="separator" aria-orientation="vertical" aria-controls="token-table" aria-label="${esc(t('token.resize', { column: t(`token.${key}`) }))}" title="${esc(t('history.resize.help'))}"></span>` : ''}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;

  const tokenRows = [...container.querySelectorAll('.token-row')];
  function select(index, highlight = false) {
    const token = shown[index];
    if (!token) return;
    const sourceLine = sourceLines[token.line - 1] || '';
    const parts = tokenSourceParts(token, sourceLine);
    container
      .querySelector('.token-row[aria-selected="true"]')
      ?.setAttribute('aria-selected', 'false');
    tokenRows[index].setAttribute('aria-selected', 'true');
    selections.set(container, { trace, index });
    if (highlight) highlightSource?.({ line: token.line, column: token.column });

    const metadata = [
      [t('token.mode'), token.mode],
      ...(token.kind === 'NUMBER' && token.number_kind
        ? [[t('token.numberKind'), token.number_kind]]
        : []),
      ...((token.mode?.startsWith('string') || token.kind.startsWith('DELIMITER_')) &&
      token.delimiter
        ? [[t('token.delimiter'), token.delimiter]]
        : []),
    ];
    $('token-inspector').innerHTML =
      `<div class="token-detail-top"><span class="token-index">${esc(t('token.selected', { index: index + 1, total: all.length }))}</span><strong class="token-detail-value" data-token-family="${tokenFamily(token)}">${esc(tokenDisplay(token, sourceLine))}</strong><span class="token-kind" data-token-family="${tokenFamily(token)}">${esc(token.kind)}</span>${openSource ? `<button class="token-open-source link-button" aria-label="${esc(t('token.openSource'))}" title="${esc(t('token.openSource'))}"><span>${esc(t('token.openSource'))}</span><span aria-hidden="true">↗</span></button>` : ''}</div>
      <div class="token-detail-meta"><span>${token.line}:${token.column}</span>${metadata.map(([label, value]) => `<span>${esc(label)} <code>${esc(value)}</code></span>`).join('')}</div>
      <div class="token-source-preview"><small>${esc(t('token.sourceLine', { line: token.line }))}</small><pre>${esc(parts.before)}${parts.match ? `<mark>${esc(parts.match)}</mark>` : ''}${esc(parts.after)}</pre></div>`;
    $('token-inspector')
      .querySelector('.token-open-source')
      ?.addEventListener('click', () => {
        highlightSource?.({ line: token.line, column: token.column });
        openSource();
      });
  }

  tokenRows.forEach((row, index) => {
    row.onclick = () => select(index, true);
    row.onkeydown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      select(index, true);
    };
  });
  const selected =
    previous?.trace === trace && previous.index >= 0 && previous.index < shown.length
      ? previous.index
      : Math.max(
          0,
          shown.findIndex((token) => !layoutKinds.has(token.kind)),
        );
  select(selected);
  if (focused !== null) tokenRows[Number(focused)]?.focus({ preventScroll: true });
  container.scrollTop = scrollTop;
  controllers.set(
    container,
    setupTableColumns(container.querySelector('table'), {
      key: KEY,
      minimums: [80, 80, 64, 64],
      defaults: () => [37, 28, 14, 21],
    }),
  );
}
