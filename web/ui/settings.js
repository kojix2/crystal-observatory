import { colorGroups, colorSettings, isColor, normalizeSettings } from '../core/settings.js';
import { $, esc } from './dom.js';
import { summaryLabel } from './icons.js';
import { text } from './language.js';
import { t } from '../i18n/index.js';

const STORAGE_KEY = 'crystal-observatory.settings.v1';

export function setupSettings() {
  const root = document.documentElement;
  const computed = window.getComputedStyle(root);
  const defaults = Object.fromEntries(
    colorSettings.map(({ id, variable }) => [id, computed.getPropertyValue(variable).trim()]),
  );
  let settings = normalizeSettings(null);
  try {
    settings = normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    // An invalid or unavailable preference must never prevent startup.
  }

  const container = $('color-settings');
  container.replaceChildren(
    ...colorGroups.map((group, index) => {
      const details = document.createElement('details');
      details.className = 'settings-group';
      details.open = index === 0;
      const summary = document.createElement('summary');
      summaryLabel(summary).dataset.i18n = `settings.group.${group.id}`;
      const grid = document.createElement('div');
      grid.className = 'settings-colors';
      for (const { id, labelKey, label } of group.colors) {
        const row = document.createElement('div');
        row.className = 'color-setting';
        row.innerHTML = `<label for="color-${id}">${esc(label || '')}</label>
        <input type="color" id="color-${id}" data-color="${id}">
        <output id="color-value-${id}" for="color-${id}" aria-hidden="true"></output>`;
        if (labelKey) row.querySelector('label').dataset.i18n = labelKey;
        grid.append(row);
      }
      details.append(summary, grid);
      return details;
    }),
  );

  const apply = () => {
    root.dataset.astColors = String(settings.astColors);
    $('ast-node-colors').checked = settings.astColors;
    for (const { id, variable } of colorSettings) {
      const value = settings.colors[id] || defaults[id];
      if (settings.colors[id]) root.style.setProperty(variable, value);
      else root.style.removeProperty(variable);
      $(`color-${id}`).value = value;
      $(`color-value-${id}`).value = value.toUpperCase();
    }
  };
  const persist = () => {
    let saved = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      saved = false;
    }
    text('settings-status', () => t(saved ? 'settings.saved' : 'settings.unsaved'));
  };

  container.addEventListener('input', (event) => {
    const color = colorSettings.find(({ id }) => id === event.target.dataset.color);
    if (!color || !isColor(event.target.value)) return;
    settings.colors[color.id] = event.target.value.toLowerCase();
    root.style.setProperty(color.variable, settings.colors[color.id]);
    $(`color-value-${color.id}`).value = settings.colors[color.id].toUpperCase();
    persist();
  });
  $('reset-colors').onclick = () => {
    settings.colors = {};
    settings.astColors = true;
    apply();
    persist();
  };
  $('ast-node-colors').onchange = (event) => {
    settings.astColors = event.target.checked;
    root.dataset.astColors = String(settings.astColors);
    persist();
  };
  $('settingsButton').onclick = () => $('settings').showModal();
  $('close-settings').onclick = () => $('settings').close();
  $('settings').addEventListener('close', () => $('settingsButton').focus());
  apply();
}
