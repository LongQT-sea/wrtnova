// Card toggle animation for .card-anim elements; <details> used only for card-history.
(function () {
  'use strict';

  const ui = window.WrtNova = window.WrtNova || {};

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
      ui.$$('input, select, textarea', card).forEach(inp => {
        inp.addEventListener('input', onAny);
        inp.addEventListener('change', onAny);
      });
    });
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
  // The grammar lives in list-grammar.mjs (ui.serializeList); this reads the
  // DOM rows and hands them to the shared serializer.
  ui.serializeRows = function (kind) {
    const rows = ui.$$('#' + kind + '-table tbody tr').map(tr => ({
      host:  tr.querySelector('[data-col="host"]').value,
      octet: tr.querySelector('[data-col="octet"]').value,
      ports: tr.querySelector('[data-col="ports"]').value,
    }));
    return ui.serializeList(rows);
  };

  ui.syncNetworkRows = function () {
    const basePfx  = (ui.$('#BASE_NET_PREFIX') || {}).value || '';
    const defSub   = (ui.$('#DEFAULT_SUBNET')  || {}).value || '/24';
    const rows     = ui.$$('.net-table tbody tr');
    const seen     = {};
    let   hasDup   = false;

    const trunkVids = {};
    ((ui.$('#ADDITIONAL_VLAN_LIST') || {}).value || '').trim().split(/\s+/).forEach(function (tok) {
      const rng = tok.match(/^(\d+)-(\d+)$/);
      if (rng) { for (let v = +rng[1]; v <= +rng[2]; v++) trunkVids[v] = true; }
      else if (/^\d+$/.test(tok)) trunkVids[+tok] = true;
    });

    const ap = (ui.$('input[name="AP_MODE"]:checked') || {}).value === '1';

    // In router mode, WAN and WAN_B VLANs are always part of resolve_vlans pool.
    if (!ap) {
      const wanVid = +(ui.$('#WAN_VLAN_ID') || {}).value || 20;
      if (trunkVids[wanVid]) hasDup = true;
      seen[wanVid] = true;
      const wanBEl = ui.$('#WAN_B_ENABLE');
      if (wanBEl && wanBEl.checked) {
        const wanBVid = +(ui.$('#WAN_B_VLAN_ID') || {}).value || 21;
        if (seen[wanBVid] || trunkVids[wanBVid]) hasDup = true;
        seen[wanBVid] = true;
      }
    }

    rows.forEach(function (row) {
      const isLan = row.dataset.net === 'lan';
      const tog   = ui.$('.toggle-input', row);
      const on    = isLan || (tog && tog.checked);
      const pfxEl = row.querySelector('[id$="_BASE_PREFIX"]');
      const vidEl = row.querySelector('[id$="_VLAN_ID"]');
      const subEl = row.querySelector('select.input-base');
      const ipEl  = ui.$('.net-derived', row);
      const defEl = row.querySelector('.net-sub-def');

      if (pfxEl) pfxEl.placeholder = basePfx || '192.168';
      if (defEl) defEl.textContent  = ui.t ? ui.t('defaultSubnetDynamic', { sub: defSub || '/24' }) : 'Default (' + (defSub || '/24') + ')';

      const effPfx  = (pfxEl && pfxEl.value.trim()) || basePfx || '192.168';
      const effVid  = (vidEl && vidEl.value.trim()) || row.dataset.defVid;
      const effSub  = (subEl && subEl.value)        || defSub || '/24';
      // In AP mode: LAN gets the AP index as last octet; Guest/IoT/WG get proto=none (no IP)
      const hasIp   = on && effVid && (!ap || isLan);
      const lastOct = (ap && isLan) ? ((ui.$('#AP_INDEX') || {}).value || '2') : '1';

      if (ipEl) {
        ipEl.innerHTML = hasIp
          ? effPfx + '.' + effVid + '.' + lastOct + '<span class="net-derived-sfx">' + effSub + '</span>'
          : '<span class="net-derived-sfx">—</span>';
      }

      if (on && effVid) {
        const vid = +effVid;
        if (seen[vid] || trunkVids[vid]) hasDup = true;
        seen[vid] = true;
      }
    });

    ui.hasVlanConflict = hasDup;
    const warn = ui.$('#net-dup-warn');
    if (warn) warn.classList.toggle('hidden', !hasDup);
  };

  ui.initConditionalVisibility = function () {
    function refresh(e) {
      const ap = ui.$('input[name="AP_MODE"]:checked').value === '1';
      ui.$$('.router-only').forEach(el => el.classList.toggle('hidden', ap));
      ui.$$('.ap-only').forEach(el => el.classList.toggle('hidden', !ap));

      const wanType = (ui.$('input[name="wan_type"]:checked') || {}).value;
      ui.$$('.pppoe-only').forEach(el => el.classList.toggle('hidden', wanType !== 'pppoe'));

      const iot = ui.$('#IOT_ENABLE').checked;
      ui.$$('.iot-only').forEach(el => el.classList.toggle('hidden', !iot));
      ui.$$('.wifi-iot').forEach(el => el.classList.toggle('hidden', !iot));

      const guest = ui.$('#GUEST_ENABLE').checked;
      ui.$$('.wifi-guest').forEach(el => el.classList.toggle('hidden', !guest));

      const wgEnabled = ui.$('#WG_ENABLE').checked;
      ui.$$('.iot-wg-only').forEach(el => el.classList.toggle('hidden', !(iot && wgEnabled)));
      // WiFi WG SSID row: visible whenever WG_ENABLE is on, regardless of mode.
      // (AP mode still needs the SSID - it trunks WG-tagged traffic to the router.)
      ui.$$('.wifi-wg').forEach(el => el.classList.toggle('hidden', !wgEnabled));
      // WireGuard client card: router-only - AP trunks back, no client config needed.
      const wgRouter = wgEnabled && !ap;
      const wgCard = ui.$('#card-wg');
      ui.$$('.wg-only').forEach(el => el.classList.toggle('hidden', !wgRouter));
      if (wgRouter && e?.target?.id === 'WG_ENABLE') {
        if (wgCard.tagName === 'DETAILS') wgCard.open = true;
        else wgCard.classList.add('open');
      }
      // Help text: swap between router and AP explanation when WG_ENABLE is on.
      ui.$$('.wg-help-router').forEach(el => el.classList.toggle('hidden', ap));

      const hasKeys = ui.$('#SSH_PUBLIC_KEY').value.trim().length > 0;
      ui.$$('.ssh-pw-row').forEach(el => el.classList.toggle('hidden', !hasKeys));

      const mesh = ui.$('#WIRELESS_MESH') && ui.$('#WIRELESS_MESH').checked;
      ui.$$('.mesh-only').forEach(el => el.classList.toggle('hidden', !mesh));

const wanTagged = ui.$('#WAN_IS_TAGGED') && ui.$('#WAN_IS_TAGGED').checked;
      ui.$$('.wan-tagged-only').forEach(el => el.classList.toggle('hidden', !wanTagged));

      const wanB = ui.$('#WAN_B_ENABLE') && ui.$('#WAN_B_ENABLE').checked;
      ui.$$('.wan-b-only').forEach(el => el.classList.toggle('hidden', !wanB));

      // Per-row net-off grey-out
      ui.$$('.net-table tbody tr').forEach(function (row) {
        if (row.dataset.net === 'lan') return;
        const tog = ui.$('.toggle-input', row);
        if (tog) row.classList.toggle('net-off', !tog.checked);
      });
      ui.syncNetworkRows();
    }
    document.body.addEventListener('change', refresh);
    document.body.addEventListener('input', refresh);
    refresh();
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

  // Fields the browser strips before sending config to /api/build.
  // The Worker only needs feature flags for package resolution - never passwords.
  // Canonical set lives in types.mjs (ui.SENSITIVE_KEYS), assigned by shared-boot
  // before this script runs; kept as ui.SENSITIVE_FIELDS for existing callers.
  ui.SENSITIVE_FIELDS = ui.SENSITIVE_KEYS;

  ui.stripSensitive = function (cfg) {
    return Object.fromEntries(Object.entries(cfg).filter(([k]) => !ui.SENSITIVE_FIELDS.has(k)));
  };

  const _SCRIPT_MARKER = '# ===================\n# End config section\n# ===================\n';
  let _wrtnovaBodyCache = null;
  let _wrtnovaBodyPromise = null;  // deduplicate concurrent first fetches

  // ui.renderConfigBlock, ui.shQuote, ui.BUILD_ONLY_KEYS are assigned by the
  // shared-boot.mjs shim (render-config.mjs) before this script runs. The masked
  // preview reuses the shared renderer, passing SENSITIVE_FIELDS so secrets show
  // as KEY='****'.
  ui.renderConfigBlockMasked = function (cfg) {
    return ui.renderConfigBlock(cfg, ui.SENSITIVE_FIELDS);
  };

  ui.fetchWrtnovaBody = function () {
    if (_wrtnovaBodyCache !== null) return Promise.resolve(_wrtnovaBodyCache);
    if (!_wrtnovaBodyPromise) {
      _wrtnovaBodyPromise = fetch('/wrtnova.sh', { cache: 'force-cache' })
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
    const block = masked ? ui.renderConfigBlockMasked(cfg) : ui.renderConfigBlock(cfg);
    return '#!/bin/sh\n# WrtNova — generated by the WrtNova frontend\n' +
      block + _SCRIPT_MARKER + wrtnovaBody;
  };

  // The exact, ordered package set sent to ASU (the shared resolvePackages, so it
  // is byte-identical to what the worker returns). Includes '-' removal tokens.
  ui.computeFinalPackages = function (target, cfg, extra) {
    const t = target || {};
    return ui.resolvePackages({
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

})();
