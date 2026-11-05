import { t } from '../i18n/index.js';
import { $, esc, brief } from './dom.js';
import { eventLabel, shortVisitor } from './event-labels.js';
const PAGE_SIZE = 70;

export class EventList {
  constructor(onSeek) {
    this.page = 0;
    this.nodeFilter = 0;
    this.filtered = [];
    $('search').oninput = $('kind').onchange = () => this.filter();
    $('clear-filter').onclick = () => {
      this.nodeFilter = 0;
      $('search').value = '';
      $('kind').value = '';
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
      const row = event.target.closest('[data-index]');
      if (row) onSeek(Number(row.dataset.index));
    };
    $('events').onclick = activate;
    $('events').onkeydown = (event) => {
      if (['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        activate(event);
      }
    };
  }
  load(model) {
    this.model = model;
    this.nodeFilter = 0;
    $('search').value = '';
    $('kind').value = '';
    this.filter();
  }
  filter(node = this.nodeFilter) {
    if (!this.model) return;
    this.nodeFilter = node;
    const query = $('search').value.trim().toLowerCase(),
      kind = $('kind').value;
    this.filtered = this.model.trace.events.filter(
      (event) =>
        (!kind || event.kind === kind) &&
        (!node || event.node_id === node) &&
        (!query ||
          `${event.visitor} ${event.node_id} ${this.model.nodes.get(event.node_id)?.kind || ''} ${event.after} ${event.phase}`
            .toLowerCase()
            .includes(query)),
    );
    this.page = 0;
    this.render();
  }
  follow() {
    const found = this.filtered.findIndex((event) => event.index === this.model.index);
    if (found >= 0) this.page = Math.floor(found / PAGE_SIZE);
    this.render();
  }
  render() {
    if (!this.model) return;
    const pages = Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    $('events').innerHTML = this.filtered
      .slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE)
      .map(
        (event) =>
          `<tr class="${event.index === this.model.index ? 'active' : ''} ${esc(event.kind)}" data-index="${event.index}" tabindex="0" aria-current="${event.index === this.model.index ? 'step' : 'false'}"><td>${event.index}</td><td title="${esc(event.visitor)}"><span class="event-visitor">${esc(shortVisitor(event.visitor) || event.phase)}</span><span class="event-node">${event.node_id ? `#${event.node_id} ${esc(this.model.nodes.get(event.node_id)?.kind || '')}` : '—'}</span></td><td><span class="event-label">${esc(eventLabel(event.kind))}</span><span class="event-result" title="${esc(event.after || event.detail)}">${esc(brief(event.after || event.detail, 130))}</span></td></tr>`,
      )
      .join('');
    $('filter-count').textContent =
      t('count.events', { count: this.filtered.length.toLocaleString() }) +
      (this.nodeFilter ? ` · #${this.nodeFilter}` : '');
    $('page-state').textContent = `${this.page + 1} / ${pages}`;
    $('page-prev').disabled = this.page === 0;
    $('page-next').disabled = this.page >= pages - 1;
    const active = $('events').querySelector('.active');
    if (active) {
      const wrap = $('trace-content'),
        y = active.offsetTop - $('events').offsetTop;
      if (y < wrap.scrollTop || y > wrap.scrollTop + wrap.clientHeight - 55)
        wrap.scrollTop = Math.max(0, y - 65);
    }
  }
}
