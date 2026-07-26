// Build history panel (lazy-loaded via dynamic import()). Dual-mode ES module:
// publishes ui.loadHistory/restoreFromHistory onto the shared namespace.
import { ui } from './ui-ns.mjs';
import { parseList, joinEndpoint } from './list-grammar.mjs';
import { BUILDER_SCHEMA, writeForm } from './config-form.mjs';
import { selectDevice, loadOverview, devicesState } from './devices.js';

  function timeAgo(ts) {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m <  1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  ui.loadHistory = function () {
    const body = document.getElementById('history-body');
    if (!body) return;
    try {
      const entries = JSON.parse(localStorage.getItem('wrtnova_history') || '[]');
      renderHistory(entries);
    } catch (_) { /* non-critical */ }
  };

  function renderHistory(entries) {
    const body = document.getElementById('history-body');
    const card = document.getElementById('card-history');
    if (!body) return;

    if (!entries.length) {
      body.innerHTML = '<p class="form-help">No builds yet.</p>';
      return;
    }

    if (card) card.open = true;

    body.innerHTML = entries.map(function (e, i) {
      const cfg     = e.config  || {};
      const dev     = e.device  || {};
      const result  = e.result  || {};
      const mode    = cfg.AP_MODE === '1' ? 'AP' : 'Router';
      const details = [cfg.HOST_NAME, mode, cfg.COUNTRY_CODE, timeAgo(e.ts)]
        .filter(Boolean).join(' · ');

      return '<div class="flex items-start justify-between gap-4 py-3' +
        (i < entries.length - 1 ? ' border-b border-zinc-100 dark:border-zinc-800' : '') + '">' +
        '<div class="min-w-0 flex-1">' +
          '<div class="text-xs font-medium truncate">' + esc(dev.title) +
            ' <span class="font-normal text-zinc-500 dark:text-zinc-400">' + esc(dev.version) + '</span>' +
          '</div>' +
          '<div class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">' + esc(details) + '</div>' +
        '</div>' +
        '<div class="flex gap-1.5 flex-shrink-0">' +
          (result.firmware_url
            ? '<a class="btn btn-ghost text-xs py-0.5 px-2" href="' + esc(result.firmware_url) +
              '" target="_blank" rel="noopener">Download</a>'
            : '') +
          '<button class="btn btn-ghost text-xs py-0.5 px-2" type="button" data-restore="' + i + '">Restore</button>' +
        '</div>' +
      '</div>';
    }).join('');

    body.querySelectorAll('[data-restore]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        ui.restoreFromHistory(entries[parseInt(btn.dataset.restore, 10)]);
      });
    });
  }

  ui.restoreFromHistory = async function (entry) {
    if (!entry) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const dev = entry.device || {};

    const sel = document.getElementById('version');
    const best = findBestVersion(dev.version, sel);
    if (sel && best && sel.value !== best) {
      sel.value = best;
      devicesState.version = best;
      await loadOverview().catch(function () {});
    }

    if (dev.title) {
      await selectDevice(dev.title).catch(function () {});
    }

    if (entry.config) restoreConfig(entry.config);

    if (ui.setWarpSessionToken) ui.setWarpSessionToken(entry.warp_refresh_token);

    const pkgEl = document.getElementById('additional_packages');
    if (pkgEl) pkgEl.value = (entry.additional_packages || []).join(' ');

    // restoreConfig wrote the DOM directly (tables / timezone / wan_type
    // inference). Re-sync the store (single source of truth) from the form and
    // refresh the derived views from it - replaces the old synthetic body
    // 'change' event that used to drive both.
    if (ui.refreshConfigStore) ui.refreshConfigStore();
    if (ui.refreshConditionalVisibility) ui.refreshConditionalVisibility();

    ui.status('Restored the config saved ' + timeAgo(entry.ts) + '.', 'info');
  };

  function findBestVersion(stored, sel) {
    if (!stored || !sel) return null;
    const opts = Array.from(sel.options).map(function (o) { return o.value; });
    if (opts.includes(stored)) return stored;
    if (stored === 'SNAPSHOT') return opts.includes('SNAPSHOT') ? 'SNAPSHOT' : opts[0];
    const branch  = stored.split('.').slice(0, 2).join('.');
    const matches = opts.filter(function (v) { return v.startsWith(branch + '.'); });
    return matches.length ? matches[matches.length - 1] : opts[0];
  }

  // Migration: the VPN fields were renamed LAN_WG_* -> LAN_VPN_*. BUILDER_SCHEMA
  // only knows the new names, so pre-rename entries would restore them blank.
  function upgradeLegacyKeys(cfg) {
    const out = Object.assign({}, cfg);
    for (const k of ['BASE_PREFIX', 'SUBNET', 'IFACE', 'VLAN_ID', 'WIFI_SSID', 'WIFI_PASSWD']) {
      const v = out['LAN_WG_' + k];
      delete out['LAN_WG_' + k];
      if (v && !out['LAN_VPN_' + k]) out['LAN_VPN_' + k] = v;
    }
    return out;
  }

  function restoreConfig(rawCfg) {
    const cfg = upgradeLegacyKeys(rawCfg);
    // wan_type, DNSMASQ_MULTI_INSTANCE and ENDPOINT are UI-only shapes: saved
    // configs carry the emitted one (PPPOE_*, DNSMASQ_SINGLE_INSTANCE, and the
    // endpoint host and port apart), so reconstruct them.
    writeForm(BUILDER_SCHEMA, {
      ...cfg,
      wan_type: cfg.PPPOE_USERNAME ? 'pppoe' : 'dhcp',
      DNSMASQ_MULTI_INSTANCE: cfg.DNSMASQ_SINGLE_INSTANCE === '1' ? '' : '1',
      ENDPOINT: joinEndpoint(cfg.ENDPOINT, cfg.ENDPOINT_PORT),
    });
    if (cfg.ZONE_NAME) {
      if (!ui.setTimezone(cfg.ZONE_NAME)) {
        const tzEl = document.getElementById('timezone');
        if (tzEl) tzEl.value = cfg.ZONE_NAME;
      }
    }

    if (cfg.PORT_FORWARD_LIST) restoreTable('portfwd', cfg.PORT_FORWARD_LIST);
    if (cfg.IPV6_SERVER_LIST)  restoreTable('ipv6',    cfg.IPV6_SERVER_LIST);
    if (ui.refreshBanipChips) ui.refreshBanipChips();
  }

  function restoreTable(kind, list) {
    const tbody = document.querySelector('#' + kind + '-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const rows = parseList(list);
    if (!rows.length) { ui.addRow(kind); return; }
    rows.forEach(function (row) {
      const tr = ui.addRow(kind);
      const h = tr.querySelector('[data-col="host"]');
      const o = tr.querySelector('[data-col="octet"]');
      const p = tr.querySelector('[data-col="ports"]');
      if (h && row.host)  h.value = row.host;
      if (o && row.octet) o.value = row.octet;
      if (p && row.ports) p.value = row.ports;
    });
  }
