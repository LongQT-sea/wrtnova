// Firewall banIP pickers: country + threat-feed pick-only chip selectors. Data
// (countries.txt, banip-feeds.txt) is fetched at runtime, kept out of the JS
// budget. Each selector is a search combo (ui.makeCombo) that adds removable
// chips backed by a hidden input (#BANIP_COUNTRY_LIST / #BANIP_FEEDS).
import { ui } from './ui-ns.mjs';
import './ui.js';
import './tzdata.js';   // provides ui.makeCombo

  const $ = ui.$;
  const state = ui.banipState = { countries: [], feeds: [] };

  const CHIP = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
  const CHIP_X = 'font-bold text-zinc-400 hover:text-red-600 dark:hover:text-red-400';

  function chipSelect(o) {
    const chips = $(o.chipsSel), hidden = $(o.hiddenSel), search = $(o.searchSel);
    if (!chips || !hidden || !search) return null;
    const values = () => hidden.value.split(/\s+/).filter(Boolean);
    function commit(vals) {
      hidden.value = [...new Set(vals)].join(' ');
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
      render();
    }
    function render() {
      chips.textContent = '';
      values().forEach(v => {
        const item = o.getItems().find(it => o.valueOf(it) === v);
        const span = document.createElement('span');
        span.className = CHIP;
        if (item) span.title = o.titleOf(item);
        const label = document.createElement('span');
        label.textContent = item ? o.labelOf(item) : v;
        span.appendChild(label);
        const x = document.createElement('button');
        x.type = 'button';
        x.textContent = 'x';
        x.className = CHIP_X;
        x.setAttribute('aria-label', 'Remove ' + (item ? o.labelOf(item) : v));
        x.addEventListener('click', () => commit(values().filter(y => y !== v)));
        span.appendChild(x);
        chips.appendChild(span);
      });
      (o.autoChips ? o.autoChips() : []).forEach(a => {
        const span = document.createElement('span');
        span.className = CHIP;
        span.style.opacity = '0.6';
        span.title = a.title;
        span.textContent = a.label;
        chips.appendChild(span);
      });
    }
    ui.makeCombo({
      inputSel: o.searchSel,
      listSel:  o.listSel,
      limit:    o.limit,
      getItems: () => o.getItems().filter(it => !values().includes(o.valueOf(it))),
      format:   o.format,
      match:    o.match,
      onPick:   it => { commit([...values(), o.valueOf(it)]); search.value = ''; },
    });
    render();
    return { render };
  }

  let countrySel = null, feedSel = null;

  ui.initBanipChips = function () {
    countrySel = chipSelect({
      searchSel: '#banip-country-search', listSel: '#banip-country-list',
      chipsSel: '#banip-country-chips', hiddenSel: '#BANIP_COUNTRY_LIST',
      limit: 999,
      getItems: () => state.countries,
      valueOf: c => c.code, labelOf: c => c.name, titleOf: c => c.code,
      format: c => c.code + '  -  ' + c.name,
      match: (c, words) => { const hay = (c.code + ' ' + c.name).toLowerCase(); return words.every(w => hay.includes(w)); },
    });
    feedSel = chipSelect({
      searchSel: '#banip-feed-search', listSel: '#banip-feed-list',
      chipsSel: '#banip-feed-chips', hiddenSel: '#BANIP_FEEDS',
      limit: 999,
      getItems: () => state.feeds,
      valueOf: f => f.name, labelOf: f => f.name, titleOf: f => f.descr,
      format: f => f.name + ' (' + f.chain + ')  -  ' + f.descr,
      match: (f, words) => { const hay = (f.name + ' ' + f.descr).toLowerCase(); return words.every(w => hay.includes(w)); },
      // `country` (from Country blocking) and `doh` (from Block DoH) are added to
      // the emitted feeds outside this picker - country at emit time
      // (assembleBanipFeeds), doh by wrtnova.sh from BLOCK_DOH - so surface them
      // here as read-only chips for visibility.
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
  };
