import { Application } from './ui/application.js';
import { setupWorkspace } from './ui/workspace.js';
import { setupLanguage } from './ui/language.js';
import { setupSettings } from './ui/settings.js';

setupSettings();
setupLanguage();
const app = new Application();
setupWorkspace(() => app.trace.renderObservation());
app.loadManifest();
