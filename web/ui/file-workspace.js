import { $ } from './dom.js';

// File tasks have their own tabs; switching them never changes the loaded trace.
export function setupFileWorkspace(app, navigation) {
  const tabs = [...$('file-tabs').querySelectorAll('[data-file-tab]')];
  function show(name) {
    for (const tab of tabs) {
      const selected = tab.dataset.fileTab === name;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', selected);
      tab.tabIndex = selected ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !selected;
    }
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => show(tab.dataset.fileTab);
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
      show(tabs[next].dataset.fileTab);
      tabs[next].focus();
    };
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
    navigation.show('files');
    show('documents');
  };
  show('templates');
  return { show };
}
