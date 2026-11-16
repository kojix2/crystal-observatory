import { $ } from './dom.js';

// Source actions stay with the editor, including when it is a comparison view.
export function setupSourceTools(app) {
  $('new-source').onclick = () => {
    app.showInput('');
    $('source').focus();
  };
  $('open-source').onclick = () => $('source-file').click();
  $('source-file').onchange = () => {
    const file = $('source-file').files[0];
    $('source-file').value = '';
    if (file) app.openSource(file);
  };
  $('save-source').onclick = () => app.saveSource();
  $('open-templates').onclick = () => $('templates').showModal();
  $('close-templates').onclick = () => $('templates').close();
}
