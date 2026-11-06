import { Application } from './ui/application.js';
import { setupWorkspace } from './ui/workspace.js';
import { setupLanguage } from './ui/language.js';
import { setupSettings } from './ui/settings.js';
import { mountIcons } from './ui/icons.js';

mountIcons();
setupSettings();
setupLanguage();
const app = new Application();
app.trace.workspace = setupWorkspace(
  () => {
    app.editor.refresh();
    app.trace.renderObservation();
  },
  {
    onReset: () => app.trace.endComparison(),
  },
);
app.loadManifest();
