// Smoke tests for paths the parity harness can't cover: cross-page module boot
// (/networks, /builder/advanced), the store-first applyStorePatch mechanism
// (used by WARP prefill + DNS auto-retry), and history restore.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../public', import.meta.url));
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.lua':'text/plain','.sh':'text/plain','.svg':'image/svg+xml' };
const server = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/')) { res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{}'); }
  let p = normalize(join(ROOT, url === '/' ? '/builder/index.html' : url));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try { const buf = await readFile(p); res.writeHead(200, {'Content-Type':MIME[extname(p)]||'application/octet-stream'}); res.end(buf); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let failures = 0;
const ok = (name, cond, extra='') => { console.log(`${cond?'PASS':'FAIL'}: ${name}${extra?'  '+extra:''}`); if(!cond) failures++; };

// Only count JS module/syntax/reference errors, not external CDN/network failures.
function jsErrorsOnly(errs){ return errs.filter(e => /SyntaxError|ReferenceError|TypeError|Cannot use import|Unexpected|is not a function|is not defined/i.test(e) && !/Failed to load resource|net::|ERR_/i.test(e)); }

async function page(url){
  const p = await browser.newPage();
  const errs = [];
  p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: '+e.name+': '+e.message));
  await p.goto(base+url, { waitUntil:'load' });
  return { p, errs };
}

// 1. /networks boots: networks.js (module) imports its pure deps directly + reads
//    the ui bag for DOM/i18n helpers; clean load proves the module graph evaluated.
//    Pure logic now comes from the typed .mjs (importable), not the ui bag.
{
  const { p, errs } = await page('/networks/index.html');
  await p.waitForFunction(() => window.WrtNova && window.WrtNova.$ , null, {timeout:8000}).catch(()=>{});
  const probe = await p.evaluate(async () => ({
    hasDollar: typeof (window.WrtNova||{}).$ === 'function',
    hasMerge:  typeof (await import('/js/config-merge.mjs')).mergeNodeConfig === 'function',
    hasT:      typeof (window.WrtNova||{}).t === 'function',
    hasCreateStore: typeof (await import('/js/store.mjs')).createStore === 'function',
  }));
  ok('/networks: ui DOM/i18n bag + pure modules importable', probe.hasDollar && probe.hasMerge && probe.hasT && probe.hasCreateStore, JSON.stringify(probe));
  ok('/networks: no JS errors', jsErrorsOnly(errs).length===0, jsErrorsOnly(errs)[0]||'');
  await p.close();
}

// 2. /builder/advanced boots (monaco CDN may fail offline; ignore network errs).
{
  const { p, errs } = await page('/builder/advanced.html');
  // Device API is now ESM exports from devices.js (importable); the page-injected
  // callbacks (renderAutoPackages stub) stay on the ui bag.
  const probe = await p.evaluate(async () => ({
    hasCollectTarget: typeof (await import('/js/devices.js')).collectTarget === 'function',
    hasInitDevice:    typeof (await import('/js/devices.js')).initDeviceCombo === 'function',
    stubRender:       typeof (window.WrtNova||{}).renderAutoPackages === 'function',
  }));
  ok('/builder/advanced: device API importable + stubs set', probe.hasCollectTarget && probe.hasInitDevice && probe.stubRender, JSON.stringify(probe));
  ok('/builder/advanced: no JS errors', jsErrorsOnly(errs).length===0, jsErrorsOnly(errs)[0]||'');
  await p.close();
}

// 3. /builder applyStorePatch: store-first writes reflect into BOTH store and DOM
//    (the mechanism WARP prefill + DNS auto-retry now use).
{
  const { p, errs } = await page('/builder/index.html');
  await p.waitForFunction(() => window.WrtNova && window.WrtNova.configStore, null, {timeout:8000});
  const r = await p.evaluate(() => {
    const ui = window.WrtNova;
    ui.applyStorePatch({ DNS_MODE: 'dnsproxy', GUEST_ENABLE: '1', WG_PRIVATE_KEY: 'SECRETKEY==' });
    const s = ui.configStore.get();
    return {
      storeDns: s.DNS_MODE, domDns: (document.querySelector('input[name="DNS_MODE"]:checked')||{}).value,
      storeGuest: s.GUEST_ENABLE, domGuest: document.querySelector('#GUEST_ENABLE').checked,
      storeWg: s.WG_PRIVATE_KEY, domWg: document.querySelector('#WG_PRIVATE_KEY').value,
    };
  });
  ok('applyStorePatch radio  (store==DOM==dnsproxy)', r.storeDns==='dnsproxy' && r.domDns==='dnsproxy', JSON.stringify(r));
  ok('applyStorePatch checkbox (store==1, DOM checked)', r.storeGuest==='1' && r.domGuest===true);
  ok('applyStorePatch text  (store==DOM==SECRETKEY==)', r.storeWg==='SECRETKEY==' && r.domWg==='SECRETKEY==');
  ok('applyStorePatch: no JS errors', jsErrorsOnly(errs).length===0, jsErrorsOnly(errs)[0]||'');
  await p.close();
}

// 4. /builder history restore: seed localStorage, lazy-load history module, restore,
//    assert fields populate AND the store re-synced from the restored DOM.
{
  const p = await browser.newPage();
  const errs = [];
  p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: '+e.message));
  await p.addInitScript(() => {
    localStorage.setItem('wrtnova_history', JSON.stringify([{
      ts: Date.now()-120000,
      device: { title:'Test Device', profile:'p', target:'t', version:'24.10.0' },
      config: { HOST_NAME:'restored-host', AP_MODE:'', COUNTRY_CODE:'US', GUEST_ENABLE:'1',
                GUEST_WIFI_SSID:'G', PORT_FORWARD_LIST:'\n\tweb | 30 | 8080\n', DNS_MODE:'none' },
      additional_packages: ['htop','tcpdump'], warp_refresh_token:'', result:{status:'success',firmware_url:null},
    }]));
  });
  await p.goto(base+'/builder/index.html', { waitUntil:'load' });
  await p.waitForFunction(() => window.WrtNova && window.WrtNova.configStore, null, {timeout:8000});
  const r = await p.evaluate(async () => {
    await import('/js/history.js');
    const ui = window.WrtNova;
    const entry = JSON.parse(localStorage.getItem('wrtnova_history'))[0];
    await ui.restoreFromHistory(entry);
    const s = ui.configStore.get();
    return {
      domHost: document.querySelector('#HOST_NAME').value,
      storeHost: s.HOST_NAME,
      domGuest: document.querySelector('#GUEST_ENABLE').checked,
      storeGuest: s.GUEST_ENABLE,
      domPkgs: document.querySelector('#additional_packages').value,
      storePf: s.PORT_FORWARD_LIST,
      pfRows: document.querySelectorAll('#portfwd-table tbody tr').length,
    };
  });
  ok('history restore: HOST_NAME in DOM+store', r.domHost==='restored-host' && r.storeHost==='restored-host', JSON.stringify(r));
  ok('history restore: GUEST toggle synced', r.domGuest===true && r.storeGuest==='1');
  ok('history restore: additional_packages restored', r.domPkgs==='htop tcpdump');
  ok('history restore: portfwd table rebuilt + in store', r.pfRows>=1 && /web \| 30 \| 8080/.test(r.storePf||''), JSON.stringify({pfRows:r.pfRows,storePf:r.storePf}));
  ok('history restore: no JS errors', jsErrorsOnly(errs).length===0, jsErrorsOnly(errs)[0]||'');
  await p.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL SMOKE CHECKS PASSED');
process.exit(failures?1:0);
