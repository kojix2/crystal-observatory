import { Application } from './ui/application.js';
import { setupWorkspace } from './ui/workspace.js';
import { setupLanguage } from './ui/language.js';
import { setupSettings } from './ui/settings.js';

setupSettings();
setupLanguage();
const app = new Application();
app.trace.workspace = setupWorkspace(() => app.trace.renderObservation(), {
  onReset: () => app.trace.endComparison(),
});
app.loadManifest();
