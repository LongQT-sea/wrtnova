// Card toggle animation for .card-anim elements; <details> used only for card-history.
// Publishes its DOM helpers onto the shared namespace (ui) for the other UI
// scripts; the pure logic it consumes is imported directly from the typed .mjs
// modules (no more shared-boot bridge).
import { ui } from './ui-ns.mjs';
import { renderConfigBlock } from './render-config.mjs';
import { resolvePackages } from './packages.mjs';
import { serializeList } from './list-grammar.mjs';
import { deriveVisibility, deriveNetRows, detectVlanConflict, resolveVlanAssignment } from './visibility.mjs';
import { SENSITIVE_KEYS } from './types.mjs';

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
  ui.setDot = function (sectionId, state) {
    const card = document.getElementById('card-' + sectionId);
    if (!card) return;
    const dot = card.querySelector('.dot');
    if (!dot) return;
    dot.classList.remove('touched', 'valid');
    if (state === 'touched') dot.classList.add('touched');
    else if (state === 'valid') dot.classList.add('valid');
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

  function addRow(kind) {
    const tbody = document.querySelector('#' + kind + '-table tbody');
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Hostname"><input type="text" data-col="host" class="input-base" placeholder="docker-host"></td>' +
      '<td data-label="Last octet"><input type="number" data-col="octet" class="input-base" min="2" max="254" placeholder="20"></td>' +
      '<td data-label="Ports"><input type="text" data-col="ports" class="input-base" placeholder="80 443"></td>' +
      '<td><button class="btn btn-icon" type="button" data-remove="1" aria-label="Remove row">×</button></td>';
    tbody.appendChild(tr);
    tr.querySelector('[data-remove]').addEventListener('click', () => tr.remove());
    return tr;
  }
  ui.addRow = addRow;
  ui.initDynamicRows = function () {
    addRow('portfwd');
    const ipv6Row = addRow('ipv6');
    ipv6Row.querySelector('[data-col="host"]').value  = 'docker-host';
    ipv6Row.querySelector('[data-col="octet"]').value = '20';
    ipv6Row.querySelector('[data-col="ports"]').value = '80 443';
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
    return serializeList(rows);
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
     ['wg', 'LAN_WG_VLAN_ID'], ['wan', 'WAN_VLAN_ID'], ['wanb', 'WAN_B_VLAN_ID']
    ].forEach(([key, id]) => {
      const el = ui.$('#' + id);
      const a = vlanByKey[key];
      if (el && a) el.placeholder = String(a.participates && a.vid != null ? a.vid : a.def);
    });

    ui.hasVlanConflict = detectVlanConflict(cfg);
    const warn = ui.$('#net-dup-warn');
    if (warn) warn.classList.toggle('hidden', !ui.hasVlanConflict);
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

  ui.WIFI_CHANNELS = {
    CHANNEL_2G: Array.from({ length: 13 }, (_, i) => i + 1),
    CHANNEL_5G: [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120,
                 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165],
    CHANNEL_6G: Array.from({ length: 59 }, (_, i) => 1 + i * 4),
  };

  ui.initChannelSelects = function () {
    Object.keys(ui.WIFI_CHANNELS).forEach(function (id) {
      const sel = ui.$('#' + id);
      if (!sel || sel.childElementCount > 1) return;   // missing, or already built
      const add = function (v, label) {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        sel.appendChild(o);
      };
      add('auto', 'Auto');
      ui.WIFI_CHANNELS[id].forEach(function (n) { add(String(n), String(n)); });
    });
  };

  ui.DOH_PROVIDERS = [
    { name: 'Cloudflare',          url: 'https://cloudflare-dns.com/dns-query' },
    { name: 'Cloudflare Security', url: 'https://security.cloudflare-dns.com/dns-query' },
    { name: 'Google',              url: 'https://dns.google/dns-query' },
    { name: 'Quad9',               url: 'https://dns.quad9.net/dns-query' },
    { name: 'AdGuard',             url: 'https://dns.adguard-dns.com/dns-query' },
    { name: 'AdGuard Family',      url: 'https://family.adguard-dns.com/dns-query' },
    { name: 'Mullvad',             url: 'https://dns.mullvad.net/dns-query' },
    { name: 'Mullvad Adblock',     url: 'https://adblock.dns.mullvad.net/dns-query' },
    { name: 'DNS4EU',              url: 'https://protective.joindns4.eu/dns-query' },
    { name: 'OpenDNS',             url: 'https://doh.opendns.com/dns-query' },
    { name: 'Wikimedia',           url: 'https://wikimedia-dns.org/dns-query' },
  ];

  // The Advanced DNS "Add DoH preset" <select> is a UI helper, not a config
  // field: picking a provider appends its URL to the DOH_UPSTREAMS textarea
  // (newline-separated, deduped). The textarea is written programmatically, so
  // we dispatch a bubbling 'input' event for each page's store to re-sync
  // (store-DOM sync hazard) and reset the select back to its placeholder.
  ui.initDohPreset = function () {
    const sel = ui.$('#doh-preset');
    const ta = ui.$('#DOH_UPSTREAMS');
    if (!sel || !ta) return;                       // page without the control
    if (sel.childElementCount <= 1) {              // only the placeholder: build options
      ui.DOH_PROVIDERS.forEach(function (p) {
        const opt = document.createElement('option');
        opt.value = p.url;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
    }
    sel.addEventListener('change', function () {
      const url = sel.value;
      sel.value = '';                              // reset to placeholder
      if (!url) return;
      const list = ta.value.split(/\s+/).filter(Boolean);
      if (list.includes(url)) return;              // already present
      list.push(url);
      ta.value = list.join('\n');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };


  ui.updateAth10kVisibility = function (hasCt) {
    ui.$$('.ath10k-ct-row').forEach(el => el.classList.toggle('hidden', !hasCt));
    if (!hasCt) {
      const cb = ui.$('#NON_CT_ATH10K');
      if (cb) cb.checked = false;
    }
  };

  // ----------------------------------- show/hide password toggle buttons
  // Toggles input type between password/text. Does NOT alter button content
  // (SVG icons stay intact). Updates aria-label for screen reader context.
  ui.initPasswordToggles = function () {
    [
      ['toggle-rootpw',       'ROOT_PASSWD'],
      ['toggle-pppoe-pw',     'PPPOE_PASSWD'],
      ['toggle-wg-privkey',   'WG_PRIVATE_KEY'],
      ['toggle-wg-psk',       'PRESHARED_KEY'],
      ['toggle-cfkey',        'CLOUDFLARE_API_KEY'],
      ['toggle-mesh-pw',      'MESH_PASSWD'],
      ['toggle-lan-wifi-pw',  'LAN_WIFI_PASSWD'],
      ['toggle-guest-wifi-pw','GUEST_WIFI_PASSWD'],
      ['toggle-iot-wifi-pw',  'IOT_WIFI_PASSWD'],
      ['toggle-wg-wifi-pw',   'LAN_WG_WIFI_PASSWD'],
    ].forEach(([btnId, inpId]) => {
      const b = document.getElementById(btnId);
      const i = document.getElementById(inpId);
      if (!b || !i) return;
      b.addEventListener('click', () => {
        const showing = i.type !== 'password';
        i.type = showing ? 'password' : 'text';
        b.setAttribute('aria-label', showing ? 'Show' : 'Hide');
      });
    });
  };

  // -- Script assembly (shared between /builder and /networks) ------------------

  // Sensitive fields: masked as '****' in the config preview and stripped from
  // saved build history (never persisted in plaintext). Canonical set lives in
  // types.mjs (SENSITIVE_KEYS, imported above); kept as ui.SENSITIVE_FIELDS for
  // existing callers.
  ui.SENSITIVE_FIELDS = SENSITIVE_KEYS;

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
  ui.assembleScript = function (cfg, wrtnovaBody, masked) {
    const block = masked ? ui.renderConfigBlockMasked(cfg) : renderConfigBlock(cfg);
    return '#!/bin/sh\n# SPDX-License-Identifier: MIT\n# Copyright (C) 2024 - 2026 Tieu Long (https://github.com/LongQT-sea/wrtnova)\n\n' +
      block + _SCRIPT_MARKER + wrtnovaBody;
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

