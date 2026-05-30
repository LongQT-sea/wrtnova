(function () {
  'use strict';

  const ui = window.WrtNova = window.WrtNova || {};
  const ASU_DEFAULT = 'https://sysupgrade.openwrt.org';

  let editor  = null;  // Monaco instance
  let polling = null;

  ui.renderAutoPackages   = function () {};
  ui.expandSectionsOnDevice  = function () {};
  ui.updateAth10kVisibility  = function () {};
  ui.notifyTargetChanged  = function () {
    const ok  = !!(ui.collectTarget && ui.collectTarget());
    const btn = document.getElementById('build-btn');
    const hint = document.getElementById('build-hint');
    if (btn)  btn.disabled = !ok;
    if (hint) hint.textContent = ok ? '' : 'Pick a device to enable build.';
    if (ok)   ui.setDot('target', 'valid');
  };

  async function fetchAssets() {
    const res = await fetch('/wrtnova.sh');
    if (!res.ok) throw new Error('Failed to load wrtnova.sh (' + res.status + ')');
    return res.text();
  }

  function initMonaco(template) {
    const isDark = () => document.documentElement.classList.contains('dark');
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs' } });
    require(['vs/editor/editor.main'], function () {
      document.getElementById('monaco-loading').remove();
      editor = monaco.editor.create(document.getElementById('monaco-editor'), {
        value:                template,
        language:             'shell',
        theme:                isDark() ? 'vs-dark' : 'vs',
        automaticLayout:      true,
        minimap:              { enabled: false },
        fontSize:             13,
        fontFamily:           '"IBM Plex Mono", "Courier New", monospace',
        scrollBeyondLastLine: false,
        lineNumbers:          'on',
        renderLineHighlight:  'line',
        tabSize:              4,
        wordWrap:             'off',
      });

      new MutationObserver(function () {
        monaco.editor.setTheme(isDark() ? 'vs-dark' : 'vs');
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    });
  }

  function asuBase() {
    return (document.getElementById('asu-url').value || ASU_DEFAULT).trim().replace(/\/+$/, '');
  }

  function parsePackages() {
    return (document.getElementById('packages').value || '')
      .split(/[\s,\n]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  async function startBuild() {
    if (polling) return;
    ui.clearStatus(); ui.clearProgress();
    document.getElementById('result').classList.add('hidden');

    const target = ui.collectTarget && ui.collectTarget();
    if (!target) { ui.status('Pick a device first.', 'error'); return; }
    if (!editor)  { ui.status('Editor not ready yet.', 'error'); return; }

    const script = editor.getValue();

    const asu     = asuBase();
    const payload = {
      target:        target.target,
      version:       target.version,
      version_code:  target.version_code,
      profile:       target.profile,
      packages:      parsePackages(),
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

  const PROGRESS_MAP = {
    'init':                    [  5, 'Initializing'],
    'queued':                  [ 10, 'Queued'],
    'started':                 [ 12, 'Starting build'],
    'container-setup':         [ 15, 'Setting up container'],
    'download-imagebuilder':   [ 20, 'Downloading imagebuilder'],
    'validate-manifest':       [ 30, 'Validating manifest'],
    'unpack-imagebuilder':     [ 40, 'Unpacking imagebuilder'],
    'calculate-packages-hash': [ 60, 'Resolving packages'],
    'building-image':          [ 80, 'Building image'],
    'build-successful':        [100, 'Done'],
  };

  function pollAsu(asu, hash) {
    let tries = 0;
    const btn = document.getElementById('build-btn');
    polling = setInterval(async function () {
      tries++;
      try {
        const r    = await fetch(asu + '/api/v1/build/' + hash, { cache: 'no-cache' });
        const data = await r.json();
        if (r.status === 202) {
          const m = PROGRESS_MAP[data.detail] || [50, data.detail || 'Building…'];
          const q = data.queue_position != null ? ' (#' + data.queue_position + ' in queue)' : '';
          ui.setProgress(m[1] + q, m[0]);
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
    const main = data.firmware_url ||
      (sys && bin_dir ? asu + '/store/' + bin_dir + '/' + sys.name : null);

    const wrap = document.getElementById('result');
    wrap.classList.remove('hidden');
    let html = '<div class="result-wrap">';
    if (main) {
      html += '<a class="btn btn-primary result-btn" href="' + main + '">'
            + 'Download ' + (sys ? sys.type : 'image') + ' image</a>';
    }
    if (images.length > 1) {
      html += '<details class="result-other"><summary>Other images</summary><ul>';
      images.forEach(function (im) {
        const url = asu + '/store/' + bin_dir + '/' + im.name;
        html += '<li><a href="' + url + '">' + im.name + '</a>'
              + ' <small>(' + im.type + ', sha256: ' + (im.sha256 || '').slice(0, 16) + '…)</small></li>';
      });
      html += '</ul></details>';
    }
    html += '</div>';
    wrap.innerHTML = html;
  }

  const PRESETS = [
    {
      label: 'WrtNova core',
      title: 'Essential packages WrtNova always installs',
      pkgs:  ['curl', 'ip-full', 'umdns', 'zram-swap', 'luci-app-commands', 'ip-bridge',
              'adguardhome', 'luci-ssl', 'luci-app-ddns', 'ddns-scripts-cloudflare'],
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
      pkgs:  ['dnsproxy', '-adguardhome', '-luci-ssl'],
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
  }

  function initPresets() {
    const container = document.getElementById('preset-buttons');
    if (!container) return;
    PRESETS.forEach(function (preset) {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.textContent = '+ ' + preset.label;
      btn.title     = preset.title;
      btn.className = 'btn btn-ghost text-xs py-0.5 px-2';
      btn.addEventListener('click', function () { addPreset(preset.pkgs); });
      container.appendChild(btn);
    });
  }

  function toggleFullscreen() {
    const wrap = document.getElementById('monaco-wrap');
    const btn  = document.getElementById('monaco-fs-btn');
    const open = wrap.classList.toggle('is-fullscreen');
    document.body.classList.toggle('monaco-fs-open', open);
    btn.querySelector('.icon-expand').classList.toggle('hidden', open);
    btn.querySelector('.icon-collapse').classList.toggle('hidden', !open);
    btn.setAttribute('aria-label', open ? 'Exit full screen' : 'Expand editor to full screen');
  }

  // ESC exits fullscreen (capture phase so it fires before Monaco's own ESC handlers)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('monaco-wrap').classList.contains('is-fullscreen')) {
      toggleFullscreen();
    }
  }, true);

  document.addEventListener('DOMContentLoaded', async function () {
    document.getElementById('build-btn').disabled = true;
    document.getElementById('build-btn').addEventListener('click', startBuild);
    document.getElementById('monaco-fs-btn').addEventListener('click', toggleFullscreen);

    initPresets();
    ui.initDeviceCombo();

    const [templateResult] = await Promise.allSettled([
      fetchAssets(),
      ui.loadVersions().catch(function (e) {
        ui.status('Failed to load device list: ' + e.message, 'error');
      }),
    ]);

    if (templateResult.status === 'fulfilled') {
      initMonaco(templateResult.value);
    } else {
      ui.status('Failed to load editor assets: ' + templateResult.reason.message, 'error');
    }
  });
})();
