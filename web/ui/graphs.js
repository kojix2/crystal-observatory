import { t } from '../i18n/index.js';
import { $, esc, brief } from './dom.js';
import { icon } from './icons.js';
import { flattenAST } from '../core/trace-model.js';
import { renderActivities } from './inspector.js';
import { astFamily } from '../core/ast-colors.js';

const mutations = new Set([
  'assign_type',
  'fix_missing_type',
  'autocast',
  'add_restriction',
  'rewrite',
  'remove_dead_code',
  'simplify_condition',
  'replace_untyped',
]);

// A render takes one explicit trace selection; no compiler/job state lives here.
export function renderGraph(
  { model, selected, snapshot, view, collapsed, reveal = true },
  onSelect,
  onFold,
  onSeek = () => {},
) {
  const caption = $(`${view}-caption`);
  const liveTypes = view === 'types' || $('follow').checked;
  function svgNode(n, x, y, width = 270, reference = false) {
    const family = astFamily(n.kind);
    const type = liveTypes ? model.types.get(n.id) || '' : n.inferred_type || '';
    const activities = model.activities.get(n.id) || [];
    const changed =
      (model.event?.kind === 'type' && model.event.node_id === n.id) ||
      activities.some(
        (event) =>
          event.node_id === n.id &&
          mutations.has(event.activity) &&
          event.index <= model.index &&
          event.phase === model.event?.phase &&
          event.visitor === model.event?.visitor,
      );
    const folded = collapsed.has(n.id);
    const hasKids =
      view === 'ast' &&
      (n.children?.length || n.targets?.length || n.hook_expansions?.length || n.expanded);
    // Activity and reference marks sit left of the id; 10px sans digits are about 5.7px wide.
    let markX = width - 9 - String(n.id).length * 5.7 - 7;
    let marks = '';
    if (activities.length) {
      marks += `<circle class="svg-dot" cx="${markX - 3}" cy="12.5" r="2.5"/>`;
      markX -= 10;
    }
    if (reference)
      marks += `<g class="svg-mark" transform="translate(${markX - 10} 7.5)">${icon('reference', { size: 10 })}</g>`;
    return `<g class="node ${n.id === selected ? 'selected' : ''} ${changed ? 'changed' : ''}" data-node="${n.id}" data-node-family="${family}" tabindex="0" role="button" aria-label="${esc(t('graph.node', { kind: n.kind, type, id: n.id }))}" transform="translate(${x} ${y})"><title>${esc(t(`ast.family.${family}`))}</title><rect class="tile" width="${width}" height="52" rx="2"/><rect class="accent" width="3" height="52" rx="1"/><text x="13" y="17" class="svg-kind">${esc(brief(n.kind, 26))}</text>${marks}<text x="${width - 9}" y="16" text-anchor="end" class="svg-id">#${n.id}</text><text x="13" y="34" class="svg-code">${esc(brief(n.label, Math.floor(width / 6.7)))}</text><text x="13" y="46" class="svg-type">${esc(brief(type || '—', 38))}</text>${hasKids && !reference ? `<text class="fold" data-fold="${n.id}" x="${width - 20}" y="46">${folded ? '+' : '−'}</text>` : ''}</g>`;
  }
  function wireGraph(container) {
    container.querySelectorAll('[data-node]').forEach((el) => {
      const activate = (ev) => {
        if (ev.target.dataset.fold) return;
        onSelect(Number(el.dataset.node));
      };
      el.addEventListener('click', activate);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') activate(e);
      });
    });
    container.querySelectorAll('[data-fold]').forEach(
      (el) =>
        (el.onclick = (e) => {
          e.stopPropagation();
          const id = Number(el.dataset.fold);
          onFold(id);
        }),
    );
  }
  function renderAST() {
    const s = model.trace.snapshots[snapshot];
    if (!s) {
      $('graph').innerHTML = `<p class="empty">${esc(t('graph.empty'))}</p>`;
      caption.textContent = t('graph.prompt');
      return;
    }
    const rows = flattenAST(s, collapsed);
    const maxDepth = Math.max(0, ...rows.map((r) => r.depth));
    const nodeWidth = Math.max(270, Math.min(400, $('graph').clientWidth - maxDepth * 27 - 44));
    const w = Math.max($('graph').clientWidth, maxDepth * 27 + nodeWidth + 40);
    let edges = '',
      nodes = '';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i],
        x = 20 + r.depth * 27,
        y = 16 + i * 65;
      if (r.parent >= 0) {
        const p = rows[r.parent],
          px = 20 + p.depth * 27 + 8,
          py = 16 + r.parent * 65 + 52;
        edges += `<path class="edge ${r.edge}" d="M ${px} ${py} V ${y + 27} H ${x}"/>`;
        if (r.edge !== 'child') {
          const label =
            r.edge === 'target'
              ? 'typed method'
              : r.edge === 'hook'
                ? t('decl.hookExpansion')
                : 'expanded';
          nodes += `<text x="${x + 8}" y="${y - 4}" class="svg-id">${esc(label)} ↘</text>`;
        }
      }
      nodes += svgNode(r.node, x, y, nodeWidth, r.reference);
    }
    $('graph').innerHTML =
      `<svg class="ast-svg" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.max(390, rows.length * 65 + 28)}" aria-label="${esc(t('ast'))}">${edges}${nodes}</svg>`;
    wireGraph($('graph'));
    const activeNode = $('graph').querySelector('.node.selected');
    if (activeNode && $('follow').checked && reveal) {
      const nodeRect = activeNode.getBoundingClientRect(),
        area = $('graph').getBoundingClientRect();
      if (nodeRect.top < area.top || nodeRect.bottom > area.bottom)
        $('graph').scrollTop += nodeRect.top - area.top - area.height * 0.38;
      if (nodeRect.left < area.left || nodeRect.right > area.right)
        $('graph').scrollLeft += nodeRect.left - area.left - 16;
    }
    caption.textContent = t('graph.caption', {
      name: s.name,
      count: s.nodes.length,
      time: t($('follow').checked ? 'graph.eventTypes' : 'graph.snapshotTypes'),
      outside: selected && !s.nodes.some((n) => n.id === selected) ? t('graph.outside') : '',
    });
  }
  function renderTypes() {
    const edges = [...model.edges.values()].filter(([a, b]) => a === selected || b === selected);
    if (!edges.length) {
      $('types').innerHTML = `<p class="empty">${esc(t('graph.noEdges'))}</p>`;
    } else {
      const incoming = [...new Set(edges.filter((e) => e[1] === selected).map((e) => e[0]))].filter(
        (x) => x !== selected,
      );
      const outgoing = [...new Set(edges.filter((e) => e[0] === selected).map((e) => e[1]))].filter(
        (x) => x !== selected,
      );
      const count = Math.max(1, incoming.length, outgoing.length),
        height = Math.max(350, count * 84 + 80),
        mid = height / 2 - 25;
      const positions = new Map([[selected, [238, mid]]]);
      incoming.forEach((id, i) => positions.set(id, [12, 40 + i * 84]));
      outgoing.forEach((id, i) => {
        if (!positions.has(id)) positions.set(id, [465, 40 + i * 84]);
      });
      let paths = '',
        nodes = '';
      for (const [a, b] of edges) {
        if (a === b) continue;
        const pa = positions.get(a),
          pb = positions.get(b);
        if (!pa || !pb) continue;
        const right = pa[0] < pb[0];
        const x1 = pa[0] + (right ? 195 : 0),
          x2 = pb[0] + (right ? 0 : 195),
          y1 = pa[1] + 29,
          y2 = pb[1] + 29;
        paths += `<path d="M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}" class="dependency-path" marker-end="url(#arrow)"/>`;
      }
      for (const [id, [x, y]] of positions) {
        const n = model.nodes.get(id);
        if (n) nodes += svgNode(n, x, y, 195);
      }
      $('types').innerHTML =
        `<div class="dep-caption">${esc(t('graph.edges'))}</div><svg class="dep-svg" xmlns="http://www.w3.org/2000/svg" width="675" height="${height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" class="dependency-arrow"/></marker></defs>${paths}${nodes}</svg>`;
      wireGraph($('types'));
    }
    const history = document.createElement('section');
    history.className = 'type-activities';
    renderActivities(model, model.nodes.get(selected), onSeek, history, true);
    $('types').append(history);
    caption.textContent = t('graph.edgeCount', {
      event: model.index + 1,
      count: model.edges.size,
    });
  }
  if (view === 'types') renderTypes();
  else renderAST();
}
