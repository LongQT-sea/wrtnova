// /builder page entry. ES module: imports the page's modules so the whole graph
// evaluates (the pure .mjs are pulled transitively via ui.js / build.js). Theme
// toggle is handled by theme.js (a standalone classic script).
import { ui } from './ui-ns.mjs';
import './ui.js';
import './i18n.js';
import './tzdata.js';
import { initDeviceCombo, loadVersions } from './devices.js';
import './build.js';

  const $ = ui.$;

  async function init() {
    ui.initCardToggles();
    ui.initDynamicRows();
    ui.initPasswordToggles();
    ui.wireDotTouches();
    initDeviceCombo();
    ui.initTzCombo();

    // Build the config store now that the dynamic tables and tz combo exist;
    // SSID placeholders are a store selector wired inside initConfigStore.
    ui.initConfigStore();

    // Conditional visibility is a store selector now; init it AFTER the store
    // exists and after its boundary listener is wired (so the store is updated
    // before the visibility handler reads it).
    ui.initConditionalVisibility();

    $('#build-btn').addEventListener('click', () => ui.startBuild());

    // session cookie ping (best-effort; not required to proceed)
    fetch('/api/session').catch(() => {});

    ui.loadAsuServers && ui.loadAsuServers();

    try {
      await Promise.all([loadVersions(), ui.loadTzdata()]);
    } catch (e) {
      ui.status('Init failed: ' + e.message, 'error');
    }
    ui.notifyTargetChanged && ui.notifyTargetChanged();

    const historyCard = document.getElementById('card-history');
    if (historyCard) {
      historyCard.addEventListener('toggle', () => {
        import('/js/history.js').then(() => ui.loadHistory && ui.loadHistory());
      }, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
