// ES module used by /builder and /builder/advanced (NOT /networks - that page
// has its own device picker, a near-copy of this one). Its public API is
// exported directly; the page-
// specific callbacks it fires (notifyTargetChanged / renderAutoPackages /
// updateAth10kVisibility) are injected via the shared ui namespace - build.js
// defines them on /builder, advanced.js stubs them on /builder/advanced. Imports
// ui.js for side effects so ui.$ exists at module-eval time.
import { ui } from './ui-ns.mjs';
import './ui.js';

  const $   = ui.$;
  const DL  = 'https://downloads.openwrt.org';

  // PLAN: only latest patch of each major.minor branch - plus branch snapshots for
  // recent branches and the rolling SNAPSHOT.
  const SUPPORTED_BRANCHES = ['23.05', '24.10', '25.12'];
  const SNAPSHOT_BRANCHES  = new Set(['24.10', '25.12']);

  export const devicesState = {
    version: '',
    overview: null,                 // raw .overview.json
    devicesByTitle: null,           // { title: profile }
    selectedTitle: '',
    selectedProfile: null,          // overview entry
    profileDetails: null,           // result of profiles.json fetch
  };
  const state = devicesState;

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
    $('#device-info').textContent = ui.t ? ui.t('deviceRequirement') : 'Required: ≥8MB flash, ≥64MB RAM';
    state.selectedTitle = ''; state.selectedProfile = null; state.profileDetails = null;
    ui.notifyTargetChanged && ui.notifyTargetChanged();
  }

  export const loadVersions = async function () {
    const VERSIONS_KEY = 'wrtnova_versions';
    const cachedVersions = cacheGet(VERSIONS_KEY);

    $('#version').addEventListener('change', () => {
      state.version = $('#version').value;
      loadOverview().catch(err => ui.status('Failed to load device list: ' + err.message, 'error'));
    });

    if (cachedVersions) {
      applyVersionsData(cachedVersions);
      // Background refresh so cache stays current
      fetch(DL + '/.versions.json', { cache: 'no-cache' })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => cacheSet(VERSIONS_KEY, d))
        .catch(() => {});
    } else {
      const res = await fetch(DL + '/.versions.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('versions fetch failed: ' + res.status);
      const data = await res.json();
      cacheSet(VERSIONS_KEY, data);
      applyVersionsData(data);
    }

    await loadOverviewWithFallback();
  };

  // Initial load only: the default version is whatever OpenWrt advertises as
  // stable, which may 404 during a release rollout (its .overview.json is not
  // published yet), automatic try the next older stable version one time.
  async function loadOverviewWithFallback() {
    try {
      await loadOverview();
      return;
    } catch (err) {
      const sel = $('#version');
      const opts = Array.from(sel.options).map(o => o.value);
      const idx = opts.indexOf(state.version);
      const fb = opts.slice(0, idx).reverse().find(v => !v.includes('SNAPSHOT'));
      if (!fb) throw err;
      const failed = state.version;
      state.version = fb;
      sel.value = fb;
      await loadOverview();
      ui.status('Version ' + failed + ' is not available yet; using ' + fb + '.', 'info');
    }
  }

  export const loadOverview = async function () {
    const v = state.version;
    const OVERVIEW_KEY = 'wrtnova_overview_' + v;
    const prevTitle = state.selectedTitle;
    $('#device').disabled = true;
    $('#device').value = '';

    const cached = cacheGet(OVERVIEW_KEY);
    if (cached) {
      applyOverviewData(cached);
      if (prevTitle) await selectDevice(prevTitle);
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
      if (prevTitle) await selectDevice(prevTitle);
    }
  };

  // Device selection is a readonly field that opens a full-screen <dialog> on
  // click, at every width - the same control /networks uses for its per-node
  // device row. It replaced an inline type-ahead dropdown that only became a
  // dialog below 768px; the dropdown was the second code path for one job, and
  // opening on focus needed a guard flag (focus returns to the input when the
  // dialog closes, which re-fired the handler and reopened it). Click has no
  // such re-entry, so the guard is gone with it.
  //
  // Strings go through ui.t where it exists: /builder/advanced loads devices.js
  // without i18n/core.mjs, so ui.S/ui.t may be absent there (same guard as
  // applyVersionsData).
  export const initDeviceCombo = function () {
    const inp = $('#device');
    const tr = (key, fallback) => (ui.t ? ui.t(key) : fallback);

    function search(q) {
      if (!state.devicesByTitle) return [];
      const qs = q.toLowerCase().split(/\s+/).filter(Boolean);
      return Object.keys(state.devicesByTitle).filter(t => {
        const lc = t.toLowerCase();
        return qs.every(w => lc.includes(w));
      }).sort();
    }

    async function pick(title) {
      inp.value = title;
      if (dlg) dlg.close();
      state.selectedTitle = title;
      state.selectedProfile = state.devicesByTitle[title];
      await loadProfileDetails();
      ui.notifyTargetChanged && ui.notifyTargetChanged();
    }

    let dlg = null, dlgInp = null, dlgList = null;

    function ensureDialog() {
      if (dlg) return;

      dlg = document.createElement('dialog');
      // Same id as the markup copy on /networks so both pick up the one
      // #modal-device-picker rule in style.css: full-screen on mobile, a
      // centered 560px panel above the breakpoint. Sizing stays in CSS - the
      // inline full-screen override this used to carry made /builder's picker
      // the odd one out at desktop widths.
      dlg.id = 'modal-device-picker';
      dlg.setAttribute('aria-label', 'Select device');

      const wrap = document.createElement('div');
      wrap.className =
        'flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono text-sm';

      const bar = document.createElement('div');
      bar.className =
        'flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0';

      dlgInp = document.createElement('input');
      dlgInp.type = 'text';
      dlgInp.className = 'input-base flex-1 min-w-0';
      dlgInp.placeholder = tr('deviceSearchPlaceholder', 'Type to search (e.g. Archer C7)');
      dlgInp.autocomplete = 'off';
      dlgInp.setAttribute('aria-autocomplete', 'list');

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-ghost text-sm flex-shrink-0';
      cancelBtn.textContent = tr('cancel', 'Cancel');

      dlgList = document.createElement('div');
      dlgList.setAttribute('role', 'listbox');
      dlgList.setAttribute('aria-label', 'Device suggestions');
      dlgList.className = 'flex-1 overflow-y-auto';

      bar.append(dlgInp, cancelBtn);
      wrap.append(bar, dlgList);
      dlg.appendChild(wrap);
      document.body.appendChild(dlg);

      cancelBtn.addEventListener('click', () => dlg.close());
      dlgInp.addEventListener('input', () => renderDlg(search(dlgInp.value)));
      dlg.addEventListener('close', () => { dlgInp.value = ''; dlgList.innerHTML = ''; });
    }

    function renderDlg(items) {
      dlgList.innerHTML = '';
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'px-4 py-8 text-center text-zinc-400 text-sm';
        empty.textContent = tr('noDevicesFound', 'No devices found.');
        dlgList.appendChild(empty);
        return;
      }
      items.slice(0, 80).forEach(title => {
        const d = document.createElement('div');
        d.setAttribute('role', 'option');
        d.className =
          'px-4 py-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ' +
          'border-b border-zinc-100 dark:border-zinc-800';
        d.textContent = title;
        d.addEventListener('click', () => pick(title));
        dlgList.appendChild(d);
      });
    }

    inp.addEventListener('click', () => {
      ensureDialog();
      renderDlg(search(''));
      dlg.showModal();
      setTimeout(() => { if (dlgInp) dlgInp.focus(); }, 60);
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
    const hasCt   = allPkgs.some(p => /^ath10k-firmware-|^kmod-ath10k-ct/.test(p));
    if (ui.updateAth10kVisibility) ui.updateAth10kVisibility(hasCt);
    // WED needs the mt7915e MediaTek Filogic wireless driver (MT7622/7981/7986);
    // presence of the driver kmod is the capability signal. Newer mt7996e parts
    // (MT7988) use a different module name and are intentionally out of scope.
    const wedCapable = allPkgs.some(p => /^kmod-mt7915e$/.test(p));
    if (ui.updateWedVisibility) ui.updateWedVisibility(wedCapable);
  }

  // -------------------------------------- programmatic device selection (used by history restore)
  export const selectDevice = async function (title) {
    const profile = state.devicesByTitle && state.devicesByTitle[title];
    if (!profile) return false;
    $('#device').value    = title;
    state.selectedTitle   = title;
    state.selectedProfile = profile;
    await loadProfileDetails();
    ui.notifyTargetChanged && ui.notifyTargetChanged();
    return true;
  };

  export const collectTarget = function () {
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
