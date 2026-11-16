import { escapeCode, highlightCrystal } from './crystal-highlight.js';

const PAGE_ROWS = 200;
const PAGE_CHARS = 32_768;
const HIGHLIGHT_CHARS = 16_384;

// Only these observations compare source with source. Other before/after values
// describe types, signatures or results, even when they happen to look like code.
export function sourceChange(event) {
  if (!event) return null;
  const transformation = ['rewrite', 'expand'].includes(event.kind);
  const activity =
    event.kind === 'activity' &&
    ['rewrite', 'replace_untyped', 'simplify_condition'].includes(event.activity) &&
    Boolean(event.before);
  if (
    (!transformation && !activity) ||
    typeof event.before !== 'string' ||
    typeof event.after !== 'string'
  )
    return null;
  // The transformer records a missing AST node as ∅, not as Crystal source.
  return { before: event.before, after: event.after === '∅' ? '' : event.after };
}

const sourceLines = (source) => (source ? source.split('\n') : []);

// Preserve shared prefixes/suffixes, then align the changed section with LCS.
// Bound the matrix for large compiler serializations: a replacement still
// preserves every source line without quadratic work or allocation.
export function diffLines(before, after) {
  const oldLines = sourceLines(before),
    newLines = sourceLines(after);
  let start = 0,
    oldEnd = oldLines.length,
    newEnd = newLines.length;
  while (start < oldEnd && start < newEnd && oldLines[start] === newLines[start]) start++;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const rows = [];
  const add = (kind, oldIndex, newIndex) =>
    rows.push({ kind, oldIndex, newIndex, text: oldLines[oldIndex] ?? newLines[newIndex] });
  for (let i = 0; i < start; i++) add('context', i, i);
  const oldCount = oldEnd - start,
    newCount = newEnd - start;
  if (oldCount > 0 && newCount > 0 && oldCount * newCount <= 250_000) {
    const lengths = Array.from({ length: oldCount + 1 }, () => new Uint32Array(newCount + 1));
    for (let i = oldCount - 1; i >= 0; i--)
      for (let j = newCount - 1; j >= 0; j--)
        lengths[i][j] =
          oldLines[start + i] === newLines[start + j]
            ? lengths[i + 1][j + 1] + 1
            : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    let i = 0,
      j = 0;
    while (i < oldCount || j < newCount) {
      if (i < oldCount && j < newCount && oldLines[start + i] === newLines[start + j]) {
        add('context', start + i++, start + j++);
      } else if (i < oldCount && (j === newCount || lengths[i + 1][j] >= lengths[i][j + 1])) {
        add('removed', start + i++, null);
      } else add('added', null, start + j++);
    }
  } else {
    for (let i = start; i < oldEnd; i++) add('removed', i, null);
    for (let j = start; j < newEnd; j++) add('added', null, j);
  }
  for (let i = oldEnd, j = newEnd; i < oldLines.length; i++, j++) add('context', i, j);
  return rows;
}

// Highlight each complete version first so multiline strings/macros retain their
// syntax context. Close/reopen Prism spans at line boundaries for valid row HTML.
function highlightedLines(source) {
  const open = [];
  return highlightCrystal(source)
    .split('\n')
    .map((line) => {
      const prefix = open.join('');
      for (const [tag] of line.matchAll(/<\/?span\b[^>]*>/g)) {
        if (tag.startsWith('</')) open.pop();
        else open.push(tag);
      }
      return prefix + line + '</span>'.repeat(open.length);
    });
}

// Keep the complete alignment, but only materialize one bounded page as HTML.
// A long single line can span pages too; never split a UTF-16 surrogate pair.
export function createCrystalDiff(before, after) {
  const rows = diffLines(before, after),
    pages = [];
  let row = 0,
    offset = 0;
  while (row < rows.length) {
    const startRow = row,
      startOffset = offset;
    let chars = 0,
      count = 0;
    while (row < rows.length && count < PAGE_ROWS && chars < PAGE_CHARS) {
      const text = rows[row].text;
      let size = Math.min(text.length - offset, PAGE_CHARS - chars);
      const last = text.charCodeAt(offset + size - 1);
      if (offset + size < text.length && last >= 0xd800 && last <= 0xdbff) size--;
      if (!size && offset < text.length) break;
      offset += size;
      chars += size;
      count++;
      if (offset < text.length) break;
      row++;
      offset = 0;
    }
    pages.push({ startRow, startOffset, endRow: row, endOffset: offset });
  }
  // Only small sources are highlighted as complete versions, preserving their
  // multiline token context. Large sources use escaped text on every page.
  const highlighted = before.length + after.length <= HIGHLIGHT_CHARS;
  const oldHTML = highlighted ? highlightedLines(before) : null,
    newHTML = highlighted ? highlightedLines(after) : null;
  return {
    pageCount: Math.max(1, pages.length),
    pageHTML(index = 0) {
      const page = pages[index];
      if (!page) return '';
      const html = [];
      for (let i = page.startRow; i < page.endRow + (page.endOffset > 0 ? 1 : 0); i++) {
        const { kind, oldIndex, newIndex, text } = rows[i];
        const start = i === page.startRow ? page.startOffset : 0,
          end = i === page.endRow ? page.endOffset : text.length,
          marker = { removed: '-', added: '+', context: ' ' }[kind];
        const code = highlighted
          ? kind === 'removed'
            ? oldHTML[oldIndex]
            : newHTML[newIndex]
          : escapeCode(text.slice(start, end));
        html.push(
          `<span class="diff-line diff-${kind}"><span class="diff-marker" aria-hidden="true">${marker}</span><span class="diff-code">${code}</span></span>`,
        );
      }
      return html.join('');
    },
  };
}
