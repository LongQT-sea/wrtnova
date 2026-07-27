// Firewall banIP pickers: country + threat-feed multi-select. Data
// (countries.txt, banip-feeds.txt) is fetched at runtime, kept out of the JS
// budget. Each picker keeps removable chips inside its control next to a
// filter input, and opens its option list in place below - the list pushes the
// card down rather than overlaying it. Selection is backed by a hidden input
// (#BANIP_COUNTRY_LIST / #BANIP_FEEDS). The options are real checkboxes so a
// value can be cleared from either the chip or the row; ui.makeCombo (the
// single-select type-ahead behind the timezone field) is deliberately not
// reused here.
import { ui } from './ui-ns.mjs';
import './ui.js';

  const $ = ui.$;
  const state = ui.banipState = { countries: [], feeds: [] };

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function multiPicker(o) {
    const root = $(o.rootSel), hidden = $(o.hiddenSel);
    if (!root || !hidden) return null;
    const ctrl = root.querySelector('.picker-control');
    const search = root.querySelector('.picker-search');
    const list = root.querySelector('.picker-list');
    const toggle = root.querySelector('.picker-toggle');

    const values = () => hidden.value.split(/\s+/).filter(Boolean);
    const isOpen = () => root.classList.contains('open');

    function commit(vals) {
      hidden.value = [...new Set(vals)].join(' ');
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
      renderChips();
    }
    const add = v => commit([...values(), v]);
    const drop = v => commit(values().filter(y => y !== v));

    function renderChips() {
      root.querySelectorAll('.picker-chip').forEach(n => n.remove());
      const before = search;
      values().forEach(v => {
        const item = o.getItems().find(it => o.valueOf(it) === v);
        const name = item ? o.labelOf(item) : v;
        const chip = el('span', 'picker-chip');
        if (item) chip.title = o.titleOf(item);
        chip.appendChild(el('span', '', name));
        const x = el('button', 'picker-chip-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Remove ' + name);
        x.addEventListener('click', e => { e.stopPropagation(); drop(v); syncList(); });
        chip.appendChild(x);
        ctrl.insertBefore(chip, before);
      });
      // `country` (from Country blocking) and `doh` (from Block DoH) are added
      // to the emitted feeds outside this picker - country at emit time
      // (assembleBanipFeeds), doh by wrtnova.sh from BLOCK_DOH - so surface
      // them here as read-only chips for visibility.
      (o.autoChips ? o.autoChips() : []).forEach(a => {
        const chip = el('span', 'picker-chip', a.label);
        chip.dataset.auto = '1';
        chip.title = a.title;
        ctrl.insertBefore(chip, before);
      });
    }

    function renderList() {
      const q = search.value.trim().toLowerCase();
      const words = q ? q.split(/\s+/) : [];
      const items = words.length ? o.getItems().filter(it => o.match(it, words)) : o.getItems();
      list.textContent = '';
      if (!items.length) {
        list.appendChild(el('div', 'picker-empty', o.emptyText || 'No matches'));
        return;
      }
      const chosen = new Set(values());
      const frag = document.createDocumentFragment();
      items.forEach(it => {
        const v = o.valueOf(it);
        const row = el('label', 'picker-opt');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = chosen.has(v);
        box.addEventListener('change', () => { box.checked ? add(v) : drop(v); });
        row.appendChild(box);
        row.appendChild(el('span', '', o.format(it)));
        frag.appendChild(row);
      });
      list.appendChild(frag);
    }

    // Keep the rows in step with the chips without rebuilding 250 of them.
    function syncList() {
      if (!isOpen()) return;
      const chosen = new Set(values());
      const rows = list.querySelectorAll('.picker-opt');
      const items = search.value.trim()
        ? null            // filtered: indexes no longer line up, so rebuild
        : o.getItems();
      if (!items || items.length !== rows.length) { renderList(); return; }
      rows.forEach((row, i) => {
        row.firstChild.checked = chosen.has(o.valueOf(items[i]));
      });
    }

    function open() {
      if (isOpen()) return;
      root.classList.add('open');
      list.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      renderList();
    }
    function close() {
      root.classList.remove('open');
      list.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    }

    ctrl.addEventListener('click', e => {
      if (e.target.closest('.picker-chip-x')) return;
      search.focus();
      open();
    });
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      isOpen() ? close() : (search.focus(), open());
    });
    search.addEventListener('input', () => { open(); renderList(); });
    search.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); search.blur(); }
      // Backspace on an empty filter drops the last chip, as chip inputs do
      else if (e.key === 'Backspace' && !search.value) {
        const v = values().pop();
        if (v) { drop(v); syncList(); }
      }
    });
    document.addEventListener('click', e => { if (!root.contains(e.target)) close(); });

    renderChips();
    return { render: () => { renderChips(); syncList(); } };
  }

  let countrySel = null, feedSel = null;

  ui.initBanipChips = function () {
    countrySel = multiPicker({
      rootSel: '#banip-country-picker', hiddenSel: '#BANIP_COUNTRY_LIST',
      getItems: () => state.countries,
      valueOf: c => c.code, labelOf: c => c.name + ' (' + c.code + ')', titleOf: c => c.code,
      format: c => c.name + ' (' + c.code + ')',
      match: (c, words) => { const hay = (c.code + ' ' + c.name).toLowerCase(); return words.every(w => hay.includes(w)); },
    });
    feedSel = multiPicker({
      rootSel: '#banip-feed-picker', hiddenSel: '#BANIP_FEEDS',
      getItems: () => state.feeds,
      valueOf: f => f.name, labelOf: f => f.name, titleOf: f => f.descr,
      format: f => f.name + ' (' + f.chain + ')  -  ' + f.descr,
      match: (f, words) => { const hay = (f.name + ' ' + f.descr).toLowerCase(); return words.every(w => hay.includes(w)); },
      autoChips: () => {
        const out = [];
        if ((($('#BANIP_COUNTRY_LIST') || {}).value || '').trim())
          out.push({ label: 'country', title: 'Auto-added from Country blocking' });
        if (($('#BLOCK_DOH') || {}).checked)
          out.push({ label: 'doh', title: 'Auto-added from Block DoH' });
        return out;
      },
    });
    const rerenderFeeds = () => { if (feedSel) feedSel.render(); };
    const countryHidden = $('#BANIP_COUNTRY_LIST');
    if (countryHidden) countryHidden.addEventListener('input', rerenderFeeds);
    const blockDoh = $('#BLOCK_DOH');
    if (blockDoh) blockDoh.addEventListener('change', rerenderFeeds);
  };

  ui.refreshBanipChips = function () {
    if (countrySel) countrySel.render();
    if (feedSel) feedSel.render();
  };

  ui.loadBanipData = async function () {
    const [c, f] = await Promise.all([
      fetch('/countries.txt', { cache: 'force-cache' }).then(r => r.ok ? r.text() : ''),
      fetch('/banip-feeds.txt', { cache: 'force-cache' }).then(r => r.ok ? r.text() : ''),
    ]);
    state.countries = c.split('\n').map(l => {
      const [code, name] = l.split('\t');
      return code && name ? { code: code.trim(), name: name.trim() } : null;
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    state.feeds = f.split('\n').map(l => {
      const [name, chain, descr] = l.split('\t');
      return name && chain ? { name: name.trim(), chain: chain.trim(), descr: (descr || '').trim() } : null;
    }).filter(Boolean);
    ui.refreshBanipChips();
    fillCountryOptions();
  };

  // The wireless COUNTRY_CODE field (Wireless card) suggests the same list this
  // module already fetched, so it rides along here instead of paying for its own
  // copy: 242 inline <option> tags would be ~8 KB of HTML on the critical path,
  // and the file is a lazy import that the byte budget does not count. The field
  // holds the 2-letter code (uppercased at the store boundary) with the country
  // name as the option label - a plain text input if this never runs.
  function fillCountryOptions() {
    const dl = $('#country-options');
    if (!dl || dl.childElementCount) return;
    const frag = document.createDocumentFragment();
    for (const c of state.countries) {
      const o = document.createElement('option');
      o.value = c.code.toUpperCase();
      o.label = c.name;
      frag.appendChild(o);
    }
    dl.appendChild(frag);
  }
