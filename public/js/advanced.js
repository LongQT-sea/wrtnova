// /builder/advanced Monaco editor build page. ES module. Imports ui.js (side
// effects) and the device API from devices.js; the Monaco AMD loader exposes
// `require`/`monaco` as globals, used directly here. Stubs renderAutoPackages /
// updateAth10kVisibility (no package chips on this page) and must set them at
// eval time, before devices.js calls ui.notifyTargetChanged.
import { ui } from './ui-ns.mjs';
import './ui.js';
import { initDeviceCombo, loadVersions, collectTarget } from './devices.js';
import { collapsePackages } from './packages.mjs';

  const ASU_DEFAULT = 'https://sysupgrade.openwrt.org';

  let editor  = null;  // Monaco IStandaloneCodeEditor instance
  let polling = null;

  ui.renderAutoPackages      = function () {
    const el = document.getElementById('auto-packages');
    if (el) ui.renderPackageChips(el, finalPackages());
  };
  ui.updateAth10kVisibility  = function () {};
  ui.notifyTargetChanged     = function () {
    const ok  = !!collectTarget();
    const btn = document.getElementById('build-btn');
    const hint = document.getElementById('build-hint');
    if (btn)  btn.disabled = !ok;
    if (hint) hint.textContent = ok ? '' : 'Pick a device to enable build.';
    if (ok)   ui.setDot('target', 'valid');
    ui.renderAutoPackages();
  };

  async function fetchAssets() {
    const res = await fetch('/wrtnova.sh');
    if (!res.ok) throw new Error('Failed to load wrtnova.sh (' + res.status + ')');
    return res.text();
  }

  function initMonacoEditor(template) {
    require(['vs/editor/editor.main'], function () {
      var isDark = document.documentElement.classList.contains('dark');
      editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: template,
        language: 'shell',
        theme: isDark ? 'vs-dark' : 'vs',
        fontSize: 13,
        fontFamily: '"IBM Plex Mono", "Courier New", monospace',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        lineNumbers: 'on',
        wordWrap: 'off',
        'semanticHighlighting.enabled': false,
        ariaLabel: 'Config script editor',
      });

      var loading = document.getElementById('editor-loading');
      if (loading) loading.remove();

      new MutationObserver(function () {
        monaco.editor.setTheme(document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs');
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    });
  }

  function editorValue() {
    return editor ? editor.getValue() : '';
  }

  // Marker splitting the per-build config block from the embedded body
  // (CLAUDE.md invariant). Only the config block is de-commented; the body
  // below the marker is left verbatim.
  const CONFIG_MARK = '# ===================\n# End config section\n# ===================';

  // Strip a trailing '#' comment, quote-aware: '#' starts a comment only outside
  // quotes and at a word boundary, so values like ROOT_PASSWD="p#ss" survive.
  function stripTrailingComment(line) {
    let q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '#' && (i === 0 || /\s/.test(line[i - 1])))
        return line.slice(0, i).replace(/\s+$/, '');
    }
    return line;
  }

  // Drop full-line and trailing comments from the config block, collapsing the
  // blank-line runs the removals leave behind. The shebang is a comment line and
  // is dropped too - uci-defaults runs via `sh /etc/uci-defaults/xxx`, so it is
  // not needed. The body below the marker is returned unchanged.
  function stripConfigComments(script) {
    const idx  = script.indexOf(CONFIG_MARK);
    const head = idx === -1 ? script : script.slice(0, idx);
    const tail = idx === -1 ? ''     : script.slice(idx);
    const lines = head.split('\n')
      .map(function (line) { return /^\s*#/.test(line) ? null : stripTrailingComment(line); })
      .filter(function (l) { return l !== null; });
    const cleaned = lines.filter(function (l, i) {
      return !(l.trim() === '' && i > 0 && lines[i - 1].trim() === '');
    });
    return cleaned.join('\n') + tail;
  }

  function asuBase() {
    return (document.getElementById('asu-url').value || ASU_DEFAULT).trim().replace(/\/+$/, '');
  }

  function parsePackages() {
    const user = (document.getElementById('packages').value || '')
      .split(/[\s,\n]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    // Always include luci unless the user explicitly removes it with -luci
    if (!user.includes('luci') && !user.includes('-luci'))
      user.unshift('luci');
    return user;
  }

  // The exact list POSTed to ASU, and what the "Final packages" chips preview.
  // diff_packages: true makes ASU treat this as the COMPLETE desired set and
  // remove every default not listed, so the device base (default + device
  // packages) MUST be included or the kmods/switch/wifi drivers get stripped
  // and the image soft-bricks. collapsePackages folds in any "-foo" removals
  // from the textarea presets - same shape /builder sends.
  function finalPackages() {
    const target = collectTarget();
    if (!target) return [];
    return collapsePackages([
      ...target.default_packages,
      ...target.device_packages,
      ...parsePackages(),
    ]);
  }

  async function startBuild() {
    if (polling) return;
    ui.clearStatus(); ui.clearProgress();
    document.getElementById('result').classList.add('hidden');

    const target = collectTarget();
    if (!target) { ui.status('Pick a device first.', 'error'); return; }
    if (!editor)  { ui.status('Editor not ready yet.', 'error'); return; }

    const script = stripConfigComments(editorValue());

    const asu     = asuBase();
    const packages = finalPackages();
    const payload = {
      target:        target.target,
      version:       target.version,
      version_code:  target.version_code,
      profile:       target.profile,
      packages:      packages,
      defaults:      script,
      diff_packages: true,
      client:        'wrtnova-advanced/1.0',
    };

    const btn = document.getElementById('build-btn');
    btn.disabled = true;
    ui.status('Submitting build…', 'info');
    ui.setProgress('Submitting…', 2);

    let r, data;
    try {
      r    = await fetch(asu + '/api/v1/build', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      data = await r.json();
    } catch (e) {
      btn.disabled = false;
      ui.clearProgress();
      ui.status('Submit failed: ' + e.message, 'error');
      return;
    }

    if (r.status === 200) {
      ui.setProgress('Done (cached build)', 100);
      ui.status('Build complete.', 'success');
      renderResult(data, asu);
      btn.disabled = false;
      return;
    }
    if (r.status === 202) {
      pollAsu(asu, data.request_hash);
      return;
    }

    btn.disabled = false;
    ui.clearProgress();
    ui.status('Build failed: ' + (data.detail || data.error || 'HTTP ' + r.status), 'error');
  }

  function pollAsu(asu, hash) {
    let tries = 0;
    let pct = 15;
    const btn = document.getElementById('build-btn');
    polling = setInterval(async function () {
      tries++;
      try {
        const r    = await fetch(asu + '/api/v1/build/' + hash, { cache: 'no-cache' });
        const data = await r.json();
        if (r.status === 202) {
          if (data.queue_position != null && data.queue_position > 0) {
            ui.setProgress('In build queue (#' + data.queue_position + ')', 8);
          } else {
            pct = Math.min(94, pct + (pct < 85 ? 8 : 2));
            ui.setProgress('Building…', pct);
          }
          return;
        }
        clearInterval(polling); polling = null;
        btn.disabled = false;
        if (r.status === 200) {
          ui.setProgress('Done', 100);
          ui.status('Build complete.', 'success');
          renderResult(data, asu);
        } else {
          ui.status('Build failed: ' + (data.detail || 'HTTP ' + r.status), 'error');
        }
      } catch (e) {
        if (tries > 200) {
          clearInterval(polling); polling = null;
          btn.disabled = false;
          ui.status('Polling timed out: ' + e.message, 'error');
        }
      }
    }, 5000);
  }

  function renderResult(data, asu) {
    const bin_dir = data.bin_dir;
    const images  = data.images || [];
    const sys = images.find(function (i) { return i.type === 'sysupgrade'; }) ||
                images.find(function (i) { return i.type === 'factory'; }) ||
                images[0];

    const wrap = document.getElementById('result');
    wrap.classList.remove('hidden');
    let html = '<div class="result-wrap"><ul class="result-images">';
    images.slice().sort(function (a, b) { return (b.type === 'sysupgrade') - (a.type === 'sysupgrade'); }).forEach(function (im) {
      const url = bin_dir ? asu + '/store/' + bin_dir + '/' + im.name : (im === sys ? data.firmware_url : null);
      html += '<li>'
            + (url ? '<a href="' + url + '">' + im.name + '</a>' : im.name)
            + (im.sha256 ? '<br><span class="result-hash">sha256: ' + im.sha256 + '</span>' : '')
            + '</li>';
    });
    html += '</ul></div>';
    wrap.innerHTML = html;
  }

  const PRESETS = [
    {
      label: 'WrtNova core',
      title: 'Essential packages WrtNova always installs',
      pkgs:  ['curl', 'ip-full', 'umdns', 'zram-swap', 'luci-app-commands', 'ip-bridge',
              'adguardhome', 'luci-app-ddns', 'ddns-scripts-cloudflare'],
    },
    {
      label: 'Full WiFi',
      title: 'Upgrade wpad to full enterprise build with roaming, steering, and mesh backhaul',
      pkgs:  ['-wpad-basic-mbedtls', 'wpad-mbedtls', 'luci-app-usteer', 'luci-proto-batman-adv'],
    },
    {
      label: 'WireGuard',
      title: 'WireGuard VPN client protocol',
      pkgs:  ['luci-proto-wireguard'],
    },
    {
      label: 'Multi-WAN',
      title: 'mwan3 for WAN failover and load balancing',
      pkgs:  ['luci-app-mwan3'],
    },
    {
      label: 'USB modem',
      title: 'MBIM cellular modem (e.g. Quectel EC25, Quectel RM520)',
      pkgs:  ['luci-proto-modemmanager', 'kmod-usb-net-cdc-mbim'],
    },
    {
      label: 'USB tether',
      title: 'Android / iPhone USB tethering failover',
      pkgs:  ['kmod-usb-net-rndis', 'kmod-usb-net-cdc-ncm', 'kmod-usb-net-ipheth'],
    },
    {
      label: 'Low RAM',
      title: 'Swap AdGuard Home for dnsproxy (devices with <230 MB RAM)',
      pkgs:  ['dnsproxy', '-adguardhome'],
    },
  ];

  function addPreset(pkgs) {
    const ta  = document.getElementById('packages');
    const existing = new Set(
      (ta.value || '').split(/[\s\n]+/).map(function (s) { return s.trim(); }).filter(Boolean)
    );
    const toAdd = pkgs.filter(function (p) { return !existing.has(p); });
    if (!toAdd.length) return;
    ta.value = (ta.value.trimEnd() ? ta.value.trimEnd() + '\n' : '') + toAdd.join(' ');
    ui.renderAutoPackages();
  }

  function initPresets() {
    const container = document.getElementById('preset-buttons');
    if (!container) return;
    PRESETS.forEach(function (preset) {
      const btn = document.createElement('button');
      btn.type        = 'button';
      btn.textContent = '+ ' + preset.label;
      btn.title       = preset.title;
      btn.className   = 'btn btn-ghost text-xs py-0.5 px-2';
      btn.addEventListener('click', function () { addPreset(preset.pkgs); });
      container.appendChild(btn);
    });
  }

  function toggleFullscreen() {
    const wrap = document.getElementById('editor-wrap');
    const btn  = document.getElementById('editor-fs-btn');
    const open = wrap.classList.toggle('is-fullscreen');
    document.body.classList.toggle('editor-fs-open', open);
    btn.querySelector('.icon-expand').classList.toggle('hidden', open);
    btn.querySelector('.icon-collapse').classList.toggle('hidden', !open);
    btn.setAttribute('aria-label', open ? 'Exit full screen' : 'Expand editor to full screen');
    if (editor) editor.layout();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('editor-wrap').classList.contains('is-fullscreen')) {
      toggleFullscreen();
    }
  }, true);

  document.addEventListener('DOMContentLoaded', async function () {
    document.getElementById('build-btn').disabled = true;
    document.getElementById('build-btn').addEventListener('click', startBuild);
    document.getElementById('editor-fs-btn').addEventListener('click', toggleFullscreen);

    initPresets();
    initDeviceCombo();
    document.getElementById('packages').addEventListener('input', ui.renderAutoPackages);

    const [templateResult] = await Promise.allSettled([
      fetchAssets(),
      loadVersions().catch(function (e) {
        ui.status('Failed to load device list: ' + e.message, 'error');
      }),
    ]);

    if (templateResult.status === 'fulfilled') {
      initMonacoEditor(templateResult.value);
    } else {
      ui.status('Failed to load editor assets: ' + templateResult.reason.message, 'error');
    }
  });
