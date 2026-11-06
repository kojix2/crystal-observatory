import { t } from '../i18n/index.js';
import { $, esc, brief } from './dom.js';
import {
  eventLabel,
  shortVisitor,
  visitorKey,
  activityLabel,
  activitySummary,
  explanation,
} from './event-labels.js';
import { groupActivitySummary } from '../core/activities.js';
import { groupEvents, eventRows } from '../core/event-groups.js';
import { declarationSummary } from './declarations.js';
const PAGE_SIZE = 70;

export class EventList {
  constructor(onSeek) {
    this.page = 0;
    this.nodeFilter = 0;
    this.filtered = [];
    this.rows = [];
    this.expanded = new Set();
    $('search').oninput = $('kind').onchange = $('activity-kind').onchange = () => this.filter();
    $('clear-filter').onclick = () => {
      this.nodeFilter = 0;
      $('search').value = '';
      $('kind').value = '';
      $('activity-kind').value = '';
      this.filter();
    };
    $('page-prev').onclick = () => {
      this.page--;
      this.render();
    };
    $('page-next').onclick = () => {
      this.page++;
      this.render();
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
  }
  load(model) {
    this.model = model;
    this.groups = groupEvents(model.trace.events);
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
  filter(node = this.nodeFilter) {
    if (!this.model) return;
    this.nodeFilter = node;
    const query = $('search').value.trim().toLowerCase(),
      kind = $('kind').value,
      activity = $('activity-kind').value;
    this.filtered = this.model.trace.events.filter(
      (event) =>
        (!kind || event.kind === kind) &&
        (!activity || (event.kind === 'activity' && event.activity === activity)) &&
        (!node || event.node_id === node) &&
        (!query ||
          `${event.visitor} ${event.node_id} ${this.model.nodes.get(event.node_id)?.kind || ''} ${this.result(event)} ${event.phase}`
            .toLowerCase()
            .includes(query)),
    );
    this.matchingIndices = new Set(this.filtered.map((event) => event.index));
    this.summaries = new Map(
      this.groups.map((group) => [
        group.start,
        groupActivitySummary(this.model.trace.events, group, this.matchingIndices),
      ]),
    );
    this.rows = eventRows(this.filtered, kind === 'declaration' ? [] : this.groups, this.expanded);
    this.page = 0;
    this.render();
  }
  localizeActivities() {
    const select = $('activity-kind'),
      value = select.value;
    select.innerHTML = `<option value="">${esc(t('activity.all'))}</option>${(this.activityKinds || []).map((kind) => `<option value="${esc(kind)}">${esc(activityLabel(kind))}</option>`).join('')}`;
    select.value = value || '';
  }
  follow() {
    let found = this.rows.findIndex((row) => row.event?.index === this.model.index);
    if (found < 0)
      found = this.rows.findIndex(
        ({ group }) => group && this.model.index >= group.start && this.model.index <= group.end,
      );
    if (found >= 0) this.page = Math.floor(found / PAGE_SIZE);
    this.render();
  }
  toggle(start) {
    this.expanded.has(start) ? this.expanded.delete(start) : this.expanded.add(start);
    this.rows = eventRows(
      this.filtered,
      $('kind').value === 'declaration' ? [] : this.groups,
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
    $('history-start').hidden = !empty;
    $('history-no-match').hidden = empty || !this.model.trace.events.length || this.rows.length > 0;
    $('events').innerHTML = this.rows
      .slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE)
      .map((row) => this.renderRow(row))
      .join('');
    $('filter-count').textContent =
      t('count.events', { count: this.filtered.length.toLocaleString() }) +
      (this.nodeFilter ? ` · #${this.nodeFilter}` : '');
    $('page-state').textContent = `${this.page + 1} / ${pages}`;
    $('page-prev').disabled = this.page === 0;
    $('page-next').disabled = this.page >= pages - 1;
    const active = $('events').querySelector('.active');
    if (active && scrollToActive) {
      const wrap = $('trace-content'),
        y = active.offsetTop - $('events').offsetTop;
      if (y < wrap.scrollTop || y > wrap.scrollTop + wrap.clientHeight - 55)
        wrap.scrollTop = Math.max(0, y - 65);
    }
  }
  renderRow({ event, group, count }) {
    if (group) {
      event = group.event;
      const expanded = this.expanded.has(group.start),
        containsCurrent = this.model.index >= group.start && this.model.index <= group.end,
        active = containsCurrent && (!expanded || !this.matchingIndices.has(this.model.index)),
        visitor = shortVisitor(event.visitor),
        label = t(expanded ? 'event.group.collapse' : 'event.group.expand', { visitor }),
        total = group.end - group.start + 1,
        summary =
          count === total
            ? t('count.events', { count: total.toLocaleString() })
            : t('event.group.matches', {
                count: count.toLocaleString(),
                total: total.toLocaleString(),
              });
      const activities = (this.summaries.get(group.start) || [])
        .map(
          (activity) =>
            `<span class="activity-summary" title="${esc(activitySummary(activity))}">#${activity.node_id} ${esc(brief(activitySummary(activity), 130))}</span>`,
        )
        .join('');
      return `<tr class="event-group ${active ? 'active' : ''}" aria-current="${active ? 'step' : 'false'}"><td>${group.start}–<wbr>${group.end}</td><td title="${esc(event.visitor)}"><button type="button" class="event-group-toggle" data-group="${group.start}" aria-expanded="${expanded}" aria-label="${esc(label)}" title="${esc(label)}"><span class="event-group-arrow" aria-hidden="true">${expanded ? '▼' : '▶'}</span><span class="event-visitor" data-visitor="${esc(visitorKey(event.visitor))}">${esc(visitor)}</span></button>${this.renderNode(event)}</td><td><span class="event-label">${esc(summary)}</span>${activities}${containsCurrent ? `<span class="event-result">${esc(t('event.group.current', { index: this.model.index }))}</span>` : ''}</td></tr>`;
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
  renderNode(event) {
    return `<span class="event-node">${event.node_id ? `#${event.node_id} ${esc(this.model.nodes.get(event.node_id)?.kind || '')}` : '—'}</span>`;
  }
}
