(function () {
  'use strict';

  const ui = window.WrtNova = window.WrtNova || {};
  const $  = ui.$, $$ = ui.$$;
  const S = ui.S, t = ui.t;
  const ASU_DEFAULT = 'https://sysupgrade.openwrt.org';
  let activeAsu = ASU_DEFAULT;

  async function pwFingerprint(pw) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  function clearRetryNote() {
    const n = $('#retry-note');
    if (n) { n.textContent = ''; n.className = 'status hidden'; }
  }

  function tryAutoRetry(errMsg) {
    if (!/exceed.*storage|storage.*exceed/i.test(errMsg)) return false;
    const dnsRadio = $('input[name="DNS_MODE"]:checked');
    const dnsVal = dnsRadio ? dnsRadio.value : '';
    if (dnsVal !== 'adguardhome' && dnsVal !== 'dnsproxy') return false;
    const nextVal = dnsVal === 'adguardhome' ? 'dnsproxy' : 'none';
    const nextRadio = $('input[name="DNS_MODE"][value="' + nextVal + '"]');
    if (nextRadio) nextRadio.checked = true;
    const rn = $('#retry-note');
    if (rn) {
      rn.innerHTML = '';
      rn.className = 'status error';
      const errLine = document.createElement('p');
      errLine.style.margin = '0';
      errLine.textContent = errMsg;
      rn.appendChild(errLine);
      const tip = document.createElement('p');
      tip.className = 'text-xs text-zinc-500 dark:text-zinc-400 mt-1';
      tip.textContent = t(dnsVal === 'adguardhome' ? 'autoSwitchedDnsproxy' : 'autoSwitchedDnsmasq');
      rn.appendChild(tip);
    }
    $('#build-btn').disabled = true;
    setTimeout(() => ui.startBuild(), 2000);
    return true;
  }

  function statusError(msg) {
    clearRetryNote();
    ui.status(msg, 'error');
    if (/exceed.*storage|storage.*exceed/i.test(msg)) {
      const el = ui.$('#status');
      const tip = document.createElement('p');
      tip.className = 'text-xs text-zinc-500 dark:text-zinc-400 mt-1';
      tip.innerHTML = S.storageTip;
      el.appendChild(tip);
    }
  }

  ui.loadAsuServers = async function () {
    let data;
    try {
      const r = await fetch('/api/asu-servers');
      if (!r.ok) return;
      data = await r.json();
    } catch { return; }
    const servers = data.servers || [];
    if (servers.length < 2) return;

    const sel = $('#asu-server');
    if (!sel) return;
    servers.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.url;
      opt.textContent = s.label;
      sel.appendChild(opt);
    });
    sel.value = servers[0].url;
    activeAsu = servers[0].url;
    sel.addEventListener('change', () => { activeAsu = sel.value; });
    $('#asu-server-row').classList.remove('hidden');
  };

  function checkboxVal(id) { const el = $('#' + id); return el && el.checked ? '1' : ''; }
  function textVal(id)     { return ($('#' + id) || {}).value || ''; }
  function radioVal(name)  { return ($('input[name="' + name + '"]:checked') || {}).value || ''; }

  // -- Config store (single source of truth) --------------------------------
  // The DOM is a view. readRawForm() reads+normalizes every field into a raw
  // object (no cross-field gating); the store holds it; ui.deriveBuilderConfig()
  // (builder-config.mjs) is the pure selector that applies the gating. Build
  // payload, preview and chips all read the store via collectConfig().

  const RADIO_KEYS = ['AP_MODE', 'wan_type', 'SSH_PASSWD_AUTH', 'DNS_MODE'];
  const CHECKBOX_KEYS = [
    'WAN_IS_TAGGED', 'WAN_B_ENABLE', 'BRIDGE_WAN_PORT',
    'GUEST_ENABLE', 'IOT_ENABLE', 'IOT_INTERNET', 'IOT_ROUTE_VIA_WG', 'WG_ENABLE',
    'WIFI_KVR', 'DENSE_ENV', 'WIRELESS_MESH', 'GUEST_ISOLATE',
    'DDNS_ENABLE', 'CELLULAR_MODEM', 'USB_TETHERING',
    'SOFTWARE_OFFLOAD', 'HARDWARE_OFFLOAD', 'BLOCK_DOT_DOQ',
    'DENY_GUEST_NIGHT', 'QUARTERLY_REBOOT', 'LOG', 'NON_CT_ATH10K',
  ];
  const TEXT_KEYS = [
    'AP_INDEX', 'HOST_NAME', 'ROOT_PASSWD', 'SSH_PUBLIC_KEY',
    'PPPOE_USERNAME', 'PPPOE_PASSWD', 'WAN_MAC_ADDR', 'WAN_VLAN_ID', 'WAN_B_VLAN_ID',
    'BASE_NET_PREFIX', 'DEFAULT_SUBNET',
    'LAN_BASE_PREFIX', 'LAN_VLAN_ID', 'LAN_SUBNET',
    'GUEST_BASE_PREFIX', 'GUEST_VLAN_ID', 'GUEST_SUBNET',
    'IOT_BASE_PREFIX', 'IOT_VLAN_ID', 'IOT_SUBNET',
    'LAN_WG_BASE_PREFIX', 'LAN_WG_VLAN_ID', 'LAN_WG_SUBNET',
    'ADDITIONAL_VLAN_LIST',
    'MESH_ID', 'MESH_PASSWD',
    'LAN_WIFI_SSID', 'LAN_WIFI_PASSWD', 'GUEST_WIFI_SSID', 'GUEST_WIFI_PASSWD',
    'IOT_WIFI_SSID', 'IOT_WIFI_PASSWD', 'LAN_WG_WIFI_SSID', 'LAN_WG_WIFI_PASSWD',
    'CHANNEL_2G', 'CHANNEL_5G', 'CHANNEL_6G', 'WIFI_LOG_LVL',
    'WG_PRIVATE_KEY', 'PEER_PUBLIC_KEY', 'ENDPOINT', 'ENDPOINT_PORT',
    'PRESHARED_KEY', 'WG_IPV4', 'WG_IPV6', 'ALLOWED_IPS',
    'LOOKUP_HOSTNAME', 'CLOUDFLARE_API_KEY',
  ];

  // DOM -> raw config object, normalized once at the boundary (checkboxes ''/'1',
  // COUNTRY_CODE uppercased, tz + dynamic tables resolved). No gating here.
  function readRawForm() {
    const raw = {};
    RADIO_KEYS.forEach(k => { raw[k] = radioVal(k); });
    CHECKBOX_KEYS.forEach(k => { raw[k] = checkboxVal(k); });
    TEXT_KEYS.forEach(k => { raw[k] = textVal(k); });
    raw.COUNTRY_CODE = textVal('COUNTRY_CODE').toUpperCase();
    const tz = ui.collectTimezone();
    raw.ZONE_NAME = tz.ZONE_NAME;
    raw.TIME_ZONE = tz.TIME_ZONE;
    raw.PORT_FORWARD_LIST = ui.serializeRows('portfwd');
    raw.IPV6_SERVER_LIST  = ui.serializeRows('ipv6');
    // Not a config key (deriveConfig never emits it); held in the store only so
    // editing extras notifies subscribers and re-renders the final package list.
    raw.additional_packages = textVal('additional_packages');
    return raw;
  }

  let store = null;

  // The gated config: pure derivation of the store (falls back to a direct form
  // read if called before the store is initialized).
  function collectConfig() {
    return ui.deriveBuilderConfig(store ? store.get() : readRawForm());
  }

  function refreshStore() {
    if (store) store.set(readRawForm());
  }
  ui.refreshConfigStore = refreshStore;

  function parseAdditionalPackages() {
    return ($('#additional_packages').value || '')
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  // The exact, ordered package set sent to ASU - the full resolved list (base +
  // device + WrtNova additions + user extras, removals collapsed/sorted), via the
  // shared resolvePackages. Byte-identical to what the worker returns.
  function computeFinalPackages() {
    if (!ui.computeFinalPackages) return [];
    const target = ui.collectTarget && ui.collectTarget();
    return ui.computeFinalPackages(target, collectConfig(), parseAdditionalPackages());
  }

  const CHIP_NEUTRAL = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
  const CHIP_REMOVAL = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 line-through';

  function renderAutoPackages() {
    const el = $('#auto-packages');
    if (!el) return;
    const pkgs = computeFinalPackages();
    // Build chips with textContent (not innerHTML): the list now includes
    // user-typed extra package names, which must not be rendered as markup.
    el.textContent = '';
    pkgs.forEach((p, i) => {
      const span = document.createElement('span');
      span.className = p.startsWith('-') ? CHIP_REMOVAL : CHIP_NEUTRAL;
      span.textContent = p;
      el.appendChild(span);
      if (i < pkgs.length - 1) el.appendChild(document.createTextNode(' '));
    });
    const copyBtn = $('#copy-packages');
    if (copyBtn) copyBtn.dataset.pkgs = pkgs.join(' ');
  }

  ui.renderAutoPackages = renderAutoPackages;

  // -- Live config / script preview (always-on selectors of the store) ----------
  let previewRevealed = false;   // mask sensitive values unless explicitly revealed
  let previewFullScript = false; // config block vs the full assembled script

  function renderPreview() {
    const pre = $('#config-preview');
    if (!pre) return;
    if (!previewFullScript) {
      const cfg = collectConfig();
      pre.textContent = previewRevealed ? ui.renderConfigBlock(cfg) : ui.renderConfigBlockMasked(cfg);
      return;
    }
    // Full script needs the cached wrtnova.sh body; recompute cfg in the .then so
    // the latest store state wins if it changed while fetching.
    ui.fetchWrtnovaBody().then(body => {
      if (!previewFullScript) return;
      pre.textContent = ui.assembleScript(collectConfig(), body, !previewRevealed);
    }).catch(e => { pre.textContent = t('failedLoadTemplate', { msg: e.message }); });
  }
  ui.renderPreview = renderPreview;

  function initPreviewControls() {
    const reveal = $('#preview-reveal');
    const full   = $('#preview-fullscript');
    if (reveal) reveal.addEventListener('change', () => { previewRevealed = reveal.checked; renderPreview(); });
    if (full)   full.addEventListener('change',   () => { previewFullScript = full.checked; renderPreview(); });

    const copyBtn = $('#copy-packages');
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      const ok = await ui.copyToClipboard(copyBtn.dataset.pkgs || '');
      copyBtn.textContent = ok ? (S.copied || 'Copied') : (S.error || 'Error');
      setTimeout(() => { copyBtn.textContent = t('copy'); }, 1200);
    });
  }

  // SSID placeholders track the hostname - a pure selector of the store.
  function syncSsidPlaceholders() {
    const name = ((store ? store.get().HOST_NAME : textVal('HOST_NAME')) || '').trim() || 'WrtNova';
    [
      ['LAN_WIFI_SSID',    name],
      ['GUEST_WIFI_SSID',  name + '_Guest'],
      ['IOT_WIFI_SSID',    name + '_IoT'],
      ['LAN_WG_WIFI_SSID', name + '_VPN'],
    ].forEach(([id, ph]) => { const el = $('#' + id); if (el) el.placeholder = ph; });
  }
  ui.syncSsidPlaceholders = syncSsidPlaceholders;

  // AP-mode LAN IP shown in the AP-index help text - a store selector that mirrors
  // the LAN row's ROUTER IP (effective LAN prefix + LAN VLAN + AP index), so the
  // help text and the Networks table never disagree.
  function syncApIndexPreview() {
    const el = $('#ap-index-preview');
    if (!el) return;
    const s = store ? store.get() : readRawForm();
    const prefix = (s.LAN_BASE_PREFIX || '').trim() || (s.BASE_NET_PREFIX || '').trim() || '192.168';
    const vlan   = (s.LAN_VLAN_ID || '').trim() || '1';
    const idx    = (s.AP_INDEX || '').trim() || '2';
    el.textContent = prefix + '.' + vlan + '.' + idx;
  }
  ui.syncApIndexPreview = syncApIndexPreview;

  // Build the store from the (fully-initialized) form, subscribe the derived
  // selectors, and wire the one boundary listener that feeds the store. Called
  // by app.js after the dynamic tables exist (so serializeRows sees them).
  ui.initConfigStore = function () {
    if (store) return;
    store = ui.createStore(readRawForm());
    ui.configStore = store;
    // Source of truth for the shared conditional-visibility selectors (ui.js).
    ui.configState = () => store.get();
    store.subscribe(() => { renderAutoPackages(); syncSsidPlaceholders(); syncApIndexPreview(); renderPreview(); });
    document.body.addEventListener('input',  refreshStore);
    document.body.addEventListener('change', refreshStore);
    initPreviewControls();
    renderAutoPackages();
    syncSsidPlaceholders();
    syncApIndexPreview();
    renderPreview();
  };

  const HISTORY_KEY = 'wrtnova_history';
  const HISTORY_MAX = 5;
  const HISTORY_SENSITIVE = new Set();

  function saveHistoryLocal(payload, result, fullCfg) {
    const cfg = fullCfg || {};
    if (!fullCfg) {
      for (const [k, v] of Object.entries(payload.wrtnova_config || {})) {
        if (HISTORY_SENSITIVE.has(k)) continue;
        cfg[k] = v;
      }
    }
    const entry = {
      ts: Date.now(),
      device: {
        title:   payload.device_title || '',
        profile: payload.profile,
        target:  payload.target,
        version: payload.version,
      },
      config:               cfg,
      additional_packages:  payload.additional_packages || [],
      warp_refresh_token:   _warpSessionToken,
      result,
    };
    try {
      const existing = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      const top = existing[0];
      const cfgKey = c => JSON.stringify(c);
      const isDup = top &&
        top.device.profile === entry.device.profile &&
        top.device.version === entry.device.version &&
        cfgKey(top.config) === cfgKey(entry.config);
      const updated = isDup ? [entry, ...existing.slice(1)] : [entry, ...existing];
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated.slice(0, HISTORY_MAX)));
    } catch (_) {}
    ui.loadHistory && ui.loadHistory();
  }

  function updateHistoryFirmwareUrl(firmware_url) {
    try {
      const existing = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (existing.length && existing[0].result) {
        existing[0].result.firmware_url = firmware_url;
        existing[0].result.status = 'success';
        localStorage.setItem(HISTORY_KEY, JSON.stringify(existing));
      }
    } catch (_) {}
    ui.loadHistory && ui.loadHistory();
  }

  let polling = null;
  ui.startBuild = async function () {
    if (polling) return;
    ui.clearStatus(); ui.clearProgress();
    $('#result').classList.add('hidden');
    // The config preview is an always-live selector now; not gated on Build.

    const target = ui.collectTarget();
    if (!target) { ui.status(S.pickDeviceFirst, 'error'); return; }
    if (ui.hasVlanConflict) { ui.status(S.fixVlanConflict, 'error'); return; }

    const wifiPassFields = [
      { id: 'LAN_WIFI_PASSWD',   active: true },
      { id: 'GUEST_WIFI_PASSWD', active: $('#GUEST_ENABLE').checked },
      { id: 'IOT_WIFI_PASSWD',   active: $('#IOT_ENABLE').checked },
      { id: 'LAN_WG_WIFI_PASSWD',active: $('#WG_ENABLE').checked },
      { id: 'MESH_PASSWD',       active: true },
    ];
    for (const { id, active } of wifiPassFields) {
      if (!active) continue;
      const val = $('#' + id).value;
      if (val && val.length < 8) {
        ui.status(t('wifiPassTooShort', { field: id.replace(/_PASSWD|_WIFI/, '') }), 'error');
        $('#' + id).focus();
        return;
      }
    }

    await Promise.all([
      ui.loadScript('/js/bcrypt.js'),
      ui.loadScript('/js/history.js'),
    ]);

    const cfg = collectConfig();
    const rootpw = cfg.ROOT_PASSWD;
    const bcrypt = window.dcodeIO && window.dcodeIO.bcrypt;
    if (rootpw && bcrypt) {
      try {
        const fp = await pwFingerprint(rootpw);
        const cached = JSON.parse(localStorage.getItem('wrtnova_adguard') || 'null');
        if (cached && cached.fp === fp) {
          cfg.ADGUARD_PASSWD = cached.hash;
        } else {
          cfg.ADGUARD_PASSWD = bcrypt.hashSync(rootpw, 10);
          localStorage.setItem('wrtnova_adguard', JSON.stringify({ fp, hash: cfg.ADGUARD_PASSWD }));
        }
      } catch (_) {}
    }

    const payload = {
      profile:      target.profile,
      target:       target.target,
      version:      target.version,
      version_code: target.version_code,
      default_packages: target.default_packages,
      device_packages:  target.device_packages,
      device_title:        ($('#device') || {}).value || '',
      wrtnova_config:      ui.stripSensitive(cfg),
      additional_packages: parseAdditionalPackages(),
      asu_url: activeAsu,
    };

    $('#build-btn').disabled = true;
    ui.setProgress(S.submittingBuild, 2);

    let resp;
    try {
      const r = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      resp = await r.json();
      if (!r.ok) throw new Error(
        [resp.error, resp.detail, resp.message].filter(Boolean).join(' — ') || ('HTTP ' + r.status)
      );
    } catch (e) {
      $('#build-btn').disabled = false;
      ui.clearProgress();
      ui.status(t('buildSubmitFailed', { msg: e.message }), 'error');
      return;
    }

    if (!resp.packages || !resp.asu_url) {
      ui.status(S.unexpectedApiBuild, 'error');
      $('#build-btn').disabled = false;
      return;
    }

    ui.setProgress(S.preparingBuild, 5);

    let wrtnovaBody;
    try {
      wrtnovaBody = await ui.fetchWrtnovaBody();
    } catch (e) {
      $('#build-btn').disabled = false;
      ui.clearProgress();
      ui.status(t('failedLoadTemplate', { msg: e.message }), 'error');
      return;
    }

    const asuBody = {
      profile:      target.profile,
      target:       target.target,
      version:      target.version,
      version_code: target.version_code,
      packages:     resp.packages,
      defaults:     ui.assembleScript(cfg, wrtnovaBody),
      diff_packages: true,
      client:       'wrtnova/1.0',
    };

    ui.setProgress(S.submittingToServer, 8);

    let asuR, asuData;
    try {
      asuR = await fetch(resp.asu_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asuBody),
      });
      asuData = await asuR.json();
      if (asuR.status !== 200 && asuR.status !== 202) throw new Error(
        asuData.detail || ('ASU HTTP ' + asuR.status)
      );
    } catch (e) {
      $('#build-btn').disabled = false;
      ui.clearProgress();
      if (!tryAutoRetry(e.message)) {
        statusError(t('buildRequestFailed', { msg: e.message }));
      }
      return;
    }

    const asuBase = resp.asu_url.replace('/api/v1/build', '');

    if (asuR.status === 200) {
      saveHistoryLocal(payload, { status: 'success', firmware_url: null }, cfg);
      renderResult(asuData, asuBase);
      ui.setProgress(S.doneCachedBuild, 100);
      clearRetryNote(); ui.status(S.buildComplete, 'success');
      $('#build-btn').disabled = false;
      return;
    }

    if (!asuData.request_hash) {
      ui.status(S.unexpectedBuildServer, 'error');
      $('#build-btn').disabled = false;
      return;
    }

    saveHistoryLocal(payload, { status: 'queued', firmware_url: null }, cfg);
    pollAsu(asuData.request_hash, asuBase);
  };

  function pollAsu(hash, asuBase) {
    const base = (asuBase || ASU_DEFAULT).replace(/\/+$/, '');
    let tries = 0;
    let pct = 15;
    polling = setInterval(async () => {
      tries++;
      try {
        const r = await fetch(base + '/api/v1/build/' + hash, { cache: 'no-cache' });
        const data = await r.json();
        if (r.status === 202) {
          if (data.queue_position != null && data.queue_position > 0) {
            ui.setProgress(t('inBuildQueue', { n: data.queue_position }), 8);
          } else {
            pct = Math.min(94, pct + (pct < 85 ? 8 : 2));
            ui.setProgress(S.building, pct);
          }
          return;
        }
        clearInterval(polling); polling = null;
        $('#build-btn').disabled = false;
        if (r.status === 200) {
          ui.setProgress(S.done, 100);
          clearRetryNote(); ui.status(S.buildComplete, 'success');
          renderResult(data, base);
        } else {
          const errMsg = data.detail || ('HTTP ' + r.status);
          if (!tryAutoRetry(errMsg)) {
            statusError(t('buildFailed', { msg: errMsg }));
            if (data.stderr) {
              // Surface the build stderr in the (always-present) preview pane;
              // expand it so it is visible. Overwritten on the next config edit.
              $('#config-preview').textContent = data.stderr;
              $('#config-preview-wrap').open = true;
            }
          }
        }
      } catch (e) {
        if (tries > 200) {
          clearInterval(polling); polling = null;
          $('#build-btn').disabled = false;
          ui.status(t('pollingFailed', { msg: e.message }), 'error');
        }
      }
    }, 5000);
  }

  function renderResult(data, asuBase) {
    const base   = (asuBase || activeAsu || ASU_DEFAULT).replace(/\/+$/, '');
    const bin_dir = data.bin_dir;
    const images  = data.images || [];
    const sys = images.find(i => i.type === 'sysupgrade') ||
                images.find(i => i.type === 'factory') ||
                images[0];
    const main = data.firmware_url || (sys && bin_dir
      ? base + '/store/' + bin_dir + '/' + sys.name
      : null);

    if (main) updateHistoryFirmwareUrl(main);

    const wrap = $('#result'); wrap.classList.remove('hidden');
    let html = '<div class="result-wrap">'
             + '<p class="result-note">' + S.flashNote + '</p>'
             + '<ul class="result-images">';
    images.slice().sort((a, b) => (b.type === 'sysupgrade') - (a.type === 'sysupgrade')).forEach(im => {
      const url = bin_dir ? base + '/store/' + bin_dir + '/' + im.name : (im === sys ? main : null);
      html += '<li>'
            + (url ? '<a href="' + url + '">' + im.name + '</a>' : im.name)
            + (im.sha256 ? '<br><span class="result-hash">sha256: ' + im.sha256 + '</span>' : '')
            + '</li>';
    });
    html += '</ul></div>';
    wrap.innerHTML = html;
  }

  // Scoped to page lifetime — cleared on reload so each new page load gets a fresh reg.
  let _warpSessionToken = '';
  ui.setWarpSessionToken = function (t) { _warpSessionToken = t || ''; };

  function initWarpPrefill() {
    const btn = $('#warp-prefill-btn');
    if (!btn) return;
    const msg = $('#warp-prefill-msg');

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const origText = btn.textContent;
      btn.textContent = S.fetchingWarp;
      if (msg) { msg.textContent = ''; msg.classList.add('hidden'); }

      try {
        const r = await fetch('/api/warp/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            warp_refresh_token: _warpSessionToken,
          }),
        });
        let data;
        try { data = await r.json(); } catch (_) { data = {}; }
        if (!r.ok) {
          const friendly = r.status === 429 || (data.message || '').includes('429')
            ? S.warpTooMany
            : (data.message || data.error || S.warpFailed);
          throw new Error(friendly);
        }

        const setField = (id, val) => { const el = $('#' + id); if (el) el.value = val || ''; };
        setField('WG_PRIVATE_KEY',  data.WG_PRIVATE_KEY);
        setField('PEER_PUBLIC_KEY', data.PEER_PUBLIC_KEY);
        setField('ENDPOINT',        data.ENDPOINT);
        setField('ENDPOINT_PORT',   data.ENDPOINT_PORT);
        setField('WG_IPV4',         data.WG_IPV4);
        setField('WG_IPV6',         data.WG_IPV6);
        setField('ALLOWED_IPS',     data.ALLOWED_IPS);

        if (data.warp_refresh_token) {
          _warpSessionToken = data.warp_refresh_token;
        }

        // WG fields were set programmatically (no input event); sync the store
        // so they reach the build payload / preview.
        refreshStore();
        ui.setDot('wg', 'touched');

        if (msg) {
          msg.textContent = S.warpSuccess;
          msg.style.color = '#16a34a';
          msg.classList.remove('hidden');
        }
      } catch (e) {
        if (msg) {
          msg.textContent = e.message;
          msg.style.color = '#dc2626';
          msg.classList.remove('hidden');
        }
      } finally {
        btn.textContent = origText;
        btn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWarpPrefill);
  } else {
    initWarpPrefill();
  }

  ui.notifyTargetChanged = function () {
    const t = ui.collectTarget && ui.collectTarget();
    const ok = !!t;
    $('#build-btn').disabled = !ok;
    $('#build-hint').textContent = ok ? '' : S.pickDeviceHint;
    if (ok) ui.setDot('target', 'valid');
    // Chips depend on the target's base/device packages, which are not part of
    // the config store; re-render on target change.
    renderAutoPackages();
  };
})();
