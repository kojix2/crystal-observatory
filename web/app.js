import { Application } from './ui/application.js';
import { setupWorkspace } from './ui/workspace.js';
import { setupLanguage } from './ui/language.js';
import { setupSettings } from './ui/settings.js';
import { mountIcons } from './ui/icons.js';
import { setupHistoryColumns } from './ui/history-columns.js';
import { resetTokenColumns } from './ui/tokens.js';
import { setupLearningNavigation } from './ui/learning-navigation.js';
import { setupFileWorkspace } from './ui/file-workspace.js';

mountIcons();
setupSettings();
setupLanguage();
const app = new Application();
const historyColumns = setupHistoryColumns();
app.trace.workspace = setupWorkspace(
  () => {
    app.editor.refresh();
    app.trace.renderObservation();
    app.trace.revealActiveTab();
  },
  {
    onReset: () => {
      app.trace.endComparison();
      historyColumns.reset();
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
setupFileWorkspace(app, navigation);
navigation.show(new URL(window.location.href).searchParams.get('page') === 'api' ? 'api' : 'files');
app.loadManifest();
app.sharing.openURL(window.location.href);
