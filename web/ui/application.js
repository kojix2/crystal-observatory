import { $, notify, download } from './dom.js';
import { t, onLocaleChange, UIError, errorText } from '../i18n/index.js';
import { messages } from '../i18n/messages.js';
import { text } from './language.js';
import { SourceEditor } from './source-editor.js';
import { TraceView } from './trace-view.js';
import { WorkSession } from '../runtime/session.js';
import { CancelledError, TimeoutError } from '../runtime/worker-client.js';
import { decodeTrace, fetchTrace, emptyTrace } from '../core/trace-io.js';

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
      if (this.editor.dirty) $('example').value = '';
      this.updateControls();
      this.trace?.renderSourceCaption();
    });
    this.trace = new TraceView(this.editor);
    this.session = new WorkSession({ onState: () => this.updateControls() });
    $('compile-run').onclick = () => this.compile(true);
    $('compile-only').onclick = () => this.compile(false);
    $('analyze').onclick = () => this.parse();
    $('cancel-job').onclick = () => {
      if (this.session.cancel()) {
        notify(() => t('notice.cancelled'));
        state('state.cancelled');
      }
    };
    $('rerun').onclick = () => this.execute();
    $('download-wasm').onclick = () => {
      if (this.artifact) download('program.wasm', this.artifact.wasm, 'application/wasm');
    };
    $('example').onchange = () => this.loadExample(false);
    $('recorded').onclick = () => this.loadExample(true);
    $('import').onclick = () => $('file').click();
    $('file').onchange = () => {
      const file = $('file').files[0];
      $('file').value = '';
      if (file) this.openRecord(() => decodeTrace(file), file.name);
    };
    $('guideButton').onclick = () => $('guide').showModal();
    $('close-guide').onclick = () => $('guide').close();
    $('notice').onclick = () => $('status-dialog').showModal();
    $('close-status').onclick = () => $('status-dialog').close();
    onLocaleChange(() => {
      this.renderExamples();
      this.editor.refresh();
      this.trace.localize();
    });
    window.addEventListener('pagehide', () => {
      this.session.dispose();
      this.trace.stop();
    });
    this.showInput(DEFAULT_SOURCE);
  }
  updateControls() {
    const busy = this.session?.busy || false;
    for (const id of ['compile-run', 'compile-only', 'analyze']) $(id).disabled = busy;
    $('cancel-job').disabled = !busy;
    $('rerun').disabled = busy || !this.artifact || this.artifact.source !== this.editor.value;
    $('download-wasm').disabled = !this.artifact;
    $('recorded').disabled = !$('example').value;
  }
  prepare(key = 'state.idle') {
    this.session.cancel();
    this.trace.stop();
    this.artifact = null;
    $('console').textContent = '';
    state(key);
    this.updateControls();
  }
  showInput(source) {
    this.prepare();
    this.trace.load(emptyTrace(source));
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
    // Imported traces can replace the editor with unrelated code. Do not keep
    // offering the previous example's recording as though it matched this input.
    if (this.manifest[Number($('example').value) - 1]?.source !== this.editor.value)
      $('example').value = '';
    this.updateControls();
    if (changed) notify(() => t('notice.changed'), 'warning');
    return !changed;
  }
  async compile(andRun) {
    this.prepare('state.compiling');
    const source = this.editor.value;
    notify(() => t('notice.prepare'));
    try {
      const result = await this.session.compile(source, (data) => {
        if (data.progress != null)
          text('engine', () => t('engine.progress', { percent: Math.round(data.progress * 100) }));
        if (['loading', 'compiling', 'linking'].includes(data.status))
          notify(() => t(`notice.${data.status}`, { detail: data.detail || '' }));
      });
      const current = this.acceptTrace(result.trace, () => t('origin.live'), source, true);
      if (!result.wasm) {
        state('state.compileFailed');
        return;
      }
      this.artifact = { wasm: result.wasm, source };
      state('state.timings', {
        compile: (result.timings.compile / 1000).toFixed(2),
        link: (result.timings.link / 1000).toFixed(2),
      });
      this.updateControls();
      if (andRun && current) await this.execute();
      else this.trace.setView('ir');
    } catch (error) {
      this.showError(error);
    }
  }
  async parse() {
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
    if (!this.artifact || this.artifact.source !== this.editor.value)
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
        () => t('notice.executed', { code: result.exitCode }),
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
      this.acceptTrace(trace, origin, source);
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
    const selection = $('example').value;
    $('example').replaceChildren(
      new Option(t('source.custom'), ''),
      ...this.manifest.map((item, index) => new Option(this.exampleTitle(item), String(index + 1))),
    );
    $('example').value = selection;
    // The empty History doubles as the entry point: one click opens a recording.
    $('start-examples').replaceChildren(
      ...this.manifest.map((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = this.exampleTitle(item);
        button.onclick = () => {
          $('example').value = String(index + 1);
          this.loadExample(true);
        };
        return button;
      }),
    );
    this.updateControls();
  }
  loadExample(recorded) {
    const item = this.manifest[Number($('example').value) - 1];
    if (!item) return;
    // The manifest already contains source: input selection must not fetch and
    // decode a multi-megabyte archived LLVM trace just to fill the editor.
    if (!recorded) this.showInput(item.source);
    else
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
      notify(() => t('notice.serving', { error: errorText(error) }), 'error');
    }
  }
}
