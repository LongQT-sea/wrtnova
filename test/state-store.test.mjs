// Unit tests for the store + the /builder config derivation selector.
// Run: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../public/js/store.mjs';
import { deriveConfig } from '../public/js/builder-config.mjs';

// ---------------------------------------------------------------------------
// createStore
// ---------------------------------------------------------------------------

test('createStore: get returns initial state', () => {
  const s = createStore({ a: 1, b: 2 });
  assert.deepEqual(s.get(), { a: 1, b: 2 });
});

test('createStore: set shallow-merges and notifies on real change', () => {
  const s = createStore({ a: 1, b: 2 });
  let seen = null, calls = 0;
  s.subscribe(st => { seen = st; calls++; });
  s.set({ b: 3 });
  assert.equal(calls, 1);
  assert.deepEqual(seen, { a: 1, b: 3 });
  assert.deepEqual(s.get(), { a: 1, b: 3 });
});

test('createStore: set is a no-op when nothing changed (notifies only on change)', () => {
  const s = createStore({ a: 1, b: 2 });
  let calls = 0;
  s.subscribe(() => { calls++; });
  s.set({ a: 1 });          // same value
  s.set({ a: 1, b: 2 });    // all same
  assert.equal(calls, 0);
  s.set({ a: 2 });          // real change
  assert.equal(calls, 1);
});

test('createStore: unsubscribe stops notifications', () => {
  const s = createStore({ a: 1 });
  let calls = 0;
  const off = s.subscribe(() => { calls++; });
  s.set({ a: 2 });
  off();
  s.set({ a: 3 });
  assert.equal(calls, 1);
});

test('createStore: multiple subscribers all fire', () => {
  const s = createStore({ a: 1 });
  let x = 0, y = 0;
  s.subscribe(() => { x++; });
  s.subscribe(() => { y++; });
  s.set({ a: 2 });
  assert.equal(x, 1);
  assert.equal(y, 1);
});

// ---------------------------------------------------------------------------
// deriveConfig (the gating selector)
// ---------------------------------------------------------------------------

// A fully-populated raw form, router mode, everything on.
function rawAllOn() {
  return {
    AP_MODE: '', wan_type: 'pppoe', SSH_PASSWD_AUTH: 'off', DNS_MODE: 'dnsproxy',
    AP_INDEX: '5',
    HOST_NAME: 'r1', ROOT_PASSWD: 'pw', SSH_PUBLIC_KEY: 'ssh-rsa k',
    PPPOE_USERNAME: 'u', PPPOE_PASSWD: 'p',
    WAN_MAC_ADDR: '00:11:22:33:44:55', WAN_VLAN_ID: '20', WAN_B_VLAN_ID: '25',
    WAN_IS_TAGGED: '1', WAN_B_ENABLE: '1', BRIDGE_WAN_PORT: '1',
    BASE_NET_PREFIX: '10.0', DEFAULT_SUBNET: '/24',
    GUEST_ENABLE: '1', IOT_ENABLE: '1', IOT_INTERNET: '1', IOT_ROUTE_VIA_WG: '1', WG_ENABLE: '1',
    DOT11KV: '1', DOT11R: '1', IOT_NO_DOT11R: '1', DENSE_ENV: '1', WIRELESS_MESH: '1', GUEST_ISOLATE: '1',
    DDNS_ENABLE: '1', CELLULAR_MODEM: '1', USB_TETHERING: '1',
    SOFTWARE_OFFLOAD: '1', HARDWARE_OFFLOAD: '1', BLOCK_DOT_DOQ: '1',
    DENY_GUEST_NIGHT: '1', QUARTERLY_REBOOT: '1', LOG: '1', NON_CT_ATH10K: '1',
    LAN_BASE_PREFIX: '10.1', LAN_VLAN_ID: '1', LAN_SUBNET: '/24',
    GUEST_BASE_PREFIX: '10.2', GUEST_VLAN_ID: '5', GUEST_SUBNET: '/24',
    IOT_BASE_PREFIX: '10.3', IOT_VLAN_ID: '10', IOT_SUBNET: '/24',
    LAN_WG_BASE_PREFIX: '10.4', LAN_WG_VLAN_ID: '15', LAN_WG_SUBNET: '/24',
    ADDITIONAL_VLAN_LIST: '30 31',
    COUNTRY_CODE: 'US',
    MESH_ID: 'm', MESH_PASSWD: 'meshpass',
    LAN_WIFI_SSID: 'lan', LAN_WIFI_PASSWD: 'lanpass1',
    GUEST_WIFI_SSID: 'g', GUEST_WIFI_PASSWD: 'guestpass',
    IOT_WIFI_SSID: 'i', IOT_WIFI_PASSWD: 'iotpass1',
    LAN_WG_WIFI_SSID: 'v', LAN_WG_WIFI_PASSWD: 'wgpass12',
    CHANNEL_2G: '6', CHANNEL_5G: '36', CHANNEL_6G: '5', WIFI_LOG_LVL: '0',
    WG_PRIVATE_KEY: 'priv', PEER_PUBLIC_KEY: 'pub', ENDPOINT: 'e', ENDPOINT_PORT: '51820',
    PRESHARED_KEY: 'psk', WG_IPV4: '1.2.3.4/32', WG_IPV6: 'fd::/128', ALLOWED_IPS: '0.0.0.0/0',
    PORT_FORWARD_LIST: '\n\tdocker | 20 | 80\n', IPV6_SERVER_LIST: '\n\thost | 20 | 443\n',
    DDNS_ENABLE_dup: '', LOOKUP_HOSTNAME: 'h.example', CLOUDFLARE_API_KEY: 'cfkey',
  };
}

test('deriveConfig: router mode passes through, gates by parent flags', () => {
  const out = deriveConfig(rawAllOn());
  assert.equal(out.AP_MODE, '');
  assert.equal(out.AP_INDEX, '');           // blanked in router mode
  assert.equal(out.PPPOE_USERNAME, 'u');    // wan_type pppoe
  assert.equal(out.WAN_B_VLAN_ID, '25');    // WAN_B on, non-default id flows through the allocator
  assert.equal(out.GUEST_ISOLATE, '1');     // guest on
  assert.equal(out.IOT_ROUTE_VIA_WG, '1');  // iot + wg on
  assert.equal(out.MESH_ID, 'm');           // mesh on
  assert.equal(out.WG_PRIVATE_KEY, 'priv'); // wg on
  assert.equal(out.PORT_FORWARD_LIST, '\n\tdocker | 20 | 80\n');
  assert.equal(out.DNS_MODE, 'dnsproxy');
  assert.equal(out.WIFI_LOG_LVL, '0');      // string '0' preserved
  assert.ok(!('wan_type' in out));          // gating-only helper not emitted
});

test('deriveConfig: AP mode blanks WAN-B/forward/DDNS/failover, keeps AP_INDEX', () => {
  const raw = Object.assign(rawAllOn(), { AP_MODE: '1' });
  const out = deriveConfig(raw);
  assert.equal(out.AP_MODE, '1');
  assert.equal(out.AP_INDEX, '5');
  for (const k of ['WAN_B_ENABLE', 'WAN_B_VLAN_ID', 'BRIDGE_WAN_PORT',
    'PORT_FORWARD_LIST', 'IPV6_SERVER_LIST', 'DDNS_ENABLE', 'LOOKUP_HOSTNAME',
    'CLOUDFLARE_API_KEY', 'CELLULAR_MODEM', 'USB_TETHERING']) {
    assert.equal(out[k], '', `${k} should be blank in AP mode`);
  }
});

test('deriveConfig: WAN_MAC/IS_TAGGED still leak in AP mode, but WAN_VLAN_ID is cleared', () => {
  // WAN_MAC_ADDR / WAN_IS_TAGGED remain the documented gap #4 leak; the VLAN
  // allocator now owns WAN_VLAN_ID and excludes WAN in AP mode, so it no longer leaks.
  const out = deriveConfig(Object.assign(rawAllOn(), { AP_MODE: '1' }));
  assert.equal(out.WAN_MAC_ADDR, '00:11:22:33:44:55');
  assert.equal(out.WAN_IS_TAGGED, '1');
  assert.equal(out.WAN_VLAN_ID, '');
});

test('deriveConfig: parent-off blanks all children', () => {
  const raw = Object.assign(rawAllOn(), {
    GUEST_ENABLE: '', IOT_ENABLE: '', WG_ENABLE: '', WIRELESS_MESH: '',
  });
  const out = deriveConfig(raw);
  for (const k of ['GUEST_BASE_PREFIX', 'GUEST_VLAN_ID', 'GUEST_SUBNET',
    'GUEST_WIFI_SSID', 'GUEST_WIFI_PASSWD', 'GUEST_ISOLATE',
    'IOT_BASE_PREFIX', 'IOT_VLAN_ID', 'IOT_SUBNET', 'IOT_WIFI_SSID',
    'IOT_WIFI_PASSWD', 'IOT_INTERNET', 'IOT_ROUTE_VIA_WG',
    'LAN_WG_BASE_PREFIX', 'LAN_WG_VLAN_ID', 'LAN_WG_SUBNET',
    'LAN_WG_WIFI_SSID', 'LAN_WG_WIFI_PASSWD',
    'WG_PRIVATE_KEY', 'PEER_PUBLIC_KEY', 'ENDPOINT', 'ALLOWED_IPS',
    'MESH_ID', 'MESH_PASSWD']) {
    assert.equal(out[k], '', `${k} should be blank when its parent is off`);
  }
  assert.equal(out.WG_ENABLE, '');
});

test('deriveConfig: wan_type dhcp blanks PPPoE', () => {
  const out = deriveConfig(Object.assign(rawAllOn(), { wan_type: 'dhcp' }));
  assert.equal(out.PPPOE_USERNAME, '');
  assert.equal(out.PPPOE_PASSWD, '');
});

test('deriveConfig: defaults and BUILD-ONLY keys', () => {
  const out = deriveConfig({});
  assert.equal(out.DNS_MODE, 'adguardhome');   // default
  assert.ok('NON_CT_ATH10K' in out);            // BUILD-ONLY passthrough present
  assert.equal(out.HOST_NAME, '');              // missing -> ''
});

test('deriveConfig: boolean flags are only "" or "1", never "0"', () => {
  const FLAG_KEYS = [
    'AP_MODE', 'WAN_IS_TAGGED', 'WAN_B_ENABLE', 'BRIDGE_WAN_PORT',
    'GUEST_ENABLE', 'IOT_ENABLE', 'IOT_INTERNET', 'IOT_ROUTE_VIA_WG', 'WG_ENABLE',
    'DOT11KV', 'DOT11R', 'IOT_NO_DOT11R', 'DENSE_ENV', 'WIRELESS_MESH', 'GUEST_ISOLATE',
    'DDNS_ENABLE', 'CELLULAR_MODEM', 'USB_TETHERING',
    'SOFTWARE_OFFLOAD', 'HARDWARE_OFFLOAD', 'BLOCK_DOT_DOQ',
    'DENY_GUEST_NIGHT', 'QUARTERLY_REBOOT', 'LOG', 'NON_CT_ATH10K',
  ];
  // Even if a stray '0' slips into a raw flag, gating passes it through only
  // where the field is non-gated; the boundary (checkboxVal) never makes '0',
  // so assert flags stay in {'', '1'} for normal on/off inputs.
  for (const on of ['', '1']) {
    const raw = {};
    FLAG_KEYS.forEach(k => { raw[k] = on; });
    raw.GUEST_ENABLE = raw.IOT_ENABLE = raw.WG_ENABLE = on; // ensure children ungated when on
    const out = deriveConfig(raw);
    for (const k of FLAG_KEYS) {
      assert.ok(out[k] === '' || out[k] === '1', `${k} must be '' or '1', got ${JSON.stringify(out[k])}`);
    }
  }
});
