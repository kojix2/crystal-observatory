import { t } from '../i18n/index.js';
import { $ } from './dom.js';
import { indexIR } from '../core/trace-model.js';
import { renderLLVM } from '../core/llvm-highlight.js';

export class IRView {
  constructor() {
    this.functions = [];
    this.selected = '';
    this.hasIR = false;
    this.visible = false;
    this.following = true;
    $('ir-search').oninput = () => {
      this.following = false;
      this.filter();
    };
    $('ir-function').onchange = () => {
      this.following = false;
      this.selected = $('ir-function').value;
      this.render();
    };
  }
  load(ir, prelude = null) {
    $('ir-prelude').hidden = !prelude;
    $('ir-prelude').textContent = prelude ? `--prelude ${prelude}` : '';
    this.hasIR = Boolean(ir);
    this.functions = indexIR(ir);
    this.selected = '';
    this.following = true;
    this.renderedText = null;
    $('ir-code').scrollTop = 0;
    $('ir-code').scrollLeft = 0;
    $('ir-search').value = '';
    this.filter();
  }
  follow(name, block = '', force = false) {
    if (!force && !this.following) return;
    if (!name || !this.functions.some((fn) => fn.name === name)) return;
    this.following = true;
    this.selected = name;
    $('ir-search').value = '';
    this.filter();
    if (block) {
      const pre = $('ir-code');
      const line = pre.textContent.split('\n').findIndex((line) => line.startsWith(`${block}:`));
      if (line >= 0)
        pre.scrollTop = line * (parseFloat(window.getComputedStyle(pre).lineHeight) || 18);
    }
  }
  filter() {
    const term = $('ir-search').value.toLowerCase();
    const list = this.functions.filter((fn) => fn.name.toLowerCase().includes(term));
    if (!list.some((fn) => fn.name === this.selected))
      this.selected = list.find((fn) => fn.name === '__crystal_main')?.name || list[0]?.name || '';
    $('ir-function').replaceChildren(...list.map((fn) => new Option(fn.name, fn.name)));
    $('ir-function').value = this.selected;
    this.render();
  }
  render(visible = this.visible) {
    this.visible = visible;
    const fn = this.functions.find((fn) => fn.name === this.selected);
    const content = fn?.text ?? t(this.hasIR ? 'ir.noMatch' : 'ir.none');
    if (content !== this.renderedText) {
      if (fn) renderLLVM($('ir-code'), content);
      else $('ir-code').textContent = content;
      this.renderedText = content;
    }
    if (visible)
      $('ir-caption').textContent = fn
        ? t('ir.caption', { count: this.functions.length })
        : t('ir.prompt');
  }
}
