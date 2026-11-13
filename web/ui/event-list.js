import { t } from '../i18n/index.js';
import { $, esc, brief } from './dom.js';
import { icon } from './icons.js';
import {
  eventLabel,
  shortVisitor,
  visitorKey,
  activityLabel,
  activitySummary,
  explanation,
} from './event-labels.js';
import { groupActivitySummary } from '../core/activities.js';
import { groupEvents, groupStages, eventRows } from '../core/event-groups.js';
import { compilerStage } from '../core/compiler-stages.js';
import { declarationSummary } from './declarations.js';
const PAGE_SIZE = 70;

export class EventList {
  constructor(onSeek, onBrowse = () => {}) {
    this.page = 0;
    this.nodeFilter = 0;
    this.filtered = [];
    this.rows = [];
    this.expanded = new Set();
    $('search').oninput = $('activity-kind').onchange = () => this.filter();
    $('kind').onchange = () => {
      if ($('kind').value !== 'activity') $('activity-kind').value = '';
      this.filter();
    };
    $('clear-node-filter').onclick = () => this.filter(0);
    $('next-activity').addEventListener('click', () => $('history-controls').hidePopover());
    $('clear-filter').onclick = () => {
      this.nodeFilter = 0;
      $('search').value = '';
      $('kind').value = '';
      $('activity-kind').value = '';
      this.filter();
    };
    $('page-prev').onclick = () => {
      onBrowse();
      this.page--;
      this.render(false);
      $('trace-content').scrollTop = 0;
    };
    $('page-next').onclick = () => {
      onBrowse();
      this.page++;
      this.render(false);
      $('trace-content').scrollTop = 0;
    };
    // Delegated once instead of installing a handler on every re-rendered row.
    const activate = (event) => {
      const toggle = event.target.closest('[data-group]');
      if (toggle) {
        this.toggle(Number(toggle.dataset.group));
        return;
      }
      const row = event.target.closest('[data-index]');
      if (row) onSeek(Number(row.dataset.index));
    };
    $('events').onclick = activate;
    $('events').onkeydown = (event) => {
      // Native buttons handle Enter/Space with a click; do not toggle twice.
      if (event.target.closest('button')) return;
      if (['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        activate(event);
      }
    };
    // A recording can seek while History is hidden on mobile. Reveal that
    // position once the list has dimensions, preserving ordinary round trips.
    if (typeof ResizeObserver !== 'undefined')
      new ResizeObserver(() => {
        if (this.pendingReveal) this.revealCurrent();
      }).observe($('trace-content'));
  }
  load(model) {
    this.model = model;
    this.groups = groupEvents(model.trace.events);
    this.historyGroups = groupStages(model.trace.events, this.groups);
    this.activityKinds = [
      ...new Set(model.trace.events.filter((e) => e.kind === 'activity').map((e) => e.activity)),
    ].sort();
    this.localizeActivities();
    this.expanded.clear();
    this.nodeFilter = 0;
    $('search').value = '';
    $('kind').value = '';
    $('activity-kind').value = '';
    this.filter();
  }
  filter(node = this.nodeFilter, { preservePosition = false } = {}) {
    if (!this.model) return;
    this.nodeFilter = node;
    const query = $('search').value.trim().toLowerCase(),
      kind = $('kind').value,
      activity = $('activity-kind').value,
      nodeQuery = /^#(\d+)$/.exec(query);
    const filtered = Boolean(query || kind || activity || node),
      tools = $('history-tools'),
      label = filtered ? 'trace.filtersActive' : 'trace.filters';
    tools.classList.toggle('filtered', filtered);
    tools.dataset.i18nAria = tools.dataset.i18nTitle = label;
    tools.ariaLabel = tools.title = t(label);
    $('clear-filter').disabled = !filtered;
    $('activity-filter').hidden = kind !== 'activity' && !activity;
    $('clear-node-filter').hidden = !node;
    const nodeLabel = node
      ? t('event.target', { id: node, kind: this.model.nodes.get(node)?.kind || '' })
      : '';
    $('node-filter-label').textContent = nodeLabel;
    $('clear-node-filter').ariaLabel = `${t('clear')}: ${nodeLabel}`;
    this.filtered = this.model.trace.events.filter(
      (event) =>
        (!kind || event.kind === kind) &&
        (!activity || (event.kind === 'activity' && event.activity === activity)) &&
        (!node || event.node_id === node) &&
        (!query ||
          (nodeQuery
            ? event.node_id === Number(nodeQuery[1])
            : `${event.visitor} ${event.node_id} ${this.model.nodes.get(event.node_id)?.kind || ''} ${this.result(event)} ${event.phase} ${this.stageLabel(event)}`
                .toLowerCase()
                .includes(query))),
    );
    this.matchingIndices = new Set(this.filtered.map((event) => event.index));
    this.summaries = new Map(
      this.groups.map((group) => [
        group.start,
        groupActivitySummary(this.model.trace.events, group, this.matchingIndices),
      ]),
    );
    this.rows = eventRows(
      this.filtered,
      kind === 'declaration' ? [] : this.historyGroups,
      this.expanded,
    );
    if (!preservePosition) this.page = 0;
    this.render(false);
    if (!preservePosition) $('trace-content').scrollTop = 0;
  }
  localizeActivities() {
    const select = $('activity-kind'),
      value = select.value;
    select.innerHTML = `<option value="">${esc(t('activity.all'))}</option>${(this.activityKinds || []).map((kind) => `<option value="${esc(kind)}">${esc(activityLabel(kind))}</option>`).join('')}`;
    select.value = value || '';
  }
  currentRowIndex() {
    let found = this.rows.findIndex((row) => row.event?.index === this.model.index);
    if (found < 0)
      found = this.rows.findLastIndex(
        ({ group }) => group && this.model.index >= group.start && this.model.index <= group.end,
      );
    return found;
  }
  follow() {
    const found = this.currentRowIndex();
    if (found >= 0) this.page = Math.floor(found / PAGE_SIZE);
    this.render();
  }
  toggle(start) {
    for (const group of this.historyGroups)
      if (group.start < start && start <= group.end && group.kind === 'phase')
        this.expanded.add(group.start);
    this.expanded.has(start) ? this.expanded.delete(start) : this.expanded.add(start);
    this.rows = eventRows(
      this.filtered,
      $('kind').value === 'declaration' ? [] : this.historyGroups,
      this.expanded,
    );
    const found = this.rows.findIndex((row) => row.group?.start === start);
    if (found >= 0) this.page = Math.floor(found / PAGE_SIZE);
    this.render(false);
    $('events').querySelector(`[data-group="${start}"]`)?.focus({ preventScroll: true });
  }
  render(scrollToActive = true) {
    if (!this.model) return;
    const pages = Math.max(1, Math.ceil(this.rows.length / PAGE_SIZE));
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    const empty = this.model.trace.mode === 'empty';
    this.activeGroup = this.rows[this.currentRowIndex()]?.group?.start;
    $('trace-empty-message').hidden = !empty;
    $('history-no-match').hidden = empty || !this.model.trace.events.length || this.rows.length > 0;
    const focused = document.activeElement,
      focusedRow = focused?.closest?.('#events [data-index]'),
      focusedGroup = focused?.closest?.('[data-group]');
    $('events').innerHTML = this.rows
      .slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE)
      .map((row) => this.renderRow(row))
      .join('');
    $('page-state').textContent = `${this.page + 1} / ${pages}`;
    $('page-prev').disabled = this.page === 0;
    $('page-next').disabled = this.page >= pages - 1;
    if (focusedRow) {
      const selector = focusedGroup
        ? `[data-group="${focusedGroup.dataset.group}"]`
        : `tr${focusedRow.classList.contains('event-group') ? '.event-group' : ':not(.event-group)'}[data-index="${focusedRow.dataset.index}"]`;
      $('events').querySelector(selector)?.focus({ preventScroll: true });
    }
    this.pendingReveal = false;
    if (scrollToActive) this.revealCurrent();
  }
  revealCurrent() {
    const active = $('events').querySelector('.active');
    if (!active) return;
    const wrap = $('trace-content');
    this.pendingReveal = !wrap.clientHeight;
    if (this.pendingReveal) return;
    const bounds = active.getBoundingClientRect(),
      viewport = wrap.getBoundingClientRect(),
      header = $('history-table').tHead.getBoundingClientRect().height,
      top = viewport.top + header;
    if (bounds.top < top || bounds.height > viewport.bottom - top)
      wrap.scrollTop += bounds.top - top;
    else if (bounds.bottom > viewport.bottom) wrap.scrollTop += bounds.bottom - viewport.bottom;
  }
  renderRow({ event, group, count }) {
    if (group) {
      event = group.event;
      const phase = group.kind === 'phase',
        expanded = this.expanded.has(group.start),
        active = this.activeGroup === group.start,
        visitor = phase ? this.stageLabel(event) : shortVisitor(event.visitor),
        label = t(expanded ? 'event.group.collapse' : 'event.group.expand', { visitor }),
        total = group.end - group.start + 1,
        summary =
          count === total
            ? t('count.events', { count: total.toLocaleString() })
            : t('event.group.matches', {
                count: count.toLocaleString(),
                total: total.toLocaleString(),
              });
      const activities = (phase ? [] : this.summaries.get(group.start) || [])
        .map(
          (activity) =>
            `<span class="activity-summary" title="${esc(activitySummary(activity))}">#${activity.node_id} ${esc(brief(activitySummary(activity), 130))}</span>`,
        )
        .join('');
      return `<tr class="event-group ${phase ? 'event-stage' : 'event-call'} ${active ? 'active' : ''}" data-index="${group.start}" tabindex="0" aria-current="${active ? 'step' : 'false'}"><td>${group.start}–<wbr>${group.end}</td><td title="${esc(phase ? event.phase || event.detail : event.visitor)}"><span class="event-group-heading"><button type="button" class="event-group-toggle" data-group="${group.start}" aria-expanded="${expanded}" aria-label="${esc(label)}" title="${esc(label)}">${icon('disclosure', { size: 12 })}</button><span class="event-visitor"${phase ? '' : ` data-visitor="${esc(visitorKey(event.visitor))}"`}>${esc(visitor)}</span></span>${phase ? '' : this.renderNode(event)}</td><td><span class="event-label">${esc(summary)}</span>${activities}${active ? `<span class="event-result">${esc(t('event.group.current', { index: this.model.index }))}</span>` : ''}</td></tr>`;
    }
    return `<tr class="${event.index === this.model.index ? 'active' : ''} ${esc(event.kind)}" data-index="${event.index}" tabindex="0" aria-current="${event.index === this.model.index ? 'step' : 'false'}"><td>${event.index}</td><td title="${esc(event.visitor)}"><span class="event-visitor" data-visitor="${esc(visitorKey(event.visitor))}">${esc(shortVisitor(event.visitor) || event.phase)}</span>${this.renderNode(event)}</td><td><span class="event-label">${esc(eventLabel(event.kind))}</span><span class="event-result" title="${esc(this.result(event))}">${esc(brief(this.result(event), 130))}</span></td></tr>`;
  }
  result(event) {
    return event.kind === 'link'
      ? explanation(event)
      : event.kind === 'activity'
        ? activitySummary(event)
        : event.kind === 'declaration'
          ? declarationSummary(event, this.model)
          : event.after || event.detail;
  }
  stageLabel(event) {
    const stage = compilerStage(event);
    return stage ? t(`pipeline.stage.${stage.id}`) : event.phase || event.detail || '';
  }
  renderNode(event) {
    return `<span class="event-node">${event.node_id ? `#${event.node_id} ${esc(this.model.nodes.get(event.node_id)?.kind || '')}` : '—'}</span>`;
  }
}
