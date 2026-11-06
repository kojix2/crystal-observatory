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
import { indexCompilerStages } from '../core/compiler-stages.js';
import { renderCompilerMap } from './compiler-map.js';
import { ViewLayout, comparisonTargets, viewLabel, viewLabelKey } from '../core/view-layout.js';

const scrollTargets = {
  source: 'source',
  ast: 'graph',
  types: 'types',
  declarations: 'declarations',
  tokens: 'token-view',
  ir: 'ir-code',
  run: 'console',
};
const label = (view) => viewLabel(view) || t(viewLabelKey(view));

// Selection/playback is a presentation concern. This class never starts Workers.
export class TraceView {
  constructor(editor) {
    this.editor = editor;
    this.selected = 0;
    this.selectedType = 0;
    this.snapshot = 0;
    this.view = 'source';
    this.scrollPositions = new Map();
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
  get view() {
    return this.layout?.primary || 'source';
  }
  set view(name) {
    this.layout ??= new ViewLayout();
    this.layout.show(name);
  }

  load(trace, { origin = () => t('origin.input'), preserveEdits = false, live = false } = {}) {
    const model = new TraceModel(trace); // Validate before replacing a usable view.
    this.stop();
    this.model = model;
    this.stageRecords = indexCompilerStages(trace);
    this.selectedStage = null;
    this.selected = 0;
    this.selectedType = 0;
    this.snapshot = 0;
    this.collapsed.clear();
    this.editor.setRecord(trace.source, preserveEdits, trace.mode !== 'empty');
    $('app').classList.toggle('trace-empty', trace.mode === 'empty');
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
    this.scrollPositions.clear();
    if (!this.layout.secondary) this.view = trace.mode === 'empty' ? 'source' : 'ast';
    this.applyLayout({ remember: false });
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
    this.renderComparisonControls();
    this.renderPhase();
    this.events.render();
    this.events.localizeActivities();
    if (this.trace) renderTokens(this.trace, (node) => this.editor.highlight(node));
    this.renderSelection({ reveal: false });
  }
  renderPhase() {
    const event = this.model?.event;
    const workflowHidden = $('workflow-column').hidden;
    renderCompilerMap(
      this.model,
      this.stageRecords,
      (index) => {
        this.stop();
        this.seek(index);
      },
      { selectedStage: this.selectedStage, onSelectStage: (id) => this.selectStage(id) },
    );
    if (workflowHidden !== $('workflow-column').hidden) this.workspace?.refresh();
    $('phase-status').textContent = this.selectedStage
      ? `${t(`pipeline.stage.${this.selectedStage}`)} / ${t('pipeline.unrecordedShort')}`
      : event
        ? `${event.phase} / ${shortVisitor(event.visitor)} / ${eventLabel(event.kind)}`
        : t('state.waiting');
  }

  stop() {
    clearInterval(this.playTimer);
    this.playTimer = null;
    $('play').textContent = '▶';
    $('play').dataset.i18nAria = 'play';
    $('play').dataset.i18nTitle = 'play';
    $('play').setAttribute('aria-label', t('play'));
    $('play').title = t('play');
  }
  togglePlay() {
    if (this.playTimer) return this.stop();
    if (!this.trace?.events.length) return;
    if (this.model.index >= this.trace.events.length - 1) this.seek(0);
    $('play').textContent = '⏸';
    $('play').dataset.i18nAria = 'pause';
    $('play').dataset.i18nTitle = 'pause';
    $('play').setAttribute('aria-label', t('pause'));
    $('play').title = t('pause');
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
    this.selectedStage = null;
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
    if (this.layout.has('ir')) this.ir.follow(event?.llvm_function, event?.llvm_block);
    this.renderSelection();
    if (this.view === 'declarations' && event?.kind === 'declaration')
      $('declarations')
        .querySelector('.declaration-details .declaration-changed')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  selectStage(id) {
    this.stop();
    this.selectedStage = id;
    this.renderPhase();
    this.renderSelection({ reveal: false });
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
  renderSelection({ reveal = true } = {}) {
    if (!this.model) return;
    this.renderObservation({ reveal });
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
        this.ir.follow(event.llvm_function, event.llvm_block, true);
      },
      this.selectedStage,
    );
    this.editor.highlight(this.model.nodes.get(this.selected));
  }
  renderSourceCaption() {
    $('source-caption').textContent = t(
      this.editor.hasRecord && this.editor.dirty ? 'comparison.sourceStale' : 'source.caption',
    );
  }
  renderObservation({ reveal = false } = {}) {
    if (!this.model) return;
    this.ir.visible = this.layout.has('ir');
    for (const view of this.layout.views) {
      const root = $(`${view}-view`);
      const focused = document.activeElement?.closest?.('[data-node]');
      const focusedNode = focused && root.contains(focused) ? focused.dataset.node : null;
      this.renderView(view, reveal);
      if (focusedNode)
        root.querySelector(`[data-node="${focusedNode}"]`)?.focus({ preventScroll: true });
    }
  }
  renderView(view, reveal) {
    if (view === 'source') {
      this.renderSourceCaption();
      this.editor.scroll();
    } else if (view === 'ir') {
      this.ir.render();
    } else if (view === 'run' || view === 'tokens') {
      $(`${view}-caption`).textContent = t(
        view === 'run' ? 'graph.runCaption' : 'graph.tokenCaption',
      );
    } else if (view === 'declarations') {
      renderDeclarations(this.model, this.selectedType, {
        onType: (id) => this.selectType(id),
        onNode: (id, target) => this.selectDeclarationNode(id, target),
        onSeek: (index) => {
          this.stop();
          this.seek(index);
        },
      });
    } else {
      renderGraph(
        {
          model: this.model,
          selected: this.selected,
          snapshot: this.snapshot,
          view,
          collapsed: this.collapsed,
          reveal,
        },
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
  }
  rememberScroll() {
    for (const [view, id] of Object.entries(scrollTargets)) {
      if ($(`${view}-view`).hidden) continue;
      const element = $(id);
      this.scrollPositions.set(view, [element.scrollLeft, element.scrollTop]);
    }
  }
  renderComparisonControls() {
    const comparing = Boolean(this.layout.secondary);
    for (const view of Object.keys(scrollTargets))
      $(`${view}-view`).setAttribute('aria-label', label(view));
    $('compare-view').replaceChildren(
      new Option(t(comparing ? 'comparison.close' : 'comparison.open'), ''),
      ...comparisonTargets(this.view).map((view) => new Option(label(view), view)),
    );
    $('compare-view').value = this.layout.secondary || '';
    $('compare-view').disabled = !comparisonTargets(this.view).length;
    $('comparison-title').textContent = comparing
      ? `${label(this.view)} / ${label(this.layout.secondary)}`
      : '';
  }
  applyLayout({ remember = true } = {}) {
    if (remember) this.rememberScroll();
    const comparing = Boolean(this.layout.secondary);
    $('app').classList.toggle('comparing', comparing);
    $('view-tabs').hidden = comparing;
    $('comparison-title').hidden = !comparing;
    $('comparison-splitter').hidden = !comparing;
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === this.view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active);
      button.tabIndex = active ? 0 : -1;
    });
    for (const view of Object.keys(scrollTargets)) {
      const root = $(`${view}-view`);
      root.hidden = !this.layout.has(view);
      root.dataset.slot = view === this.layout.secondary ? 'secondary' : 'primary';
      root.setAttribute('role', comparing ? 'region' : 'tabpanel');
      if (comparing) root.removeAttribute('aria-labelledby');
      else root.setAttribute('aria-labelledby', `tab-${view}`);
    }
    if (comparing)
      $('comparison-splitter').setAttribute(
        'aria-controls',
        `${this.view}-view ${this.layout.secondary}-view`,
      );
    this.renderComparisonControls();
    this.workspace?.refresh();
    if (this.layout.has('ir') && !this.ir.visible)
      this.ir.follow(this.model?.event?.llvm_function, this.model?.event?.llvm_block);
    this.renderObservation();
    for (const view of this.layout.views) {
      const scroll = this.scrollPositions.get(view);
      if (scroll) {
        $(scrollTargets[view]).scrollLeft = scroll[0];
        $(scrollTargets[view]).scrollTop = scroll[1];
      }
    }
  }
  beginComparison(view) {
    if (!comparisonTargets(this.view).includes(view)) return;
    if (!this.layout.secondary) this.workspaceBeforeComparison = this.workspace?.capture();
    this.layout.compare(view);
    this.applyLayout();
  }
  endComparison({ focus = true } = {}) {
    if (!this.layout.secondary) return;
    this.layout.close();
    this.applyLayout();
    if (this.workspaceBeforeComparison) this.workspace?.restore(this.workspaceBeforeComparison);
    this.workspaceBeforeComparison = null;
    if (focus) $(`tab-${this.view}`).focus({ preventScroll: true });
  }
  setView(name) {
    if (this.layout.secondary && this.layout.has(name)) {
      const target = name === 'source' ? $('source') : $(scrollTargets[name]);
      target.tabIndex = name === 'source' ? target.tabIndex : -1;
      target.focus({ preventScroll: true });
      return;
    }
    if (this.layout.secondary) this.endComparison({ focus: false });
    this.layout.show(name);
    this.applyLayout();
  }
  nextKind(kind) {
    if (!this.model) return;
    this.stop();
    const index = this.trace.events.findIndex(
      (event) =>
        event.index > this.model.index &&
        (event.kind === kind ||
          (kind === 'rewrite' && event.kind === 'expand') ||
          (kind === 'phase_enter' && event.kind === 'link')),
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
    $('compare-view').onchange = (event) => {
      if (event.target.value) this.beginComparison(event.target.value);
      else this.endComparison();
    };
    for (const [id, index] of [
      ['first', () => 0],
      ['prev', () => this.model.index - 1],
      ['next', () => this.model.index + 1],
      ['last', () => this.trace.events.length - 1],
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
