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
    $('ir-search').oninput = () => this.filter();
    $('ir-function').onchange = () => {
      this.selected = $('ir-function').value;
      this.render();
    };
  }
  load(ir) {
    this.hasIR = Boolean(ir);
    this.functions = indexIR(ir);
    this.selected = '';
    $('ir-search').value = '';
    this.filter();
  }
  follow(name, block = '') {
    if (!name || !this.functions.some((fn) => fn.name === name)) return;
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
    if (fn) renderLLVM($('ir-code'), fn.text);
    else $('ir-code').textContent = this.hasIR ? t('ir.noMatch') : t('ir.none');
    if (visible)
      $('graph-caption').textContent = fn
        ? t('ir.caption', { count: this.functions.length })
        : t('ir.prompt');
  }
}
