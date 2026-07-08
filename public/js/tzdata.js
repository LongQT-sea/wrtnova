// Timezone combobox + tzdata.lua parsing. Dual-mode ES module: publishes its
// helpers onto the shared namespace for /networks while /builder imports it.
// Imports ui.js for its side effects so ui.$/ui.$$ exist at module-eval time.
import { ui } from './ui-ns.mjs';
import './ui.js';

  const $  = ui.$, $$ = ui.$$;

  // Shared type-to-search combobox, reused by the timezone and banIP feed/country
  // pickers. opts: { inputSel, listSel, getItems, format, match, onPick, limit? };
  // limit caps the visible list (default 15).
  ui.makeCombo = function (opts) {
    const inp = $(opts.inputSel), list = $(opts.listSel);
    if (!inp || !list) return;
    const limit = opts.limit || 15;
    let active = -1;
    const close = () => { list.classList.add('hidden'); active = -1; };
    const search = q => {
      const items = opts.getItems();
      if (!q) return items.slice(0, limit);
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      return items.filter(it => opts.match(it, words));
    };
    const pick = it => { opts.onPick(it); close(); };
    const render = items => {
      list.innerHTML = '';
      items.slice(0, limit).forEach((it, i) => {
        const d = document.createElement('div');
        d.textContent = opts.format(it);
        if (i === active) d.classList.add('active');
        d.addEventListener('mousedown', e => { e.preventDefault(); pick(it); });
        list.appendChild(d);
      });
      list.classList.toggle('hidden', !items.length);
    };
    inp.addEventListener('input', () => { active = -1; render(search(inp.value)); });
    inp.addEventListener('focus', () => render(search(inp.value)));
    inp.addEventListener('blur',  () => setTimeout(close, 120));
    inp.addEventListener('keydown', e => {
      const items = $$('div', list);
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); render(search(inp.value)); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(search(inp.value)); e.preventDefault(); }
      else if (e.key === 'Enter' && active >= 0) { pick(search(inp.value)[active]); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); }
    });
  };

  const state = ui.tzState = {
    zones: [],        // [{ zoneName, tzString }]
    zoneName: '',
    tzString: '',
  };

  ui.loadTzdata = async function () {
    const res = await fetch('/tzdata.lua', { cache: 'force-cache' });
    if (!res.ok) throw new Error('tzdata.lua fetch failed');
    const text = await res.text();
    const re = /\{\s*'([^']+)'\s*,\s*'([^']+)'\s*\}/g;
    let m;
    while ((m = re.exec(text))) {
      state.zones.push({ zoneName: m[1], tzString: m[2] });
    }
    state.zones.sort((a, b) => a.zoneName.localeCompare(b.zoneName));
  };

  ui.initTzCombo = function () {
    const inp = $('#timezone'), help = $('#tz-help');
    ui.makeCombo({
      inputSel: '#timezone',
      listSel:  '#tz-list',
      getItems: () => state.zones,
      format:   z => z.zoneName + '  →  ' + z.tzString,
      match:    (z, words) => { const lc = z.zoneName.toLowerCase(); return words.every(w => lc.includes(w)); },
      onPick:   z => {
        state.zoneName = z.zoneName;
        state.tzString = z.tzString;
        inp.value = z.zoneName;
        help.textContent = 'ZONE_NAME="' + z.zoneName + '"  TIME_ZONE="' + z.tzString + '"';
        ui.setDot('system', 'touched');
      },
    });
  };

  ui.collectTimezone = function () {
    return { ZONE_NAME: state.zoneName, TIME_ZONE: state.tzString };
  };

  // Set timezone by zone name without opening the dropdown (used by history restore).
  ui.setTimezone = function (zoneName) {
    const zone = state.zones.find(z => z.zoneName === zoneName);
    if (!zone) return false;
    const inp  = $('#timezone');
    const help = $('#tz-help');
    state.zoneName = zone.zoneName;
    state.tzString = zone.tzString;
    if (inp)  inp.value = zone.zoneName;
    if (help) help.textContent = 'ZONE_NAME="' + zone.zoneName + '"  TIME_ZONE="' + zone.tzString + '"';
    return true;
  };
