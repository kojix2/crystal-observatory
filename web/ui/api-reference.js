import { getLocale, t } from '../i18n/index.js';
import { localizedURL } from './language.js';
import { esc } from './dom.js';

export function renderAPIReference() {
  const base = localizedURL(new URL('../', import.meta.url), getLocale());
  const example = (suffix, live = false) => {
    const value = base.href + suffix;
    return `<pre><code>${esc(value)}</code></pre>${live ? `<a href="${esc(value)}" target="_blank" rel="noreferrer">${esc(t('share.open'))}</a>` : ''}`;
  };
  const section = (title, description, examples = '') =>
    `<section><h3>${esc(t(title))}</h3><p>${esc(t(description))}</p>${examples}</section>`;
  return `<div class="api-reference">
    ${section('api.code', 'api.codeText', example('#code=puts%2042', true) + '<pre><code>url.hash = new URLSearchParams({ code: source }).toString();</code></pre>')}
    ${section('api.gzip', 'api.gzipText', example('#v=1&encoding=gzip&code=<base64url>'))}
    ${section('api.gist', 'api.gistText', example('?gist=GIST_ID&file=main.cr') + example('?gist=GIST_ID&file=main.cr&rev=REVISION_SHA'))}
    ${section('api.github', 'api.githubText', example('?repo=kojix2%2Fcrystal-observatory&file=examples%2F03_macro_expansion.cr&ref=main', true) + example('?repo=OWNER%2FREPO&file=examples%2Fmain.cr&ref=COMMIT_SHA'))}
    ${section('api.fixed', 'api.fixedText')}
    ${section('api.rules', 'api.rulesText')}
    ${section('api.errors', 'api.errorsText')}
  </div>`;
}
