// DOM helpers: collapsibles, status bar, dynamic table rows, status dots, AP-mode gating.
(function () {
  'use strict';

  const ui = window.WrtNova = window.WrtNova || {};

  // ---------------------------------------------------------------- shorthand
  ui.$  = (sel, root) => (root || document).querySelector(sel);
  ui.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ---------------------------------------------------- collapsible card cards
  ui.initCollapsibles = function () {
    ui.$$('.card-header').forEach(h => {
      h.addEventListener('click', e => {
        // ignore clicks on form controls inside header
        if (e.target.closest('input, button, select, textarea, a')) return;
        h.parentElement.classList.toggle('collapsed');
        const chev = h.querySelector('.chev');
        if (chev) chev.textContent = h.parentElement.classList.contains('collapsed') ? '▸' : '▾';
      });
    });
  };

  // -------------------------------------------------------- section status dots
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

  // touch a section whenever any of its inputs changes
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

  // --------------------------------------------------------- status / progress
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

  // ----------------------------------------------------- dynamic table rows
  function addRow(kind) {
    const tbody = document.querySelector('#' + kind + '-table tbody');
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="text" data-col="host" placeholder="docker-host"></td>' +
      '<td><input type="number" data-col="octet" min="2" max="254" placeholder="20"></td>' +
      '<td><input type="text" data-col="ports" placeholder="80 443"></td>' +
      '<td><button class="btn btn-icon" type="button" data-remove="1">×</button></td>';
    tbody.appendChild(tr);
    tr.querySelector('[data-remove]').addEventListener('click', () => tr.remove());
    return tr;
  }
  ui.addRow = addRow;
  ui.initDynamicRows = function () {
    addRow('portfwd'); addRow('portfwd');
    addRow('ipv6');    addRow('ipv6');
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('[data-add]');
      if (btn) addRow(btn.dataset.add);
    });
  };

  // serialize a dynamic table into the wrtnova.sh multi-line list format
  ui.serializeRows = function (kind) {
    const rows = ui.$$('#' + kind + '-table tbody tr');
    const lines = [];
    rows.forEach(tr => {
      const host  = tr.querySelector('[data-col="host"]').value.trim();
      const octet = tr.querySelector('[data-col="octet"]').value.trim();
      const ports = tr.querySelector('[data-col="ports"]').value.trim();
      if (!host && !octet) return;
      lines.push('\t' + host + ' | ' + octet + ' | ' + ports);
    });
    return lines.length ? '\n' + lines.join('\n') + '\n' : '';
  };

  // ---------------------------------------------- conditional visibility wires
  ui.initConditionalVisibility = function () {
    function refresh() {
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

      const wg = ui.$('#WG_ENABLE').checked && !ap;
      ui.$$('.wifi-wg').forEach(el => el.classList.toggle('hidden', !wg));
      ui.$$('.wg-only').forEach(el => el.classList.toggle('hidden', !wg));

      const ddns = ui.$('#DDNS_ENABLE').checked;
      ui.$$('.ddns-only').forEach(el => el.classList.toggle('hidden', !ddns));

      const hasKeys = ui.$('#SSH_PUBLIC_KEY').value.trim().length > 0;
      ui.$$('.ssh-pw-row').forEach(el => el.classList.toggle('hidden', !hasKeys));

      const wgMode = (ui.$('input[name="wg_mode"]:checked') || {}).value;
      ui.$$('.wg-disabled-note').forEach(el => el.classList.toggle('hidden', wgMode !== 'disabled'));
      ui.$$('.wg-warp-note').forEach(el => el.classList.toggle('hidden', wgMode !== 'warp'));
    }
    document.body.addEventListener('change', refresh);
    document.body.addEventListener('input', refresh);
    refresh();
  };

  // ----------------------------------- show/hide password toggle buttons
  ui.initPasswordToggles = function () {
    [['toggle-rootpw', 'ROOT_PASSWD'], ['toggle-cfkey', 'CLOUDFLARE_API_KEY']].forEach(([btn, inp]) => {
      const b = document.getElementById(btn), i = document.getElementById(inp);
      if (!b || !i) return;
      b.addEventListener('click', () => {
        i.type = i.type === 'password' ? 'text' : 'password';
        b.textContent = i.type === 'password' ? 'show' : 'hide';
      });
    });
  };
})();
