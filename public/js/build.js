(function () {
  'use strict';

  const ui = window.WrtNova = window.WrtNova || {};
  const $  = ui.$, $$ = ui.$$;
  const S = ui.S, t = ui.t;
  const ASU_DEFAULT = 'https://sysupgrade.openwrt.org';
  let activeAsu = ASU_DEFAULT;

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

  function collectConfig() {
    const apMode  = $('input[name="AP_MODE"]:checked').value;
    const wanType = ($('input[name="wan_type"]:checked') || {}).value || 'dhcp';
    const tz      = ui.collectTimezone();

    const isRouter   = apMode !== '1';
    const wgEnable   = $('#WG_ENABLE').checked;
    const meshEnable = $('#WIRELESS_MESH') && $('#WIRELESS_MESH').checked;


    return {
      AP_MODE:  apMode,
      AP_INDEX: isRouter ? '' : textVal('AP_INDEX'),

      HOST_NAME:       textVal('HOST_NAME'),
      ROOT_PASSWD:     textVal('ROOT_PASSWD'),
      SSH_PUBLIC_KEY:  textVal('SSH_PUBLIC_KEY'),
      SSH_PASSWD_AUTH: ($('input[name="SSH_PASSWD_AUTH"]:checked') || {}).value || '',
      ZONE_NAME:       tz.ZONE_NAME,
      TIME_ZONE:       tz.TIME_ZONE,

      PPPOE_USERNAME: wanType === 'pppoe' ? textVal('PPPOE_USERNAME') : '',
      PPPOE_PASSWD:   wanType === 'pppoe' ? textVal('PPPOE_PASSWD')   : '',
      WAN_MAC_ADDR:   textVal('WAN_MAC_ADDR'),
      WAN_IS_TAGGED:  checkboxVal('WAN_IS_TAGGED'),
      WAN_VLAN_ID:    checkboxVal('WAN_IS_TAGGED') ? textVal('WAN_VLAN_ID') : '',
      WAN_B_ENABLE:   isRouter ? checkboxVal('WAN_B_ENABLE') : '',
      WAN_B_VLAN_ID:  (isRouter && $('#WAN_B_ENABLE').checked) ? textVal('WAN_B_VLAN_ID') : '',

      BASE_NET_PREFIX: textVal('BASE_NET_PREFIX'),
      DEFAULT_SUBNET:  textVal('DEFAULT_SUBNET'),
      GUEST_ENABLE:    checkboxVal('GUEST_ENABLE'),
      IOT_ENABLE:      checkboxVal('IOT_ENABLE'),
      IOT_INTERNET:    $('#IOT_ENABLE').checked ? checkboxVal('IOT_INTERNET') : '',
      WG_ENABLE:       wgEnable ? '1' : '',

      // ── Per-network addressing (blank = inherit default) ──────────────────
      LAN_BASE_PREFIX:    textVal('LAN_BASE_PREFIX'),
      LAN_VLAN_ID:        textVal('LAN_VLAN_ID'),
      LAN_SUBNET:         textVal('LAN_SUBNET'),
      GUEST_BASE_PREFIX:  $('#GUEST_ENABLE').checked ? textVal('GUEST_BASE_PREFIX') : '',
      GUEST_VLAN_ID:      $('#GUEST_ENABLE').checked ? textVal('GUEST_VLAN_ID')     : '',
      GUEST_SUBNET:       $('#GUEST_ENABLE').checked ? textVal('GUEST_SUBNET')       : '',
      IOT_BASE_PREFIX:    $('#IOT_ENABLE').checked   ? textVal('IOT_BASE_PREFIX')   : '',
      IOT_VLAN_ID:        $('#IOT_ENABLE').checked   ? textVal('IOT_VLAN_ID')       : '',
      IOT_SUBNET:         $('#IOT_ENABLE').checked   ? textVal('IOT_SUBNET')         : '',
      LAN_WG_BASE_PREFIX: wgEnable ? textVal('LAN_WG_BASE_PREFIX') : '',
      LAN_WG_VLAN_ID:     wgEnable ? textVal('LAN_WG_VLAN_ID')     : '',
      LAN_WG_SUBNET:      wgEnable ? textVal('LAN_WG_SUBNET')       : '',
      ADDITIONAL_VLAN_LIST: textVal('ADDITIONAL_VLAN_LIST'),

      COUNTRY_CODE:   textVal('COUNTRY_CODE').toUpperCase(),
      DENSE_ENV:      checkboxVal('DENSE_ENV'),
      WIRELESS_MESH:  checkboxVal('WIRELESS_MESH'),
      MESH_ID:        meshEnable ? textVal('MESH_ID')     : '',
      MESH_PASSWD:    meshEnable ? textVal('MESH_PASSWD') : '',

      LAN_WIFI_SSID:      textVal('LAN_WIFI_SSID'),
      LAN_WIFI_PASSWD:    textVal('LAN_WIFI_PASSWD'),
      GUEST_WIFI_SSID:    $('#GUEST_ENABLE').checked ? textVal('GUEST_WIFI_SSID')   : '',
      GUEST_WIFI_PASSWD:  $('#GUEST_ENABLE').checked ? textVal('GUEST_WIFI_PASSWD') : '',
      IOT_WIFI_SSID:      $('#IOT_ENABLE').checked   ? textVal('IOT_WIFI_SSID')     : '',
      IOT_WIFI_PASSWD:    $('#IOT_ENABLE').checked   ? textVal('IOT_WIFI_PASSWD')   : '',
      LAN_WG_WIFI_SSID:   wgEnable ? textVal('LAN_WG_WIFI_SSID')   : '',
      LAN_WG_WIFI_PASSWD: wgEnable ? textVal('LAN_WG_WIFI_PASSWD') : '',
      CHANNEL_2G:   textVal('CHANNEL_2G'),
      CHANNEL_5G:   textVal('CHANNEL_5G'),
      CHANNEL_6G:   textVal('CHANNEL_6G'),
      WIFI_LOG_LVL: textVal('WIFI_LOG_LVL'),

      WG_PRIVATE_KEY: wgEnable ? textVal('WG_PRIVATE_KEY') : '',
      PEER_PUBLIC_KEY: wgEnable ? textVal('PEER_PUBLIC_KEY') : '',
      ENDPOINT:        wgEnable ? textVal('ENDPOINT')        : '',
      ENDPOINT_PORT:   wgEnable ? textVal('ENDPOINT_PORT')   : '',
      PRESHARED_KEY:   wgEnable ? textVal('PRESHARED_KEY')   : '',
      WG_IPV4:         wgEnable ? textVal('WG_IPV4')         : '',
      WG_IPV6:         wgEnable ? textVal('WG_IPV6')         : '',
      ALLOWED_IPS:     wgEnable ? textVal('ALLOWED_IPS')     : '',

      PORT_FORWARD_LIST: isRouter ? ui.serializeRows('portfwd') : '',
      IPV6_SERVER_LIST:  isRouter ? ui.serializeRows('ipv6')    : '',

      DDNS_ENABLE:        isRouter ? checkboxVal('DDNS_ENABLE') : '',
      LOOKUP_HOSTNAME:    isRouter ? textVal('LOOKUP_HOSTNAME')    : '',
      CLOUDFLARE_API_KEY: isRouter ? textVal('CLOUDFLARE_API_KEY') : '',

      CELLULAR_MODEM: isRouter ? checkboxVal('CELLULAR_MODEM') : '',
USB_TETHERING:  isRouter ? checkboxVal('USB_TETHERING') : '',

      DNS_MODE:         ($('input[name="DNS_MODE"]:checked') || {}).value || 'adguardhome',
      SOFTWARE_OFFLOAD: checkboxVal('SOFTWARE_OFFLOAD'),
      HARDWARE_OFFLOAD: checkboxVal('HARDWARE_OFFLOAD'),
      BLOCK_DOT_DOQ:    checkboxVal('BLOCK_DOT_DOQ'),
      NON_CT_ATH10K:    checkboxVal('NON_CT_ATH10K'),
    };
  }

  function parseAdditionalPackages() {
    return ($('#additional_packages').value || '')
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function computeAutoPackages() {
    const target  = ui.collectTarget && ui.collectTarget();
    const cfg     = collectConfig();
    const base    = target ? [...(target.default_packages || []), ...(target.device_packages || [])] : [];
    const pkgs    = [];

    pkgs.push('curl', 'ip-full', 'umdns', 'luci');
    if (cfg.AP_MODE !== '1') {
      const dnsMode = cfg.DNS_MODE || 'adguardhome';
      if (dnsMode === 'adguardhome') pkgs.push('adguardhome');
      else if (dnsMode === 'dnsproxy') pkgs.push('dnsproxy');
    }
    pkgs.push('zram-swap', 'luci-app-commands', 'ip-bridge');

    const multiWan = cfg.WAN_B_ENABLE === '1' || cfg.WWAN_ENABLE === '1' ||
                     cfg.CELLULAR_MODEM === '1' || cfg.USB_TETHERING === '1';
    if (multiWan) pkgs.push('luci-app-mwan3');

    const hasWifi = /\bwpad-?|\bhostapd|\bmac80211/.test(base.join(' ')) ||
                    Object.entries(cfg).some(([k, v]) => /WIFI/.test(k) && v);
    if (hasWifi) pkgs.push('-wpad-basic-mbedtls', 'wpad-mbedtls', 'luci-app-usteer');

    const isAth10kCt = p => /^ath10k-firmware-|^kmod-ath10k-ct/.test(p);
    const ctPkgs = base.filter(isAth10kCt);
    if (cfg.NON_CT_ATH10K === '1' && ctPkgs.length) {
      ctPkgs.forEach(p => { pkgs.push('-' + p); pkgs.push(p.replace(/-ct.*$/, '')); });
    }

    pkgs.push('luci-app-ddns', 'ddns-scripts-cloudflare');
    if (cfg.WG_ENABLE === '1' && cfg.AP_MODE !== '1') pkgs.push('luci-proto-wireguard');
    if (cfg.CELLULAR_MODEM === '1') pkgs.push('luci-proto-modemmanager', 'kmod-usb-net-cdc-mbim');
    if (cfg.USB_TETHERING === '1') pkgs.push('kmod-usb-net-rndis', 'kmod-usb-net-cdc-ncm', 'kmod-usb-net-ipheth');

    return pkgs;
  }

  function renderAutoPackages() {
    const el = $('#auto-packages');
    if (!el) return;
    const pkgs = computeAutoPackages();
    el.innerHTML = pkgs.map(p => {
      const isRemoval = p.startsWith('-');
      const cls = isRemoval
        ? 'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 line-through'
        : 'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
      return `<span class="${cls}">${p}</span>`;
    }).join(' ');
  }

  ui.renderAutoPackages = renderAutoPackages;

  function initAutoPackages() {
    document.body.addEventListener('change', renderAutoPackages);
    document.body.addEventListener('input',  renderAutoPackages);
    renderAutoPackages();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoPackages);
  } else {
    initAutoPackages();
  }

  const HISTORY_KEY = 'wrtnova_history';
  const HISTORY_MAX = 5;
  const HISTORY_SENSITIVE = new Set();

  function saveHistoryLocal(payload, result) {
    const cfg = {};
    for (const [k, v] of Object.entries(payload.wrtnova_config || {})) {
      if (HISTORY_SENSITIVE.has(k)) continue;
      cfg[k] = v;
    }
    const entry = {
      ts: Date.now(),
      device: {
        title:   payload.device_title || '',
        profile: payload.profile,
        target:  payload.target,
        version: payload.version,
      },
      config:              cfg,
      additional_packages: payload.additional_packages || [],
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
    $('#config-preview-wrap').classList.add('hidden');

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
        const cached = JSON.parse(localStorage.getItem('wrtnova_adguard') || 'null');
        if (cached && cached.pw === rootpw) {
          cfg.ADGUARD_PASSWD = cached.hash;
        } else {
          cfg.ADGUARD_PASSWD = bcrypt.hashSync(rootpw, 10);
          localStorage.setItem('wrtnova_adguard', JSON.stringify({ pw: rootpw, hash: cfg.ADGUARD_PASSWD }));
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
    ui.status(S.submittingBuild, 'info');
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

    if (resp.config_preview) {
      $('#config-preview').textContent = resp.config_preview;
      $('#config-preview-wrap').classList.remove('hidden');
    }

    if (!resp.packages || !resp.asu_url) {
      ui.status(S.unexpectedApiBuild, 'error');
      $('#build-btn').disabled = false;
      return;
    }

    ui.status(S.preparingBuild, 'info');
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

    ui.status(S.submittingToServer, 'info');
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
      ui.status(t('buildRequestFailed', { msg: e.message }), 'error');
      return;
    }

    const asuBase = resp.asu_url.replace('/api/v1/build', '');

    if (asuR.status === 200) {
      saveHistoryLocal(payload, { status: 'success', firmware_url: null });
      renderResult(asuData, asuBase);
      ui.setProgress(S.doneCachedBuild, 100);
      ui.status(S.buildComplete, 'success');
      $('#build-btn').disabled = false;
      return;
    }

    if (!asuData.request_hash) {
      ui.status(S.unexpectedBuildServer, 'error');
      $('#build-btn').disabled = false;
      return;
    }

    saveHistoryLocal(payload, { status: 'queued', firmware_url: null });
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
          ui.status(S.buildComplete, 'success');
          renderResult(data, base);
        } else {
          ui.status(t('buildFailed', { msg: data.detail || ('HTTP ' + r.status) }), 'error');
          if (data.stderr) {
            $('#config-preview').textContent = data.stderr;
            $('#config-preview-wrap').classList.remove('hidden');
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

  function initWarpPrefill() {
    const btn = $('#warp-prefill-btn');
    if (!btn) return;
    const msg = $('#warp-prefill-msg');
    let dismissTimer;

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const origText = btn.textContent;
      btn.textContent = S.fetchingWarp;
      if (msg) { msg.textContent = ''; msg.classList.add('hidden'); }
      clearTimeout(dismissTimer);

      try {
        const r = await fetch('/api/warp/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            warp_refresh_token: localStorage.getItem('wrtnova_warp_refresh') || '',
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
          localStorage.setItem('wrtnova_warp_refresh', data.warp_refresh_token);
        }

        if (msg) {
          msg.textContent = S.warpSuccess;
          msg.style.color = '#16a34a';
          msg.classList.remove('hidden');
          dismissTimer = setTimeout(() => msg.classList.add('hidden'), 5000);
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
  };
})();
