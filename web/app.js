import { Application } from './ui/application.js';
import { setupWorkspace } from './ui/workspace.js';
import { setupLanguage } from './ui/language.js';
import { setupSettings } from './ui/settings.js';
import { mountIcons } from './ui/icons.js';
import { resetTokenColumns } from './ui/tokens.js';
import { setupLearningNavigation } from './ui/learning-navigation.js';
import { setupFileWorkspace } from './ui/file-workspace.js';
import { setupNavigationRail } from './ui/navigation-rail.js';

mountIcons();
setupSettings();
setupLanguage();
const rail = setupNavigationRail();
const app = new Application();
app.trace.workspace = setupWorkspace(
  () => {
    app.editor.refresh();
    app.trace.renderObservation();
    app.trace.revealActiveTab();
  },
  {
    onReset: () => {
      rail.show();
      app.trace.endComparison();
      resetTokenColumns();
    },
  },
);
const navigation = setupLearningNavigation({
  onLeave: () => app.trace.stop(),
  onReturn: () => {
    app.trace.workspace.refresh();
    app.editor.refresh();
    app.trace.renderObservation();
    app.trace.revealActiveTab();
  },
});
app.navigation = navigation;
app.sidePanel = setupFileWorkspace(app);
if (new URL(window.location.href).searchParams.get('page') === 'api') navigation.show('api');
app.loadManifest();
app.sharing.openURL(window.location.href);
