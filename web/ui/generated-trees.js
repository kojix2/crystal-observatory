import { flattenAST } from '../core/trace-model.js';
import { getLocale, t } from '../i18n/index.js';
import { $, esc } from './dom.js';

export function clearGeneratedTrees() {
  const panel = $('generated-trees');
  panel.hidden = true;
  if (!panel.generatedState) return;
  delete panel.generatedState;
  $('generated-method').onchange = null;
  $('generated-nodes').onclick = null;
  for (const id of ['generated-method', 'generated-nodes', 'generated-meta'])
    $(id).replaceChildren();
}

// A revision is captured from a generated Def, independently of the source AST.
export function renderGeneratedTrees(trees, root, selected, index, onRoot, onNode) {
  if (!trees.size) return clearGeneratedTrees();
  const panel = $('generated-trees');
  panel.hidden = false;
  const select = $('generated-method');
  const last = panel.generatedState;
  const locale = getLocale();
  if (trees !== last?.trees || locale !== last.locale) {
    select.replaceChildren(
      ...Array.from(trees, ([id, { event }]) => {
        const tree = event.generated_tree;
        const label = (tree.nodes[0].label || 'new').replace(/^def /, '');
        return new Option(`${tree.name} · ${label}  #${id}`, id);
      }),
    );
  }
  if (!trees.has(root)) {
    let latest = -1;
    for (const [id, { event }] of trees) {
      if (event.index > latest) {
        latest = event.index;
        root = id;
      }
    }
  }
  select.value = root;
  select.onchange = () => onRoot(Number(select.value));

  const { event, previous } = trees.get(root);
  const current = event.index === index;
  const selection = event.generated_tree.nodes.some((n) => n.id === selected) ? selected : 0;
  panel.generatedState = { trees, locale, event, current, selection };
  if (
    last?.event === event &&
    last.locale === locale &&
    last.current === current &&
    last.selection === selection
  )
    return selection;
  const signature = event.activity === 'register_initializer';
  const origin = signature ? event.node_id : event.related_id;
  const status = t(signature ? 'ast.signatureOnly' : 'ast.newBody');
  const meta = $('generated-meta');
  meta.innerHTML = `<strong>${esc(status)}</strong><span>${esc(event.visitor.replace(/^Crystal::/, ''))}</span>${origin ? `<button type="button" class="link-button" data-node="${origin}">${esc(t('ast.newOrigin'))} · initialize #${origin}</button>` : ''}`;
  if (origin) meta.querySelector('button').onclick = () => onNode(origin);

  const oldIds = new Set(previous?.nodes.map((node) => node.id));
  const rows = flattenAST(event.generated_tree);
  const container = $('generated-nodes');
  container.innerHTML = rows
    .map(({ node, depth, reference }) => {
      const added = current && !oldIds.has(node.id);
      const label = node.kind === 'Expressions' ? '' : node.label;
      return `<div class="generated-row" style="--depth:${depth}"><button type="button" data-node="${node.id}" aria-pressed="${node.id === selected}" class="${added ? 'generated-added' : ''}">${added ? `<span class="generated-plus" aria-label="${esc(t('ast.addedNode'))}">+</span>` : ''}<b>${esc(node.kind)}</b>${label ? ` <code>${esc(label)}</code>` : ''} <small>${reference ? '↪ ' : ''}#${node.id}</small></button></div>`;
    })
    .join('');
  container.onclick = (e) => {
    const button = e.target.closest('button[data-node]');
    if (button) onNode(Number(button.dataset.node));
  };
  if (container.dataset.revision !== String(event.index)) container.scrollTop = 0;
  container.dataset.revision = String(event.index);
  return selection;
}
