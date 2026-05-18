// Parse public/tzdata.lua into a searchable list + combobox.
(function () {
  'use strict';

  const ui = window.WrtNova = window.WrtNova || {};
  const $  = ui.$, $$ = ui.$$;

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
    const inp = $('#timezone'), list = $('#tz-list'), help = $('#tz-help');
    let active = -1;

    function close() { list.classList.add('hidden'); active = -1; }
    function render(items) {
      list.innerHTML = '';
      items.slice(0, 15).forEach((z, i) => {
        const d = document.createElement('div');
        d.textContent = z.zoneName + '  →  ' + z.tzString;
        if (i === active) d.classList.add('active');
        d.addEventListener('mousedown', e => { e.preventDefault(); pick(z); });
        list.appendChild(d);
      });
      list.classList.toggle('hidden', !items.length);
    }
    function search(q) {
      if (!q) return state.zones.slice(0, 15);
      const qs = q.toLowerCase().split(/\s+/).filter(Boolean);
      return state.zones.filter(z => {
        const lc = z.zoneName.toLowerCase();
        return qs.every(w => lc.includes(w));
      });
    }
    function pick(z) {
      state.zoneName = z.zoneName;
      state.tzString = z.tzString;
      inp.value = z.zoneName;
      help.textContent = 'ZONE_NAME="' + z.zoneName + '"  TIME_ZONE="' + z.tzString + '"';
      close();
      ui.setDot('system', 'touched');
    }

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

  ui.collectTimezone = function () {
    return { ZONE_NAME: state.zoneName, TIME_ZONE: state.tzString };
  };
})();
