import { t } from '../i18n/index.js';
import { text } from './language.js';
import { $, notify, download } from './dom.js';
import { eventLabel, shortVisitor } from './event-labels.js';
import { TraceModel, revealASTNode } from '../core/trace-model.js';
import { renderGraph } from './graphs.js';
import { renderInspector } from './inspector.js';
import { renderTokens } from './tokens.js';
import { EventList } from './event-list.js';
import { IRView } from './ir-view.js';
import { renderDeclarations } from './declarations.js';

// Selection/playback is a presentation concern. This class never starts Workers.
export class TraceView {
  constructor(editor) {
    this.editor = editor;
    this.selected = 0;
    this.selectedType = 0;
    this.snapshot = 0;
    this.view = 'source';
    this.collapsed = new Set();
    this.events = new EventList((index) => {
      this.stop();
      this.seek(index);
    });
    this.ir = new IRView();
    this.bindControls();
  }
  get trace() {
    return this.model?.trace;
  }

  load(trace, { origin = () => t('origin.input'), preserveEdits = false, live = false } = {}) {
    const model = new TraceModel(trace); // Validate before replacing a usable view.
    this.stop();
    this.model = model;
    this.selected = 0;
    this.selectedType = 0;
    this.snapshot = 0;
    this.collapsed.clear();
    this.editor.setRecord(trace.source, preserveEdits, trace.mode !== 'empty');
    $('export').disabled = trace.mode === 'empty';
    $('follow').checked = true;
    $('snapshot').replaceChildren(...trace.snapshots.map((item, i) => new Option(item.name, i)));
    $('scrubber').max = Math.max(0, trace.events.length - 1);
    text('meta', () =>
      t('count.trace', { events: trace.events.length.toLocaleString(), nodes: trace.nodes.length }),
    );
    const engine = live
      ? 'engine.live'
      : trace.mode === 'full'
        ? 'engine.recorded'
        : trace.mode === 'empty'
          ? 'engine.empty'
          : 'engine.syntax';
    text('engine', () => t(engine));
    $('engine').classList.toggle('syntax', trace.mode !== 'full');
    $('versions').textContent =
      `Engine ${trace.compiler_version} · ${trace.llvm_version ? `LLVM ${trace.llvm_version} · ` : ''}schema ${trace.schema_version}`;
    this.ir.load(trace.llvm_ir || '');
    renderTokens(trace, (node) => this.editor.highlight(node));
    this.events.load(model);
    this.setView(trace.mode === 'empty' ? 'source' : 'ast');
    const firstType = trace.events.findIndex(
      (event) => event.kind === 'type' && event.visitor.includes('MainVisitor'),
    );
    this.seek(firstType >= 0 ? firstType : 0);
    const originText = () => (typeof origin === 'function' ? origin() : origin);
    if (trace.errors?.length) notify(() => `${originText()} · ${trace.errors.join('\n')}`, 'error');
    else if (trace.truncated) notify(() => t('notice.truncated'), 'warning');
    else
      notify(() =>
        live
          ? t('notice.compiled')
          : trace.mode === 'empty'
            ? t('notice.input')
            : t(trace.mode === 'full' ? 'notice.recorded' : 'notice.syntax', {
                origin: originText(),
              }),
      );
  }

  // Redraw presentation only. Do not seek: that would change a manually selected
  // node/snapshot, reset filters or move playback when switching languages.
  localize() {
    this.renderPhase();
    this.events.render();
    this.events.localizeActivities();
    if (this.trace) renderTokens(this.trace, (node) => this.editor.highlight(node));
    this.renderSelection();
  }
  renderPhase() {
    const event = this.model?.event;
    $('phase-status').textContent = event
      ? `${event.phase} / ${shortVisitor(event.visitor)} / ${eventLabel(event.kind)}`
      : t('state.waiting');
  }

  stop() {
    clearInterval(this.playTimer);
    this.playTimer = null;
    $('play').textContent = '▶';
    $('play').dataset.i18nAria = 'play';
    $('play').setAttribute('aria-label', t('play'));
  }
  togglePlay() {
    if (this.playTimer) return this.stop();
    if (!this.trace?.events.length) return;
    if (this.model.index >= this.trace.events.length - 1) this.seek(0);
    $('play').textContent = 'Ⅱ';
    $('play').dataset.i18nAria = 'pause';
    $('play').setAttribute('aria-label', t('pause'));
    this.playTimer = setInterval(
      () => {
        if (this.model.index >= this.trace.events.length - 1) this.stop();
        else this.seek(this.model.index + 1);
      },
      Number($('speed').value),
    );
  }
  seek(index) {
    if (!this.model) return;
    this.model.seek(index);
    const event = this.model.event;
    this.selected = event?.node_id || this.selected;
    if (event?.kind === 'declaration') this.selectedType = event.type_id;
    if ($('follow').checked) {
      this.snapshot = this.model.snapshotAt();
      $('snapshot').value = this.snapshot;
    }
    $('scrubber').value = Math.max(0, this.model.index);
    $('position').textContent = `${this.model.index + 1} / ${this.trace.events.length}`;
    this.renderPhase();
    this.events.follow();
    if (this.view === 'ir') this.ir.follow(event?.llvm_function, event?.llvm_block);
    this.renderSelection();
    if (this.view === 'declarations' && event?.kind === 'declaration')
      $('declarations')
        .querySelector('.declaration-details .declaration-changed')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  selectNode(id) {
    this.selected = id;
    const declaration = this.trace.events.findLast(
      (event) =>
        event.index <= this.model.index && event.kind === 'declaration' && event.node_id === id,
    );
    if (declaration) this.selectedType = declaration.type_id;
    this.renderSelection();
  }
  selectType(id) {
    this.selectedType = id;
    const state = this.model.declarations.get(id);
    const site = state?.declarations.at(-1);
    if (site) this.selected = site.node_id;
    this.setView('declarations');
    this.renderSelection();
  }
  selectDeclarationNode(id, view = 'source') {
    if (view === 'ast') {
      const snapshot = this.model.snapshotForNode(id, this.snapshot);
      if (snapshot >= 0) {
        if (snapshot !== this.snapshot) {
          this.snapshot = snapshot;
          $('snapshot').value = snapshot;
          $('follow').checked = false;
        }
        revealASTNode(this.trace.snapshots[snapshot], id, this.collapsed);
      }
    }
    this.selectNode(id);
    this.setView(view);
    if (view === 'ast')
      $('graph')
        .querySelector(`.node[data-node="${id}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  renderSelection() {
    if (!this.model) return;
    this.renderObservation();
    renderInspector(
      this.model,
      this.selected,
      (id) => this.selectNode(id),
      (id) => this.selectType(id),
      (index) => {
        this.stop();
        const selected = this.selected;
        this.seek(index);
        this.selectNode(selected);
      },
      (event) => {
        if (!this.ir.functions.some((fn) => fn.name === event.llvm_function)) {
          notify(() => t('ir.noMatch'), 'warning');
          return;
        }
        this.setView('ir');
        this.ir.follow(event.llvm_function, event.llvm_block);
      },
    );
    this.editor.highlight(this.model.nodes.get(this.selected));
  }
  renderObservation() {
    if (!this.model) return;
    this.ir.visible = this.view === 'ir';
    if (this.ir.visible) {
      this.ir.render();
      return;
    }
    if (this.view === 'source') {
      $('graph-caption').textContent = t('source.caption');
      this.editor.scroll();
      return;
    }
    if (this.view === 'run') {
      $('graph-caption').textContent = t('graph.runCaption');
      return;
    }
    if (this.view === 'tokens') {
      $('graph-caption').textContent = t('graph.tokenCaption');
      return;
    }
    if (this.view === 'declarations') {
      renderDeclarations(this.model, this.selectedType, {
        onType: (id) => this.selectType(id),
        onNode: (id, view) => this.selectDeclarationNode(id, view),
        onSeek: (index) => {
          this.stop();
          this.seek(index);
        },
      });
      return;
    }
    renderGraph(
      this,
      (id) => this.selectNode(id),
      (id) => {
        this.collapsed.has(id) ? this.collapsed.delete(id) : this.collapsed.add(id);
        this.renderObservation();
      },
      (index) => {
        this.stop();
        const selected = this.selected;
        this.seek(index);
        this.selectNode(selected);
      },
    );
  }
  setView(name) {
    this.view = name;
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active);
      button.tabIndex = active ? 0 : -1;
    });
    for (const [view, id] of Object.entries({
      source: 'source-view',
      ast: 'graph',
      types: 'types',
      declarations: 'declarations',
      tokens: 'token-view',
      ir: 'ir-view',
      run: 'run-view',
    }))
      $(id).hidden = view !== name;
    document.querySelector('.view-tools').style.display = name === 'ast' ? 'flex' : 'none';
    this.renderObservation();
  }
  nextKind(kind) {
    if (!this.model) return;
    this.stop();
    const index = this.trace.events.findIndex(
      (event) =>
        event.index > this.model.index &&
        (event.kind === kind || (kind === 'rewrite' && event.kind === 'expand')),
    );
    if (index >= 0) this.seek(index);
    else notify(() => t('notice.noNext'));
  }
  moveNode(direction) {
    if (!this.model) return;
    const events = this.model.eventsFor(this.selected);
    const event =
      direction > 0
        ? events.find((event) => event.index > this.model.index)
        : events.findLast((event) => event.index < this.model.index);
    if (event) {
      this.stop();
      this.seek(event.index);
    }
  }
  bindControls() {
    for (const [id, index] of [
      ['first', () => 0],
      ['prev', () => this.model.index - 1],
      ['next', () => this.model.index + 1],
    ])
      $(id).onclick = () => {
        if (this.model) {
          this.stop();
          this.seek(index());
        }
      };
    $('play').onclick = () => this.togglePlay();
    $('speed').onchange = () => {
      if (this.playTimer) {
        this.stop();
        this.togglePlay();
      }
    };
    $('scrubber').oninput = () => {
      this.stop();
      this.seek(Number($('scrubber').value));
    };
    for (const [id, kind] of [
      ['next-type', 'type'],
      ['next-rewrite', 'rewrite'],
      ['next-phase', 'phase_enter'],
      ['next-declaration', 'declaration'],
      ['next-activity', 'activity'],
    ])
      $(id).onclick = () => {
        if (kind === 'declaration') this.setView('declarations');
        this.nextKind(kind);
      };
    $('snapshot').onchange = () => {
      this.snapshot = Number($('snapshot').value);
      $('follow').checked = false;
      this.renderObservation();
    };
    $('follow').onchange = () => {
      if ($('follow').checked) this.seek(this.model.index);
      else this.renderObservation();
    };
    $('expand').onclick = () => {
      this.collapsed.clear();
      this.renderObservation();
    };
    $('node-filter').onclick = () => this.events.filter(this.selected);
    $('node-next').onclick = () => this.moveNode(1);
    $('node-prev').onclick = () => this.moveNode(-1);
    $('download-ir').onclick = () => {
      if (this.trace?.llvm_ir) download('crystal-observatory.ll', this.trace.llvm_ir, 'text/plain');
    };
    $('export').onclick = () => {
      if (this.trace) download('crystal-observatory-trace.json', JSON.stringify(this.trace));
    };
    document
      .querySelectorAll('[data-view]')
      .forEach((button) => (button.onclick = () => this.setView(button.dataset.view)));
    const tabs = [...document.querySelectorAll('[data-view]')];
    tabs.forEach((tab, i) =>
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        this.setView(tabs[next].dataset.view);
        tabs[next].focus();
      }),
    );
    document.addEventListener('keydown', (event) => {
      if (
        !this.model ||
        event.defaultPrevented ||
        event.target.getAttribute('role') === 'separator' ||
        ['TEXTAREA', 'INPUT', 'SELECT', 'BUTTON'].includes(event.target.tagName) ||
        document.querySelector('dialog[open]')
      )
        return;
      if (['ArrowRight', 'ArrowLeft'].includes(event.key)) {
        event.preventDefault();
        this.stop();
        this.seek(this.model.index + (event.key === 'ArrowRight' ? 1 : -1));
      }
      if (event.code === 'Space') {
        event.preventDefault();
        this.togglePlay();
      }
    });
  }
}
