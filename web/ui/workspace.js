import { $ } from './dom.js';
import { t } from '../i18n/index.js';
import {
  DEFAULT_PANES,
  MIN_PANES,
  paneWeights,
  paneWidths,
  moveDivider,
  detailHeights,
} from '../core/layout.js';

// Columns and the stacked inspector share keyboard/pointer behavior.
function bindDivider(handle, { axis, enabled, measure, move, reset, persist }) {
  const coordinate = axis === 'x' ? 'clientX' : 'clientY';
  const keys = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  let drag;
  handle.addEventListener('pointerdown', (event) => {
    if (!enabled() || event.button !== 0) return;
    drag = { origin: event[coordinate], sizes: measure() };
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('dragging');
    document.body.classList.add('resizing');
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (drag) move(drag.sizes, event[coordinate] - drag.origin);
  });
  const finish = () => {
    if (!drag) return;
    drag = null;
    handle.classList.remove('dragging');
    document.body.classList.remove('resizing');
    persist();
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    handle.addEventListener(name, finish);
  handle.addEventListener('dblclick', () => {
    if (enabled()) {
      reset();
      persist();
    }
  });
  handle.addEventListener('keydown', (event) => {
    if (!enabled() || ![...keys, 'Home'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Home') reset();
    else move(measure(), (event.key === keys[1] ? 1 : -1) * (event.shiftKey ? 40 : 12));
    persist();
  });
}
function range(handle, value, min, max) {
  handle.setAttribute('aria-valuemin', min);
  handle.setAttribute('aria-valuemax', Math.round(max));
  handle.setAttribute('aria-valuenow', Math.round(value));
  handle.setAttribute('aria-valuetext', `${Math.round(value)}px`);
}
export function setupWorkspace(onResize) {
  const app = $('app'),
    bench = $('workbench');
  const handles = ['timeline-splitter', 'inspector-splitter'].map($);
  // v2 had four columns in a different order; do not reinterpret those settings.
  const key = 'crystal-observatory.workspace.v3';
  let weights = [...DEFAULT_PANES],
    detailRatio = 0.42,
    resizeFrame;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    weights = paneWeights(saved?.weights);
    if (Number.isFinite(saved?.detailRatio) && saved.detailRatio > 0 && saved.detailRatio < 1)
      detailRatio = saved.detailRatio;
  } catch {
    /* Optional preference. */
  }
  const persist = () => {
    try {
      localStorage.setItem(key, JSON.stringify({ weights, detailRatio }));
    } catch {
      /* Private browsing. */
    }
  };
  const widths = () => paneWidths(bench.clientWidth - 12, weights);
  const heights = () => detailHeights($('inspector-panel').clientHeight - 6, detailRatio);
  function apply() {
    const panes = widths();
    if (app.classList.contains('trace-collapsed')) {
      panes[1] += panes[0] - 32;
      panes[0] = 32;
    }
    bench.style.setProperty('--pane-columns', panes.map((n) => `${n}px`).join(' 6px '));
    handles.forEach((handle, i) =>
      range(handle, panes[i], MIN_PANES[i], panes[i] + panes[i + 1] - MIN_PANES[i + 1]),
    );
    const [top, bottom] = heights();
    $('inspector-panel').style.gridTemplateRows = `${top}px 6px ${bottom}px`;
    range($('detail-splitter'), top, 150, top + bottom - 190);
  }
  const enabled = () => !app.classList.contains('graph-maximized');
  handles.forEach((handle, i) =>
    bindDivider(handle, {
      axis: 'x',
      enabled: () => enabled() && !app.classList.contains('trace-collapsed'),
      measure: widths,
      persist,
      move: (panes, delta) => {
        weights = moveDivider(panes, i, delta);
        apply();
      },
      reset: () => {
        const panes = widths(),
          pair = panes[i] + panes[i + 1];
        weights = moveDivider(
          panes,
          i,
          (pair * DEFAULT_PANES[i]) / (DEFAULT_PANES[i] + DEFAULT_PANES[i + 1]) - panes[i],
        );
        apply();
      },
    }),
  );
  bindDivider($('detail-splitter'), {
    axis: 'y',
    enabled,
    measure: heights,
    persist,
    move: ([top, bottom], delta) => {
      const total = top + bottom;
      detailRatio = detailHeights(total, (top + delta) / total)[0] / total;
      apply();
    },
    reset: () => {
      detailRatio = 0.42;
      apply();
    },
  });
  function label(button, key) {
    button.dataset.i18nAria = button.dataset.i18nTitle = key;
    button.setAttribute('aria-label', t(key));
    button.title = t(key);
  }
  function maximize(active) {
    app.classList.toggle('graph-maximized', active);
    $('maximize-graph').setAttribute('aria-pressed', active);
    label($('maximize-graph'), active ? 'unmaximize' : 'maximize');
    apply();
  }
  function collapse(active) {
    app.classList.toggle('trace-collapsed', active);
    $('toggle-trace').setAttribute('aria-expanded', !active);
    $('toggle-trace').textContent = active ? '›' : '‹';
    label($('toggle-trace'), active ? 'trace.expand' : 'trace.collapse');
    handles.forEach((handle) => {
      handle.tabIndex = active ? -1 : 0;
      handle.setAttribute('aria-disabled', active);
    });
    apply();
  }
  $('maximize-graph').onclick = () => maximize(!app.classList.contains('graph-maximized'));
  $('toggle-trace').onclick = () => collapse(!app.classList.contains('trace-collapsed'));
  $('reset-layout').onclick = () => {
    weights = [...DEFAULT_PANES];
    detailRatio = 0.42;
    maximize(false);
    collapse(false);
    persist();
  };
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) maximize(false);
  });
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(apply);
  });
  new ResizeObserver(() => requestAnimationFrame(onResize)).observe($('graph-panel'));
  apply();
}
