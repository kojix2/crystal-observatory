import { $ } from './dom.js';
import { bindDivider } from './divider.js';
import { paneWidths, moveDivider } from '../core/layout.js';

const KEY = 'crystal-observatory.history-columns.v1';
const MINIMUMS = [44, 80, 80];

export function setupHistoryColumns() {
  const table = $('history-table');
  const columns = [...table.querySelectorAll('col')];
  const handles = [...table.querySelectorAll('[role="separator"]')];
  let weights = null;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (
      Array.isArray(saved) &&
      saved.length === 3 &&
      saved.every((value) => Number.isFinite(value) && value > 0) &&
      Number.isFinite(saved.reduce((sum, value) => sum + value, 0))
    )
      weights = saved;
  } catch {
    /* Optional preference. */
  }
  const measure = () => {
    const width = Math.max(204, table.getBoundingClientRect().width);
    return paneWidths(width, weights || [72, width * 0.61 - 72, width * 0.39], MINIMUMS);
  };
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(weights));
    } catch {
      /* Private browsing. */
    }
  };
  function apply() {
    const widths = measure();
    const total = widths.reduce((sum, value) => sum + value, 0);
    columns.forEach((column, index) => {
      column.style.width = `${(widths[index] / total) * 100}%`;
    });
  }
  const reset = () => {
    weights = null;
    apply();
  };
  handles.forEach((handle, index) =>
    bindDivider(handle, {
      axis: 'x',
      keyboard: false,
      enabled: () => true,
      measure,
      persist,
      move: (widths, delta) => {
        weights = moveDivider(widths, index, delta, MINIMUMS);
        apply();
      },
      reset,
    }),
  );
  const observer = new ResizeObserver(apply);
  observer.observe(table);
  apply();
  return {
    reset() {
      reset();
      persist();
    },
  };
}
