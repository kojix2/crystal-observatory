import { $ } from './dom.js';

function setupTabs(id, key, onChange = () => {}) {
  const tabs = [...$(id).querySelectorAll('[role="tab"]')];
  function show(name) {
    for (const tab of tabs) {
      const selected = tab.dataset[key] === name;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', selected);
      tab.tabIndex = selected ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !selected;
    }
    onChange(name);
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => show(tab.dataset[key]);
    tab.onkeydown = (event) => {
      const next = {
        ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index + tabs.length - 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      show(tabs[next].dataset[key]);
      tabs[next].focus();
    };
  });
  return show;
}

// Files and the compilation trace share the left column. These tabs never
// replace the center editor, observation view, selection, or comparison.
export function setupFileWorkspace(app) {
  const showSide = setupTabs('side-tabs', 'sideTab', (name) => {
    $('side-panel').dataset.view = name;
    if (name === 'files') app.trace.stop();
  });
  $('new-source').onclick = () => app.showInput('');
  $('open-source').onclick = () => $('source-file').click();
  $('source-file').onchange = () => {
    const file = $('source-file').files[0];
    $('source-file').value = '';
    if (file) app.openSource(file);
  };
  $('save-source').onclick = () => app.saveSource();
  $('close-document').onclick = () => {
    app.showInput('');
    showSide('files');
    app.trace.workspace?.showPane('history');
  };
  showSide('files');
  app.trace.onPlaybackStart = () => showSide('trace');
  return { showSide };
}
