// Collect form -> POST /api/build -> poll ASU -> render download URL.
(function () {
  'use strict';

  const ui = window.WrtNova = window.WrtNova || {};
  const $  = ui.$, $$ = ui.$$;
  const ASU = 'https://sysupgrade.openwrt.org';

  // -------------------------------------- form serialization helpers
  function checkboxVal(id) { const el = $('#' + id); return el && el.checked ? '1' : ''; }
  function textVal(id)     { return ($('#' + id) || {}).value || ''; }

  function collectConfig() {
    const apMode  = $('input[name="AP_MODE"]:checked').value;
    const wanType = ($('input[name="wan_type"]:checked') || {}).value || 'dhcp';
    const tz      = ui.collectTimezone();

    const isRouter   = apMode !== '1';
    const wgEnable   = isRouter && $('#WG_ENABLE').checked;
    const meshEnable = $('#WIRELESS_MESH') && $('#WIRELESS_MESH').checked;
    const modemEn    = isRouter && $('#CELLULAR_MODEM') && $('#CELLULAR_MODEM').checked;

    // AdGuard hash. Empty plaintext → empty string (script falls back to default).
    let adguard = '';
    const rootpw = textVal('ROOT_PASSWD');
    const bcrypt = window.dcodeIO && window.dcodeIO.bcrypt;
	if (rootpw && bcrypt) {
      try { adguard = bcrypt.hashSync(rootpw, 10); } catch (e) { /* leave empty */ }
    }

    return {
      // ── Device mode ──────────────────────────────────────────────────────
      AP_MODE:  apMode,
      AP_INDEX: isRouter ? '' : textVal('AP_INDEX'),

      // ── System ───────────────────────────────────────────────────────────
      HOST_NAME:       textVal('HOST_NAME'),
      ROOT_PASSWD:     rootpw,
      SSH_PUBLIC_KEY:  textVal('SSH_PUBLIC_KEY'),
      SSH_PASSWD_AUTH: ($('input[name="SSH_PASSWD_AUTH"]:checked') || {}).value || '',
      ZONE_NAME:       tz.ZONE_NAME,
      TIME_ZONE:       tz.TIME_ZONE,

      // ── WAN (router only) ─────────────────────────────────────────────────
      PPPOE_USERNAME: wanType === 'pppoe' ? textVal('PPPOE_USERNAME') : '',
      PPPOE_PASSWD:   wanType === 'pppoe' ? textVal('PPPOE_PASSWD')   : '',
      WAN_MAC_ADDR:   textVal('WAN_MAC_ADDR'),
      WAN_IS_TAGGED:  checkboxVal('WAN_IS_TAGGED'),
      WAN_VLAN_ID:    checkboxVal('WAN_IS_TAGGED') ? textVal('WAN_VLAN_ID') : '',
      WAN_B_ENABLE:   isRouter ? checkboxVal('WAN_B_ENABLE') : '',
      WAN_B_VLAN_ID:  (isRouter && $('#WAN_B_ENABLE').checked) ? textVal('WAN_B_VLAN_ID') : '',

      // ── Network ───────────────────────────────────────────────────────────
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

      // ── WiFi ──────────────────────────────────────────────────────────────
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

      // ── WireGuard VPN client (always collected when WG enabled) ───────────
      // Leave any field blank to trigger WARP auto-register on the server.
      WG_PRIVATE_KEY: wgEnable ? textVal('WG_PRIVATE_KEY') : '',
      PEER_PUBLIC_KEY: wgEnable ? textVal('PEER_PUBLIC_KEY') : '',
      ENDPOINT:        wgEnable ? textVal('ENDPOINT')        : '',
      ENDPOINT_PORT:   wgEnable ? textVal('ENDPOINT_PORT')   : '',
      PRESHARED_KEY:   wgEnable ? textVal('PRESHARED_KEY')   : '',
      WG_IPV4:         wgEnable ? textVal('WG_IPV4')         : '',
      WG_IPV6:         wgEnable ? textVal('WG_IPV6')         : '',
      ALLOWED_IPS:     wgEnable ? textVal('ALLOWED_IPS')     : '',

      // ── Port forwarding / IPv6 exposure (router only) ─────────────────────
      PORT_FORWARD_LIST: isRouter ? ui.serializeRows('portfwd') : '',
      IPV6_SERVER_LIST:  isRouter ? ui.serializeRows('ipv6')    : '',

      // ── DDNS (router only) ─────────────────────────────────────────────────
      DDNS_ENABLE:        isRouter ? checkboxVal('DDNS_ENABLE') : '',
      LOOKUP_HOSTNAME:    isRouter ? textVal('LOOKUP_HOSTNAME')    : '',
      CLOUDFLARE_API_KEY: isRouter ? textVal('CLOUDFLARE_API_KEY') : '',

      // ── Failover (router only) ────────────────────────────────────────────
      CELLULAR_MODEM: isRouter ? checkboxVal('CELLULAR_MODEM') : '',
      MODEM_PATH:     modemEn  ? textVal('MODEM_PATH') : '',
      MODEM_APN:      modemEn  ? textVal('MODEM_APN')  : '',
      USB_TETHERING:  isRouter ? checkboxVal('USB_TETHERING') : '',

      // ── Performance & misc ────────────────────────────────────────────────
      SOFTWARE_OFFLOAD: checkboxVal('SOFTWARE_OFFLOAD'),
      HARDWARE_OFFLOAD: checkboxVal('HARDWARE_OFFLOAD'),
      BLOCK_DOT_DOQ:    checkboxVal('BLOCK_DOT_DOQ'),
      ADGUARD_PASSWD:   adguard,
    };
  }

  function parseAdditionalPackages() {
    return ($('#additional_packages').value || '')
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  // Mirror of server-side resolvePackages additions — keep in sync with functions/api/build.js.
  function computeAutoPackages() {
    const target  = ui.collectTarget && ui.collectTarget();
    const cfg     = collectConfig();
    const base    = target ? [...(target.default_packages || []), ...(target.device_packages || [])] : [];
    const lowRam  = checkboxVal('LOW_RAM') === '1';
    const pkgs    = [];

    pkgs.push('curl', 'ip-full', 'umdns');
    if (lowRam) {
      pkgs.push('dnsproxy');
    } else {
      pkgs.push('adguardhome', '-dnsproxy', 'luci-ssl');
    }
    pkgs.push('zram-swap', 'luci-app-commands', 'ip-bridge');

    const multiWan = cfg.WAN_B_ENABLE === '1' || cfg.WWAN_ENABLE === '1' ||
                     cfg.CELLULAR_MODEM === '1' || cfg.USB_TETHERING === '1';
    if (multiWan) pkgs.push('luci-app-mwan3');

    const hasWifi = /\bwpad-?|\bhostapd|\bmac80211/.test(base.join(' ')) ||
                    Object.entries(cfg).some(([k, v]) => /WIFI/.test(k) && v);
    if (hasWifi) pkgs.push('-wpad-basic-mbedtls', 'wpad-mbedtls', 'luci-app-usteer');

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

  // Re-render chips whenever any input in the form changes or device is picked.
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

  // -------------------------------------- main build flow
  let polling = null;

  ui.startBuild = async function () {
    if (polling) return;
    ui.clearStatus(); ui.clearProgress();
    $('#result').classList.add('hidden');
    $('#config-preview-wrap').classList.add('hidden');

    const target = ui.collectTarget();
    if (!target) { ui.status('Pick a device first.', 'error'); return; }

    const payload = {
      profile:      target.profile,
      target:       target.target,
      version:      target.version,
      version_code: target.version_code,
      default_packages: target.default_packages,
      device_packages:  target.device_packages,
      device_title:        ($('#device') || {}).value || '',
      low_ram:             checkboxVal('LOW_RAM'),
      wrtnova_config:      collectConfig(),
      additional_packages: parseAdditionalPackages(),
    };

    $('#build-btn').disabled = true;
    ui.status('Submitting build…', 'info');
    ui.setProgress('Submitting build…', 2);

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
      ui.status('Build submit failed: ' + e.message, 'error');
      return;
    }

    if (resp.config_preview) {
      $('#config-preview').textContent = resp.config_preview;
      $('#config-preview-wrap').classList.remove('hidden');
    }

    if (resp.firmware_url) {
      // cached build — no polling needed
      renderResult({ firmware_url: resp.firmware_url, images: resp.images, bin_dir: resp.bin_dir });
      ui.setProgress('Done (cached build)', 100);
      ui.status('Build complete (cached).', 'success');
      $('#build-btn').disabled = false;
      return;
    }

    if (!resp.request_hash) {
      ui.status('Unexpected response from /api/build', 'error');
      $('#build-btn').disabled = false;
      return;
    }

    pollAsu(resp.request_hash);
  };

  const PROGRESS_MAP = {
    'init':                    [ 5,  'Initializing'],
    'queued':                  [10,  'Queued'],
    'started':                 [12,  'Starting build'],
    'container-setup':         [15,  'Setting up container'],
    'download-imagebuilder':   [20,  'Downloading imagebuilder'],
    'validate-manifest':       [30,  'Validating manifest'],
    'unpack-imagebuilder':     [40,  'Unpacking imagebuilder'],
    'calculate-packages-hash': [60,  'Resolving packages'],
    'building-image':          [80,  'Building image'],
    'build-successful':        [100, 'Done'],
  };

  function pollAsu(hash) {
    let tries = 0;
    polling = setInterval(async () => {
      tries++;
      try {
        const r = await fetch(ASU + '/api/v1/build/' + hash, { cache: 'no-cache' });
        const data = await r.json();
        if (r.status === 202) {
          const m = PROGRESS_MAP[data.detail] || [50, data.detail || 'Building…'];
          ui.setProgress(m[1] + (data.queue_position != null ? ' (#' + data.queue_position + ' in queue)' : ''), m[0]);
          return;
        }
        clearInterval(polling); polling = null;
        $('#build-btn').disabled = false;
        if (r.status === 200) {
          ui.setProgress('Done', 100);
          ui.status('Build complete.', 'success');
          renderResult(data);
        } else {
          ui.status('Build failed: ' + (data.detail || ('HTTP ' + r.status)), 'error');
          if (data.stderr) {
            $('#config-preview').textContent = data.stderr;
            $('#config-preview-wrap').classList.remove('hidden');
          }
        }
      } catch (e) {
        if (tries > 200) {
          clearInterval(polling); polling = null;
          $('#build-btn').disabled = false;
          ui.status('Polling failed: ' + e.message, 'error');
        }
      }
    }, 5000);
  }

  function renderResult(data) {
    const bin_dir = data.bin_dir;
    const images  = data.images || [];
    const sys = images.find(i => i.type === 'sysupgrade') ||
                images.find(i => i.type === 'factory') ||
                images[0];
    const main = data.firmware_url || (sys && bin_dir
      ? ASU + '/store/' + bin_dir + '/' + sys.name
      : null);

    // Patch history entry with final firmware_url (handles queued builds that polled to completion)
    if (main) {
      fetch('/api/history', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ firmware_url: main }),
      }).catch(function () {});
    }

    const wrap = $('#result'); wrap.classList.remove('hidden');
    let html = '<div class="result-wrap">';
    if (main) {
      html += '<a class="btn btn-primary result-btn" href="' + main + '">'
            + 'Download ' + (sys ? sys.type : 'image') + ' image</a>';
    }
    if (images.length > 1) {
      html += '<details class="result-other"><summary>Other images</summary><ul>';
      images.forEach(im => {
        const url = ASU + '/store/' + bin_dir + '/' + im.name;
        html += '<li><a href="' + url + '">' + im.name + '</a>'
             + ' <small>(' + im.type + ', sha256: ' + (im.sha256 || '').slice(0, 16) + '…)</small></li>';
      });
      html += '</ul></details>';
    }
    html += '</div>';
    wrap.innerHTML = html;
  }

  // -------------------------------------- WARP prefill button
  function initWarpPrefill() {
    const btn = $('#warp-prefill-btn');
    if (!btn) return;
    const msg = $('#warp-prefill-msg');
    let dismissTimer;

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const origText = btn.textContent;
      btn.textContent = 'Fetching WARP…';
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
        if (!r.ok) throw new Error(data.message || data.error || ('HTTP ' + r.status));

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
          msg.textContent = '✓ Filled from Cloudflare WARP';
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

  // -------------------------------------- expose build enable/disable signal
  ui.notifyTargetChanged = function () {
    const t = ui.collectTarget && ui.collectTarget();
    const ok = !!t;
    $('#build-btn').disabled = !ok;
    $('#build-hint').textContent = ok ? '' : 'Pick a device to enable build.';
    if (ok) ui.setDot('target', 'valid');
  };
})();
