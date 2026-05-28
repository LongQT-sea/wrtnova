// Entry point: wire UI, load static data, kick session.
// Theme toggle is handled by theme.js (loaded separately).
// Collapsible open/close is handled natively by <details>/<summary>.
(function () {
  'use strict';
  const ui = window.WrtNova = window.WrtNova || {};
  const $ = ui.$;

  function syncSsidPlaceholders() {
    const name = ($('#HOST_NAME').value || '').trim() || 'WrtNova';
    [
      ['LAN_WIFI_SSID',    name],
      ['GUEST_WIFI_SSID',  name + '_Guest'],
      ['IOT_WIFI_SSID',    name + '_IoT'],
      ['LAN_WG_WIFI_SSID', name + '_VPN'],
    ].forEach(function([id, ph]) {
      const el = $('#' + id);
      if (el) el.placeholder = ph;
    });
  }

  async function init() {
    ui.initDynamicRows();
    ui.initConditionalVisibility();
    ui.initPasswordToggles();
    ui.wireDotTouches();
    ui.initDeviceCombo();
    ui.initTzCombo();

    $('#HOST_NAME').addEventListener('input', syncSsidPlaceholders);
    syncSsidPlaceholders();

    $('#build-btn').addEventListener('click', () => ui.startBuild());

    // session cookie ping (best-effort; not required to proceed)
    fetch('/api/session').catch(() => {});

    try {
      await Promise.all([ui.loadVersions(), ui.loadTzdata()]);
    } catch (e) {
      ui.status('Init failed: ' + e.message, 'error');
    }
    ui.notifyTargetChanged && ui.notifyTargetChanged();
    ui.loadHistory && ui.loadHistory();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
