// Theme toggle is handled by theme.js (loaded separately).
(function () {
  'use strict';
  const ui = window.WrtNova = window.WrtNova || {};
  const $ = ui.$;

  async function init() {
    ui.initCardToggles();
    ui.initDynamicRows();
    ui.initPasswordToggles();
    ui.wireDotTouches();
    ui.initDeviceCombo();
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
      await Promise.all([ui.loadVersions(), ui.loadTzdata()]);
    } catch (e) {
      ui.status('Init failed: ' + e.message, 'error');
    }
    ui.notifyTargetChanged && ui.notifyTargetChanged();

    const historyCard = document.getElementById('card-history');
    if (historyCard) {
      historyCard.addEventListener('toggle', () => {
        ui.loadScript('/js/history.js').then(() => ui.loadHistory && ui.loadHistory());
      }, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
