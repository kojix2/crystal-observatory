import glyphs from '../vendor/lucide/icons.js';
import { lucideNames } from './icon-names.js';

// Every icon in the UI is drawn here: Lucide strokes on a 24-grid, shown at 16px
// (toolbars, workflow) or 12px (inline disclosure). Text labels never carry glyphs,
// so translations stay plain and icons keep one weight across platforms.
const STROKE =
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
// Lucide no longer ships brand marks; this is the only filled icon.
const brands = {
  github:
    '<path fill="currentColor" stroke="none" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.27-.01-1.18-.02-2.14-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.16 1.18a11 11 0 0 1 5.76 0c2.19-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.05.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.66.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/>',
};

export const iconNames = Object.freeze([...Object.keys(lucideNames), ...Object.keys(brands)]);

function body(name) {
  const markup = brands[name] ?? glyphs[lucideNames[name]];
  if (!markup) throw new Error(`Unknown icon: ${name}`);
  return markup;
}

export function icon(name, { size = 16, className = '' } = {}) {
  return `<svg class="icon${className ? ` ${className}` : ''}" data-icon="${name}" width="${size}" height="${size}" viewBox="0 0 24 24" ${STROKE} aria-hidden="true">${body(name)}</svg>`;
}

// Static markup declares <svg data-icon="name"> placeholders; fill them once at startup.
export function mountIcons(root = document) {
  for (const element of root.querySelectorAll('svg[data-icon]:empty')) {
    const size = Number(element.dataset.size) || 16;
    element.classList.add('icon');
    for (const [key, value] of [
      ['width', size],
      ['height', size],
      ['viewBox', '0 0 24 24'],
      ['fill', 'none'],
      ['stroke', 'currentColor'],
      ['stroke-width', '2'],
      ['stroke-linecap', 'round'],
      ['stroke-linejoin', 'round'],
      ['aria-hidden', 'true'],
    ])
      element.setAttribute(key, value);
    element.innerHTML = body(element.dataset.icon);
  }
}

// Toggles that change shape (play/pause) swap the glyph; toggles that only change
// direction rotate in CSS via aria-expanded instead.
export function setIcon(element, name) {
  const existing = element.querySelector('svg[data-icon]');
  if (existing?.dataset.icon === name) return;
  const size = Number(existing?.getAttribute('width')) || 16;
  const template = document.createElement('template');
  template.innerHTML = icon(name, { size });
  if (existing) existing.replaceWith(template.content.firstChild);
  else element.prepend(template.content.firstChild);
}

// <summary> labels use the shared disclosure chevron rather than the browser marker.
// Returns the text span so callers can bind data-i18n to it.
export function summaryLabel(summary, text = '') {
  const label = document.createElement('span');
  label.textContent = text;
  summary.replaceChildren();
  summary.insertAdjacentHTML('afterbegin', icon('disclosure', { size: 12 }));
  summary.append(label);
  return label;
}
