// /builder build flow, config store, live preview, WARP prefill. ES module.
// Imports ui.js (DOM helpers) and i18n.js (ui.t/ui.S) for their side effects so
// the values captured below exist at module-eval time; pure logic (deriveConfig,
// createStore, renderConfigBlock, config-form) is imported directly from the
// typed .mjs. Still publishes its own callbacks (renderAutoPackages,
// notifyTargetChanged, ...) onto the shared namespace for devices.js / history.js
// until those import it directly.
import { ui } from './ui-ns.mjs';
import './ui.js';
import './i18n.js';
import { BASE_SCHEMA, readForm, keySets, textVal } from './config-form.mjs';
import { deriveConfig } from './builder-config.mjs';
import { createStore } from './store.mjs';
import { renderConfigBlock } from './render-config.mjs';
import { collectTarget } from './devices.js';

// Shared-config field schema for /builder: the canonical BASE_SCHEMA plus the
// single-device fields (AP mode + AP index + non-CT ath10k) that only /builder
// edits inline; /networks carries those as per-node overrides instead.
const BUILDER_SCHEMA = [...BASE_SCHEMA, ['AP_MODE', 'radio'], ['AP_INDEX', 'text'], ['NON_CT_ATH10K', 'checkbox']];

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
    // Store-first: downgrade DNS_MODE in the store (single source of truth) and
    // reflect it into the radio, so the auto-retry rebuild uses the new value.
    ui.applyStorePatch({ DNS_MODE: nextVal });
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

  // -- Config store (single source of truth) --------------------------------
  // The DOM is a view. readRawForm() reads+normalizes every field into a raw
  // object (no cross-field gating); the store holds it; deriveConfig()
  // (builder-config.mjs) is the pure selector that applies the gating. Build
  // payload, preview and chips all read the store via collectConfig().

  // DOM -> raw config object, normalized once at the boundary (checkboxes ''/'1',
  // COUNTRY_CODE uppercased, tz + dynamic tables resolved). No gating here. The
  // field list + ordering live in config-form.mjs (BUILDER_SCHEMA), shared with
  // /networks' readConfig.
  function readRawForm() {
    return readForm(BUILDER_SCHEMA);
  }

  let store = null;

  // The gated config: pure derivation of the store (falls back to a direct form
  // read if called before the store is initialized).
  function collectConfig() {
    return deriveConfig(store ? store.get() : readRawForm());
  }

  function refreshStore() {
    if (store) store.set(readRawForm());
  }
  ui.refreshConfigStore = refreshStore;

  // -- Store-first programmatic writes (single-writer model) -----------------
  // The store is the single source of truth. Programmatic config changes (WARP
  // prefill, DNS auto-retry) go through applyStorePatch: write the store first
  // (which notifies the derived selectors), then reflect the changed keys into
  // the form controls via renderConfigToDom (the inverse of readRawForm). This
  // removes the "wrote the DOM but forgot to sync the store" hazard class: there
  // is no separate refreshStore() call to forget. (History restore reconstructs
  // tables / timezone / wan_type and stays DOM-first, then re-syncs explicitly.)
  const { radio: RADIO_SET, checkbox: CHECKBOX_SET } = keySets(BUILDER_SCHEMA);
  function renderConfigToDom(patch) {
    for (const k in patch) {
      const val = patch[k];
      if (k === 'ZONE_NAME') { if (val) ui.setTimezone(val); continue; }
      if (k === 'TIME_ZONE') continue;                 // set together with ZONE_NAME
      if (RADIO_SET.has(k)) {
        const el = $('input[name="' + k + '"][value="' + (val || '') + '"]');
        if (el) el.checked = true;
        continue;
      }
      if (CHECKBOX_SET.has(k)) {
        const el = $('#' + k);
        if (el) el.checked = val === '1';
        continue;
      }
      const el = $('#' + k);                            // text / select / textarea
      if (el && 'value' in el) el.value = val == null ? '' : val;
    }
  }

  function applyStorePatch(patch) {
    if (store) store.set(patch);
    renderConfigToDom(patch);
  }
  ui.applyStorePatch  = applyStorePatch;
  ui.renderConfigToDom = renderConfigToDom;

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
    const target = collectTarget();
    return ui.computeFinalPackages(target, collectConfig(), parseAdditionalPackages());
  }

  function renderAutoPackages() {
    const el = $('#auto-packages');
    if (!el) return;
    const pkgs = computeFinalPackages();
    ui.renderPackageChips(el, pkgs);   // shared chip renderer (ui.js)
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
      pre.textContent = previewRevealed ? renderConfigBlock(cfg) : ui.renderConfigBlockMasked(cfg);
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

  // Always-unmasked text for the Copy button, regardless of the reveal toggle:
  // copying masked asterisks would paste an unusable config.
  function previewUnmaskedText() {
    const cfg = collectConfig();
    if (!previewFullScript) return Promise.resolve(renderConfigBlock(cfg));
    return ui.fetchWrtnovaBody().then(body => ui.assembleScript(cfg, body, false));
  }

  function initPreviewControls() {
    const reveal = $('#preview-reveal');
    const full   = $('#preview-fullscript');
    if (reveal) reveal.addEventListener('change', () => { previewRevealed = reveal.checked; renderPreview(); });
    if (full)   full.addEventListener('change',   () => { previewFullScript = full.checked; renderPreview(); });

    const copyCfg = $('#copy-config');
    if (copyCfg) copyCfg.addEventListener('click', async () => {
      let ok = false;
      try { ok = await ui.copyToClipboard(await previewUnmaskedText()); } catch (_) { ok = false; }
      ui.flashCopied(copyCfg, ok);
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
    store = createStore(readRawForm());
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

    const target = collectTarget();
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
      ui.loadScript('/js/bcrypt.js'),     // classic global (window.dcodeIO)
      import('/js/history.js'),           // ES module - dynamic import
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
    ui.setProgress(S.preparingBuild, 5);

    // Package set + ASU endpoint are both resolved client-side (no /api/build).
    // computeFinalPackages() is the shared resolvePackages - byte-identical to
    // what the old worker returned. asuUrl is the user-selected (or default) ASU.
    const packages = computeFinalPackages();
    const asuUrl   = activeAsu.replace(/\/+$/, '') + '/api/v1/build';

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
      packages:     packages,
      defaults:     ui.assembleScript(cfg, wrtnovaBody),
      diff_packages: true,
      client:       'wrtnova/1.0',
    };

    ui.setProgress(S.submittingToServer, 8);

    let asuR, asuData;
    try {
      asuR = await fetch(asuUrl, {
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

    const asuBase = asuUrl.replace('/api/v1/build', '');

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

        // Store-first: write the WARP-derived WG fields into the store (single
        // source of truth) and reflect them into the form. No separate sync.
        ui.applyStorePatch({
          WG_PRIVATE_KEY:  data.WG_PRIVATE_KEY  || '',
          PEER_PUBLIC_KEY: data.PEER_PUBLIC_KEY || '',
          ENDPOINT:        data.ENDPOINT        || '',
          ENDPOINT_PORT:   data.ENDPOINT_PORT   || '',
          WG_IPV4:         data.WG_IPV4         || '',
          WG_IPV6:         data.WG_IPV6         || '',
          ALLOWED_IPS:     data.ALLOWED_IPS     || '',
        });

        if (data.warp_refresh_token) {
          _warpSessionToken = data.warp_refresh_token;
        }

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
    const t = collectTarget();
    const ok = !!t;
    $('#build-btn').disabled = !ok;
    $('#build-hint').textContent = ok ? '' : S.pickDeviceHint;
    if (ok) ui.setDot('target', 'valid');
    // Chips depend on the target's base/device packages, which are not part of
    // the config store; re-render on target change.
    renderAutoPackages();
  };
