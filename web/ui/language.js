import { getLocale, setLocale, onLocaleChange, t, locales } from '../i18n/index.js';

const WEB_ROOT = new URL('../', import.meta.url);
export function localeFromURL(url, root = WEB_ROOT) {
  const pathname = new URL(url).pathname;
  if (!pathname.startsWith(root.pathname)) return null;
  const value = pathname.slice(root.pathname.length).replace(/\/(?:index\.html)?$/, '');
  return locales.includes(value) ? value : null;
}
export function localizedURL(url, value, root = WEB_ROOT) {
  const result = new URL(url);
  result.pathname = new URL(`${value}/`, root).pathname;
  return result;
}

// Bind presentation text, never application data. Switching language does not
// reload a trace, restart a worker, change source, or seek to another event.
const bindings = new Map();
export function text(id, value) {
  const render = typeof value === 'function' ? value : () => value;
  bindings.set(id, render);
  document.getElementById(id).textContent = render();
}
export function translateDOM(root = document) {
  for (const [data, attr] of [
    ['i18n', null],
    ['i18nTitle', 'title'],
    ['i18nAria', 'aria-label'],
    ['i18nPlaceholder', 'placeholder'],
    ['i18nContent', 'content'],
  ]) {
    const selector = 'data-' + data.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
    root.querySelectorAll(`[${selector}]`).forEach((element) => {
      if (attr) element.setAttribute(attr, t(element.dataset[data]));
      else element.textContent = t(element.dataset[data]);
    });
  }
}
export function setupLanguage() {
  const key = 'crystal-observatory.language';
  // Shared URLs take precedence over the optional saved preference.
  const requested = localeFromURL(window.location.href);
  if (requested) setLocale(requested);
  else {
    try {
      setLocale(localStorage.getItem(key));
    } catch {
      /* Private browsing. */
    }
  }
  const render = () => {
    document.documentElement.lang = getLocale();
    document.title = t('app.title');
    document.getElementById('language').value = getLocale();
    translateDOM();
    for (const [id, value] of bindings) document.getElementById(id).textContent = value();
  };
  onLocaleChange(render);
  document.getElementById('language').onchange = (event) => {
    setLocale(event.target.value);
    window.history.replaceState(
      window.history.state,
      '',
      localizedURL(window.location.href, getLocale()),
    );
    try {
      localStorage.setItem(key, getLocale());
    } catch {
      /* Optional preference. */
    }
  };
  render();
}
