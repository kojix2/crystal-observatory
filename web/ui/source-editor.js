import { renderCrystal } from '../core/crystal-highlight.js';
import { t } from '../i18n/index.js';
import { $ } from './dom.js';

export class SourceEditor {
  constructor(onChange) {
    this.recordedSource = '';
    this.line = 0;
    this.hasRecord = false;
    this.coloredSource = null;
    $('source').oninput = () => {
      this.refresh();
      onChange();
    };
    $('source').onscroll = () => this.scroll();
    $('source').onkeydown = (event) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const source = $('source');
      source.setRangeText('  ', source.selectionStart, source.selectionEnd, 'end');
      source.dispatchEvent(new Event('input'));
    };
    $('restore').onclick = () => {
      this.value = this.recordedSource;
      onChange();
    };
  }
  get value() {
    return $('source').value;
  }
  set value(value) {
    $('source').value = value;
    this.refresh();
  }
  get dirty() {
    return this.value !== this.recordedSource;
  }
  setRecord(source, preserveEdits = false, hasRecord = true) {
    this.recordedSource = source;
    this.hasRecord = hasRecord;
    this.line = 0;
    this.nodeId = null;
    this.pendingReveal = false;
    if (!preserveEdits) this.value = source;
    this.refresh();
  }
  refresh() {
    if (this.coloredSource !== this.value) {
      this.coloredSource = this.value;
      renderCrystal($('source-colors'), this.value + '\n');
    }
    $('line-numbers').textContent = Array.from(
      { length: this.value.split('\n').length },
      (_, i) => i + 1,
    ).join('\n');
    $('dirty').textContent = t(this.dirty ? 'dirty' : this.hasRecord ? 'clean' : 'source.ready');
    $('restore').hidden = !this.dirty;
    this.scroll();
  }
  metrics() {
    const style = window.getComputedStyle($('source'));
    return { lineHeight: parseFloat(style.lineHeight), padding: parseFloat(style.paddingTop) };
  }
  scroll() {
    const { lineHeight, padding } = this.metrics();
    const source = $('source');
    if (
      this.pendingReveal &&
      this.line &&
      !this.dirty &&
      source.clientHeight > 0 &&
      !$('source-view').hidden
    ) {
      const y = (this.line - 1) * lineHeight;
      if (y < source.scrollTop || y > source.scrollTop + source.clientHeight - 2 * lineHeight)
        source.scrollTop = Math.max(0, y - 2.5 * lineHeight);
      this.pendingReveal = false;
    }
    $('source-location').textContent =
      this.line && !this.dirty ? `L${this.line}:${this.column}` : '';
    $('source-colors').style.transform =
      `translate(${-$('source').scrollLeft}px, ${-$('source').scrollTop}px)`;
    $('line-numbers').style.transform = `translateY(${-$('source').scrollTop}px)`;
    $('highlight').style.display = this.line > 0 && !this.dirty ? 'block' : 'none';
    $('highlight').style.top =
      `${padding + (this.line - 1) * lineHeight - $('source').scrollTop}px`;
  }
  highlight(node) {
    const changed = this.nodeId !== node?.id || this.line !== (node?.line || 0);
    this.nodeId = node?.id;
    this.line = node?.line || 0;
    this.column = node?.column || 0;
    if (changed) this.pendingReveal = this.line > 0;
    this.scroll();
  }
}
