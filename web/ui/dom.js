import { text as bindText } from './language.js';
export const $ = (id) => document.getElementById(id);
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const brief = (value, length = 55) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .slice(0, length);
export function notify(text, level = '') {
  bindText('notice', text);
  bindText('notice-detail', text);
  $('notice').className = level;
}
export function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
