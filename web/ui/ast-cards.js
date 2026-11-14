import { t } from '../i18n/index.js';
import { esc } from './dom.js';
import { icon } from './icons.js';
import { visitDecoration } from './ast-visitation.js';

const typeWidths = new WeakMap();
const letterWidth = 7.8;
const declarationKinds = new Set([
  'Def',
  'FunDef',
  'ClassDef',
  'ModuleDef',
  'EnumDef',
  'LibDef',
  'Alias',
  'TypeDef',
  'ExternalVar',
  'CStructOrUnionDef',
  'CEnumDef',
  'AnnotationDef',
  'Include',
  'Extend',
  'Macro',
]);
const prefixes = new Map([
  ['Def', 'def'],
  ['FunDef', 'fun'],
  ['ClassDef', 'class'],
  ['ModuleDef', 'module'],
  ['EnumDef', 'enum'],
  ['LibDef', 'lib'],
  ['Alias', 'alias'],
  ['TypeDef', 'type'],
  ['Include', 'include'],
  ['Extend', 'extend'],
  ['Macro', 'macro'],
  ['If', 'if'],
  ['Unless', 'unless'],
  ['While', 'while'],
  ['Until', 'until'],
  ['Block', 'do'],
]);

function columns(value) {
  let width = 0;
  for (const char of String(value || '')) width += char.codePointAt(0) > 0xff ? 2 : 1;
  return width;
}

// Keep literal contents intact, including repeated spaces and Unicode characters.
function fitText(value, budget) {
  if (budget <= 0) return '';
  if (columns(value) <= budget) return value;
  let result = '',
    used = 0;
  for (const char of value) {
    const width = char.codePointAt(0) > 0xff ? 2 : 1;
    if (used + width > budget - 1) break;
    result += char;
    used += width;
  }
  return `${result}…`;
}

function summary(node) {
  if (node.kind === 'Expressions') return '';
  const text = (node.label || '').split(/\r?\n/, 1)[0].trim();
  const prefix = prefixes.get(node.kind);
  if (text === prefix) return '';
  // Only remove an explicit leading keyword. Older recordings do not expose
  // method names or child roles, so do not guess them by parsing printed code.
  return prefix && text.startsWith(`${prefix} `) ? text.slice(prefix.length + 1) : text;
}

function recordedTypeWidths(trace) {
  if (typeWidths.has(trace)) return typeWidths.get(trace);
  const widths = new Map();
  const record = (id, type) => {
    if (type) widths.set(id, Math.max(widths.get(id) || 0, columns(type)));
  };
  for (const node of trace.nodes || []) record(node.id, node.inferred_type);
  for (const snapshot of trace.snapshots || [])
    for (const node of snapshot.nodes) record(node.id, node.inferred_type);
  for (const event of trace.events || [])
    if (
      event.kind === 'type' ||
      (event.kind === 'activity' && event.activity === 'fix_missing_type')
    ) {
      record(event.node_id, event.before);
      record(event.node_id, event.after);
    }
  typeWidths.set(trace, widths);
  return widths;
}

export function measureASTCard(row, { trace, state, collapsed, availableWidth }) {
  const { node, reference, edge } = row;
  const { family, type } = state;
  const branchCount =
    (node.children?.length || 0) +
    (node.targets?.length || 0) +
    (node.hook_expansions?.length || 0) +
    (node.expanded ? 1 : 0);
  const hasKids = !reference && branchCount > 0;
  const folded = hasKids && collapsed.has(node.id);
  // A typed target Def is a resolved method; ordinary declarations' Nil is the
  // declaration expression's type and would be misleading beside the signature.
  const showType = !declarationKinds.has(node.kind) || edge === 'target';
  const typeWidth = showType ? recordedTypeWidths(trace).get(node.id) || 0 : 0;
  const reserveType = typeWidth > 0;
  const typeText = reserveType ? type || t('ast.typeUnobserved') : '';
  const countText = folded ? t('ast.branchCount', { count: branchCount }) : '';
  const value = summary(node);
  const inset = hasKids ? 36 : 12;
  const markWidth = reference ? 20 : 0;
  const kindWidth = columns(node.kind) * letterWidth;
  const valueWidth = value ? 10 + columns(value) * letterWidth : 0;
  const footerWidth =
    (reserveType ? Math.max(typeWidth, columns(t('ast.typeUnobserved'))) * letterWidth : 0) +
    (countText ? columns(countText) * letterWidth + (reserveType ? 12 : 0) : 0);
  const desiredWidth = Math.ceil(
    inset + Math.max(kindWidth + valueWidth + markWidth, footerWidth) + 12,
  );
  const minimumWidth = Math.min(
    340,
    Math.max(96, Math.ceil(inset + kindWidth + markWidth + 12 + (value ? 10 + letterWidth : 0))),
  );
  const width = Math.max(minimumWidth, Math.min(340, availableWidth, desiredWidth));
  const height = reserveType || folded ? 44 : 28;
  const headingBudget = Math.floor((width - inset - 12 - markWidth) / letterWidth);
  const kind = fitText(node.kind, headingBudget);
  const valueBudget = Math.floor((width - inset - 12 - markWidth - kindWidth - 10) / letterWidth);
  const displayedValue = value && valueBudget > 0 ? fitText(value, valueBudget) : '';
  const displayedCount = fitText(countText, Math.floor((width - inset - 12) / letterWidth));
  const countWidth = columns(displayedCount) * letterWidth;
  const typeBudget = Math.floor(
    (width - inset - 12 - countWidth - (countText ? 12 : 0)) / letterWidth,
  );
  const label = `${t('graph.node', { kind: node.kind, type: showType ? typeText || type : '', id: node.id })}${node.label ? ` · ${node.label}` : ''}${folded ? ` · ${countText}` : ''}${reference ? ` · ${t('ast.reference')}` : ''}`;
  const tooltip = `${label}\n${t(`ast.family.${family}`)}`;
  return {
    width,
    height,
    inset,
    kind,
    displayedValue,
    displayedCount,
    typeText,
    typeBudget,
    reserveType,
    countText,
    hasKids,
    folded,
    label,
    tooltip,
  };
}

export function renderASTCard(
  row,
  { trace, state, selected, collapsed, x, y, availableWidth, visit, metrics, layout = 'cards' },
) {
  const { node, reference } = row;
  const { family, type, changed } = state;
  const {
    width,
    height,
    inset,
    kind,
    displayedValue,
    displayedCount,
    typeText,
    typeBudget,
    reserveType,
    countText,
    hasKids,
    folded,
    label,
    tooltip,
  } = metrics || measureASTCard(row, { trace, state, collapsed, availableWidth });
  const fold = hasKids
    ? `<g class="card-fold" data-fold="${node.id}" tabindex="0" role="button" aria-expanded="${!folded}" aria-label="${esc(t(folded ? 'ast.expandNode' : 'ast.collapseNode', { id: node.id }))}" transform="translate(17 14)"><rect x="-10" y="-10" width="20" height="20" rx="3"/><text text-anchor="middle" y="4">${folded ? '+' : '−'}</text></g>`
    : '';
  const mark = reference
    ? `<g class="svg-mark" transform="translate(${width - 24} 8)">${icon('reference', { size: 12 })}</g>`
    : '';
  const dispatch = visit
    ? visitDecoration(node.id, visit, { width, height, reference })
    : { classes: '', attributes: '', shape: '' };
  const nodeClass = layout === 'mindmap' ? 'mindmap-node card-node' : 'card-node';
  const html = `<g class="node ${nodeClass} ${node.id === selected ? 'selected' : ''} ${changed ? 'changed' : ''} ${reference ? 'reference' : ''}${dispatch.classes}"${dispatch.attributes} data-node="${node.id}" data-node-family="${family}" tabindex="0" role="button" aria-label="${esc(label)}" transform="translate(${x} ${y})"><title>${esc(tooltip)}</title><rect class="tile" width="${width}" height="${height}" rx="4"/><rect class="accent" width="3" height="${height}" rx="1"/>${fold}<text x="${inset}" y="18" class="svg-card-heading" xml:space="preserve"><tspan class="svg-kind">${esc(kind)}</tspan>${displayedValue ? `<tspan class="svg-card-value" dx="10">${esc(displayedValue)}</tspan>` : ''}</text>${mark}${typeText ? `<text x="${inset}" y="35" class="${type ? 'svg-type' : 'svg-card-pending'}">${esc(fitText(typeText, typeBudget))}</text>` : ''}${countText ? `<text x="${reserveType ? width - 12 : inset}" y="35"${reserveType ? ' text-anchor="end"' : ''} class="svg-card-count">${esc(displayedCount)}</text>` : ''}${dispatch.shape}</g>`;
  return { html, width, height, right: dispatch.right || 0 };
}
