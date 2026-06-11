// Differential-parity harness for the /networks ESM migration.
// Serves public/ statically, seeds one network (router + AP node with real device
// targets), navigates into the per-network config editor, drives #config-form to
// N seeded random states, and records the store-derived outputs: the shared-config
// store (ui.configState, fed by readConfig), plus the node-derived merge/packages/
// render for both nodes (the same helpers buildNode/renderNodePreview feed off).
// Run before and after the refactor; the two JSON dumps must be byte-identical.
//
//   node scripts/dev/parity-harness-networks.mjs <out.json>

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../public', import.meta.url));
const OUT = process.argv[2] || '/tmp/net-parity.json';
const N = 200;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.lua': 'text/plain',
  '.sh': 'text/plain', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  // Stub API endpoints so the page boots without the network.
  if (url.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{}'); }
  const p = normalize(join(ROOT, url === '/' ? '/networks/index.html' : url));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const buf = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
});

await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

// Seeded network: a router + one AP, each with a real device target so
// computeFinalPackages yields a non-empty resolved set. The shared_config is a
// non-trivial config so the entry loadConfig()->readConfig() round-trip is
// exercised before the random driving begins.
const SEED_NET = [{
  id: 'net-seed-1', name: 'Parity Net', updated_at: 0, warp_refresh_token: '',
  shared_config: {
    HOST_NAME: 'parity', COUNTRY_CODE: 'US', GUEST_ENABLE: '1', IOT_ENABLE: '1',
    WG_ENABLE: '1', DNS_MODE: 'adguardhome', wan_type: 'dhcp',
    PORT_FORWARD_LIST: '\n\tweb | 30 | 8080\n', IPV6_SERVER_LIST: '\n\tdocker-host | 20 | 80 443\n',
    additional_packages: 'htop tcpdump',
  },
  nodes: [
    { id: 'node-router', name: 'Main Router', last_build: null,
      device_target: { title: 'Router Dev', profile: 'rp', target: 'rt', version: '24.10.0', version_code: '',
        default_packages: ['base-files', 'luci', 'dnsmasq'], device_packages: ['kmod-ath10k-ct', 'wpad-basic-mbedtls'] },
      overrides: { AP_MODE: '', WIRELESS_MESH: '' } },
    { id: 'node-ap', name: 'Office', last_build: null,
      device_target: { title: 'AP Dev', profile: 'ap', target: 'at', version: '24.10.0', version_code: '',
        default_packages: ['base-files', 'luci'], device_packages: ['wpad-basic-mbedtls'] },
      overrides: { AP_MODE: '1', AP_INDEX: '2', WIRELESS_MESH: '1' } },
  ],
}];

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

await page.addInitScript((net) => {
  localStorage.setItem('wrtnova_networks', JSON.stringify(net));
}, SEED_NET);

await page.goto(base + '/networks/index.html', { waitUntil: 'load' });
// Wait for the page to boot (networks.js renders the list).
await page.waitForFunction(() => window.WrtNova && typeof window.WrtNova.$ === 'function' && document.querySelector('[data-netid]'), null, { timeout: 10000 });

// Navigate: list -> detail -> config editor. Clicking these runs showDetail then
// showConfig, which creates st.configStore and publishes ui.configState.
await page.click('[data-netid="net-seed-1"]');
await page.click('#btn-edit-config');
await page.waitForFunction(() => typeof window.WrtNova.configState === 'function', null, { timeout: 10000 });

const result = await page.evaluate(async (args) => {
  const { N, nodes } = args;
  const ui = window.WrtNova;
  // Pure shared logic is imported directly (no longer mirrored onto the ui bag);
  // the UI-method wrappers (computeFinalPackages / renderConfigBlockMasked) stay
  // on ui because they live in ui.js.
  const { mergeNodeConfig } = await import('/js/config-merge.mjs');
  const { renderConfigBlock } = await import('/js/render-config.mjs');
  // Deterministic PRNG so before/after runs drive identical states.
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const form = document.getElementById('config-form');
  const controls = Array.from(form.querySelectorAll('input, select, textarea'))
    .filter(el => el.id || el.name);
  const TEXT_POOL = ['', 'WrtNova', 'home-router', 'US', 'de', '192.168', '10.0', '1', '5', '20',
    'pass1234', 'short', 'docker | 20 | 80 443', 'vpn.example.com', '51820', 'AA:BB:CC:DD:EE:FF', '/24', '/26'];

  // Derive every node-output the way networks.js does, off the shared store.
  function nodeOutputs(shared) {
    const extra = (shared.additional_packages || '').split(/[\s,]+/).filter(Boolean);
    return nodes.map(node => {
      const cfg = mergeNodeConfig(shared, node.overrides);
      return {
        merged: cfg,
        finalPkgs: ui.computeFinalPackages(node.device_target, cfg, extra),
        block: renderConfigBlock(cfg),
        masked: ui.renderConfigBlockMasked(cfg),
      };
    });
  }

  const out = [];
  // seed -1: the entry state (loadConfig of the seeded shared_config -> readConfig).
  out.push({ seed: -1, shared: ui.configState(), nodes: nodeOutputs(ui.configState()) });

  for (let seed = 0; seed < N; seed++) {
    const rnd = mulberry32(seed * 2654435761);
    for (const el of controls) {
      if (el.type === 'checkbox') el.checked = rnd() < 0.5;
      else if (el.type === 'radio') {
        const group = form.querySelectorAll(`input[name="${el.name}"]`);
        const pick = group[Math.floor(rnd() * group.length)];
        group.forEach(g => g.checked = (g === pick));
      } else if (el.tagName === 'SELECT') {
        if (el.options.length) el.selectedIndex = Math.floor(rnd() * el.options.length);
      } else {
        el.value = TEXT_POOL[Math.floor(rnd() * TEXT_POOL.length)];
      }
    }
    // Fire the boundary listener exactly as a user edit would.
    form.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('change', { bubbles: true }));

    const shared = ui.configState();
    out.push({ seed, shared, nodes: nodeOutputs(shared) });
  }
  return out;
}, { N, nodes: SEED_NET[0].nodes });

await browser.close();
server.close();

await writeFile(OUT, JSON.stringify({ n: N, consoleErrors, result }, null, 0));
console.log(`net-parity: wrote ${result.length} states to ${OUT}; consoleErrors=${consoleErrors.length}`);
if (consoleErrors.length) console.log('  first error:', consoleErrors[0]);
