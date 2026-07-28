// Card toggle animation for .card-anim elements; <details> used only for card-history.
// Publishes its DOM helpers onto the shared namespace (ui) for the other UI
// scripts; the pure logic it consumes is imported directly from the typed .mjs
// modules (no more shared-boot bridge).
import { ui } from './ui-ns.mjs';
import { renderConfigBlock } from './render-config.mjs';
import { resolvePackages } from './packages.mjs';
import { serializeList, clampOctet4, ipv6OctetValid } from './list-grammar.mjs';
import { deriveVisibility, deriveNetRows, detectVlanConflict, resolveVlanAssignment,
         detectIfaceConflict, resolveIfaceAssignment, DOH_PROVIDERS } from './visibility.mjs';

  ui.$  = (sel, root) => (root || document).querySelector(sel);
  ui.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  ui.initCardToggles = function (scope) {
    var root = scope ? (typeof scope === 'string' ? document.querySelector(scope) : scope) : document;
    ui.$$('.card-anim', root).forEach(function (card) {
      var hdr = card.querySelector('.card-header');
      if (!hdr) return;
      hdr.setAttribute('role', 'button');
      hdr.setAttribute('tabindex', '0');
      hdr.addEventListener('click', function () { card.classList.toggle('open'); });
      hdr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('open'); }
      });
      var wrap = card.querySelector('.card-body-wrap');
      if (!wrap) return;
      var footer = document.createElement('button');
      footer.type = 'button';
      footer.className = 'card-collapse-footer';
      footer.setAttribute('aria-label', 'Collapse section');
      footer.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>';
      footer.addEventListener('click', function () { card.classList.remove('open'); });
      wrap.appendChild(footer);
    });
  };

  ui.loadScript = function (src) {
    if (document.querySelector('script[src="' + src + '"]')) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  };

  // states: 'untouched' | 'touched' | 'valid'
  const DOT_LABEL = { untouched: 'dotNotStarted', touched: 'dotInProgress', valid: 'dotComplete' };

  ui.setDot = function (sectionId, state) {
    const card = document.getElementById('card-' + sectionId);
    if (!card) return;
    const dot = card.querySelector('.dot');
    if (!dot) return;
    dot.classList.remove('touched', 'valid');
    if (state === 'touched') dot.classList.add('touched');
    else if (state === 'valid') dot.classList.add('valid');
    const key = DOT_LABEL[state];
    if (!key) return;
    dot.dataset.i18nAria = key;
    if (ui.t) dot.setAttribute('aria-label', ui.t(key));
  };

  ui.wireDotTouches = function () {
    ui.$$('.card').forEach(card => {
      const id = (card.dataset.section || card.id.replace(/^card-/, ''));
      const onAny = () => ui.setDot(id, 'touched');
      card.addEventListener('input', onAny);
      card.addEventListener('change', onAny);
    });
  };

  ui.wireSubnetAnchors = function () {
    const mark = function (e) {
      const t = e.target;
      if (t && t.classList && t.classList.contains('net-sub')) t.dataset.explicit = '1';
    };
    document.addEventListener('input', mark, true);
    document.addEventListener('change', mark, true);
  };

  ui.status = function (msg, kind /* 'info' | 'error' | 'success' */) {
    const el = ui.$('#status');
    el.textContent = msg;
    el.className = 'status' + (kind && kind !== 'info' ? ' ' + kind : '');
  };
  ui.clearStatus = function () { ui.$('#status').classList.add('hidden'); };

  ui.setProgress = function (label, pct) {
    ui.$('#progress').classList.remove('hidden');
    ui.$('#progress-fill').style.width = pct + '%';
    ui.$('#progress-label').textContent = label;
  };
  ui.clearProgress = function () { ui.$('#progress').classList.add('hidden'); };

  function octetAttrs(isV6) {
    return isV6
      ? 'type="text" pattern="[0-9a-fA-F]{1,4}" maxlength="4"'
      : 'type="number" min="1" max="254"';
  }
  ui.octetAttrs = octetAttrs;

  function addRow(kind) {
    const tbody = document.querySelector('#' + kind + '-table tbody');
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Hostname"><input type="text" data-col="host" class="input-base" placeholder="docker-host"></td>' +
      '<td data-label="Last octet"><input ' + octetAttrs(kind === 'ipv6') + ' data-col="octet" class="input-base" placeholder="20"></td>' +
      '<td data-label="Ports"><input type="text" data-col="ports" class="input-base" placeholder="80 443"></td>' +
      '<td><button class="btn btn-icon" type="button" data-remove="1" aria-label="Remove row">×</button></td>';
    tbody.appendChild(tr);
    // Removing the last row leaves the box as a bare column header with nothing
    // under it, so the last one clears instead - the same end state, minus the
    // empty shell.
    tr.querySelector('[data-remove]').addEventListener('click', () => {
      if (tbody.children.length > 1) { tr.remove(); return; }
      for (const el of tr.querySelectorAll('input')) {
        el.value = '';
        el.setCustomValidity('');
      }
    });
    bindOctetClamp(tr.querySelector('[data-col="octet"]'), kind === 'ipv6' ? 'v6' : 'v4');
    return tr;
  }

  // v4: clamp to 1-254 on blur. v6: never rewrite; block a bad hostid via a
  // validity bubble (like the prefix fields).
  function bindOctetClamp(el, kind) {
    if (!el) return;
    if (kind === 'v6') {
      const validate = () => {
        el.setCustomValidity(ipv6OctetValid(el.value) ? '' : ui.t('octetV6Invalid'));
        if (!el.validity.valid) el.reportValidity();
      };
      el.addEventListener('change', validate);
      el.addEventListener('focusout', validate);
      return;
    }
    el.addEventListener('change', () => {
      const v = el.value.trim();
      if (v !== '') el.value = clampOctet4(v);
    });
  }
  ui.bindOctetClamp = bindOctetClamp;
  ui.addRow = addRow;
  ui.initDynamicRows = function () {
    addRow('portfwd');
    addRow('ipv6');
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('[data-add]');
      if (btn) addRow(btn.dataset.add);
    });
  };

  // serialize a dynamic table into the wrtnova.sh multi-line list format.
  // The grammar lives in list-grammar.mjs (serializeList); this reads the
  // DOM rows and hands them to the shared serializer.
  ui.serializeRows = function (kind) {
    const rows = ui.$$('#' + kind + '-table tbody tr').map(tr => ({
      host:  tr.querySelector('[data-col="host"]').value,
      octet: tr.querySelector('[data-col="octet"]').value,
      ports: tr.querySelector('[data-col="ports"]').value,
    }));
    return serializeList(rows, kind === 'ipv6' ? 'v6' : 'v4');
  };

  // Render the per-network derived rows (prefix placeholder, router IP, default-
  // subnet label, net-off greying) and the VLAN-conflict warning from a config
  // object. Pure logic is in visibility.mjs (deriveNetRows/detectVlanConflict);
  // this is the DOM-writing view layer that consumes it.
  ui.applyNetworkRows = function (cfg) {
    const byKey = {};
    deriveNetRows(cfg).forEach(r => { byKey[r.key] = r; });
    ui.$$('.net-table tbody tr').forEach(function (row) {
      const r = byKey[row.dataset.net];
      if (!r) return;
      const pfxEl = row.querySelector('[id$="_BASE_PREFIX"]');
      const ipEl  = ui.$('.net-derived', row);
      const subEl = row.querySelector('[id$="_SUBNET"]');

      if (pfxEl) pfxEl.placeholder = r.basePfx;
      // Anchored subnet selects (no explicit user pick) cosmetically track the
      // global Default subnet; the store value stays '' (see config-form.mjs).
      if (subEl && !subEl.dataset.explicit) subEl.value = r.defSub;
      if (ipEl) {
        ipEl.innerHTML = r.hasIp
          ? r.effPfx + '.' + r.effVid + '.' + r.lastOct + '<span class="net-derived-sfx">' + r.effSub + '</span>'
          : '<span class="net-derived-sfx">—</span>';
      }
      if (row.dataset.net !== 'lan') row.classList.toggle('net-off', !r.on);
    });

    // Reflect the auto-allocated VLAN id in each field's placeholder so an empty
    // field reads its assigned value (e.g. WAN shows 21 when 20 is taken). Covers
    // the four net-table inputs plus the advanced WAN/WAN-B inputs.
    const vlanByKey = resolveVlanAssignment(cfg).byKey;
    [['lan', 'LAN_VLAN_ID'], ['guest', 'GUEST_VLAN_ID'], ['iot', 'IOT_VLAN_ID'],
     ['wg', 'LAN_VPN_VLAN_ID'], ['wan', 'WAN_VLAN_ID'], ['wanb', 'WAN_B_VLAN_ID']
    ].forEach(([key, id]) => {
      const el = ui.$('#' + id);
      const a = vlanByKey[key];
      if (el && a) el.placeholder = String(a.participates && a.vid != null ? a.vid : a.def);
    });

    // Same for the interface names: an empty field reads the name it will
    // actually get, so a net that yielded 'guest' shows its vlan5 fallback.
    const ifaceByKey = resolveIfaceAssignment(cfg).byKey;
    [['lan', 'LAN_IFACE'], ['guest', 'GUEST_IFACE'], ['iot', 'IOT_IFACE'], ['wg', 'LAN_VPN_IFACE']]
      .forEach(([key, id]) => {
        const el = ui.$('#' + id);
        const a = ifaceByKey[key];
        if (el && a) el.placeholder = a.name;
      });

    ui.hasVlanConflict = detectVlanConflict(cfg);
    const warn = ui.$('#net-dup-warn');
    if (warn) warn.classList.toggle('hidden', !ui.hasVlanConflict);

    ui.hasIfaceConflict = detectIfaceConflict(cfg);
    const ifaceWarn = ui.$('#net-iface-warn');
    if (ifaceWarn) ifaceWarn.classList.toggle('hidden', !ui.hasIfaceConflict);
  };

  // Back-compat: re-render rows from the current store config.
  ui.syncNetworkRows = function () {
    const cfg = ui.configState ? ui.configState() : null;
    if (cfg) ui.applyNetworkRows(cfg);
  };

  // Apply all conditional-visibility class toggles + the network rows from a
  // config object (pure deriveVisibility). DOM-writing view layer.
  ui.applyVisibility = function (cfg) {
    const vis = deriveVisibility(cfg);
    Object.keys(vis).forEach(function (cls) {
      const hidden = vis[cls];
      ui.$$('.' + cls).forEach(function (el) { el.classList.toggle('hidden', hidden); });
    });
    ui.applyNetworkRows(cfg);
  };

  // Conditional visibility is now a store selector: the page registers
  // ui.configState (() => store.get()); on every input/change the store is
  // updated at its boundary (before this body-level handler runs) and we render
  // from it. The only event-dependent behavior is the WG-card auto-open, which
  // must fire only on a direct WG_ENABLE toggle-on (CLAUDE.md).
  ui.initConditionalVisibility = function () {
    function refresh(e) {
      const cfg = ui.configState ? ui.configState() : null;
      if (!cfg) return;                       // store not ready (e.g. no network open yet)
      ui.applyVisibility(cfg);

      // ADGUARD_MAIN_DNS only applies in AdGuard Home mode. When the user
      // switches DNS mode away from AdGuard Home, force the toggle off. Read
      // straight from the DOM (order-independent of the store-sync listener)
      // and dispatch a bubbling change so each page's store re-syncs.
      const agMain = ui.$('#ADGUARD_MAIN_DNS');
      if (agMain && agMain.checked) {
        const dnsMode = (ui.$('input[name="DNS_MODE"]:checked') || {}).value;
        if (dnsMode && dnsMode !== 'adguardhome') {
          agMain.checked = false;
          agMain.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // DENSE_ENV only tightens usteer thresholds, and usteer runs only with
      // 802.11k/v (DOT11KV). When DOT11KV is off the toggle is inert: disable it
      // and force it off, dispatching a bubbling change so each page's store
      // re-syncs (same pattern as ADGUARD_MAIN_DNS above).
      const dense = ui.$('#DENSE_ENV');
      const kv = ui.$('#DOT11KV');
      if (dense && kv) {
        dense.disabled = !kv.checked;
        if (!kv.checked && dense.checked) {
          dense.checked = false;
          dense.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // When PSK_VLAN is on, disable the toggle and force it off, dispatching a
      // bubbling change so each page's store re-syncs (same pattern as DENSE_ENV).
      const pskVlan = ui.$('#PSK_VLAN');
      const guestIso = ui.$('#GUEST_ISOLATE');
      if (pskVlan && guestIso) {
        guestIso.disabled = pskVlan.checked;
        if (pskVlan.checked && guestIso.checked) {
          guestIso.checked = false;
          guestIso.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // "IoT: 802.11r" (IOT_NO_DOT11R, shown checked = IoT fast transition on)
      // only means anything when the base 802.11r (DOT11R) is on. When DOT11R is
      // off the toggle is inert: disable it and force it off (same pattern as
      // DENSE_ENV; the bubbling change lets each page's store re-sync the value).
      const dot11r = ui.$('#DOT11R');
      const iotFt = ui.$('#IOT_NO_DOT11R');
      if (dot11r && iotFt) {
        iotFt.disabled = !dot11r.checked;
        if (!dot11r.checked && iotFt.checked) {
          iotFt.checked = false;
          iotFt.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Per-VLAN PSK is one shared SSID: mirror LAN_WIFI_SSID into Guest/VPN (and
      // IoT unless "IoT: 802.11r" is off, keeping IoT its own SSID); disable them
      // (bubbling input so each page's store re-syncs). After the DOT11R block so
      // iotFt is settled.
      if (pskVlan) {
        const lan = ui.$('#LAN_WIFI_SSID');
        const s = (lan || {}).value;
        const lanPh = lan ? (lan.value || lan.placeholder) : '';   // what the shared SSID resolves to
        [['GUEST_WIFI_SSID', true], ['LAN_VPN_WIFI_SSID', true], ['IOT_WIFI_SSID', !iotFt || iotFt.checked]].forEach(function (p) {
          const el = ui.$('#' + p[0]);
          if (!el) return;
          if (el.dataset.ph == null) el.dataset.ph = el.placeholder;  // stash own placeholder once
          const share = pskVlan.checked && p[1];
          el.disabled = share;
          el.placeholder = share ? lanPh : el.dataset.ph;
          if (share && s != null && el.value !== s) { el.value = s; el.dispatchEvent(new Event('input', { bubbles: true })); }
        });
      }

      const mesh5 = ui.$('#WIRELESS_MESH');
      const mesh2g = ui.$('#WIRELESS_MESH_2G');

      const batman = ui.$('#BATMAN_ADV');

      // batman-adv needs a radio to run over and its toggle no longer hides when
      // both bands are off. Direct toggle only - a saved "batman on, mesh off" stays.
      if (batman && mesh5 && mesh2g && batman.checked && !mesh5.checked && !mesh2g.checked &&
          e && e.target && e.target.id === 'BATMAN_ADV') {
        mesh5.checked = true;
        mesh5.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // batman-adv runs over one mesh radio: with it on, the two bands are radio
      // buttons - the band just toggled on wins, the other is forced off (bubbling
      // change re-syncs each store). Any other trigger drops 2.4 GHz, keeps 5 GHz.
      // Before the BRIDGE_STP block so that block sees the settled single band.
      if (batman && mesh5 && mesh2g && batman.checked && mesh5.checked && mesh2g.checked) {
        const drop = (e && e.target && e.target.id === 'WIRELESS_MESH_2G') ? mesh5 : mesh2g;
        drop.checked = false;
        drop.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // When both 2.4 GHz and 5 GHz mesh backhauls are on, two 802.11s meshpoints
      // are bridged into br-vlan and can form an L2 loop; force BRIDGE_STP checked
      // and disabled so the toggle reflects the built config (same disable/force/dispatch pattern).
      const stp = ui.$('#BRIDGE_STP');
      if (stp && mesh5 && mesh2g) {
        const bothMesh = mesh5.checked && mesh2g.checked;
        stp.disabled = bothMesh;
        if (bothMesh && !stp.checked) {
          stp.checked = true;
          stp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      const wgRouter = cfg.WG_ENABLE === '1' && cfg.AP_MODE !== '1';
      if (wgRouter && e && e.target && e.target.id === 'WG_ENABLE') {
        const wgCard = ui.$('#card-wg');
        if (wgCard) {
          if (wgCard.tagName === 'DETAILS') wgCard.open = true;
          else wgCard.classList.add('open');
        }
      }
    }
    ui.refreshConditionalVisibility = refresh;
    document.body.addEventListener('change', refresh);
    document.body.addEventListener('input', refresh);

    // WG off-notice "Enable": flip WG_ENABLE via a simulated user toggle so both
    // pages' store-sync, visibility refresh and card auto-expand run as normal.
    document.body.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#wg-enable-now')) return;
      const cb = ui.$('#WG_ENABLE');
      if (cb && !cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    refresh();
    ui.initDohPreset();
    ui.initChannelSelects();
  };

  // Lockout guard TAGGED_LAN_VLAN
  ui.initTaggedLanGuard = function () {
    const box = ui.$('#TAGGED_LAN_VLAN'), modal = ui.$('#modal-tag-lan');
    if (!box || !modal || !modal.showModal) return;
    const arm = ui.$('#tag-lan-understand'), ok = ui.$('#btn-confirm-tag-lan');
    const close = (v) => () => { modal.returnValue = v; modal.close(); };
    const setEnabled = (on) => { if (!ok) return; ok.disabled = !on; ok.style.opacity = on ? '' : '0.5'; };
    arm?.addEventListener('change', () => setEnabled(arm.checked));
    box.addEventListener('change', () => {
      if (!box.checked) return;
      if (arm) arm.checked = false;
      setEnabled(false);
      modal.returnValue = ''; modal.showModal();
    });
    ok?.addEventListener('click', close('confirm'));
    ui.$('#btn-cancel-tag-lan')?.addEventListener('click', close('cancel'));
    modal.addEventListener('close', () => {
      if (modal.returnValue === 'confirm' || !box.checked) return;
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  ui.WIFI_CHANNELS = {
    CHANNEL_2G: Array.from({ length: 13 }, (_, i) => i + 1),
    CHANNEL_5G: [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120,
                 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165],
    CHANNEL_6G: Array.from({ length: 59 }, (_, i) => 1 + i * 4),
  };
  // High-band 5 GHz radio on a tri-band board: only UNII-2C + UNII-3 (the low
  // band is served by CHANNEL_5G). wrtnova.sh always assigns this to the
  // higher-frequency radio, so a low channel here would be nonsensical.
  ui.WIFI_CHANNELS.CHANNEL_5G_2 = [100, 104, 108, 112, 116, 120, 124, 128, 132,
                                   136, 140, 144, 149, 153, 157, 161, 165];

  ui.initChannelSelects = function () {
    Object.keys(ui.WIFI_CHANNELS).forEach(function (id) {
      const sel = ui.$('#' + id);
      if (!sel || sel.childElementCount > 1) return;   // missing, or already built
      const add = function (v, label, key) {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        // These are built during page init, which can beat the lazy locale
        // import; the key lets applyTranslations come back for them.
        if (key) o.dataset.i18n = key;
        sel.appendChild(o);
      };
      add('auto', ui.t ? ui.t('channelAuto') : 'Auto', 'channelAuto');
      ui.WIFI_CHANNELS[id].forEach(function (n) { add(String(n), String(n)); });
    });
  };

  // DoH presets: one plain-IP bootstrap resolver per family (v4 + v6), from each
  // variant's current published resolvers.

  // The Advanced DNS "Add DoH preset" <select> is a UI helper, not a config field.
  // It writes the textareas programmatically, so each append dispatches a bubbling
  // 'input' event to re-sync the page store (store-DOM sync hazard).
  ui.initDohPreset = function () {
    const sel = ui.$('#doh-preset');
    const ta = ui.$('#DOH_UPSTREAMS');
    if (!sel || !ta) return;                       // page without the control
    if (sel.childElementCount <= 1) {              // only the placeholder: build options
      DOH_PROVIDERS.forEach(function (p) {
        const opt = document.createElement('option');
        opt.value = p.url;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
    }
    // Appends the URL only. Its bootstrap IPs are derived from this list at emit
    // time (deriveBootstrapDns), so removing the URL removes them with it.
    sel.addEventListener('change', function () {
      const url = sel.value;
      sel.value = '';                              // reset to placeholder
      const list = ta.value.split(/\s+/).filter(Boolean);
      if (!url || list.includes(url)) return;
      ta.value = list.concat(url).join('\n');
      ta.dispatchEvent(new Event('input', { bubbles: true }));   // JS sets fire none
    });
  };


  ui.updateAth10kVisibility = function (hasCt) {
    ui.$$('.ath10k-ct-row').forEach(el => el.classList.toggle('hidden', !hasCt));
    if (!hasCt) {
      const cb = ui.$('#NON_CT_ATH10K');
      if (cb) cb.checked = false;
    }
  };

  // Show the WED (MediaTek Filogic wireless offload) toggle only for devices
  // whose driver supports it; clear the checkbox when the device cannot.
  ui.updateWedVisibility = function (capable) {
    ui.$$('.wed-row').forEach(el => el.classList.toggle('hidden', !capable));
    if (!capable) {
      const cb = ui.$('#WED_ENABLE');
      if (cb) cb.checked = false;
    }
  };

  // ----------------------------------- show/hide password toggle buttons
  // Toggles input type between password/text. Does NOT alter button content
  // (SVG icons stay intact). Third column is the noun the aria-label keeps
  // naming, so the four kinds of reveal button stay distinguishable.
  ui.initPasswordToggles = function () {
    [
      ['toggle-rootpw',       'ROOT_PASSWD',         'Password'],
      ['toggle-pppoe-pw',     'PPPOE_PASSWD',        'Password'],
      ['toggle-wg-privkey',   'WG_PRIVATE_KEY',      'PrivateKey'],
      ['toggle-wg-psk',       'PRESHARED_KEY',       'PresharedKey'],
      ['toggle-cfkey',        'CLOUDFLARE_API_KEY',  'ApiToken'],
      ['toggle-mesh-pw',      'MESH_PASSWD',         'Password'],
      ['toggle-lan-wifi-pw',  'LAN_WIFI_PASSWD',     'Password'],
      ['toggle-guest-wifi-pw','GUEST_WIFI_PASSWD',   'Password'],
      ['toggle-iot-wifi-pw',  'IOT_WIFI_PASSWD',     'Password'],
      ['toggle-wg-wifi-pw',   'LAN_VPN_WIFI_PASSWD', 'Password'],
    ].forEach(([btnId, inpId, noun]) => {
      const b = document.getElementById(btnId);
      const i = document.getElementById(inpId);
      if (!b || !i) return;
      b.addEventListener('click', () => {
        const showing = i.type !== 'password';
        i.type = showing ? 'password' : 'text';
        const key = (showing ? 'show' : 'hide') + noun;
        b.dataset.i18nAria = key;
        if (ui.t) b.setAttribute('aria-label', ui.t(key));
      });
    });
  };

  // -- Script assembly (shared between /builder and /networks) ------------------

  // Sensitive fields: masked as '****' in the config preview and stripped from
  // saved build history (never persisted in plaintext). Defined here (ui.js is
  // the sole consumer) so the type-only types.mjs stays out of the browser
  // payload; the Config typedef still references these by name in prose.
  /** @type {ReadonlySet<string>} */
  ui.SENSITIVE_FIELDS = new Set([
    'ROOT_PASSWD', 'PPPOE_PASSWD',
    'LAN_WIFI_PASSWD', 'GUEST_WIFI_PASSWD', 'IOT_WIFI_PASSWD', 'LAN_VPN_WIFI_PASSWD',
    'MESH_PASSWD',
    'WG_PRIVATE_KEY', 'PEER_PUBLIC_KEY', 'PRESHARED_KEY',
    'ENDPOINT', 'ENDPOINT_PORT', 'WG_IPV4', 'WG_IPV6', 'ALLOWED_IPS',
    'CLOUDFLARE_API_KEY', 'ADGUARD_PASSWD',
  ]);

  ui.stripSensitive = function (cfg) {
    return Object.fromEntries(Object.entries(cfg).filter(([k]) => !ui.SENSITIVE_FIELDS.has(k)));
  };

  // -- AdGuard Home admin password (derived from ROOT_PASSWD) -------------------
  // bcrypt hash of the root password, used as the AdGuard Home admin password so
  // the user logs in with the same credential. The salt is derived
  // deterministically from the password (SHA-256 -> first 16 bytes) so the SAME
  // password always yields the SAME hash: the preview can show it and rebuilds
  // are byte-identical, which lets the ASU server reuse a cached image. bcrypt's
  // cost factor still protects the hash; identical passwords share a hash, an
  // acceptable trade for a derived router admin credential.
  const _agHashPromises = new Map();   // pw -> Promise<hash>  (dedupe compute)
  const _agHashResolved = new Map();   // pw -> hash           (sync lookup)

  ui.adguardHashFromRoot = function (pw) {
    if (!pw) return Promise.resolve('');
    if (_agHashPromises.has(pw)) return _agHashPromises.get(pw);
    const p = (async () => {
      await ui.loadScript('/js/bcrypt.js');             // classic global (window.dcodeIO)
      const bcrypt = window.dcodeIO && window.dcodeIO.bcrypt;
      if (!bcrypt) return '';
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
      const saltBytes = new Uint8Array(digest).subarray(0, 16);
      const salt = '$2a$10$' + bcrypt.encodeBase64(saltBytes, 16);
      const hash = bcrypt.hashSync(pw, salt);
      _agHashResolved.set(pw, hash);
      return hash;
    })();
    _agHashPromises.set(pw, p);
    return p;
  };

  // Inject the derived ADGUARD_PASSWD into cfg for previews. If the hash for the
  // current ROOT_PASSWD is already computed it is set synchronously; otherwise
  // computation is kicked off and `onReady` fires once it lands so the caller can
  // re-render. Returns cfg (mutated in place).
  ui.injectAdguardPasswd = function (cfg, onReady) {
    const pw = cfg && cfg.ROOT_PASSWD;
    if (!pw) return cfg;
    const cached = _agHashResolved.get(pw);
    if (cached) { cfg.ADGUARD_PASSWD = cached; return cfg; }
    ui.adguardHashFromRoot(pw).then(h => { if (h && onReady) onReady(); });
    return cfg;
  };

  const _SCRIPT_MARKER = '# ===================\n# End config section\n# ===================\n';
  let _wrtnovaBodyCache = null;
  let _wrtnovaBodyPromise = null;  // deduplicate concurrent first fetches

  // The masked preview reuses the shared renderer (render-config.mjs, imported
  // above), passing SENSITIVE_FIELDS so secrets show as KEY='****'.
  ui.renderConfigBlockMasked = function (cfg) {
    return renderConfigBlock(cfg, ui.SENSITIVE_FIELDS);
  };

  ui.fetchWrtnovaBody = function () {
    if (_wrtnovaBodyCache !== null) return Promise.resolve(_wrtnovaBodyCache);
    if (!_wrtnovaBodyPromise) {
      _wrtnovaBodyPromise = fetch('/wrtnova.sh')
        .then(r => {
          if (!r.ok) throw new Error('Failed to fetch /wrtnova.sh');
          return r.text();
        })
        .then(text => {
          const idx = text.indexOf(_SCRIPT_MARKER);
          if (idx < 0) throw new Error('wrtnova.sh marker not found');
          _wrtnovaBodyCache = text.slice(idx + _SCRIPT_MARKER.length);
          return _wrtnovaBodyCache;
        })
        .catch(err => { _wrtnovaBodyPromise = null; throw err; });
    }
    return _wrtnovaBodyPromise;
  };

  // masked=true renders the config block with sensitive values as '****' (used by
  // the live full-script preview). Default false: the real script POSTed to ASU.
  // CUSTOM_SCRIPT emits a /tmp/_user_script.sh block, not KEY=value: build gzips
  // (_customBlockGz), preview uses a heredoc (_customBlockPlain).
  const _HEADER = '#!/bin/sh\n# SPDX-License-Identifier: MIT\n# Copyright (C) 2024 - 2026 Tieu Long (https://github.com/LongQT-sea/wrtnova)\n\n';
  function _customBlockPlain(cmd) {
    if (!cmd) return '';
    return "cat > /tmp/_user_script.sh <<'USER_SCRIPT_EOF'\n" + cmd + '\nUSER_SCRIPT_EOF\n';
  }
  ui.assembleScript = function (cfg, wrtnovaBody, masked) {
    const block = masked ? ui.renderConfigBlockMasked(cfg) : renderConfigBlock(cfg);
    return _HEADER + block + _customBlockPlain(cfg.CUSTOM_SCRIPT) + _SCRIPT_MARKER + wrtnovaBody;
  };

  // ASU caps uci-defaults at 40960 B; over that, keep the header+config plaintext
  // (readable on the router) and ship only the body as a gzip+base64 blob that is
  // decoded to /tmp and sourced (so it sees the plaintext config vars). gunzip is
  // in busybox but base64 needs coreutils-base64 (compressed:true -> callers add it).
  const _ASU_MAX = 40960;
  async function _gzB64(str) {
    if (typeof CompressionStream === 'undefined')
      throw new Error('Config too large; browser cannot compress.');
    const gz = await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    const u8 = new Uint8Array(gz);
    let raw = '';
    for (let i = 0; i < u8.length; i += 0x8000) raw += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(raw).replace(/(.{76})/g, '$1\n');
  }
  function _bodyStub(payload) {
    return "wrtnova_body=/tmp/wrtnova.sh\n" +
      "base64 -d <<'WRTNOVA_B64' 2>/dev/null | gunzip > \"$wrtnova_body\" 2>/dev/null\n" +
      payload + "\nWRTNOVA_B64\n" +
      "[ -s \"$wrtnova_body\" ] && . \"$wrtnova_body\"\n";
  }
  // Custom script, always gzip+base64 -> /tmp/_user_script.sh (needs coreutils-base64).
  async function _customBlockGz(cmd) {
    return "# === Custom script ===\n" +
      "u_script=/tmp/_user_script.sh\n" +
      "base64 -d <<'USER_SCRIPT_B64' 2>/dev/null | gunzip > \"$u_script\" 2>/dev/null\n" +
      await _gzB64(cmd) + "\nUSER_SCRIPT_B64\n";
  }
  function _tooBig(script) {
    let hint = 'Config too large even compressed; reduce IPv4 port forward / IPv6 servers expose host';
    if (/^DOH_UPSTREAMS=/m.test(script)) hint += ' / DoH upstreams URL';
    return new Error(hint + '.');
  }
  // Standalone script (advanced editor): decode + source the whole thing.
  ui.compressDefaultsIfNeeded = async function (script) {
    if (new Blob([script]).size <= _ASU_MAX) return { script, compressed: false };
    const out = '#!/bin/sh\n' + _bodyStub(await _gzB64(script));
    if (new Blob([out]).size > _ASU_MAX) throw _tooBig(script);
    return { script: out, compressed: true };
  };
  // header+config stay plaintext; body compressed only if over. `compressed` =
  // "needs coreutils-base64" (body compressed OR custom present); only withBase64Pkg reads it.
  ui.assembleScriptForBuild = async function (cfg, wrtnovaBody) {
    const hasCustom = !!cfg.CUSTOM_SCRIPT;
    const customGz = hasCustom ? await _customBlockGz(cfg.CUSTOM_SCRIPT) : '';
    const prefix = _HEADER + renderConfigBlock(cfg) + customGz + _SCRIPT_MARKER;
    const full = prefix + wrtnovaBody;
    if (new Blob([full]).size <= _ASU_MAX) return { script: full, compressed: hasCustom };
    const out = prefix + _bodyStub(await _gzB64(wrtnovaBody));
    if (new Blob([out]).size > _ASU_MAX) throw _tooBig(full);
    return { script: out, compressed: true };
  };
  ui.withBase64Pkg = function (packages, compressed) {
    if (!compressed || packages.includes('coreutils-base64')) return packages;
    return packages.concat('coreutils-base64');
  };

  // Render a final-package list as chips into `el` (shared by /builder and the
  // /networks per-node panel). Removal tokens ('-pkg') render struck-through.
  // textContent only - the list can include user-typed names, never markup.
  const _CHIP_NEUTRAL = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
  const _CHIP_REMOVAL = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 line-through';
  ui.renderPackageChips = function (el, pkgs) {
    if (!el) return;
    el.textContent = '';
    pkgs.forEach((p, i) => {
      const span = document.createElement('span');
      span.className = p.startsWith('-') ? _CHIP_REMOVAL : _CHIP_NEUTRAL;
      span.textContent = p;
      el.appendChild(span);
      if (i < pkgs.length - 1) el.appendChild(document.createTextNode(' '));
    });
  };

  ui.computeFinalPackages = function (target, cfg, extra) {
    const t = target || {};
    return resolvePackages({
      base:   t.default_packages || [],
      device: t.device_packages  || [],
      extra:  extra || [],
      config: cfg || {},
    });
  };

  // Copy text to the clipboard. Prefers the async Clipboard API; falls back to a
  // hidden textarea + execCommand for non-secure-context / older browsers.
  // Resolves true on success, false on failure.
  ui.copyToClipboard = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  };

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) { return false; }
  }

  // Transient success feedback for an icon-only copy button: swap the .icon-copy
  // glyph for .icon-check for ~1.2s. No-op on failure (button keeps its copy icon).
  ui.flashCopied = function (btn, ok) {
    if (!btn || !ok) return;
    const copy = btn.querySelector('.icon-copy');
    const check = btn.querySelector('.icon-check');
    if (!copy || !check) return;
    copy.classList.add('hidden');
    check.classList.remove('hidden');
    setTimeout(function () {
      check.classList.add('hidden');
      copy.classList.remove('hidden');
    }, 1200);
  };

