// Theme toggle is handled by theme.js (loaded separately).
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
    ui.initCardToggles();
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
