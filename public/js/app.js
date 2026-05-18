// Entry point: wire UI, load static data, kick session.
(function () {
  'use strict';
  const ui = window.WrtNova = window.WrtNova || {};
  const $ = ui.$;

  async function init() {
    ui.initCollapsibles();
    ui.initDynamicRows();
    ui.initConditionalVisibility();
    ui.initPasswordToggles();
    ui.wireDotTouches();
    ui.initDeviceCombo();
    ui.initTzCombo();

    $('#build-btn').addEventListener('click', () => ui.startBuild());

    // session cookie ping (best-effort; not required to proceed)
    fetch('/api/session').catch(() => {});

    try {
      await Promise.all([ui.loadVersions(), ui.loadTzdata()]);
    } catch (e) {
      ui.status('Init failed: ' + e.message, 'error');
    }
    ui.notifyTargetChanged && ui.notifyTargetChanged();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
