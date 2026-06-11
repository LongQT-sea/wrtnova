// Differential-parity harness for the /builder ESM migration.
// Serves public/ statically, loads /builder, drives the form to N seeded random
// states, and records the store-derived outputs (collectConfig, masked/plain
// preview, final packages, and the live preview/chip DOM). Run before and after
// the refactor; the two JSON dumps must be byte-identical.
//
//   node /tmp/parity-harness.mjs <out.json>

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../public', import.meta.url));
const OUT = process.argv[2] || '/tmp/parity.json';
const N = 250;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.lua': 'text/plain',
  '.sh': 'text/plain', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  // Stub API + external-ish endpoints so the page boots without the network.
  if (url.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{}'); }
  let p = normalize(join(ROOT, url === '/' ? '/builder/index.html' : url));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const buf = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
});

await new Promise(r => server.listen(0, r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

await page.goto(base + '/builder/index.html', { waitUntil: 'load' });
// Wait for the config store to come up (app.init runs it after DOMContentLoaded).
await page.waitForFunction(() => window.WrtNova && window.WrtNova.configStore, null, { timeout: 10000 });

const result = await page.evaluate(async (N) => {
  const ui = window.WrtNova;
  // Pure shared logic is imported directly (no longer mirrored onto the ui bag);
  // the UI-method wrappers (computeFinalPackages / renderConfigBlockMasked) stay
  // on ui because they live in ui.js.
  const { deriveConfig } = await import('/js/builder-config.mjs');
  const { renderConfigBlock } = await import('/js/render-config.mjs');
  // Deterministic PRNG so before/after runs drive identical states.
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const form = document.querySelector('form') || document.body;
  const controls = Array.from(form.querySelectorAll('input, select, textarea'))
    .filter(el => el.id || el.name);
  const TEXT_POOL = ['', 'WrtNova', 'home-router', 'US', 'de', '192.168', '10.0', '1', '5', '20',
    'pass1234', 'short', 'docker | 20 | 80 443', 'vpn.example.com', '51820', 'AA:BB:CC:DD:EE:FF', '/24', '/26'];

  const target = { default_packages: ['base-files', 'luci', 'dnsmasq'], device_packages: ['kmod-ath10k-ct', 'wpad-basic-mbedtls'] };
  const extras = ['my-pkg', '-dnsmasq', 'tcpdump'];

  const out = [];
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

    // Canonicalize raw-store key order: the store object is a key->value MAP, so
    // its key ORDER is not a behavioral contract (deriveConfig reads by key; the
    // store is never persisted). The config-form.mjs collapse reorders builder's
    // store to canonical schema order; sort keys here so parity stays value-strict
    // without false-positiving on that inert reorder. All derived outputs below
    // (cfg/masked/block/finalPkgs/DOM) remain order-independent and byte-strict.
    const rawRaw = ui.configStore.get();
    const raw = {}; for (const k of Object.keys(rawRaw).sort()) raw[k] = rawRaw[k];
    const cfg = deriveConfig(raw);
    out.push({
      seed,
      raw,
      cfg,
      masked: ui.renderConfigBlockMasked(cfg),
      block: renderConfigBlock(cfg),
      finalPkgs: ui.computeFinalPackages(target, cfg, extras),
      previewDom: (document.querySelector('#config-preview') || {}).textContent || '',
      chipsDom: (document.querySelector('#auto-packages') || {}).textContent || '',
    });
  }
  return out;
}, N);

await browser.close();
server.close();

const { writeFileSync } = await import('node:fs');
writeFileSync(OUT, JSON.stringify({ n: N, consoleErrors, result }, null, 0));
console.log(`parity: wrote ${result.length} states to ${OUT}; consoleErrors=${consoleErrors.length}`);
if (consoleErrors.length) console.log('  first error:', consoleErrors[0]);
