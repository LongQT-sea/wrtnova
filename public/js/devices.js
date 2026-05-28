// Versions / overview / profiles fetch + searchable device combobox.
// On mobile (<768px) the combobox opens as a full-screen native <dialog>.
(function () {
  'use strict';

  const ui  = window.WrtNova = window.WrtNova || {};
  const $   = ui.$, $$ = ui.$$;
  const DL  = 'https://downloads.openwrt.org';

  // PLAN: only latest patch of each major.minor branch — plus SNAPSHOT.
  const SUPPORTED_BRANCHES = ['23.05', '24.10', '25.12'];

  const state = ui.devicesState = {
    version: '',
    overview: null,                 // raw .overview.json
    devicesByTitle: null,           // { title: profile }
    selectedTitle: '',
    selectedProfile: null,          // overview entry
    profileDetails: null,           // result of profiles.json fetch
  };

  // -------------------------------------- helpers
  function pickLatestPatch(versions, branch) {
    const ofBranch = versions.filter(v => v.startsWith(branch + '.'));
    if (!ofBranch.length) return null;
    // semver-ish sort: numeric per component, descending.
    ofBranch.sort((a, b) => {
      const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pb[i] || 0) - (pa[i] || 0);
        if (d) return d;
      }
      return 0;
    });
    return ofBranch[0];
  }

  function versionToUrl(v) {
    return v === 'SNAPSHOT' ? DL + '/snapshots' : DL + '/releases/' + v;
  }

  function titleFor(profile) {
    const t = (profile.titles && profile.titles[0]) || {};
    if (t.title) return t.title.trim();
    return [t.vendor, t.model, t.variant].filter(Boolean).join(' ').trim();
  }

  // -------------------------------------- version list
  ui.loadVersions = async function () {
    const res = await fetch(DL + '/.versions.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('versions fetch failed: ' + res.status);
    const data = await res.json();

    const picks = SUPPORTED_BRANCHES
      .map(b => pickLatestPatch(data.versions_list || [], b))
      .filter(Boolean);
    picks.push('SNAPSHOT');

    const sel = $('#version');
    sel.innerHTML = '';
    picks.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });

    // Pre-select stable if it matches one of our picks
    if (data.stable_version && picks.includes(data.stable_version)) {
      sel.value = data.stable_version;
    } else {
      sel.value = picks[0];
    }
    state.version = sel.value;

    sel.addEventListener('change', () => {
      state.version = sel.value;
      ui.loadOverview().catch(err => ui.status('Failed to load device list: ' + err.message, 'error'));
    });

    await ui.loadOverview();
  };

  // -------------------------------------- overview (device list)
  ui.loadOverview = async function () {
    const v = state.version;
    $('#device').disabled = true;
    $('#device').value = '';
    $('#device-info').textContent = 'Loading devices…';

    const res = await fetch(versionToUrl(v) + '/.overview.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('overview fetch failed: ' + res.status);
    const data = await res.json();
    state.overview = data;

    // build title map, disambiguate dup titles via (target)
    const titles = {};
    const dups = new Set();
    (data.profiles || []).forEach(p => {
      const t = titleFor(p);
      if (titles[t]) { dups.add(t); }
      titles[t] = p;
    });

    state.devicesByTitle = {};
    (data.profiles || []).forEach(p => {
      const t = titleFor(p);
      const key = dups.has(t) ? t + ' (' + p.target + ')' : t;
      state.devicesByTitle[key] = p;
    });

    $('#device').disabled = false;
    $('#device-info').textContent = (data.profiles || []).length + ' devices available';
    state.selectedTitle = ''; state.selectedProfile = null; state.profileDetails = null;
    ui.notifyTargetChanged && ui.notifyTargetChanged();
  };

  // -------------------------------------- device combobox
  ui.initDeviceCombo = function () {
    const inp = $('#device'), list = $('#device-list');
    let active = -1;

    // ---------- shared helpers
    function search(q) {
      if (!state.devicesByTitle) return [];
      const qs = q.toLowerCase().split(/\s+/).filter(Boolean);
      return Object.keys(state.devicesByTitle).filter(t => {
        const lc = t.toLowerCase();
        return qs.every(w => lc.includes(w));
      }).sort();
    }

    async function pick(title) {
      // Suppress the inp focus handler while we programmatically set the value.
      // When <dialog>.close() returns focus to inp, the focus event re-fires and
      // would immediately reopen the dialog with an empty list — this flag stops that.
      suppressMobileFocus = true;
      inp.value = title;
      close();
      state.selectedTitle = title;
      state.selectedProfile = state.devicesByTitle[title];
      await loadProfileDetails();
      ui.notifyTargetChanged && ui.notifyTargetChanged();
      // Release after a tick — any focus events triggered by the pick are now done.
      setTimeout(() => { suppressMobileFocus = false; }, 200);
    }

    // ---------- desktop dropdown
    function close() { list.classList.add('hidden'); active = -1; }
    function render(items) {
      list.innerHTML = '';
      items.slice(0, 15).forEach((title, i) => {
        const d = document.createElement('div');
        d.textContent = title;
        if (i === active) d.classList.add('active');
        d.setAttribute('role', 'option');
        d.addEventListener('mousedown', e => { e.preventDefault(); pick(title); });
        list.appendChild(d);
      });
      list.classList.toggle('hidden', !items.length);
    }

    inp.addEventListener('input', () => { active = -1; render(search(inp.value)); });
    inp.addEventListener('blur',  () => setTimeout(close, 120));
    inp.addEventListener('keydown', e => {
      const items = $$('div', list);
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); render(search(inp.value)); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(search(inp.value)); e.preventDefault(); }
      else if (e.key === 'Enter' && active >= 0) { pick(items[active].textContent); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); }
    });

    // ---------- mobile full-screen dialog
    let dlg = null, dlgInp = null, dlgList = null;
    let suppressMobileFocus = false; // guards against dialog reopening on focus-return

    function ensureDialog() {
      if (dlg) return;

      dlg = document.createElement('dialog');
      dlg.id = 'device-dialog';
      dlg.setAttribute('aria-label', 'Select device');
      // Full-screen override — browsers may limit dialog max-width/height
      dlg.style.cssText =
        'position:fixed;inset:0;width:100%;height:100%;' +
        'max-width:100%;max-height:100%;margin:0;border:none;padding:0;' +
        'background:transparent;';

      const wrap = document.createElement('div');
      wrap.className =
        'flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100';

      // Header bar: search input + Cancel
      const bar = document.createElement('div');
      bar.className =
        'flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0';

      dlgInp = document.createElement('input');
      dlgInp.type = 'text';
      dlgInp.className = 'input-base flex-1 min-w-0';
      dlgInp.placeholder = 'Type to search (e.g. Archer C7)';
      dlgInp.autocomplete = 'off';
      dlgInp.setAttribute('aria-autocomplete', 'list');

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-ghost text-sm flex-shrink-0';
      cancelBtn.textContent = 'Cancel';

      // Results list — scrollable
      dlgList = document.createElement('div');
      dlgList.setAttribute('role', 'listbox');
      dlgList.setAttribute('aria-label', 'Device suggestions');
      dlgList.className = 'flex-1 overflow-y-auto font-mono text-sm';

      bar.append(dlgInp, cancelBtn);
      wrap.append(bar, dlgList);
      dlg.appendChild(wrap);
      document.body.appendChild(dlg);

      cancelBtn.addEventListener('click', () => {
        // Set flag BEFORE dlg.close() — focus returns to inp synchronously,
        // before the 'close' event fires, so the guard must already be up.
        suppressMobileFocus = true;
        setTimeout(() => { suppressMobileFocus = false; }, 200);
        dlg.close();
      });

      // Escape key also closes the dialog via the native 'cancel' event,
      // which fires synchronously before 'close' — set the guard here too.
      dlg.addEventListener('cancel', () => {
        suppressMobileFocus = true;
        setTimeout(() => { suppressMobileFocus = false; }, 200);
      });

      dlgInp.addEventListener('input', () => renderDlg(search(dlgInp.value)));

      dlg.addEventListener('close', () => {
        dlgInp.value = '';
        dlgList.innerHTML = '';
      });
    }

    function renderDlg(items) {
      dlgList.innerHTML = '';
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'px-4 py-8 text-center text-zinc-400 text-sm';
        empty.textContent = 'No devices found.';
        dlgList.appendChild(empty);
        return;
      }
      // Show more results on mobile full-screen than desktop dropdown
      items.slice(0, 50).forEach(title => {
        const d = document.createElement('div');
        d.setAttribute('role', 'option');
        d.className =
          'px-4 py-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ' +
          'border-b border-zinc-100 dark:border-zinc-800';
        d.textContent = title;
        d.addEventListener('click', () => {
          // Guard must be set BEFORE dlg.close() — focus returns to inp
          // synchronously (before the async 'close' event task), so pick()'s
          // later assignment would arrive too late.
          suppressMobileFocus = true;
          dlg.close();
          pick(title);
        });
        dlgList.appendChild(d);
      });
    }

    // Wire focus: desktop shows dropdown, mobile shows dialog
    inp.addEventListener('focus', () => {
      if (window.innerWidth < 768) {
        // Guard: don't reopen the dialog when focus returns to inp after a pick.
        if (suppressMobileFocus) { inp.blur(); return; }
        ensureDialog();
        renderDlg(search(''));
        dlg.showModal();
        // Defer focus so dialog finishes opening
        setTimeout(() => { if (dlgInp) dlgInp.focus(); }, 60);
        inp.blur();
        return;
      }
      render(search(inp.value));
    });
  };

  async function loadProfileDetails() {
    const prof = state.selectedProfile;
    if (!prof) return;
    $('#device-info').textContent = 'Loading device details…';
    const url = versionToUrl(state.version) + '/targets/' + prof.target + '/profiles.json';
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) {
      $('#device-info').textContent = 'Failed to load device details (' + res.status + ')';
      return;
    }
    const data = await res.json();
    state.profileDetails = data;
    const dev = (data.profiles || {})[prof.id] || {};
    const defs = (data.default_packages || []).length;
    const devs = (dev.device_packages || []).length;
    $('#device-info').textContent =
      prof.target + ' • ' + defs + ' default + ' + devs + ' device pkgs • ' + (data.version_code || '');
    if (ui.renderAutoPackages) ui.renderAutoPackages();
  }

  // -------------------------------------- gather final build payload
  ui.collectTarget = function () {
    const prof = state.selectedProfile, det = state.profileDetails;
    if (!prof || !det) return null;
    const dev = (det.profiles || {})[prof.id] || {};
    return {
      profile: prof.id,
      target:  prof.target,
      version: state.version,
      version_code: det.version_code,
      default_packages: det.default_packages || [],
      device_packages: dev.device_packages || [],
      images: dev.images || [],
    };
  };
})();
