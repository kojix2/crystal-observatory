import { $ } from './dom.js';
import { setupMobileWorkspace } from './mobile-workspace.js';
import { t } from '../i18n/index.js';
import { comparisonRatio, comparisonWidths } from '../core/view-layout.js';
import {
  DEFAULT_PANES,
  PANE_GAP,
  paneWeights,
  moveDivider,
  workspaceLayout,
  workspaceMinimumWidth,
  detailHeights,
} from '../core/layout.js';

import { bindDivider, range } from './divider.js';

function setHandleEnabled(handle, active) {
  handle.tabIndex = active ? 0 : -1;
  handle.setAttribute('aria-disabled', !active);
}
function label(button, key) {
  button.dataset.i18nAria = button.dataset.i18nTitle = key;
  button.setAttribute('aria-label', t(key));
  button.title = t(key);
}
export function setupWorkspace(onResize, { onReset = () => {} } = {}) {
  const app = $('app'),
    bench = $('workbench');
  const handles = ['timeline-splitter', 'inspector-splitter'].map($);
  const mobile = setupMobileWorkspace(() => {
    apply();
    onResize();
  });
  // Retain the saved proportions of History, observations and Details.
  const key = 'crystal-observatory.workspace.v5';
  const comparisonKey = 'crystal-observatory.comparison.v1';
  let weights = [...DEFAULT_PANES],
    detailRatio = 0.42,
    compareRatio = 0.5,
    resizeFrame;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    const details =
      saved ||
      JSON.parse(localStorage.getItem('crystal-observatory.workspace.v4')) ||
      JSON.parse(localStorage.getItem('crystal-observatory.workspace.v3'));
    weights = paneWeights(saved?.weights);
    if (Number.isFinite(details?.detailRatio) && details.detailRatio > 0 && details.detailRatio < 1)
      detailRatio = details.detailRatio;
    app.classList.toggle('trace-collapsed', saved?.collapsed === true);
  } catch {
    /* Optional preference. */
  }
  try {
    compareRatio = comparisonRatio(JSON.parse(localStorage.getItem(comparisonKey))?.ratio);
  } catch {
    /* Optional preference. */
  }
  const comparing = () => app.classList.contains('comparing');
  const historyCollapsed = () => app.classList.contains('trace-collapsed');
  const layoutOptions = () => ({
    historyCollapsed: historyCollapsed(),
    comparing: comparing(),
  });
  const persist = () => {
    if (comparing()) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          weights,
          detailRatio,
          collapsed: historyCollapsed(),
        }),
      );
    } catch {
      /* Private browsing. */
    }
  };
  const sizes = () => workspaceLayout(bench.clientWidth, weights, layoutOptions());
  const widths = () => sizes().panes;
  const minimums = () => sizes().minimums;
  const compareWidths = () =>
    comparisonWidths($('observation-scroll').clientWidth - PANE_GAP, compareRatio);
  const persistComparison = () => {
    try {
      localStorage.setItem(comparisonKey, JSON.stringify({ ratio: compareRatio }));
    } catch {
      /* Private browsing. */
    }
  };
  const heights = () => detailHeights($('inspector-panel').clientHeight - 6, detailRatio);
  function apply() {
    mobile.refresh();
    if (mobile.active) {
      bench.style.minWidth = '0';
      for (const handle of [...handles, $('detail-splitter'), $('comparison-splitter')])
        setHandleEnabled(handle, false);
      return;
    }
    bench.style.minWidth = enabled() ? `${workspaceMinimumWidth(layoutOptions())}px` : '0';
    const { panes, minimums } = sizes();
    bench.style.setProperty('--pane-columns', panes.map((n) => `${n}px`).join(` ${PANE_GAP}px `));
    handles.forEach((handle, i) => {
      range(handle, panes[i], minimums[i], panes[i] + panes[i + 1] - minimums[i + 1]);
      setHandleEnabled(handle, enabled() && (i !== 0 || !historyCollapsed()));
    });
    $('toggle-trace').setAttribute('aria-expanded', !historyCollapsed());
    label($('toggle-trace'), historyCollapsed() ? 'trace.expand' : 'trace.collapse');
    const [top, bottom] = heights();
    $('inspector-panel').style.gridTemplateRows = `${top}px 6px ${bottom}px`;
    range($('detail-splitter'), top, 150, top + bottom - 190);
    setHandleEnabled($('detail-splitter'), enabled());
    setHandleEnabled($('comparison-splitter'), comparing());
    if (comparing()) {
      const [left, right] = compareWidths();
      $('observation-views').style.setProperty('--comparison-columns', `${left}px 6px ${right}px`);
      range($('comparison-splitter'), left, 320, left + right - 320);
    }
  }
  const enabled = () => !mobile.active && !app.classList.contains('graph-maximized');
  handles.forEach((handle, i) =>
    bindDivider(handle, {
      axis: 'x',
      enabled: () => enabled() && (i !== 0 || !historyCollapsed()),
      measure: widths,
      persist,
      move: (panes, delta) => {
        weights = moveDivider(panes, i, delta, minimums());
        apply();
      },
      reset: () => {
        const panes = widths(),
          pair = panes[i] + panes[i + 1];
        weights = moveDivider(
          panes,
          i,
          (pair * DEFAULT_PANES[i]) / (DEFAULT_PANES[i] + DEFAULT_PANES[i + 1]) - panes[i],
          minimums(),
        );
        apply();
      },
    }),
  );
  bindDivider($('comparison-splitter'), {
    axis: 'x',
    enabled: () => !mobile.active && comparing(),
    measure: compareWidths,
    persist: persistComparison,
    move: ([left, right], delta) => {
      const total = left + right;
      compareRatio = Math.max(320, Math.min(total - 320, left + delta)) / total;
      apply();
    },
    reset: () => {
      compareRatio = 0.5;
      apply();
    },
  });
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
  function maximize(active) {
    app.classList.toggle('graph-maximized', active);
    $('maximize-graph').setAttribute('aria-pressed', active);
    label($('maximize-graph'), active ? 'unmaximize' : 'maximize');
    apply();
  }
  function collapse(active) {
    app.classList.toggle('trace-collapsed', active);
    apply();
  }
  $('maximize-graph').onclick = () => maximize(!app.classList.contains('graph-maximized'));
  $('toggle-trace').onclick = () => {
    collapse(!historyCollapsed());
    persist();
  };
  $('reset-layout').onclick = () => {
    onReset();
    weights = [...DEFAULT_PANES];
    detailRatio = 0.42;
    compareRatio = 0.5;
    mobile.showPane('work');
    maximize(false);
    collapse(false);
    persist();
    persistComparison();
  };
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) maximize(false);
  });
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(apply);
  });
  let renderFrame;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(onResize);
  });
  document.querySelectorAll('[data-observation]').forEach((element) => observer.observe(element));
  apply();
  return {
    refresh: apply,
    showPane: mobile.showPane,
    setDetailContext: mobile.setDetailContext,
    get mobile() {
      return mobile.active;
    },
    capture: () => ({
      weights: [...weights],
      detailRatio,
      maximized: app.classList.contains('graph-maximized'),
      collapsed: app.classList.contains('trace-collapsed'),
    }),
    restore: (saved) => {
      weights = [...saved.weights];
      detailRatio = saved.detailRatio;
      collapse(saved.collapsed);
      maximize(saved.maximized);
      persist();
    },
  };
}
