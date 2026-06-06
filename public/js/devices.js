// On mobile (<768px) the combobox opens as a full-screen native <dialog>.
(function () {
  'use strict';

  const ui  = window.WrtNova = window.WrtNova || {};
  const $   = ui.$, $$ = ui.$$;
  const DL  = 'https://downloads.openwrt.org';

  // PLAN: only latest patch of each major.minor branch - plus branch snapshots for
  // recent branches and the rolling SNAPSHOT.
  const SUPPORTED_BRANCHES = ['23.05', '24.10', '25.12'];
  const SNAPSHOT_BRANCHES  = new Set(['24.10', '25.12']);

  const state = ui.devicesState = {
    version: '',
    overview: null,                 // raw .overview.json
    devicesByTitle: null,           // { title: profile }
    selectedTitle: '',
    selectedProfile: null,          // overview entry
    profileDetails: null,           // result of profiles.json fetch
  };

  function pickLatestNPatches(versions, branch, n) {
    return versions.filter(v => v.startsWith(branch + '.'))
      .sort((a, b) => {
        const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const d = (pb[i] || 0) - (pa[i] || 0);
          if (d) return d;
        }
        return 0;
      })
      .slice(0, n)
      .reverse();
  }

  function versionToUrl(v) {
    return v === 'SNAPSHOT' ? DL + '/snapshots' : DL + '/releases/' + v;
  }

  function titleFor(profile) {
    const t = (profile.titles && profile.titles[0]) || {};
    if (t.title) return t.title.trim();
    return [t.vendor, t.model, t.variant].filter(Boolean).join(' ').trim();
  }

  const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

  function cacheGet(key) {
    try {
      const item = JSON.parse(localStorage.getItem(key) || 'null');
      return item && (Date.now() - item.ts < CACHE_TTL) ? item.data : null;
    } catch (e) { return null; }
  }

  function cacheSet(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch (e) {}
  }

  function applyVersionsData(data) {
    const picks = [];
    SUPPORTED_BRANCHES.forEach(b => {
      picks.push(...pickLatestNPatches(data.versions_list || [], b, 2));
      if (SNAPSHOT_BRANCHES.has(b)) picks.push(b + '-SNAPSHOT');
    });
    picks.push('SNAPSHOT');

    const sel = $('#version');
    sel.innerHTML = '';
    picks.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });

    if (data.stable_version && picks.includes(data.stable_version)) {
      sel.value = data.stable_version;
    } else {
      sel.value = picks.filter(v => !v.includes('SNAPSHOT')).pop() || picks[0];
    }
    state.version = sel.value;
  }

  function applyOverviewData(data) {
    state.overview = data;

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
    $('#device-info').textContent = ui.t ? ui.t('deviceRequirement') : 'Required: ≥16MB flash, ≥128MB RAM';
    state.selectedTitle = ''; state.selectedProfile = null; state.profileDetails = null;
    ui.notifyTargetChanged && ui.notifyTargetChanged();
  }

  ui.loadVersions = async function () {
    const VERSIONS_KEY = 'wrtnova_versions';
    const cachedVersions = cacheGet(VERSIONS_KEY);

    if (cachedVersions) {
      applyVersionsData(cachedVersions);
      // Background refresh so cache stays current
      fetch(DL + '/.versions.json', { cache: 'no-cache' })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => cacheSet(VERSIONS_KEY, d))
        .catch(() => {});
      await ui.loadOverview();
    } else {
      const res = await fetch(DL + '/.versions.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('versions fetch failed: ' + res.status);
      const data = await res.json();
      cacheSet(VERSIONS_KEY, data);
      applyVersionsData(data);
      await ui.loadOverview();
    }

    $('#version').addEventListener('change', () => {
      state.version = $('#version').value;
      ui.loadOverview().catch(err => ui.status('Failed to load device list: ' + err.message, 'error'));
    });
  };

  ui.loadOverview = async function () {
    const v = state.version;
    const OVERVIEW_KEY = 'wrtnova_overview_' + v;
    const prevTitle = state.selectedTitle;
    $('#device').disabled = true;
    $('#device').value = '';

    const cached = cacheGet(OVERVIEW_KEY);
    if (cached) {
      applyOverviewData(cached);
      if (prevTitle) await ui.selectDevice(prevTitle);
      // Background refresh
      fetch(versionToUrl(v) + '/.overview.json', { cache: 'no-cache' })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => cacheSet(OVERVIEW_KEY, d))
        .catch(() => {});
    } else {
      $('#device-info').textContent = 'Loading devices…';
      const res = await fetch(versionToUrl(v) + '/.overview.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('overview fetch failed: ' + res.status);
      const data = await res.json();
      cacheSet(OVERVIEW_KEY, data);
      applyOverviewData(data);
      if (prevTitle) await ui.selectDevice(prevTitle);
    }
  };

  ui.initDeviceCombo = function () {
    const inp = $('#device'), list = $('#device-list');
    let active = -1;

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
      // would immediately reopen the dialog with an empty list - this flag stops that.
      suppressMobileFocus = true;
      inp.value = title;
      close();
      state.selectedTitle = title;
      state.selectedProfile = state.devicesByTitle[title];
      await loadProfileDetails();
      ui.notifyTargetChanged && ui.notifyTargetChanged();
      // Release after a tick - any focus events triggered by the pick are now done.
      setTimeout(() => { suppressMobileFocus = false; }, 200);
    }

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

    let dlg = null, dlgInp = null, dlgList = null;
    let suppressMobileFocus = false; // guards against dialog reopening on focus-return

    function ensureDialog() {
      if (dlg) return;

      dlg = document.createElement('dialog');
      dlg.id = 'device-dialog';
      dlg.setAttribute('aria-label', 'Select device');
      // Full-screen override - browsers may limit dialog max-width/height
      dlg.style.cssText =
        'position:fixed;inset:0;width:100%;height:100%;' +
        'max-width:100%;max-height:100%;margin:0;border:none;padding:0;' +
        'background:transparent;';

      const wrap = document.createElement('div');
      wrap.className =
        'flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100';

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

      dlgList = document.createElement('div');
      dlgList.setAttribute('role', 'listbox');
      dlgList.setAttribute('aria-label', 'Device suggestions');
      dlgList.className = 'flex-1 overflow-y-auto font-mono text-sm';

      bar.append(dlgInp, cancelBtn);
      wrap.append(bar, dlgList);
      dlg.appendChild(wrap);
      document.body.appendChild(dlg);

      cancelBtn.addEventListener('click', () => {
        // Set flag BEFORE dlg.close() - focus returns to inp synchronously,
        // before the 'close' event fires, so the guard must already be up.
        suppressMobileFocus = true;
        setTimeout(() => { suppressMobileFocus = false; }, 200);
        dlg.close();
      });

      // Escape key also closes the dialog via the native 'cancel' event,
      // which fires synchronously before 'close' - set the guard here too.
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
          // Guard must be set BEFORE dlg.close() - focus returns to inp
          // synchronously (before the async 'close' event task), so pick()'s
          // later assignment would arrive too late.
          suppressMobileFocus = true;
          dlg.close();
          pick(title);
        });
        dlgList.appendChild(d);
      });
    }

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
    const allPkgs = (data.default_packages || []).concat((dev.device_packages || []));
    const hasWifi = /\bwpad[-\w]|\bhostapd|\bmac80211/.test(allPkgs.join(' '));
    const hasCt   = allPkgs.some(p => /^ath10k-firmware-|^kmod-ath10k-ct/.test(p));
    if (ui.updateAth10kVisibility) ui.updateAth10kVisibility(hasCt);
  }

  // -------------------------------------- programmatic device selection (used by history restore)
  ui.selectDevice = async function (title) {
    const profile = state.devicesByTitle && state.devicesByTitle[title];
    if (!profile) return false;
    $('#device').value    = title;
    state.selectedTitle   = title;
    state.selectedProfile = profile;
    await loadProfileDetails();
    ui.notifyTargetChanged && ui.notifyTargetChanged();
    return true;
  };

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
