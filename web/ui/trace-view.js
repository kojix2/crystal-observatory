import { t } from '../i18n/index.js';
import { text } from './language.js';
import { $, notify, download, downloadBlob } from './dom.js';
import { setIcon } from './icons.js';
import { AstRecorder, astMarker } from './ast-recorder.js';
import { TraceModel, revealASTNode } from '../core/trace-model.js';
import { renderGraph } from './graphs.js';
import { renderVisitorSpeech } from './visitor-speech.js';
import { currentSpeechCue, SpeechSound } from './speech-sound.js';
import { visitation, nextVisit } from '../core/visitation.js';
import { bindGraphNavigation, zoomGraphAt } from './graph-navigation.js';
import { renderInspector } from './inspector.js';
import { setupNodeTabs } from './node-tabs.js';
import { setupEventTabs } from './event-tabs.js';
import { renderTokens, TOKEN_DISPLAY_LIMIT } from './tokens.js';
import { EventList } from './event-list.js';
import { IRView } from './ir-view.js';
import { renderDeclarations } from './declarations.js';
import { isStateObservation, stateObservation } from '../core/compiler-state.js';
import { ViewLayout, comparisonTargets, viewLabel, viewLabelKey } from '../core/view-layout.js';
import { compilerVersionSummary } from '../core/compiler-version.js';

const scrollTargets = {
  source: 'source',
  ast: 'graph',
  types: 'types',
  declarations: 'declarations',
  tokens: 'token-view',
  ir: 'ir-code',
};
const label = (view) => viewLabel(view) || t(viewLabelKey(view));
const AST_LAYOUT_KEY = 'crystal-observatory.ast-layout.v1';
const SPEECH_SOUND_KEY = 'crystal-observatory.speech-sound.v1';

// Selection/playback is a presentation concern. This class never starts Workers.
export class TraceView {
  constructor(editor) {
    this.editor = editor;
    this.selected = 0;
    this.selectedType = 0;
    this.stateSection = 'holders';
    this.stateExpanded = new Set();
    this.snapshot = 0;
    this.view = 'source';
    this.scrollPositions = new Map();
    this.pendingReveals = new Set();
    this.collapsed = new Set();
    this.astLayout = 'inline';
    this.astZoom = 1;
    this.typesZoom = 1;
    this.speechSound = new SpeechSound();
    this.astRecorder = new AstRecorder({
      onSave: (blob, extension) => {
        downloadBlob(`crystal-observatory-ast.${extension}`, blob, 60_000);
        notify(() => t('playback.videoSaved'));
      },
      onStop: () => {
        this.updateRecordButton();
        if (this.playback?.recording) this.stop();
      },
      onError: () => {
        if (this.playback?.recording) this.stop();
        notify(() => t('playback.videoError'), 'error');
      },
    });
    this.soundEnabled = false;
    try {
      const saved = localStorage.getItem(AST_LAYOUT_KEY);
      if (['inline', 'cards', 'mindmap', 'radial'].includes(saved)) this.astLayout = saved;
      this.soundEnabled = localStorage.getItem(SPEECH_SOUND_KEY) === 'on';
    } catch {
      /* Optional preference. */
    }
    $('speech-sound').checked = this.soundEnabled;
    $('settings-speech-sound').checked = this.soundEnabled;
    this.events = new EventList(
      (index) => this.selectEvent(index),
      () => this.stop(),
    );
    this.ir = new IRView();
    this.nodeTabs = setupNodeTabs();
    this.eventTabs = setupEventTabs();
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
    // Hidden views are rendered on demand. Drop their old DOM/handlers now so
    // they cannot retain a previous recording until the user opens them again.
    for (const id of ['graph', 'types', 'declarations']) $(id).replaceChildren();
    delete $('declarations').stateTrace;
    this.model = model;
    this.selected = 0;
    this.selectedType = 0;
    this.stateSection = 'holders';
    this.stateExpanded = new Set();
    this.snapshot = 0;
    this.collapsed.clear();
    for (const event of model.generatedChanges) this.collapsed.add(event.generated_tree.roots[0]);
    this.astZoom = 1;
    this.typesZoom = 1;
    this.editor.setRecord(trace.source, preserveEdits, trace.mode !== 'empty', trace.filename);
    $('app').classList.toggle('trace-empty', trace.mode === 'empty');
    $('export').disabled = trace.mode === 'empty';
    $('follow').checked = true;
    $('snapshot').replaceChildren(...trace.snapshots.map((item, i) => new Option(item.name, i)));
    $('scrubber').max = Math.max(0, trace.events.length - 1);
    for (const id of ['play', 'scrubber', 'playback-options'])
      $(id).disabled = !trace.events.length;
    this.updateRecordButton();
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
    $('versions').textContent = compilerVersionSummary(trace);
    this.ir.load(trace.llvm_ir || '', trace.mode === 'full' ? trace.prelude : null);
    renderTokens(
      trace,
      (node) => this.editor.highlight(node),
      () => {
        this.editor.pendingReveal = true;
        this.setView('source');
        this.editor.scroll();
      },
    );
    this.events.load(model);
    this.scrollPositions.clear();
    this.pendingReveals.clear();
    if (!this.layout.secondary) this.view = trace.mode === 'empty' ? 'source' : 'ast';
    this.applyLayout({ remember: false });
    const firstType = trace.events.findIndex(
      (event) => event.kind === 'type' && event.visitor?.includes('MainVisitor'),
    );
    this.seek(firstType >= 0 ? firstType : 0);
    const originText = () => (typeof origin === 'function' ? origin() : origin);
    if (trace.errors?.length) notify(() => `${originText()} · ${trace.errors.join('\n')}`, 'error');
    else if (trace.truncated) notify(() => t('notice.truncated'), 'warning');
    else
      notify(() =>
        trace.mode === 'empty'
          ? ''
          : !live && trace.mode === 'full'
            ? t('notice.recorded', { origin: originText() })
            : t('notice.done'),
      );
  }

  // Redraw presentation only. Do not seek: that would change a manually selected
  // node/snapshot, reset filters or move playback when switching languages.
  localize() {
    this.renderComparisonControls();
    this.events.filter(this.events.nodeFilter, { preservePosition: true });
    this.events.localizeActivities();
    if (this.trace)
      renderTokens(
        this.trace,
        (node) => this.editor.highlight(node),
        () => {
          this.editor.pendingReveal = true;
          this.setView('source');
          this.editor.scroll();
        },
      );
    this.renderSelection({ reveal: false });
    this.revealActiveTab();
  }
  stop() {
    this.recordingRequest = null;
    this.playback = null;
    clearInterval(this.playTimer);
    this.playTimer = null;
    this.astRecorder?.stop();
    this.updateRecordButton();
    this.speechSound?.stop();
    setIcon($('play'), 'play');
    $('play').dataset.i18nAria = 'play';
    $('play').dataset.i18nTitle = 'play';
    $('play').setAttribute('aria-label', t('play'));
    $('play').title = t('play');
  }
  updateRecordButton() {
    const button = $('record-video');
    const recording = this.astRecorder?.recorder?.state === 'recording';
    button.disabled =
      !this.trace?.events.length ||
      this.recordPending ||
      this.astRecorder?.stopping ||
      this.astRecorder?.recorder?.state === 'inactive' ||
      !AstRecorder.supported();
    button.dataset.i18nAria = recording ? 'playback.stopVideo' : 'playback.recordVideo';
    button.dataset.i18nTitle = button.dataset.i18nAria;
    button.setAttribute('aria-label', t(button.dataset.i18nAria));
    button.title = t(button.dataset.i18nTitle);
    button.classList.toggle('recording', recording);
    setIcon(button, recording ? 'stop' : 'record');
  }
  async recordVideo() {
    if (this.recordPending) return;
    if (this.astRecorder.recorder?.state === 'recording') return this.stop();
    if (this.astRecorder.recorder) return;
    if (!this.trace?.events.length || !AstRecorder.supported()) return;
    this.stop();
    this.setView('ast');
    if (this.model.index >= this.trace.events.length - 1) this.seek(0);
    const request = Symbol('recording');
    this.recordingRequest = request;
    this.recordPending = true;
    this.updateRecordButton();
    try {
      const started = await this.astRecorder.start(
        $('graph'),
        () => this.recordingRequest === request,
      );
      if (started) {
        this.recordPending = false;
        this.updateRecordButton();
        this.togglePlay();
      }
    } catch (error) {
      this.stop();
      notify(() => t('playback.videoError'), 'error');
    } finally {
      this.recordPending = false;
      if (this.recordingRequest === request) this.recordingRequest = null;
      this.updateRecordButton();
    }
  }
  setSpeechSoundEnabled(enabled) {
    this.soundEnabled = enabled;
    $('speech-sound').checked = enabled;
    $('settings-speech-sound').checked = enabled;
    let saved = true;
    try {
      localStorage.setItem(SPEECH_SOUND_KEY, enabled ? 'on' : 'off');
    } catch {
      saved = false;
    }
    if (enabled && this.playTimer) this.speechSound.activate();
    else if (!enabled) this.speechSound.stop();
    return saved;
  }
  togglePlay() {
    if (this.playTimer) return this.stop();
    if (!this.trace?.events.length) return;
    if (this.model.index >= this.trace.events.length - 1) this.seek(0);
    if (this.soundEnabled) this.speechSound.activate();
    setIcon($('play'), 'pause');
    $('play').dataset.i18nAria = 'pause';
    $('play').dataset.i18nTitle = 'pause';
    $('play').setAttribute('aria-label', t('pause'));
    $('play').title = t('pause');
    const speed = () =>
      Number(document.querySelector('input[name="playback-speed"]:checked').value);
    const playback = {
      recording: this.astRecorder?.recorder?.state === 'recording' && !this.astRecorder.stopping,
    };
    this.playback = playback;
    const step = () => {
      if (this.playback !== playback) return false;
      if (this.model.index >= this.trace.events.length - 1) {
        this.stop();
        return false;
      }
      this.seek(this.model.index + 1);
      if (this.soundEnabled && this.layout.has('ast')) {
        const cue = currentSpeechCue(
          this.model,
          Boolean($('graph').querySelector('.visitor-speech')),
        );
        if (cue) this.speechSound.play(cue);
      }
      return true;
    };
    if (playback.recording) {
      const recordedStep = async () => {
        if (this.playback !== playback) return;
        const previous = astMarker($('graph'));
        if (!step()) return;
        try {
          await this.astRecorder.capture($('graph'), previous, Math.max(240, speed()));
        } catch {
          if (this.playback !== playback) return;
          this.stop();
          notify(() => t('playback.videoError'), 'error');
          return;
        }
        if (this.playback === playback) this.playTimer = setTimeout(recordedStep, 0);
      };
      this.playTimer = setTimeout(recordedStep, Math.max(240, speed()));
    } else {
      this.playTimer = setInterval(step, speed());
    }
  }
  seek(index, stageRoots) {
    if (!this.model) return;
    this.model.seek(index);
    const event = this.model.event;
    this.workspace?.setDetailContext?.('event', event);
    if (
      !stageRoots &&
      event?.phase === 'Semantic (new)' &&
      (event.kind === 'phase_enter' || event.kind === 'phase_leave')
    ) {
      stageRoots = new Set(this.model.generatedTreesAt().keys());
    }
    this.selectedStageRoots = stageRoots;
    this.selected = stageRoots
      ? stageRoots.values().next().value || 0
      : event?.generated_tree?.roots[0] || event?.node_id || this.selected;
    if (event?.kind === 'declaration') {
      this.selectedType = event.type_id;
      if (this.stateSection !== 'holders') this.stateSection = 'types';
    } else if (event) {
      const observation = stateObservation(event);
      if (observation && isStateObservation(observation) && this.stateSection !== 'holders')
        this.stateSection = observation.category;
    }
    if ($('follow').checked) {
      this.snapshot = this.model.snapshotAt();
      const focus = visitation(this.model).focus;
      if (focus) {
        const snapshot = this.model.snapshotForNode(focus.node_id, this.snapshot);
        if (snapshot >= 0) {
          this.snapshot = snapshot;
          if (this.collapsed.size)
            revealASTNode(this.trace.snapshots[snapshot], focus.node_id, this.collapsed);
        }
      }
      $('snapshot').value = this.snapshot;
    }
    $('scrubber').value = Math.max(0, this.model.index);
    $('position').textContent = `${this.model.index + 1} / ${this.trace.events.length}`;
    this.events.follow();
    if (this.layout.has('ir')) this.ir.follow(event?.llvm_function, event?.llvm_block);
    this.renderSelection();
    if (this.layout.has('declarations') && event?.kind === 'declaration')
      $('declarations')
        .querySelector(
          '.state-type-slot.declaration-changed, .declaration-details .declaration-changed',
        )
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (this.layout.has('declarations') && event?.kind === 'activity')
      $('declarations')
        .querySelector('.compiler-state .declaration-changed')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  selectEvent(index) {
    this.stop();
    const event = this.trace?.events[index];
    let stageRoots;
    if (event?.kind === 'phase_enter') {
      if (event.phase === 'Semantic (new)') {
        const stage = this.model.constructorStageAt(index);
        index = stage.index;
        stageRoots = stage.roots;
      } else {
        const first = nextVisit({ trace: this.trace, event, index });
        if (first >= 0) index = first;
      }
    }
    this.seek(index, stageRoots);
    const node = this.model?.event?.node_id;
    if ($('follow').checked) {
      const generated = stageRoots?.size || this.model.event?.generated_tree;
      const snapshot = !generated && node ? this.model.snapshotForNode(node, this.snapshot) : -1;
      if (snapshot >= 0) {
        this.snapshot = snapshot;
        $('snapshot').value = snapshot;
        revealASTNode(this.trace.snapshots[snapshot], node, this.collapsed);
      }
      if (generated || snapshot >= 0) {
        if (!this.layout.has('ast')) this.setView('ast', { reveal: false });
        this.renderObservation({ reveal: true });
      }
    }
    if (node) this.showNodeEventTab();
    this.workspace?.showPane('details', { focus: true });
  }
  showNodeEventTab() {
    const event = this.model.event;
    this.nodeTabs?.show(
      event?.kind === 'ir' || event?.activity === 'emit_instructions'
        ? 'ir'
        : event?.kind === 'activity'
          ? 'activities'
          : 'overview',
    );
  }
  selectNode(id) {
    this.selectedStageRoots = undefined;
    this.selected = id;
    this.workspace?.setDetailContext?.('node', this.model.nodes.get(id) || id);
    const declaration = this.trace.events.findLast(
      (event) =>
        event.index <= this.model.index && event.kind === 'declaration' && event.node_id === id,
    );
    if (declaration) this.selectedType = declaration.type_id;
    this.renderSelection();
  }
  selectType(id) {
    this.selectedStageRoots = undefined;
    this.stateSection = 'types';
    this.selectedType = id;
    const state = this.model.declarations.get(id);
    const site = state?.declarations.at(-1);
    if (site) this.selected = site.node_id;
    this.workspace?.setDetailContext?.(
      'node',
      this.model.nodes.get(this.selected) || this.selected,
    );
    this.setView('declarations');
    this.renderSelection();
  }
  selectDeclarationNode(id, view = 'source') {
    if (view === 'ast' && this.model.generatedTreesAt().has(id)) {
      this.collapsed.delete(id);
      $('follow').checked = true;
      this.snapshot = this.model.snapshotAt();
      $('snapshot').value = this.snapshot;
    } else if (view === 'ast') {
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
    this.nodeTabs?.update(this.model, this.selected);
    this.eventTabs?.update(this.model);
    this.renderObservation({ reveal });
    renderInspector(
      this.model,
      this.selected,
      (id) => this.selectNode(id),
      (id) => this.selectType(id),
      (index) => {
        this.stop();
        const selected = this.selected;
        const tab = this.nodeTabs?.current;
        this.seek(index);
        this.selectNode(selected);
        this.nodeTabs?.show(tab);
        if (tab === 'activities')
          $('node-activities')
            .querySelector(`[data-index="${index}"]`)
            ?.focus({ preventScroll: true });
      },
      (event) => {
        if (!this.ir.functions.some((fn) => fn.name === event.llvm_function)) {
          notify(() => t('ir.noMatch'), 'warning');
          return;
        }
        this.setView('ir');
        this.ir.follow(event.llvm_function, event.llvm_block, true);
      },
      (node) => {
        this.editor.highlight(node);
        this.editor.pendingReveal = true;
        this.setView('source');
      },
      this.model
        .generatedTreesAt(this.layout.has('ast') ? this.generatedIndex() : this.model.index)
        .get(this.selected)?.event.generated_tree.nodes[0],
    );
    this.editor.highlight(this.model.nodes.get(this.selected));
  }
  generatedIndex() {
    return $('follow').checked
      ? this.model.index
      : (this.trace.snapshots[this.snapshot]?.at_event ?? 0) - 1;
  }
  renderSourceCaption() {
    const stale = this.editor.hasRecord && this.editor.dirty;
    $('source-caption').hidden = !stale;
    $('source-caption').textContent = stale ? t('comparison.sourceStale') : '';
  }
  renderObservation({ reveal = false } = {}) {
    if (!this.model) return;
    this.pendingReveals ??= new Set();
    if (reveal) for (const view of ['ast', 'types']) this.pendingReveals.add(view);
    const visible = !this.workspace?.mobile || $('app').dataset.mobilePane === 'work';
    this.ir.visible = this.layout.has('ir');
    for (const view of this.layout.views) {
      const root = $(`${view}-view`);
      const focused = document.activeElement?.closest?.('[data-node]');
      const focusedNode = focused && root.contains(focused) ? focused.dataset.node : null;
      this.renderView(view, visible && this.pendingReveals.has(view));
      if (visible) this.pendingReveals.delete(view);
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
    } else if (view === 'tokens') {
      const total = this.trace.tokens?.length || 0;
      $('tokens-caption').textContent =
        (total > TOKEN_DISPLAY_LIMIT
          ? `${t('token.showing', { shown: TOKEN_DISPLAY_LIMIT.toLocaleString(), total: total.toLocaleString() })} · `
          : '') + t('graph.tokenCaption');
    } else if (view === 'declarations') {
      renderDeclarations(this.model, this.selectedType, {
        section: this.stateSection,
        expanded: (this.stateExpanded ??= new Set()),
        onSection: (section) => {
          this.stateSection = section;
          this.renderObservation();
        },
        onType: (id) => this.selectType(id),
        onNode: (id, target) => this.selectDeclarationNode(id, target),
        onSeek: (index) => {
          this.stop();
          this.seek(index);
        },
      });
    } else if (view === 'ast' || view === 'types') {
      let forest;
      if (view === 'ast') {
        forest = this.model.astForest(this.snapshot, this.generatedIndex());
        const radial = this.astLayout === 'radial';
        $('ast-layout').value = this.astLayout || 'inline';
        $('ast-radial-controls').hidden = !['radial', 'mindmap'].includes(this.astLayout);
        $('ast-zoom-label').hidden = !radial;
        $('ast-zoom').hidden = !radial;
        $('ast-zoom').value = (this.astZoom || 1) * 100;
        $('ast-zoom-value').value = `${Number(((this.astZoom || 1) * 100).toPrecision(3))}%`;
        $('expand').hidden = radial || !forest?.nodes.some((node) => this.collapsed.has(node.id));
      }
      if (view === 'types')
        $('types-zoom-value').value = `${Number(((this.typesZoom || 1) * 100).toPrecision(3))}%`;
      renderGraph(
        {
          model: this.model,
          forest,
          selectedStageRoots: this.selectedStageRoots,
          selected: this.selected,
          snapshot: this.snapshot,
          view,
          collapsed: this.collapsed,
          reveal,
          astLayout: this.astLayout,
          astZoom: this.astZoom,
          typesZoom: this.typesZoom,
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
  zoomAST(zoom, point) {
    const graph = $('graph'),
      previous = this.astZoom || 1,
      x = graph.scrollLeft + graph.clientWidth / 2,
      y = graph.scrollTop + graph.clientHeight / 2;
    this.astZoom = Math.max(
      this.astLayout === 'mindmap' ? 0.000001 : 1,
      Math.min(8, Number(zoom) || 1),
    );
    if (point) {
      zoomGraphAt(
        graph,
        '.mindmap-svg',
        this.astZoom / previous,
        () => this.renderView('ast', false),
        point,
      );
      this.refreshVisitorSpeech();
      return;
    }
    this.renderObservation();
    graph.scrollLeft =
      this.astLayout === 'radial' && this.astZoom === 1
        ? 0
        : (x * this.astZoom) / previous - graph.clientWidth / 2;
    graph.scrollTop =
      this.astLayout === 'radial' && this.astZoom === 1
        ? 0
        : (y * this.astZoom) / previous - graph.clientHeight / 2;
    this.refreshVisitorSpeech();
  }
  refreshVisitorSpeech() {
    const graph = $('graph');
    graph.querySelector?.('.visitor-speech')?.remove();
    if (this.model) renderVisitorSpeech(graph, this.model, visitation(this.model));
  }
  syncVisitorSpeechVisibility() {
    const graph = $('graph'),
      ball = graph.querySelector('.visitor-ball-current'),
      matrix = ball?.getScreenCTM();
    if (!matrix) return;
    const area = graph.getBoundingClientRect(),
      visible =
        matrix.e >= area.left &&
        matrix.e <= area.left + graph.clientWidth &&
        matrix.f >= area.top &&
        matrix.f <= area.top + graph.clientHeight;
    if (!visible) graph.querySelector('.visitor-speech')?.remove();
    else if (!graph.querySelector('.visitor-speech')) this.refreshVisitorSpeech();
  }
  zoomTypes(zoom, point) {
    const graph = $('types'),
      previous = this.typesZoom || 1;
    this.typesZoom = Math.max(0.05, Math.min(8, Number(zoom) || 1));
    const area = graph.getBoundingClientRect();
    zoomGraphAt(
      graph,
      '.dep-svg',
      this.typesZoom / previous,
      () => this.renderView('types', false),
      point || { x: area.left + graph.clientWidth / 2, y: area.top + graph.clientHeight / 2 },
    );
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
    $('playback').hidden = !['ast', 'declarations', 'types'].some((view) => this.layout.has(view));
    for (const id of ['record-video', 'ast-playback-settings'])
      $(id).hidden = !this.layout.has('ast');
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
    $('close-comparison').hidden = !comparing;
    this.revealActiveTab();
    if (this.layout.has('ir') && !this.ir.visible)
      this.ir.follow(this.model?.event?.llvm_function, this.model?.event?.llvm_block);
    const revealing = new Set(this.pendingReveals);
    if (this.editor?.pendingReveal && !this.editor.dirty) revealing.add('source');
    this.renderObservation();
    for (const view of this.layout.views) {
      const scroll = this.scrollPositions.get(view);
      if (scroll && !revealing.has(view)) {
        $(scrollTargets[view]).scrollLeft = scroll[0];
        $(scrollTargets[view]).scrollTop = scroll[1];
      }
    }
  }
  revealActiveTab() {
    if (!this.layout.secondary)
      $(`tab-${this.view}`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  beginComparison(view) {
    if (!comparisonTargets(this.view).includes(view)) return;
    this.workspace?.showPane('work');
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
    if (focus) {
      this.workspace?.showPane('work');
      $(`tab-${this.view}`).focus({ preventScroll: true });
    }
  }
  setView(name, { reveal = true } = {}) {
    if (reveal) this.workspace?.showPane('work');
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
    const next = this.events.filtered.find(
      (event) => event.index > this.model.index && event.kind === kind,
    );
    if (next) this.seek(next.index);
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
    $('close-comparison').onclick = () => this.endComparison();
    $('compare-view').onchange = (event) => {
      if (event.target.value) this.beginComparison(event.target.value);
      else this.endComparison();
    };
    $('play').onclick = () => this.togglePlay();
    $('record-video').onclick = () => this.recordVideo();
    $('playback-settings').onchange = (event) => {
      if (event.target.id === 'speech-sound') {
        this.setSpeechSoundEnabled(event.target.checked);
      } else if (this.playTimer && !this.astRecorder.recorder) {
        this.stop();
        this.togglePlay();
      }
      $('playback-settings').hidePopover();
    };
    $('settings-speech-sound').onchange = (event) => {
      const saved = this.setSpeechSoundEnabled(event.target.checked);
      text('settings-status', () => t(saved ? 'settings.saved' : 'settings.unsaved'));
    };
    $('scrubber').oninput = () => {
      this.stop();
      this.seek(Number($('scrubber').value));
    };
    $('next-activity').onclick = () => {
      this.nextKind('activity');
      this.showNodeEventTab();
    };
    $('snapshot').onchange = () => {
      this.snapshot = Number($('snapshot').value);
      $('follow').checked = false;
      this.renderSelection({ reveal: false });
    };
    $('ast-layout').value = this.astLayout;
    $('ast-layout').onchange = () => {
      const layout = $('ast-layout').value;
      this.astLayout = ['cards', 'mindmap', 'radial'].includes(layout) ? layout : 'inline';
      this.astZoom = 1;
      this.scrollPositions.delete('ast');
      $('graph').scrollLeft = $('graph').scrollTop = 0;
      try {
        localStorage.setItem(AST_LAYOUT_KEY, this.astLayout);
      } catch {
        /* Optional preference. */
      }
      this.renderObservation();
      if (this.astLayout === 'mindmap') {
        const graph = $('graph');
        (graph.querySelector('.node.selected') || graph.querySelector('.node'))?.scrollIntoView({
          block: 'center',
          inline: 'center',
        });
      }
    };
    $('ast-zoom').oninput = () => this.zoomAST(Number($('ast-zoom').value) / 100);
    $('ast-fit').onclick = () => {
      const graph = $('graph'),
        bounds = graph.querySelector('.mindmap-svg')?.viewBox.baseVal;
      this.zoomAST(
        bounds
          ? Math.min(
              1,
              (graph.clientWidth - 24) / bounds.width,
              (graph.clientHeight - 24) / bounds.height,
            )
          : 1,
      );
      graph.scrollLeft = graph.scrollTop = 0;
      this.refreshVisitorSpeech();
    };
    bindGraphNavigation($('graph'), {
      enabled: () => this.astLayout === 'mindmap',
      selector: '.mindmap-svg',
      zoom: (factor, point) => this.zoomAST((this.astZoom || 1) * factor, point),
    });
    let speechFrame;
    $('graph').addEventListener('scroll', () => {
      cancelAnimationFrame(speechFrame);
      speechFrame = requestAnimationFrame(() => this.syncVisitorSpeechVisibility());
    });
    bindGraphNavigation($('types'), {
      selector: '.dep-svg',
      zoom: (factor, point) => this.zoomTypes((this.typesZoom || 1) * factor, point),
    });
    $('types-fit').onclick = () => {
      const graph = $('types'),
        bounds = graph.querySelector('.dep-svg')?.viewBox.baseVal;
      if (!bounds) return;
      const captionHeight = graph.querySelector('.dep-caption').offsetHeight;
      this.zoomTypes(
        Math.min(
          1,
          (graph.clientWidth - 24) / bounds.width,
          (graph.clientHeight - captionHeight - 24) / bounds.height,
        ),
      );
      graph.scrollLeft = graph.scrollTop = 0;
    };
    $('follow').onchange = () => {
      if ($('follow').checked) this.seek(this.model.index);
      else this.renderObservation();
    };
    $('expand').onclick = () => {
      this.collapsed.clear();
      this.renderObservation();
    };
    $('node-filter').onclick = () => {
      this.events.filter(this.selected);
      this.workspace?.showPane('history');
    };
    $('node-next').onclick = () => this.moveNode(1);
    $('node-prev').onclick = () => this.moveNode(-1);
    $('download-ir').onclick = () => {
      if (this.trace?.llvm_ir) download('crystal-observatory.ll', this.trace.llvm_ir, 'text/plain');
    };
    $('export').onclick = () => {
      $('trace-file-actions').hidePopover();
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
        $('app').hidden ||
        ($('timeline').hidden && ($('ast-view').hidden || $('graph-panel').inert)) ||
        event.defaultPrevented ||
        event.target.getAttribute('role') === 'separator' ||
        (['TEXTAREA', 'INPUT', 'SELECT', 'BUTTON'].includes(event.target.tagName) &&
          !(
            event.target.closest('.event-select') && ['ArrowRight', 'ArrowLeft'].includes(event.key)
          )) ||
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
