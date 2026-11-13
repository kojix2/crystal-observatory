const views = ['source', 'tokens', 'ast', 'declarations', 'types', 'ir'];

export const comparisonTargets = (view) =>
  views.includes(view) ? views.filter((target) => target !== view) : [];
export const viewLabel = (view) => ({ ast: 'AST', ir: 'LLVM IR', tokens: 'Tokens' })[view];
export const viewLabelKey = (view) => ({ declarations: 'decl.title' })[view] || view;

export class ViewLayout {
  constructor(primary = 'source') {
    this.primary = primary;
    this.secondary = null;
  }
  get views() {
    return this.secondary ? [this.primary, this.secondary] : [this.primary];
  }
  has(view) {
    return this.views.includes(view);
  }
  compare(view) {
    if (!comparisonTargets(this.primary).includes(view)) return false;
    this.secondary = view;
    return true;
  }
  show(view) {
    if (this.has(view)) return;
    this.primary = view;
    this.secondary = null;
  }
  close() {
    this.secondary = null;
  }
}

export const comparisonRatio = (value) =>
  Number.isFinite(value) && value > 0 && value < 1 ? value : 0.5;

export function comparisonWidths(available, ratio) {
  const total = Math.max(640, available);
  const left = Math.max(320, Math.min(total - 320, total * comparisonRatio(ratio)));
  return [left, total - left];
}
