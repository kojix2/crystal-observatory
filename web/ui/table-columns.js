import { bindDivider, range } from './divider.js';
import { paneWidths, moveDivider } from '../core/layout.js';

export function setupTableColumns(table, { key, minimums, defaults }) {
  const columns = [...table.querySelectorAll('col')];
  const handles = [...table.querySelectorAll('[role="separator"]')];
  let weights = null;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (
      Array.isArray(saved) &&
      saved.length === columns.length &&
      saved.every((value) => Number.isFinite(value) && value > 0) &&
      Number.isFinite(saved.reduce((sum, value) => sum + value, 0))
    )
      weights = saved;
  } catch {
    /* Optional preference. */
  }
  const measure = () => {
    const width = Math.max(
      minimums.reduce((sum, value) => sum + value, 0),
      table.getBoundingClientRect().width,
    );
    return paneWidths(width, weights || defaults(width), minimums);
  };
  const persist = () => {
    try {
      localStorage.setItem(key, JSON.stringify(weights));
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
    handles.forEach((handle, index) => {
      handle.tabIndex = 0;
      range(
        handle,
        widths[index],
        minimums[index],
        widths[index] + widths[index + 1] - minimums[index + 1],
      );
    });
  }
  const reset = () => {
    weights = null;
    apply();
  };
  handles.forEach((handle, index) =>
    bindDivider(handle, {
      axis: 'x',
      enabled: () => true,
      measure,
      persist,
      move: (widths, delta) => {
        weights = moveDivider(widths, index, delta, minimums);
        apply();
      },
      reset,
    }),
  );
  const observer = new ResizeObserver(apply);
  observer.observe(table);
  apply();
  return {
    destroy() {
      observer.disconnect();
    },
    reset() {
      reset();
      persist();
    },
  };
}
