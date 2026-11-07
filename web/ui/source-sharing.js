import { getLocale, t, onLocaleChange, UIError, errorText } from '../i18n/index.js';
import { embeddedSourceURL, externalSourceURL, parseSourceLink } from '../core/source-link.js';
import { loadSharedSource } from '../runtime/source-loader.js';
import { CancelledError } from '../runtime/worker-client.js';
import { localizedURL } from './language.js';
import { $, notify } from './dom.js';

// Owns source imports and provenance, never compiler execution. Application.prepare
// and editor changes invalidate pending imports, including a Gist file choice.
export class SourceSharing {
  constructor(app) {
    this.app = app;
    this.pending = null;
    this.origin = null;
    $('share-source').onclick = () => this.showShare();
    $('close-source-share').onclick = () => $('source-share').close();
    $('copy-source-link').onclick = () => this.copy(false);
    $('copy-origin-link').onclick = () => this.copy(true);
    $('source-link-form').onsubmit = (event) => {
      event.preventDefault();
      try {
        const url = new URL($('source-link-input').value, window.location.href);
        if (!parseSourceLink(url)) throw new UIError('share.invalid');
        $('source-share').close();
        this.openURL(url);
      } catch (error) {
        $('share-status').textContent = errorText(error);
      }
    };
    $('source-file-form').onsubmit = (event) => {
      event.preventDefault();
      const link = this.pending?.origin;
      if (!link) return;
      const url = externalSourceURL(window.location.href, {
        ...link,
        file: $('source-file-choice').value,
      });
      $('source-files').close();
      this.openURL(url);
    };
    $('cancel-source-files').onclick = () => this.cancel();
    $('source-files').addEventListener('cancel', () => this.cancel());
    onLocaleChange(() => this.update());
    window.addEventListener('hashchange', () => this.openURL(window.location.href));
  }

  update() {
    $('copy-origin-link').disabled = !this.origin || this.origin.source !== this.app.editor.value;
    if (
      $('source-share').open &&
      (this.previewSource !== this.app.editor.value || this.previewLocale !== getLocale())
    )
      this.showShare();
  }

  async showShare() {
    const request = (this.previewRequest ?? 0) + 1;
    this.previewRequest = request;
    this.previewSource = this.app.editor.value;
    this.previewLocale = getLocale();
    this.preview = null;
    const source = this.previewSource;
    const base = localizedURL(window.location.href, this.previewLocale);
    const gistExample = localizedURL(new URL('../', import.meta.url), this.previewLocale);
    gistExample.search = new URLSearchParams({ gist: 'GIST_ID', file: 'main.cr' });
    $('share-gist-example').textContent = gistExample.href;
    $('share-link').value = '';
    $('copy-source-link').disabled = true;
    $('share-status').textContent = t('share.generating');
    if (!$('source-share').open) $('source-share').showModal();
    this.update();
    try {
      const url = await embeddedSourceURL(base, source);
      if (request !== this.previewRequest || !$('source-share').open) return;
      if (source !== this.app.editor.value) throw new UIError('share.changed');
      this.preview = url;
      $('share-link').value = url.href;
      $('copy-source-link').disabled = false;
      $('share-status').textContent = '';
    } catch (error) {
      if (request === this.previewRequest && $('source-share').open)
        $('share-status').textContent = errorText(error);
    }
  }

  cancel() {
    if (this.pending?.loading) this.app.session.cancel();
    this.pending = null;
    if ($('source-files').open) $('source-files').close();
  }

  async openURL(input) {
    let ticket;
    try {
      const link = parseSourceLink(input);
      if (!link) return;
      this.cancel();
      ticket = { loading: true };
      this.pending = ticket;
      notify(() => t('share.loading'));
      const result = await this.app.session.load((signal) => loadSharedSource(link, { signal }));
      if (this.pending !== ticket) return;
      ticket.loading = false;
      if (result.choices) {
        ticket.origin = result.origin;
        $('source-file-choice').replaceChildren(
          ...result.choices.map((file) => new Option(file, file)),
        );
        $('source-files').showModal();
        return;
      }
      this.pending = null;
      this.app.showInput(result.source);
      this.origin = result.origin ? { ...result.origin, source: result.source } : null;
      $('example').value = '';
      this.app.trace.setView('source');
      this.app.trace.workspace?.showPane('work');
      this.app.updateControls();
      notify(() => t('share.loaded'));
    } catch (error) {
      if (ticket && this.pending !== ticket) return;
      if (error instanceof CancelledError) return;
      notify(() => errorText(error), 'error');
    } finally {
      if (this.pending === ticket && ticket?.loading) this.pending = null;
    }
  }

  async copy(fixed) {
    const source = this.app.editor.value;
    const origin = this.origin;
    try {
      if (fixed && (!origin || origin.source !== source)) throw new UIError('share.changed');
      const base = localizedURL(window.location.href, getLocale());
      const url = fixed ? externalSourceURL(base, origin) : this.preview;
      if (!url || (!fixed && (this.previewSource !== source || this.previewLocale !== getLocale())))
        throw new UIError('share.changed');
      $('share-link').value = url.href;
      try {
        await window.navigator.clipboard.writeText(url.href);
        $('share-status').textContent = t('share.copied');
      } catch {
        $('share-link').focus();
        $('share-link').select();
        $('share-status').textContent = t('share.manualCopy');
      }
    } catch (error) {
      $('share-status').textContent = errorText(error);
    }
  }
}
