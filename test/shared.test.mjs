// Unit tests for the shared pure modules (Section 0 Test Strategy).
// Run: node --test  (no dependency; Node built-in test runner)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeNodeConfig } from '../public/js/config-merge.mjs';
import { computeAdds, resolvePackages } from '../public/js/packages.mjs';
import { renderConfigBlock, shQuote, BUILD_ONLY_KEYS } from '../public/js/render-config.mjs';

// ---------------------------------------------------------------------------
// mergeNodeConfig
// ---------------------------------------------------------------------------

test('mergeNodeConfig: AP mode suppresses WAN/WG/forward/DDNS/failover fields', () => {
  const out = mergeNodeConfig({
    AP_MODE: '1',
    WAN_VLAN_ID: '20', WAN_IS_TAGGED: '1', WAN_B_ENABLE: '1', BRIDGE_WAN_PORT: '1',
    WAN_MAC_ADDR: '00:11:22:33:44:55',
    WG_ENABLE: '1', WG_PRIVATE_KEY: 'priv', PEER_PUBLIC_KEY: 'pub', ENDPOINT: 'e',
    PORT_FORWARD_LIST: 'x', IPV6_SERVER_LIST: 'y',
    DDNS_ENABLE: '1', LOOKUP_HOSTNAME: 'h', CLOUDFLARE_API_KEY: 'k',
    CELLULAR_MODEM: '1', USB_TETHERING: '1',
    IOT_ENABLE: '1', IOT_INTERNET: '1', IOT_ROUTE_VIA_WG: '1',
  }, {});
  for (const k of ['WAN_VLAN_ID', 'WAN_IS_TAGGED', 'WAN_B_ENABLE', 'BRIDGE_WAN_PORT',
    'WAN_MAC_ADDR', 'WG_PRIVATE_KEY', 'PEER_PUBLIC_KEY', 'ENDPOINT',
    'PORT_FORWARD_LIST', 'IPV6_SERVER_LIST', 'DDNS_ENABLE', 'LOOKUP_HOSTNAME',
    'CLOUDFLARE_API_KEY', 'CELLULAR_MODEM', 'USB_TETHERING',
    // IoT internet / route-via-WG are L3-only; suppressed on an AP (IoT is L2 there).
    'IOT_INTERNET', 'IOT_ROUTE_VIA_WG']) {
    assert.equal(out[k], '', `${k} should be cleared in AP mode`);
  }
  assert.equal(out.AP_MODE, '1');
  assert.equal(out.AP_INDEX, '2', 'AP_INDEX defaults to 2');
  // WG_ENABLE itself is retained (signals the WG VLAN/SSID trunk on an AP)
  assert.equal(out.WG_ENABLE, '1');
});

test('mergeNodeConfig: sub-fields gated on their parent flag', () => {
  const off = mergeNodeConfig({
    GUEST_ENABLE: '', GUEST_WIFI_SSID: 'g', GUEST_VLAN_ID: '5', GUEST_ISOLATE: '1',
    IOT_ENABLE: '', IOT_WIFI_SSID: 'i', IOT_VLAN_ID: '10', IOT_INTERNET: '1', IOT_ROUTE_VIA_WG: '1',
    WG_ENABLE: '', LAN_WG_WIFI_SSID: 'v', LAN_WG_VLAN_ID: '15', WG_PRIVATE_KEY: 'p',
    WIRELESS_MESH: '', MESH_ID: 'm', MESH_PASSWD: 's',
  }, {});
  for (const k of ['GUEST_WIFI_SSID', 'GUEST_VLAN_ID', 'GUEST_ISOLATE',
    'IOT_WIFI_SSID', 'IOT_VLAN_ID', 'IOT_INTERNET', 'IOT_ROUTE_VIA_WG',
    'LAN_WG_WIFI_SSID', 'LAN_WG_VLAN_ID', 'WG_PRIVATE_KEY',
    'MESH_ID', 'MESH_PASSWD']) {
    assert.equal(off[k], '', `${k} should be gated off`);
  }
});

test('mergeNodeConfig: IOT_ROUTE_VIA_WG requires both IoT and WG on', () => {
  const both = mergeNodeConfig({ IOT_ENABLE: '1', WG_ENABLE: '1', IOT_ROUTE_VIA_WG: '1' }, {});
  assert.equal(both.IOT_ROUTE_VIA_WG, '1');
  const iotOnly = mergeNodeConfig({ IOT_ENABLE: '1', WG_ENABLE: '', IOT_ROUTE_VIA_WG: '1' }, {});
  assert.equal(iotOnly.IOT_ROUTE_VIA_WG, '');
});

test('mergeNodeConfig: flag() never emits 0', () => {
  const out = mergeNodeConfig({
    DENSE_ENV: '0', DOT11KV: '0', DOT11R: '0', BLOCK_DOT_DOQ: '0', SOFTWARE_OFFLOAD: '0',
    HARDWARE_OFFLOAD: '0', DENY_GUEST_NIGHT: '0', QUARTERLY_REBOOT: '0', LOG: '0',
    NON_CT_ATH10K: '0',
  }, {});
  for (const [k, v] of Object.entries(out)) {
    assert.notEqual(v, '0', `${k} must never be the string '0'`);
  }
});

test('mergeNodeConfig: emits the previously-diverged keys (parity fix)', () => {
  const out = mergeNodeConfig({
    GUEST_ENABLE: '1', GUEST_ISOLATE: '1',
    IOT_ENABLE: '1', WG_ENABLE: '1', IOT_ROUTE_VIA_WG: '1',
    DENY_GUEST_NIGHT: '1', QUARTERLY_REBOOT: '1', LOG: '1',
  }, {});
  assert.equal(out.GUEST_ISOLATE, '1');
  assert.equal(out.IOT_ROUTE_VIA_WG, '1');
  assert.equal(out.DENY_GUEST_NIGHT, '1');
  assert.equal(out.QUARTERLY_REBOOT, '1');
  assert.equal(out.LOG, '1');
});

test('mergeNodeConfig: overrides win over shared', () => {
  const out = mergeNodeConfig({ HOST_NAME: 'shared', AP_MODE: '' }, { HOST_NAME: 'node', AP_MODE: '1' });
  assert.equal(out.HOST_NAME, 'node');
  assert.equal(out.AP_MODE, '1');
});

// ---------------------------------------------------------------------------
// resolvePackages / computeAdds
// ---------------------------------------------------------------------------

test('resolvePackages: always-on additions present, sorted, deduped', () => {
  const out = resolvePackages({ base: [], device: [], extra: [], config: {} });
  for (const p of ['curl', 'ip-full', 'umdns', 'luci', 'zram-swap',
    'luci-app-commands', 'ip-bridge', 'luci-app-ddns', 'ddns-scripts-cloudflare']) {
    assert.ok(out.includes(p), `missing ${p}`);
  }
  // default DNS mode is adguardhome
  assert.ok(out.includes('adguardhome'));
  // sorted ignoring leading '-'
  const keys = out.map(p => p.replace(/^-/, ''));
  assert.deepEqual(keys, [...keys].sort((a, b) => a.localeCompare(b)));
  // no duplicates
  assert.equal(out.length, new Set(out).size);
});

test('resolvePackages: DNS modes', () => {
  assert.ok(resolvePackages({ config: { DNS_MODE: 'dnsproxy' } }).includes('dnsproxy'));
  const none = resolvePackages({ config: { DNS_MODE: 'none' } });
  assert.ok(!none.includes('adguardhome') && !none.includes('dnsproxy'));
});

test('resolvePackages: AP mode skips DNS package and wireguard proto', () => {
  const out = resolvePackages({ config: { AP_MODE: '1', WG_ENABLE: '1', DNS_MODE: 'adguardhome' } });
  assert.ok(!out.includes('adguardhome'));
  assert.ok(!out.includes('luci-proto-wireguard'));
});

test('resolvePackages: multi-WAN, wifi, usteer, wireguard, modem, tether', () => {
  const mwan = resolvePackages({ config: { WAN_B_ENABLE: '1' } });
  assert.ok(mwan.includes('luci-app-mwan3'));

  const wifi = resolvePackages({ base: ['wpad-basic-mbedtls'], config: { DOT11KV: '1' } });
  assert.ok(wifi.includes('wpad-mbedtls'));
  assert.ok(wifi.includes('luci-app-usteer'));
  // -wpad-basic-mbedtls removal beat its positive (base had wpad-basic-mbedtls)
  assert.ok(!wifi.includes('wpad-basic-mbedtls'));
  assert.ok(wifi.includes('-wpad-basic-mbedtls'));

  const wg = resolvePackages({ config: { WG_ENABLE: '1' } });
  assert.ok(wg.includes('luci-proto-wireguard'));

  const modem = resolvePackages({ config: { CELLULAR_MODEM: '1' } });
  assert.ok(modem.includes('luci-proto-modemmanager') && modem.includes('kmod-usb-net-cdc-mbim'));
  assert.ok(!modem.includes('luci-app-mwan3'), 'cellular modem uses metric failover, not mwan3');

  const tether = resolvePackages({ config: { USB_TETHERING: '1' } });
  for (const p of ['kmod-usb-net-rndis', 'kmod-usb-net-cdc-ncm', 'kmod-usb-net-ipheth']) {
    assert.ok(tether.includes(p), `missing ${p}`);
  }
  assert.ok(!tether.includes('luci-app-mwan3'), 'usb tether uses metric failover, not mwan3');
});

test('resolvePackages: banIP added by DoH block or country list, router-only', () => {
  assert.ok(resolvePackages({ config: { BLOCK_DOH: '1' } }).includes('luci-app-banip'));
  assert.ok(resolvePackages({ config: { BANIP_COUNTRY_LIST: 'lk in' } }).includes('luci-app-banip'));
  // whitespace-only country list does not trigger it
  assert.ok(!resolvePackages({ config: { BANIP_COUNTRY_LIST: '   ' } }).includes('luci-app-banip'));
  assert.ok(!resolvePackages({ config: {} }).includes('luci-app-banip'));
  // banIP operates on the WAN; AP mode has none
  assert.ok(!resolvePackages({ config: { AP_MODE: '1', BLOCK_DOH: '1' } }).includes('luci-app-banip'));
});

test('resolvePackages: ath10k-ct swap', () => {
  const out = resolvePackages({
    base: ['ath10k-firmware-qca988x-ct', 'kmod-ath10k-ct'],
    config: { NON_CT_ATH10K: '1' },
  });
  assert.ok(out.includes('-ath10k-firmware-qca988x-ct'));
  assert.ok(out.includes('ath10k-firmware-qca988x'));
  assert.ok(out.includes('-kmod-ath10k-ct'));
  assert.ok(out.includes('kmod-ath10k'));
});

test('resolvePackages: user extra removal beats any positive', () => {
  const out = resolvePackages({ base: ['luci'], extra: ['-luci', 'nano'], config: {} });
  assert.ok(!out.includes('luci'));
  assert.ok(out.includes('-luci'));
  assert.ok(out.includes('nano'));
});

test('resolvePackages: unmatched removal token still emitted', () => {
  const out = resolvePackages({ extra: ['-does-not-exist'], config: {} });
  assert.ok(out.includes('-does-not-exist'));
});

test('computeAdds: returns additions only (no base/extra merge)', () => {
  const adds = computeAdds({ base: ['luci'], device: [], config: {} });
  assert.ok(!adds.includes('luci') || adds.filter(p => p === 'luci').length === 1);
  // it is the raw rule output (curl is always first)
  assert.equal(adds[0], 'curl');
});

// ---------------------------------------------------------------------------
// renderConfigBlock / shQuote
// ---------------------------------------------------------------------------

test('renderConfigBlock: skips _-prefixed, BUILD-ONLY, empty and 0', () => {
  const out = renderConfigBlock({
    HOST_NAME: 'r1',
    _internal: 'x',
    DNS_MODE: 'adguardhome',     // BUILD-ONLY
    NON_CT_ATH10K: '1',          // BUILD-ONLY
    EMPTY: '',
    ZERO: '0',
    WG_ENABLE: '1',
  });
  assert.match(out, /^HOST_NAME='r1'$/m);
  assert.match(out, /^WG_ENABLE='1'$/m);
  assert.ok(!/_internal/.test(out));
  assert.ok(!/DNS_MODE/.test(out));
  assert.ok(!/NON_CT_ATH10K/.test(out));
  assert.ok(!/EMPTY/.test(out));
  assert.ok(!/ZERO/.test(out));
  assert.ok(out.endsWith('\n'));
});

test('shQuote: single-quote by default, preserves $ (bcrypt hashes)', () => {
  assert.equal(shQuote('plain'), "'plain'");
  const bcrypt = '$2a$10$abcDEF';
  assert.equal(shQuote(bcrypt), "'" + bcrypt + "'");
  // rendered line keeps the $ literally inside single quotes
  const block = renderConfigBlock({ ADGUARD_PASSWD: bcrypt });
  assert.match(block, /^ADGUARD_PASSWD='\$2a\$10\$abcDEF'$/m);
});

test('shQuote: falls back to double-quote escaping when value has a single quote', () => {
  const v = "it's $x `cmd` \\path \"q\"";
  const q = shQuote(v);
  assert.ok(q.startsWith('"') && q.endsWith('"'));
  assert.ok(q.includes('\\$x'));   // $ escaped
  assert.ok(q.includes('\\`cmd\\`')); // backticks escaped
  assert.ok(q.includes('\\"q\\"')); // double quotes escaped
});

test('renderConfigBlock: maskKeys renders KEY=****', () => {
  const mask = new Set(['ROOT_PASSWD']);
  const out = renderConfigBlock({ HOST_NAME: 'r1', ROOT_PASSWD: 'secret' }, mask);
  assert.match(out, /^HOST_NAME='r1'$/m);
  assert.match(out, /^ROOT_PASSWD='\*\*\*\*'$/m);
  assert.ok(!out.includes('secret'));
});

test('BUILD_ONLY_KEYS contents', () => {
  assert.ok(BUILD_ONLY_KEYS.has('DNS_MODE'));
  assert.ok(BUILD_ONLY_KEYS.has('NON_CT_ATH10K'));
});
