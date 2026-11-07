import { highlightCrystal } from './crystal-highlight.js';

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
  if (oldCount * newCount <= 250_000) {
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

export function crystalDiffHTML(before, after) {
  const oldHTML = highlightedLines(before),
    newHTML = highlightedLines(after);
  return diffLines(before, after)
    .map(({ kind, oldIndex, newIndex }) => {
      const marker = { removed: '-', added: '+', context: ' ' }[kind];
      const html = kind === 'removed' ? oldHTML[oldIndex] : newHTML[newIndex];
      return `<span class="diff-line diff-${kind}"><span class="diff-marker" aria-hidden="true">${marker}</span><span class="diff-code">${html}</span></span>`;
    })
    .join('');
}
