import { t } from '../i18n/index.js';
import { $, esc, brief } from './dom.js';
import { renderASTCard } from './ast-cards.js';
import { flattenAST } from '../core/trace-model.js';
import { renderActivities } from './inspector.js';
import { astFamily } from '../core/ast-colors.js';
import { layoutRadialAST, radialBranch } from '../core/radial-ast.js';
import { layoutMindmapAST, mindmapBranch } from '../core/mindmap-ast.js';

const radialLayouts = new WeakMap();
const nodeHeight = 76;
const cardGap = 6;
const cardIndent = 20;
const cardInset = 12;
const dependencyWidth = 260;
const dependencyStride = 104;

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
  {
    model,
    selected,
    snapshot,
    view,
    collapsed,
    reveal = true,
    astLayout = 'cards',
    astZoom = 1,
    typesZoom = 1,
  },
  onSelect,
  onFold,
  onSeek = () => {},
) {
  const caption = $(`${view}-caption`);
  const liveTypes = view === 'types' || $('follow').checked;
  function nodeState(n) {
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
    return { family, type, activities, changed };
  }
  function svgNode(n, x, y, width = 320) {
    const { family, type, activities, changed } = nodeState(n);
    const markX = width - 12 - `#${n.id}`.length * 8.4 - 8;
    const headingLength = Math.max(
      1,
      Math.floor((markX - (activities.length ? 10 : 0) - 20) / 9.6),
    );
    const codeLength = Math.floor((width - 26) / 8.4);
    const label = t('graph.node', { kind: n.kind, type, id: n.id });
    return `<g class="node ${n.id === selected ? 'selected' : ''} ${changed ? 'changed' : ''}" data-node="${n.id}" data-node-family="${family}" tabindex="0" role="button" aria-label="${esc(label)}" transform="translate(${x} ${y})"><title>${esc(t(`ast.family.${family}`))}</title><rect class="tile" width="${width}" height="${nodeHeight}" rx="2"/><rect class="accent" width="3" height="${nodeHeight}" rx="1"/><text x="13" y="20" class="svg-kind">${esc(brief(n.kind, headingLength))}</text>${activities.length ? `<circle class="svg-dot" cx="${markX - 3}" cy="15.5" r="2.5"/>` : ''}<text x="${width - 12}" y="20" text-anchor="end" class="svg-id">#${n.id}</text><text x="13" y="43" class="svg-code">${esc(brief(n.label, codeLength))}</text><text x="13" y="65" class="svg-type">${esc(brief(type || '—', codeLength))}</text></g>`;
  }
  function wireGraph(container) {
    container.querySelectorAll('[data-node]').forEach((el) => {
      const activate = (ev) => {
        if (ev.target.dataset.fold) return;
        onSelect(Number(el.dataset.node));
      };
      el.addEventListener('click', activate);
      el.addEventListener('keydown', (e) => {
        if (
          view === 'ast' &&
          astLayout !== 'radial' &&
          !e.target.dataset.fold &&
          ['+', '-', '='].includes(e.key)
        ) {
          const fold = el.querySelector('[data-fold]');
          if (fold && (e.key === '-') !== collapsed.has(Number(el.dataset.node))) {
            e.preventDefault();
            e.stopPropagation();
            onFold(Number(el.dataset.node));
          }
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate(e);
        }
      });
    });
    container.querySelectorAll('[data-fold]').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        onFold(Number(el.dataset.fold));
      };
      el.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.onclick(e);
        }
      };
    });
  }
  function renderAST() {
    const s = model.trace.snapshots[snapshot];
    if (!s) {
      $('graph').innerHTML = `<p class="empty">${esc(t('graph.empty'))}</p>`;
      caption.textContent = t('graph.prompt');
      return;
    }
    if (astLayout === 'radial') renderRadial(s);
    else if (astLayout === 'mindmap') renderMindmap(s);
    else renderCards(s);
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
    caption.textContent =
      t('graph.caption', {
        name: s.name,
        count: s.nodes.length,
        time: t($('follow').checked ? 'graph.eventTypes' : 'graph.snapshotTypes'),
        outside: selected && !s.nodes.some((n) => n.id === selected) ? t('graph.outside') : '',
      }) +
      (astLayout === 'radial'
        ? ` · ${t('ast.radialHint')}`
        : astLayout === 'mindmap'
          ? ` · ${t('ast.mindmapHint')}`
          : '');
  }
  function renderMindmap(s) {
    const { rows, width, height } = layoutMindmapAST(s, collapsed);
    let edges = '',
      nodes = '';
    for (const row of rows) {
      if (row.parent >= 0)
        edges += `<path class="edge ${row.edge}" d="${mindmapBranch(rows[row.parent], row)}"/>`;
      const n = row.node,
        { family, type, changed } = nodeState(n),
        folded = collapsed.has(n.id),
        hasKids =
          !row.reference &&
          (n.children?.length || n.targets?.length || n.hook_expansions?.length || n.expanded),
        label = t('graph.node', { kind: n.kind, type, id: n.id }),
        headingLength = Math.max(1, Math.floor((row.width - 36 - `#${n.id}`.length * 7) / 7.2)),
        codeLength = Math.floor((row.width - 24) / 7.2),
        typeLength = Math.floor((row.width - (hasKids ? 48 : 24)) / 7.2);
      nodes += `<g class="node mindmap-node ${n.id === selected ? 'selected' : ''} ${changed ? 'changed' : ''} ${row.reference ? 'reference' : ''}" data-node="${n.id}" data-node-family="${family}" tabindex="0" role="button" aria-label="${esc(label)}" transform="translate(${row.x} ${row.y})"><title>${esc(label)}\n${esc(n.label || '')}${row.reference ? `\n${esc(t('ast.reference'))}` : ''}</title><rect class="tile" width="${row.width}" height="${row.height}" rx="8"/><rect class="accent" width="3" height="${row.height - 16}" x="0" y="8" rx="1.5"/><text x="12" y="18" class="svg-kind">${esc(brief(n.kind, headingLength))}</text><text x="${row.width - 12}" y="18" text-anchor="end" class="svg-id">#${n.id}</text><text x="12" y="36" class="svg-code">${esc(brief(n.label, codeLength))}</text><text x="12" y="53" class="svg-type">${esc(brief(type || '—', typeLength))}</text>${hasKids ? `<g class="mindmap-fold" data-fold="${n.id}" tabindex="0" role="button" aria-expanded="${!folded}" aria-label="${esc(t(folded ? 'ast.expandNode' : 'ast.collapseNode', { id: n.id }))}" transform="translate(${row.width - 19} 48)"><circle r="10"/><text text-anchor="middle" y="4">${folded ? '+' : '−'}</text></g>` : ''}</g>`;
    }
    $('graph').innerHTML =
      `<svg class="ast-svg mindmap-svg" xmlns="http://www.w3.org/2000/svg" width="${width * astZoom}" height="${height * astZoom}" viewBox="0 0 ${width} ${height}" aria-label="${esc(t('ast.layout.mindmap'))}">${edges}${nodes}</svg>`;
  }
  function renderRadial(s) {
    if (!radialLayouts.has(s)) radialLayouts.set(s, layoutRadialAST(s));
    const rows = radialLayouts.get(s),
      graph = $('graph'),
      fit = Math.max(1, Math.min(graph.clientWidth || 600, graph.clientHeight || 600) - 24),
      diameter = fit * astZoom,
      unit = 1000 / diameter;
    let edges = '',
      nodes = '';
    for (const row of rows) {
      if (row.parent >= 0)
        edges += `<path class="edge ${row.edge}" d="${radialBranch(rows[row.parent], row)}"/>`;
      else if (row.radius > 0) edges += `<path class="edge root" d="M500 500 L${row.x} ${row.y}"/>`;
      const { family, type, changed } = nodeState(row.node),
        active = row.node.id === selected,
        label = t('graph.node', { kind: row.node.kind, type, id: row.node.id });
      nodes += `<g class="node radial-node ${active ? 'selected' : ''} ${changed ? 'changed' : ''} ${row.reference ? 'reference' : ''}" data-node="${row.node.id}" data-node-family="${family}" tabindex="0" role="button" aria-label="${esc(label)}" transform="translate(${row.x} ${row.y})"><title>${esc(label)}\n${esc(row.node.label || '')}${row.reference ? `\n${esc(t('ast.reference'))}` : ''}</title><circle class="radial-hit" r="${7 * unit}"/><circle class="radial-dot" r="${(active ? 4.5 : 2.5) * unit}"/></g>`;
    }
    graph.innerHTML = `<svg class="ast-svg radial-svg" xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}" viewBox="0 0 1000 1000" aria-label="${esc(t('ast.layout.radial'))}">${edges}${nodes}</svg>`;
  }
  function renderCards(s) {
    const rows = flattenAST(s, collapsed);
    const cards = [];
    let edges = '',
      nodes = '',
      w = $('graph').clientWidth,
      nextY = cardInset;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i],
        x = cardInset + r.depth * cardIndent,
        annotated = r.parent >= 0 && r.edge !== 'child',
        y = nextY + (annotated ? 16 : 0),
        card = renderASTCard(r, {
          trace: model.trace,
          state: nodeState(r.node),
          selected,
          collapsed,
          x,
          y,
          availableWidth: $('graph').clientWidth - x - cardInset,
        });
      cards.push({ y, height: card.height });
      if (r.parent >= 0) {
        const p = rows[r.parent],
          px = cardInset + p.depth * cardIndent + 6,
          py = cards[r.parent].y + cards[r.parent].height;
        edges += `<path class="edge ${r.edge}" d="M ${px} ${py} V ${y + card.height / 2} H ${x}"/>`;
        if (annotated) {
          const label =
            r.edge === 'target'
              ? 'typed method'
              : r.edge === 'hook'
                ? t('decl.hookExpansion')
                : 'expanded';
          nodes += `<text x="${x + 8}" y="${y - 4}" class="svg-id">${esc(label)} ↘</text>`;
        }
      }
      nodes += card.html;
      w = Math.max(w, x + card.width + cardInset);
      nextY = y + card.height + cardGap;
    }
    $('graph').innerHTML =
      `<svg class="ast-svg cards-svg" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.max(cardInset * 2, nextY - cardGap + cardInset)}" aria-label="${esc(t('ast'))}">${edges}${nodes}</svg>`;
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
        height = Math.max(350, count * dependencyStride + 80),
        mid = (height - nodeHeight) / 2;
      const positions = new Map([[selected, [324, mid]]]);
      incoming.forEach((id, i) => positions.set(id, [12, 40 + i * dependencyStride]));
      outgoing.forEach((id, i) => {
        if (!positions.has(id)) positions.set(id, [636, 40 + i * dependencyStride]);
      });
      let paths = '',
        nodes = '';
      for (const [a, b] of edges) {
        if (a === b) continue;
        const pa = positions.get(a),
          pb = positions.get(b);
        if (!pa || !pb) continue;
        const right = pa[0] < pb[0];
        const x1 = pa[0] + (right ? dependencyWidth : 0),
          x2 = pb[0] + (right ? 0 : dependencyWidth),
          y1 = pa[1] + nodeHeight / 2,
          y2 = pb[1] + nodeHeight / 2;
        paths += `<path d="M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}" class="dependency-path" marker-end="url(#arrow)"/>`;
      }
      for (const [id, [x, y]] of positions) {
        const n = model.nodes.get(id);
        if (n) nodes += svgNode(n, x, y, dependencyWidth);
      }
      $('types').innerHTML =
        `<div class="dep-caption">${esc(t('graph.edges'))}</div><svg class="dep-svg" xmlns="http://www.w3.org/2000/svg" width="${908 * typesZoom}" height="${height * typesZoom}" viewBox="0 0 908 ${height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" class="dependency-arrow"/></marker></defs>${paths}${nodes}</svg>`;
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
