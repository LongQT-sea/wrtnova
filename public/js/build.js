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
    if (rootpw && window.bcrypt) {
      try { adguard = window.bcrypt.hashSync(rootpw, 10); } catch (e) { /* leave empty */ }
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
      WAN_B_ENABLE:   isRouter ? checkboxVal('WAN_B_ENABLE') : '',

      // ── Network ───────────────────────────────────────────────────────────
      BASE_NET_PREFIX: textVal('BASE_NET_PREFIX'),
      DEFAULT_SUBNET:  textVal('DEFAULT_SUBNET'),
      GUEST_ENABLE:    checkboxVal('GUEST_ENABLE'),
      IOT_ENABLE:      checkboxVal('IOT_ENABLE'),
      IOT_INTERNET:    $('#IOT_ENABLE').checked ? checkboxVal('IOT_INTERNET') : '',
      WG_ENABLE:       wgEnable ? '1' : '',

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
      wrtnova_config:      collectConfig(),
      additional_packages: parseAdditionalPackages(),
      // WARP refresh token lets the server reuse an existing WARP registration.
      // Server infers WARP auto-fill from empty WG fields — no separate flag needed.
      warp_refresh_token: localStorage.getItem('wrtnova_warp_refresh') || '',
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

    if (resp.warp_refresh_token) {
      localStorage.setItem('wrtnova_warp_refresh', resp.warp_refresh_token);
    }
    if (resp.config_preview) {
      $('#config-preview').textContent = resp.config_preview;
      $('#config-preview-wrap').classList.remove('hidden');
    }

    if (resp.firmware_url) {
      // cached build — no polling needed
      renderResult({ firmware_url: resp.firmware_url, images: resp.images, bin_dir: resp.bin_dir });
      ui.setProgress('Done (cached build)', 100);
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

  // -------------------------------------- expose build enable/disable signal
  ui.notifyTargetChanged = function () {
    const t = ui.collectTarget && ui.collectTarget();
    const ok = !!t;
    $('#build-btn').disabled = !ok;
    $('#build-hint').textContent = ok ? '' : 'Pick a version and device to enable build.';
    if (ok) ui.setDot('target', 'valid');
  };
})();
