(function () {
  'use strict';

  const ui = window.WrtNova = window.WrtNova || {};

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

  ui.loadHistory = async function () {
    const body = document.getElementById('history-body');
    if (!body) return;
    try {
      const r = await fetch('/api/history');
      if (!r.ok) return;
      const entries = await r.json();
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
      if (ui.devicesState) ui.devicesState.version = best;
      await ui.loadOverview().catch(function () {});
    }

    if (dev.title && ui.selectDevice) {
      await ui.selectDevice(dev.title).catch(function () {});
    }

    if (entry.config) restoreConfig(entry.config);

    const pkgEl = document.getElementById('additional_packages');
    if (pkgEl) pkgEl.value = (entry.additional_packages || []).join(' ');


    document.body.dispatchEvent(new Event('change'));

    ui.status('Config restored from ' + timeAgo(entry.ts) + '.', 'info');
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

  function restoreConfig(cfg) {
    function set(id, val) {
      const el = document.getElementById(id);
      if (el && val != null) el.value = val;
    }
    function check(id, val) {
      const el = document.getElementById(id);
      if (el) el.checked = val === '1';
    }
    function radio(name, val) {
      const el = document.querySelector('input[name="' + name + '"][value="' + (val || '') + '"]');
      if (el) el.checked = true;
    }

    radio('AP_MODE',  cfg.AP_MODE);
    radio('DNS_MODE', cfg.DNS_MODE || 'adguardhome');
    set('AP_INDEX', cfg.AP_INDEX);

    set('HOST_NAME',       cfg.HOST_NAME);
    set('SSH_PUBLIC_KEY',  cfg.SSH_PUBLIC_KEY);
    radio('SSH_PASSWD_AUTH', cfg.SSH_PASSWD_AUTH);

    // Timezone: use setTimezone so state.zoneName/tzString are updated, not just the input text
    if (cfg.ZONE_NAME) {
      if (!ui.setTimezone(cfg.ZONE_NAME)) {
        const tzEl = document.getElementById('timezone');
        if (tzEl) tzEl.value = cfg.ZONE_NAME;
      }
    }

    set('BASE_NET_PREFIX', cfg.BASE_NET_PREFIX);
    set('DEFAULT_SUBNET',  cfg.DEFAULT_SUBNET);
    check('GUEST_ENABLE',  cfg.GUEST_ENABLE);
    check('IOT_ENABLE',    cfg.IOT_ENABLE);
    check('IOT_INTERNET',  cfg.IOT_INTERNET);
    check('WG_ENABLE',     cfg.WG_ENABLE);

    set('LAN_BASE_PREFIX',    cfg.LAN_BASE_PREFIX);
    set('LAN_VLAN_ID',        cfg.LAN_VLAN_ID);
    set('LAN_SUBNET',         cfg.LAN_SUBNET);
    set('GUEST_BASE_PREFIX',  cfg.GUEST_BASE_PREFIX);
    set('GUEST_VLAN_ID',      cfg.GUEST_VLAN_ID);
    set('GUEST_SUBNET',       cfg.GUEST_SUBNET);
    set('IOT_BASE_PREFIX',    cfg.IOT_BASE_PREFIX);
    set('IOT_VLAN_ID',        cfg.IOT_VLAN_ID);
    set('IOT_SUBNET',         cfg.IOT_SUBNET);
    set('LAN_WG_BASE_PREFIX', cfg.LAN_WG_BASE_PREFIX);
    set('LAN_WG_VLAN_ID',     cfg.LAN_WG_VLAN_ID);
    set('LAN_WG_SUBNET',      cfg.LAN_WG_SUBNET);
    set('ADDITIONAL_VLAN_LIST', cfg.ADDITIONAL_VLAN_LIST);

    radio('wan_type', cfg.PPPOE_USERNAME ? 'pppoe' : 'dhcp');
    set('PPPOE_USERNAME', cfg.PPPOE_USERNAME);
    set('PPPOE_PASSWD',   cfg.PPPOE_PASSWD);
    set('WAN_MAC_ADDR',   cfg.WAN_MAC_ADDR);
    check('WAN_IS_TAGGED', cfg.WAN_IS_TAGGED);
    set('WAN_VLAN_ID',    cfg.WAN_VLAN_ID);
    check('WAN_B_ENABLE',  cfg.WAN_B_ENABLE);
    set('WAN_B_VLAN_ID',  cfg.WAN_B_VLAN_ID);

    set('COUNTRY_CODE',  cfg.COUNTRY_CODE);
    check('DENSE_ENV',   cfg.DENSE_ENV);
    check('WIRELESS_MESH', cfg.WIRELESS_MESH);
    set('MESH_ID',       cfg.MESH_ID);
    set('MESH_PASSWD',   cfg.MESH_PASSWD);
    set('LAN_WIFI_SSID',     cfg.LAN_WIFI_SSID);
    set('LAN_WIFI_PASSWD',   cfg.LAN_WIFI_PASSWD);
    set('GUEST_WIFI_SSID',   cfg.GUEST_WIFI_SSID);
    set('GUEST_WIFI_PASSWD', cfg.GUEST_WIFI_PASSWD);
    set('IOT_WIFI_SSID',     cfg.IOT_WIFI_SSID);
    set('IOT_WIFI_PASSWD',   cfg.IOT_WIFI_PASSWD);
    set('LAN_WG_WIFI_SSID',   cfg.LAN_WG_WIFI_SSID);
    set('LAN_WG_WIFI_PASSWD', cfg.LAN_WG_WIFI_PASSWD);
    set('CHANNEL_2G',  cfg.CHANNEL_2G);
    set('CHANNEL_5G',  cfg.CHANNEL_5G);
    set('CHANNEL_6G',  cfg.CHANNEL_6G);
    set('WIFI_LOG_LVL', cfg.WIFI_LOG_LVL);

    set('WG_PRIVATE_KEY',  cfg.WG_PRIVATE_KEY);
    set('PEER_PUBLIC_KEY', cfg.PEER_PUBLIC_KEY);
    set('ENDPOINT',        cfg.ENDPOINT);
    set('ENDPOINT_PORT',   cfg.ENDPOINT_PORT);
    set('PRESHARED_KEY',   cfg.PRESHARED_KEY);
    set('WG_IPV4',         cfg.WG_IPV4);
    set('WG_IPV6',         cfg.WG_IPV6);
    set('ALLOWED_IPS',     cfg.ALLOWED_IPS);

    if (cfg.PORT_FORWARD_LIST) restoreTable('portfwd', cfg.PORT_FORWARD_LIST);
    if (cfg.IPV6_SERVER_LIST)  restoreTable('ipv6',    cfg.IPV6_SERVER_LIST);

    check('DDNS_ENABLE',    cfg.DDNS_ENABLE);
    set('LOOKUP_HOSTNAME',  cfg.LOOKUP_HOSTNAME);
    set('CLOUDFLARE_API_KEY', cfg.CLOUDFLARE_API_KEY);

    check('CELLULAR_MODEM', cfg.CELLULAR_MODEM);
    check('USB_TETHERING',  cfg.USB_TETHERING);

    check('SOFTWARE_OFFLOAD', cfg.SOFTWARE_OFFLOAD);
    check('HARDWARE_OFFLOAD', cfg.HARDWARE_OFFLOAD);
    check('BLOCK_DOT_DOQ',    cfg.BLOCK_DOT_DOQ);
    check('NON_CT_ATH10K',    cfg.NON_CT_ATH10K);
  }

  function restoreTable(kind, list) {
    const tbody = document.querySelector('#' + kind + '-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const lines = String(list).split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l && l.includes('|'); });
    if (!lines.length) { ui.addRow(kind); return; }
    lines.forEach(function (line) {
      const parts = line.split('|').map(function (p) { return p.trim(); });
      const tr    = ui.addRow(kind);
      const h = tr.querySelector('[data-col="host"]');
      const o = tr.querySelector('[data-col="octet"]');
      const p = tr.querySelector('[data-col="ports"]');
      if (h && parts[0]) h.value = parts[0];
      if (o && parts[1]) o.value = parts[1];
      if (p && parts[2]) p.value = parts[2];
    });
  }
})();
