import { $, notify, download } from './dom.js';
import { t, onLocaleChange, UIError, errorText } from '../i18n/index.js';
import { messages } from '../i18n/messages.js';
import { text } from './language.js';
import { SourceEditor } from './source-editor.js';
import { TraceView } from './trace-view.js';
import { WorkSession } from '../runtime/session.js';
import { CancelledError, TimeoutError } from '../runtime/worker-client.js';
import { decodeTrace, fetchTrace, emptyTrace } from '../core/trace-io.js';
import { SourceSharing } from './source-sharing.js';
import { LIMITS, validateSource } from '../core/limits.js';

const DEFAULT_SOURCE =
  'def square(x)\n  x * x\nend\n\nputs "Hello, Crystal!"\n(1..5).each do |n|\n  puts "#{n}² = #{square(n)}"\nend\n';
const WEB_ROOT = new URL('../', import.meta.url);
const state = (key, values) => text('run-state', () => t(key, values));

// Coordinates user actions. Worker lifetime belongs to WorkSession; replay and
// rendering belong to TraceView. An executable is always paired with its source.
export class Application {
  constructor() {
    this.artifact = null;
    this.manifest = [];
    this.editor = new SourceEditor(() => {
      this.sharing?.cancel();
      if (this.sharing) this.sharing.origin = null;
      this.updateControls();
      this.trace?.renderSourceCaption();
    });
    this.trace = new TraceView(this.editor);
    this.session = new WorkSession({ onState: () => this.updateControls() });
    $('prelude').onchange = () => this.updateControls();
    $('compile-run').onclick = () => this.compile(true);
    $('compile-only').onclick = () => {
      $('compile-options').hidePopover();
      this.compile(false);
    };
    $('analyze').onclick = () => {
      $('compile-options').hidePopover();
      this.parse();
    };
    $('cancel-job').onclick = () => {
      const cancelled = this.session.cancel();
      this.sharing?.cancel();
      if (cancelled) {
        notify(() => t('notice.cancelled'));
        state('state.cancelled');
      }
    };
    $('rerun').onclick = () => this.execute();
    $('download-wasm').onclick = () => {
      if (this.artifact) download('program.wasm', this.artifact.wasm, 'application/wasm');
    };
    $('import').onclick = () => $('file').click();
    $('file').onchange = () => {
      const file = $('file').files[0];
      $('file').value = '';
      if (file) this.openRecord(() => decodeTrace(file), file.name);
    };
    $('notice').onclick = () => $('status-dialog').showModal();
    $('close-status').onclick = () => $('status-dialog').close();
    onLocaleChange(() => {
      this.renderExamples();
      this.editor.refresh();
      this.trace.localize();
    });
    window.addEventListener('pagehide', () => {
      this.sharing?.cancel();
      this.session.dispose();
      this.trace.stop();
    });
    this.showInput(DEFAULT_SOURCE);
    this.sharing = new SourceSharing(this);
  }
  get prelude() {
    return $('prelude').checked ? 'prelude' : 'empty';
  }
  updateControls() {
    const busy = this.session?.busy || false,
      prelude = this.prelude;
    $('prelude-hint').hidden = prelude !== 'empty';
    $('compile-run').disabled = busy || prelude === 'empty';
    for (const id of ['compile-only', 'analyze']) $(id).disabled = busy;
    $('prelude').disabled = busy;
    $('cancel-job').disabled = !busy;
    $('rerun').disabled =
      busy ||
      !this.artifact ||
      this.artifact.source !== this.editor.value ||
      this.artifact.prelude !== prelude;
    $('download-wasm').disabled = !this.artifact || this.artifact.prelude !== prelude;
    this.sharing?.update();
  }
  prepare(key = 'state.idle') {
    this.sharing?.cancel();
    this.session.cancel();
    this.trace.stop();
    this.artifact = null;
    $('console').textContent = '';
    state(key);
    this.updateControls();
  }
  showInput(source, name = 'main.cr') {
    if (this.sharing) this.sharing.origin = null;
    this.prepare();
    this.sourceName = name;
    this.trace.load(emptyTrace(source));
    this.revealWork();
  }
  revealWork() {
    this.navigation?.show('observatory');
    this.trace.workspace?.showPane('work');
  }
  async openSource(file) {
    this.sharing?.cancel();
    state('state.loading');
    try {
      const source = await this.session.load(async () => {
        if (file.size > LIMITS.sourceBytes) throw new UIError('error.sourceLimit');
        const value = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
        validateSource(value);
        return value;
      });
      this.showInput(source, file.name);
    } catch (error) {
      this.showError(error);
    }
  }
  saveSource() {
    download(this.sourceName || 'main.cr', this.editor.value, 'text/plain;charset=utf-8');
  }
  showError(error) {
    if (error instanceof CancelledError) return;
    text('run-state', () => (error instanceof TimeoutError ? errorText(error) : t('state.failed')));
    notify(() => errorText(error), error instanceof TimeoutError ? 'warning' : 'error');
    this.updateControls();
  }
  acceptTrace(trace, origin, submittedSource, live = false) {
    // Editing is allowed while the Worker runs. Keep the editor text and label
    // the older trace, rather than silently replacing the user's newer source.
    const changed = this.editor.value !== submittedSource;
    this.trace.load(trace, { origin, preserveEdits: changed, live });
    this.trace.workspace?.showPane('work');
    this.updateControls();
    if (changed) notify(() => t('notice.changed'), 'warning');
    return !changed;
  }
  async compile(andRun) {
    this.sidePanel?.showSide('trace');
    const prelude = this.prelude;
    this.prepare('state.compiling');
    const source = this.editor.value;
    notify(() => t('notice.prepare'));
    try {
      const result = await this.session.compile(
        source,
        (data) => {
          if (data.progress != null)
            text('engine', () =>
              t('engine.progress', { percent: Math.round(data.progress * 100) }),
            );
          if (['loading', 'compiling', 'linking'].includes(data.status))
            notify(() => t(`notice.${data.status}`, { detail: data.detail || '' }));
        },
        prelude,
      );
      const current = this.acceptTrace(result.trace, () => t('origin.live'), source, true);
      if (result.trace.errors.length) {
        state('state.compileFailed');
        return;
      }
      if (!result.wasm) {
        if (prelude !== 'empty' || !result.trace.llvm_ir)
          throw new Error('Compiler did not return the expected output');
        state('state.irReady');
        this.trace.setView('ir');
        return;
      }
      this.artifact = { wasm: result.wasm, source, prelude };
      state('state.timings', {
        compile: (result.timings.compile / 1000).toFixed(2),
        link: (result.timings.link / 1000).toFixed(2),
      });
      this.updateControls();
      if (andRun && prelude !== 'empty' && current) await this.execute();
      else this.trace.setView('ir');
    } catch (error) {
      this.showError(error);
    }
  }
  async parse() {
    this.sidePanel?.showSide('trace');
    this.prepare('state.parsing');
    const source = this.editor.value;
    notify(() => t('notice.parsing'));
    try {
      const { trace } = await this.session.parse(source);
      this.acceptTrace(trace, () => t('origin.syntax'), source);
      state(trace.errors.length ? 'state.syntaxError' : 'state.syntax');
    } catch (error) {
      this.showError(error);
    }
  }
  async execute() {
    if (
      !this.artifact ||
      this.artifact.source !== this.editor.value ||
      this.artifact.prelude !== this.prelude
    )
      return notify(() => t('notice.needCompile'), 'warning');
    let args;
    try {
      args = JSON.parse($('runtime-args').value);
      if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) throw new Error();
    } catch {
      return notify(() => t('notice.args'), 'error');
    }
    this.trace.setView('run');
    $('console').textContent = '';
    state('state.running');
    try {
      const result = await this.session.run(
        { wasm: this.artifact.wasm, args, stdin: $('stdin').value },
        (data) => {
          if (data.output) {
            $('console').textContent += data.output;
            $('console').scrollTop = $('console').scrollHeight;
          }
        },
      );
      state('state.exit', { code: result.exitCode, seconds: (result.elapsed / 1000).toFixed(3) });
      notify(
        () =>
          result.exitCode ? t('notice.executed', { code: result.exitCode }) : t('notice.done'),
        result.exitCode ? 'warning' : '',
      );
    } catch (error) {
      this.showError(error);
    }
  }
  async openRecord(load, origin) {
    this.prepare('state.loading');
    const source = this.editor.value;
    notify(() => t('notice.recordLoading'));
    try {
      const trace = await this.session.load(load);
      const current = this.acceptTrace(trace, origin, source);
      if (current) this.sourceName = trace.filename || 'main.cr';
      this.sidePanel?.showSide('trace');
      this.navigation?.show('observatory');
      state('state.recorded');
    } catch (error) {
      this.showError(error);
    }
  }
  exampleTitle(item) {
    const id = /\/(\d\d)_/.exec(item.trace)?.[1];
    return messages[`example.${id}`] ? t(`example.${id}`) : item.title;
  }
  renderExamples() {
    $('template-status').hidden = this.manifest.length > 0;
    if (!this.manifest.length) {
      $('template-status').dataset.i18n = 'files.noTemplates';
      $('template-status').textContent = t('files.noTemplates');
    }
    $('template-list').replaceChildren(
      ...this.manifest.map((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.template = index;
        button.textContent = this.exampleTitle(item);
        button.onclick = () => this.loadExample(item);
        return button;
      }),
    );
    this.updateControls();
  }
  loadExample(item) {
    this.openRecord(
      (signal) => fetchTrace(new URL(item.trace, WEB_ROOT), signal),
      () => t('origin.recorded', { title: this.exampleTitle(item) }),
    );
  }
  async loadManifest() {
    try {
      const response = await fetch(new URL('traces/manifest.json', WEB_ROOT));
      if (!response.ok) throw new UIError('error.manifest');
      this.manifest = await response.json();
      this.renderExamples();
    } catch (error) {
      this.manifest = [];
      this.renderExamples();
      notify(() => t('notice.serving', { error: errorText(error) }), 'error');
    }
  }
}
