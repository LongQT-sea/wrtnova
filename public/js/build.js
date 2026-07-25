// /builder build flow, config store, live preview, WARP prefill. ES module.
// Imports ui.js (DOM helpers) and i18n/core.mjs (ui.t/ui.S) for their side effects so
// the values captured below exist at module-eval time; pure logic (deriveConfig,
// createStore, renderConfigBlock, config-form) is imported directly from the
// typed .mjs. Still publishes its own callbacks (renderAutoPackages,
// notifyTargetChanged, ...) onto the shared namespace for devices.js / history.js
// until those import it directly.
import { ui } from './ui-ns.mjs';
import './ui.js';
import './i18n/core.mjs';
import { BUILDER_SCHEMA, readForm, keySets, SUBNET_KEYS, writeSubnet, IFACE_FIELDS, ifaceValid, PREFIX_FIELDS, prefixValid, WIFI_TEXT_FIELDS, wifiTextValid, pskVlanPassIssue } from './config-form.mjs';
import { deriveConfig } from './builder-config.mjs';
import { deriveNetRows, truncateAdditionalVlans, SWCONFIG_VLAN_MAX, isSwconfigTarget } from './visibility.mjs';
import { createStore } from './store.mjs';
import { renderConfigBlock } from './render-config.mjs';
import { parseAdditionalPackages } from './packages.mjs';
import { ipv6OctetValid, hostnameValid, ddnsHostnameValid, macValid, portListValid, joinEndpoint } from './list-grammar.mjs';
import { collectTarget, devicesState } from './devices.js';

  const $  = ui.$, $$ = ui.$$;
  const S = ui.S, t = ui.t;
  const ASU_DEFAULT = 'https://sysupgrade.openwrt.org';
  let activeAsu = ASU_DEFAULT;

  function clearRetryNote() {
    const n = $('#retry-note');
    if (n) { n.textContent = ''; n.className = 'status hidden'; }
  }

  function tryAutoRetry(errMsg) {
    if (!/exceed.*storage|storage.*exceed/i.test(errMsg)) return false;
    const dnsRadio = $('input[name="DNS_MODE"]:checked');
    const dnsVal = dnsRadio ? dnsRadio.value : '';
    const nextVal = dnsVal === 'adguardhome'     ? 'dnsproxy'
                  : dnsVal === 'dnsproxy'        ? 'https-dns-proxy'
                  : dnsVal === 'https-dns-proxy' ? 'adblock-fast'
                  : dnsVal === 'adblock-fast'    ? 'none'
                  : '';
    if (!nextVal) return false;
    // Store-first: downgrade DNS_MODE in the store (single source of truth) and
    // reflect it into the radio, so the auto-retry rebuild uses the new value.
    // The downgrade always leaves AdGuard Home mode, so clear ADGUARD_MAIN_DNS too.
    ui.applyStorePatch({ DNS_MODE: nextVal, ADGUARD_MAIN_DNS: '' });
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
      tip.textContent = t(nextVal === 'dnsproxy' ? 'autoSwitchedDnsproxy'
                        : nextVal === 'https-dns-proxy' ? 'autoSwitchedHttpsDnsProxy'
                        : nextVal === 'adblock-fast' ? 'autoSwitchedAdblock'
                        : 'autoSwitchedDnsmasq');
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

  // Whether the user has directly picked a DNS engine. Until they do, the DNS
  // default tracks the selected device (applyDnsDefaultForTarget); once touched,
  // their choice is sticky across device changes. Set only on a real user
  // 'change' of the DNS_MODE radios - programmatic writes (applyStorePatch ->
  // renderConfigToDom set .checked directly, no event) never trip it.
  let dnsModeTouched = false;

  // AdGuard Home (>=32 MB flash / >=230 MB RAM) is the nicest default DNS engine,
  // but too heavy for the low-flash swconfig targets (ath79, ramips/mt7620,
  // ramips/mt76x8), which fall back to the lightweight https-dns-proxy. Pick the
  // default for the selected device, but never override an explicit user choice.
  function applyDnsDefaultForTarget(target) {
    if (dnsModeTouched) return;
    const desired = target && isSwconfigTarget(target.target) ? 'https-dns-proxy' : 'adguardhome';
    const cur = (store ? store.get().DNS_MODE : '') || 'https-dns-proxy';
    if (cur === desired) return;
    // Leaving AdGuard Home also clears its port-53 sub-option (mirrors tryAutoRetry).
    const patch = { DNS_MODE: desired };
    if (desired !== 'adguardhome') patch.ADGUARD_MAIN_DNS = '';
    applyStorePatch(patch);
    // renderConfigToDom sets the radio without an event, so nudge the DNS-mode
    // conditional visibility (AdGuard RAM note, main-DNS sub-option) to re-run.
    if (ui.refreshConditionalVisibility) ui.refreshConditionalVisibility();
  }

  // The gated config: pure derivation of the store (falls back to a direct form
  // read if called before the store is initialized).
  function collectConfig() {
    return deriveConfig(store ? store.get() : readRawForm());
  }

  // swconfig switches (ath79/mt7620/mt76x8) expose only SWCONFIG_VLAN_MAX (16)
  // hardware VLAN slots. When the selected device is one of these, auto-truncate
  // ADDITIONAL_VLAN_LIST to fit and surface a live note explaining the drop, so
  // the preview, the copied config and the built image all agree. On DSA targets
  // the config is returned unchanged and the note stays hidden.
  function withVlanTrunc(cfg) {
    const target = collectTarget();
    const trunc = truncateAdditionalVlans(cfg, target && target.target);
    const note = $('#vlan-trunc-note');
    if (note) {
      note.classList.toggle('hidden', !trunc.truncated);
      note.textContent = trunc.truncated
        ? t('vlanTruncNote', { max: String(SWCONFIG_VLAN_MAX), dropped: trunc.dropped })
        : '';
    }
    return trunc.truncated ? { ...cfg, ADDITIONAL_VLAN_LIST: trunc.list } : cfg;
  }

  function refreshStore() {
    if (store) store.set(readRawForm());
  }
  ui.refreshConfigStore = refreshStore;

  // Version-gated options. Packet steering "Enabled (all CPUs)" (value 2) needs
  // OpenWrt 24+; hide the control and clear a stale value on older releases,
  // syncing the store so the gated config never emits an unsupported setting.
  function updatePacketSteeringOpts(ver) {
    const parts = String(ver).split('.');
    const maj = parseInt(parts[0], 10);
    const unknown = isNaN(maj);              // SNAPSHOT/unknown -> newest, show all
    const allow24 = unknown || maj >= 24;

    const sel = $('#P_STEERING');
    const opt2 = sel && sel.querySelector('option[value="2"]');
    if (opt2) {
      opt2.hidden = !allow24;
      opt2.disabled = !allow24;
      if (!allow24 && sel.value === '2') { sel.value = ''; refreshStore(); }
    }
  }

  // Time format (clock_hourcycle) needs OpenWrt 25.12+
  function updateTimeFormatRow(ver) {
    const maj = parseInt(String(ver).split('.')[0], 10);
    const allow = isNaN(maj) || maj >= 25;   // SNAPSHOT/unknown -> newest, show
    const row = $('#row-time-format');
    if (!row) return;
    row.classList.toggle('hidden', !allow);
    if (!allow) {
      const cur = row.querySelector('input[name="TIME_FORMAT"]:checked');
      if (cur && cur.value !== '') {
        const def = row.querySelector('input[name="TIME_FORMAT"][value=""]');
        if (def) def.checked = true;
        refreshStore();
      }
    }
  }

  function updateVersionGatedOpts(ver) {
    updatePacketSteeringOpts(ver);
    updateTimeFormatRow(ver);
  }

  // -- Store-first programmatic writes (single-writer model) -----------------
  // The store is the single source of truth. Programmatic config changes (WARP
  // prefill, DNS auto-retry) go through applyStorePatch: write the store first
  // (which notifies the derived selectors), then reflect the changed keys into
  // the form controls via renderConfigToDom (the inverse of readRawForm). This
  // removes the "wrote the DOM but forgot to sync the store" hazard class: there
  // is no separate refreshStore() call to forget. (History restore reconstructs
  // tables / timezone / wan_type and stays DOM-first, then re-syncs explicitly.)
  const { radio: RADIO_SET, checkbox: CHECKBOX_SET, invCheckbox: INV_CHECKBOX_SET } = keySets(BUILDER_SCHEMA);
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
        if (el) el.checked = INV_CHECKBOX_SET.has(k) ? val !== '1' : val === '1';
        continue;
      }
      if (SUBNET_KEYS.has(k)) {                          // anchored subnet select
        const el = $('#' + k);
        if (el) writeSubnet(el, val || '');
        continue;
      }
      const el = $('#' + k);                            // text / select / textarea
      if (el && 'value' in el) el.value = val == null ? '' : val;
    }
    if (ui.refreshBanipChips && ('BANIP_COUNTRY_LIST' in patch || 'BANIP_FEEDS' in patch)) ui.refreshBanipChips();
  }

  function applyStorePatch(patch) {
    if (store) store.set(patch);
    renderConfigToDom(patch);
  }
  ui.applyStorePatch  = applyStorePatch;
  ui.renderConfigToDom = renderConfigToDom;

  // The exact, ordered package set sent to ASU - the full resolved list (base +
  // device + WrtNova additions + user extras, removals collapsed/sorted), via the
  // shared resolvePackages. Byte-identical to what the worker returns.
  function computeFinalPackages() {
    if (!ui.computeFinalPackages) return [];
    const target = collectTarget();
    return ui.computeFinalPackages(target, collectConfig(), parseAdditionalPackages($('#additional_packages').value));
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
      const cfg = ui.injectAdguardPasswd(withVlanTrunc(collectConfig()), renderPreview);
      pre.textContent = previewRevealed ? renderConfigBlock(cfg) : ui.renderConfigBlockMasked(cfg);
      return;
    }
    // Full script needs the cached wrtnova.sh body; recompute cfg in the .then so
    // the latest store state wins if it changed while fetching.
    ui.fetchWrtnovaBody().then(body => {
      if (!previewFullScript) return;
      const cfg = ui.injectAdguardPasswd(withVlanTrunc(collectConfig()), renderPreview);
      pre.textContent = ui.assembleScript(cfg, body, !previewRevealed);
    }).catch(e => { pre.textContent = t('failedLoadTemplate', { msg: e.message }); });
  }
  ui.renderPreview = renderPreview;

  // Always-unmasked text for the Copy button, regardless of the reveal toggle:
  // copying masked asterisks would paste an unusable config.
  async function previewUnmaskedText() {
    const cfg = withVlanTrunc(collectConfig());
    if (cfg.ROOT_PASSWD) {
      const h = await ui.adguardHashFromRoot(cfg.ROOT_PASSWD);
      if (h) cfg.ADGUARD_PASSWD = h;
    }
    if (!previewFullScript) return renderConfigBlock(cfg);
    const body = await ui.fetchWrtnovaBody();
    return ui.assembleScript(cfg, body, false);
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

  // Static: wrtnova.sh SSID defaults are decoupled from HOST_NAME
  // (lan_ssid="${LAN_WIFI_SSID:-WrtNova}", etc.).
  function syncSsidPlaceholders() {
    [
      ['LAN_WIFI_SSID',    'WrtNova'],
      ['GUEST_WIFI_SSID',  'WrtNova_Guest'],
      ['IOT_WIFI_SSID',    'WrtNova_IoT'],
      ['LAN_WG_WIFI_SSID', 'WrtNova_VPN'],
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
    // Reuse the LAN row's resolved prefix/VID/octet (same source as the Networks
    // table's Router IP cell) so an out-of-range or auto-reallocated VLAN renders
    // identically in both places instead of echoing the raw LAN_VLAN_ID input.
    const lan = deriveNetRows(s).find(r => r.key === 'lan');
    if (!lan) return;
    el.textContent = lan.effPfx + '.' + lan.effVid + '.' + lan.lastOct;
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
    store.subscribe(() => { renderAutoPackages(); syncApIndexPreview(); renderPreview(); });
    document.body.addEventListener('input',  refreshStore);
    document.body.addEventListener('change', refreshStore);
    $$('input[name="DNS_MODE"]').forEach(el =>
      el.addEventListener('change', () => { dnsModeTouched = true; }));
    if (ui.wireSubnetAnchors) ui.wireSubnetAnchors();
    $('#version')?.addEventListener('change', () => updateVersionGatedOpts($('#version').value));
    updateVersionGatedOpts(devicesState.version);
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
  // Numeric fields whose out-of-range values get a friendly, localized validation
  // message instead of the browser default ("Value must be <= 255"). The bounds
  // themselves stay declared as min/max on the inputs; this only renames the noun.
  const RANGE_NOUN = {
    LAN_VLAN_ID:    'LAN VLAN', GUEST_VLAN_ID: 'Guest VLAN', IOT_VLAN_ID:   'IoT VLAN',
    LAN_WG_VLAN_ID: 'VLAN', WAN_VLAN_ID:   'VLAN', WAN_B_VLAN_ID: 'VLAN',
  };

  // Refresh one field's custom validity from its native range state. Clearing
  // first reveals the native rangeOverflow/Underflow flags (a non-empty custom
  // message would otherwise pin validity to customError).
  function refreshRangeValidity(el) {
    const noun = RANGE_NOUN[el.id];
    if (!noun) return false;
    el.setCustomValidity('');
    const v = el.validity;
    const bad = v.rangeOverflow || v.rangeUnderflow || v.stepMismatch || v.badInput;
    if (bad) {
      el.setCustomValidity(ui.t
        ? ui.t('rangeMsg', { label: noun, min: el.min, max: el.max })
        : noun + ' must be ' + el.min + '-' + el.max);
    }
    return bad;
  }

  // Validate every range field; return the first *visible* offender so the caller
  // can pop its bubble. Hidden fields (collapsed card via .hidden or a closed
  // <details>) have offsetParent === null and are skipped: reportValidity can't
  // render a bubble on them, and out-of-range VLANs are dropped at emit time.
  function checkRangeFields() {
    let first = null;
    Object.keys(RANGE_NOUN).forEach(id => {
      const el = $('#' + id);
      if (!el) return;
      if (refreshRangeValidity(el) && !first && el.offsetParent !== null) first = el;
    });
    return first;
  }

  const IFACE_SET = new Set(IFACE_FIELDS);
  function refreshIfaceValidity(el) {
    el.setCustomValidity('');
    if (ifaceValid(el.value)) return false;
    el.setCustomValidity(t('ifaceInvalid', { field: el.value }));
    return true;
  }
  function checkIfaceFields() {
    let first = null;
    for (const id of IFACE_FIELDS) {
      const el = $('#' + id);
      if (!el) continue;
      if (refreshIfaceValidity(el) && !first && el.offsetParent !== null) first = el;
    }
    return first;
  }

  const PREFIX_SET = new Set(PREFIX_FIELDS);
  function refreshPrefixValidity(el) {
    el.setCustomValidity('');
    if (prefixValid(el.value)) return false;
    el.setCustomValidity(t('prefixInvalid', { field: el.value }));
    return true;
  }
  function checkPrefixFields() {
    let first = null;
    for (const id of PREFIX_FIELDS) {
      const el = $('#' + id);
      if (!el) continue;
      if (refreshPrefixValidity(el) && !first && el.offsetParent !== null) first = el;
    }
    return first;
  }

  const WIFI_TEXT_SET = new Set(WIFI_TEXT_FIELDS);
  function refreshWifiTextValidity(el) {
    el.setCustomValidity('');
    if (wifiTextValid(el.value)) return false;
    el.setCustomValidity(t('wifiPipeInvalid', { field: el.id }));
    return true;
  }
  function checkWifiTextFields() {
    let first = null;
    for (const id of WIFI_TEXT_FIELDS) {
      const el = $('#' + id);
      if (!el) continue;
      if (refreshWifiTextValidity(el) && !first && el.offsetParent !== null) first = el;
    }
    return first;
  }

  // IPv6 host IDs (the ipv6-table octet column): 1-4 hex digits, not 0.
  function refreshOctetV6Validity(el) {
    el.setCustomValidity('');
    if (ipv6OctetValid(el.value)) return false;
    el.setCustomValidity(t('octetV6Invalid'));
    return true;
  }
  function checkOctetV6Fields() {
    let first = null;
    for (const el of $$('#ipv6-table [data-col="octet"]')) {
      if (refreshOctetV6Validity(el) && !first && el.offsetParent !== null) first = el;
    }
    return first;
  }

  // Hostnames: System card HOST_NAME + the portfwd/ipv6 host column (they become
  // UCI section names / DHCP hosts, so a malformed one corrupts the config).
  function refreshHostnameValidity(el) {
    el.setCustomValidity('');
    if (hostnameValid(el.value)) return false;
    el.setCustomValidity(t('hostnameInvalid', { field: el.value }));
    return true;
  }
  function checkHostnameFields() {
    let first = null;
    const els = [$('#HOST_NAME'), ...$$('#portfwd-table [data-col="host"], #ipv6-table [data-col="host"]')];
    for (const el of els) {
      if (!el) continue;
      if (refreshHostnameValidity(el) && !first && el.offsetParent !== null) first = el;
    }
    return first;
  }

  function refreshDdnsValidity(el) {
    el.setCustomValidity('');
    if (ddnsHostnameValid(el.value)) return false;
    el.setCustomValidity(t('ddnsHostnameInvalid', { field: el.value }));
    return true;
  }
  function checkDdnsFields() {
    const el = $('#LOOKUP_HOSTNAME');
    if (el && refreshDdnsValidity(el) && el.offsetParent !== null) return el;
    return null;
  }

  // WAN MAC address: empty (leave the stock MAC) or six colon-separated hex
  // octets (e.g. F0:B4:29:2E:33:11), the form LuCI accepts.
  function refreshMacValidity(el) {
    el.setCustomValidity('');
    if (macValid(el.value)) return false;
    el.setCustomValidity(t('macInvalid', { field: el.value }));
    return true;
  }
  function checkMacFields() {
    const el = $('#WAN_MAC_ADDR');
    if (el && refreshMacValidity(el) && el.offsetParent !== null) return el;
    return null;
  }

  function refreshPortsValidity(el) {
    el.setCustomValidity('');
    if (portListValid(el.value)) return false;
    el.setCustomValidity(t('portInvalid', { field: el.value }));
    return true;
  }
  function checkPortFields() {
    let first = null;
    for (const el of $$('#portfwd-table [data-col="ports"], #ipv6-table [data-col="ports"]')) {
      if (refreshPortsValidity(el) && !first && el.offsetParent !== null) first = el;
    }
    return first;
  }

  // Live feedback: when the user leaves a range/iface/prefix field with a bad
  // value, set the message and show the bubble immediately rather than waiting
  // for Build.
  document.addEventListener('focusout', e => {
    const el = e.target;
    if (!el) return;
    if (RANGE_NOUN[el.id] && refreshRangeValidity(el)) el.reportValidity();
    else if (IFACE_SET.has(el.id) && refreshIfaceValidity(el)) el.reportValidity();
    else if (PREFIX_SET.has(el.id) && refreshPrefixValidity(el)) el.reportValidity();
    else if (WIFI_TEXT_SET.has(el.id) && refreshWifiTextValidity(el)) el.reportValidity();
    else if (el.id === 'LOOKUP_HOSTNAME') { if (refreshDdnsValidity(el)) el.reportValidity(); }
    else if (el.id === 'WAN_MAC_ADDR') { if (refreshMacValidity(el)) el.reportValidity(); }
    else if (el.id === 'HOST_NAME' || (el.matches && el.matches('[data-col="host"]'))) { if (refreshHostnameValidity(el)) el.reportValidity(); }
    else if (el.matches && el.matches('[data-col="ports"]')) { if (refreshPortsValidity(el)) el.reportValidity(); }
  });

  ui.startBuild = async function () {
    if (polling) return;
    ui.clearStatus(); ui.clearProgress();
    $('#result').classList.add('hidden');
    // The config preview is an always-live selector now; not gated on Build.

    const target = collectTarget();
    if (!target) { ui.status(S.pickDeviceFirst, 'error'); return; }
    if (ui.hasVlanConflict) { ui.status(S.fixVlanConflict, 'error'); return; }

    // Out-of-range numeric fields: set a friendly message ("VLAN must be 1-255")
    // and pop the first visible offender's native validation bubble, then bail.
    const badRange = checkRangeFields();
    if (badRange) { badRange.reportValidity(); return; }

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

    // Per-VLAN PSK: the enabled networks' WiFi passwords must be distinct (a
    // blank one uses the shared default), since the password is what steers a
    // client onto its VLAN. Report via the status banner only - no focus(), so
    // the page does not scroll the WiFi input into view.
    const pskIssue = pskVlanPassIssue({
      PSK_VLAN:           $('#PSK_VLAN').checked ? '1' : '',
      GUEST_ENABLE:       $('#GUEST_ENABLE').checked ? '1' : '',
      WG_ENABLE:          $('#WG_ENABLE').checked ? '1' : '',
      IOT_ENABLE:         $('#IOT_ENABLE').checked ? '1' : '',
      IOT_NO_DOT11R:      $('#IOT_NO_DOT11R').checked ? '' : '1',
      LAN_WIFI_PASSWD:    $('#LAN_WIFI_PASSWD').value,
      GUEST_WIFI_PASSWD:  $('#GUEST_WIFI_PASSWD').value,
      LAN_WG_WIFI_PASSWD: $('#LAN_WG_WIFI_PASSWD').value,
      IOT_WIFI_PASSWD:    $('#IOT_WIFI_PASSWD').value,
    });
    if (pskIssue) {
      ui.status(t('pskVlanPass', { networks: pskIssue.networks.join(', ') }), 'error');
      return;
    }

    // Interface names: empty (use default) or a valid UCI section name. Pop the
    // first visible offender's native bubble (hidden fields are blanked at emit).
    const badIface = checkIfaceFields();
    if (badIface) { badIface.reportValidity(); return; }

    // IP prefixes: empty (use default) or two octets 0-255. Pop the first visible
    // offender's native bubble.
    const badPrefix = checkPrefixFields();
    if (badPrefix) { badPrefix.reportValidity(); return; }

    // '|' would corrupt the wifi_networks table (its field delimiter).
    const badWifiText = checkWifiTextFields();
    if (badWifiText) { badWifiText.reportValidity(); return; }

    // IPv6 host IDs: 1-4 hex digits, not 0. Pop the first visible offender.
    const badOctet = checkOctetV6Fields();
    if (badOctet) { badOctet.reportValidity(); return; }

    // Hostname / DDNS / port formats: a bad value corrupts the emitted config.
    // Pop the first visible offender's bubble.
    const badHostname = checkHostnameFields();
    if (badHostname) { badHostname.reportValidity(); return; }
    const badDdns = checkDdnsFields();
    if (badDdns) { badDdns.reportValidity(); return; }
    const badMac = checkMacFields();
    if (badMac) { badMac.reportValidity(); return; }
    const badPorts = checkPortFields();
    if (badPorts) { badPorts.reportValidity(); return; }

    await import('/js/history.js');       // ES module - dynamic import

    const cfg = withVlanTrunc(collectConfig());
    // AdGuard Home admin password = deterministic bcrypt of the root password
    // (ui.adguardHashFromRoot loads bcrypt + derives a stable salt), so the
    // emitted script is byte-identical across rebuilds and the ASU cache hits.
    if (cfg.ROOT_PASSWD) {
      const h = await ui.adguardHashFromRoot(cfg.ROOT_PASSWD);
      if (h) cfg.ADGUARD_PASSWD = h;
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
      additional_packages: parseAdditionalPackages($('#additional_packages').value),
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

    let built;
    try {
      built = await ui.assembleScriptForBuild(cfg, wrtnovaBody);
    } catch (e) {
      $('#build-btn').disabled = false;
      ui.clearProgress();
      ui.status(t('buildFailed', { msg: e.message }), 'error');
      return;
    }

    const asuBody = {
      profile:      target.profile,
      target:       target.target,
      version:      target.version,
      version_code: target.version_code,
      packages:     ui.withBase64Pkg(packages, built.compressed),
      defaults:     built.script,
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

    const lbl = btn.querySelector('span') || btn;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const origText = lbl.textContent;
      lbl.textContent = S.fetchingWarp;
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
        // source of truth) and reflect them into the form. Prefilling a config
        // implies the user wants the VPN on, so enable WG_ENABLE too (otherwise
        // every field is silently dropped at build time). No separate sync.
        ui.applyStorePatch({
          WG_ENABLE:       '1',
          WG_PRIVATE_KEY:  data.WG_PRIVATE_KEY  || '',
          PEER_PUBLIC_KEY: data.PEER_PUBLIC_KEY || '',
          // WARP hands back host and port apart; the form shows them joined.
          ENDPOINT:        joinEndpoint(data.ENDPOINT, data.ENDPOINT_PORT),
          WG_IPV4:         data.WG_IPV4         || '',
          WG_IPV6:         data.WG_IPV6         || '',
          ALLOWED_IPS:     data.ALLOWED_IPS     || '',
        });
        // store.subscribe re-renders packages/preview but not conditional
        // visibility; refresh so the WG network rows show and the off-notice clears.
        if (ui.refreshConditionalVisibility) ui.refreshConditionalVisibility();

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
        lbl.textContent = origText;
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
    // Steer the DNS default to match the device's flash/RAM budget (unless the
    // user already picked one). Runs before renderPreview so the preview agrees.
    applyDnsDefaultForTarget(t);
    // The selected version may have changed (device pick can switch branches),
    // so refresh the version-gated options.
    updateVersionGatedOpts(devicesState.version);
    // Chips depend on the target's base/device packages, which are not part of
    // the config store; re-render on target change.
    renderAutoPackages();
    // The 16-slot VLAN cap is target-dependent, so re-run the preview (which
    // refreshes the truncation note) when the device changes.
    renderPreview();
  };
