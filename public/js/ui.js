// DOM helpers: status bar, dynamic table rows, status dots, conditional visibility.
// Native <details>/<summary> handles collapsible open/close — no custom logic needed.
(function () {
  'use strict';

  const ui = window.WrtNova = window.WrtNova || {};

  // ---------------------------------------------------------------- shorthand
  ui.$  = (sel, root) => (root || document).querySelector(sel);
  ui.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

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
    addRow('ipv6');
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

      const hasKeys = ui.$('#SSH_PUBLIC_KEY').value.trim().length > 0;
      ui.$$('.ssh-pw-row').forEach(el => el.classList.toggle('hidden', !hasKeys));

      const mesh = ui.$('#WIRELESS_MESH') && ui.$('#WIRELESS_MESH').checked;
      ui.$$('.mesh-only').forEach(el => el.classList.toggle('hidden', !mesh));

      const modem = ui.$('#CELLULAR_MODEM') && ui.$('#CELLULAR_MODEM').checked;
      ui.$$('.modem-only').forEach(el => el.classList.toggle('hidden', !modem));
    }
    document.body.addEventListener('change', refresh);
    document.body.addEventListener('input', refresh);
    refresh();
  };

  // ----------------------------------- show/hide password toggle buttons
  // Toggles input type between password/text. Does NOT alter button content
  // (SVG icons stay intact). Updates aria-label for screen reader context.
  ui.initPasswordToggles = function () {
    [
      ['toggle-rootpw',     'ROOT_PASSWD'],
      ['toggle-wg-privkey', 'WG_PRIVATE_KEY'],
      ['toggle-wg-psk',     'PRESHARED_KEY'],
      ['toggle-cfkey',      'CLOUDFLARE_API_KEY'],
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
})();
