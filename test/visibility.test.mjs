// Unit tests for the pure conditional-visibility / net-row selectors
// (Section 0 "State Model": derived UI are pure selectors of the config).
// Run: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveVisibility, deriveNetRows, detectVlanConflict,
         resolveVlanAssignment, resolveVlanEmit } from '../public/js/visibility.mjs';

// ---------------------------------------------------------------------------
// deriveVisibility
// ---------------------------------------------------------------------------

test('deriveVisibility: router mode (AP_MODE absent) shows router, hides ap', () => {
  const v = deriveVisibility({});
  assert.equal(v['router-only'], false);   // shown
  assert.equal(v['ap-only'], true);          // hidden
  assert.equal(v['wg-help-router'], false);  // router help shown
});

test('deriveVisibility: AP mode hides router/wg-client, shows ap', () => {
  const v = deriveVisibility({ AP_MODE: '1', WG_ENABLE: '1' });
  assert.equal(v['router-only'], true);
  assert.equal(v['ap-only'], false);
  assert.equal(v['wg-only'], true);          // wg client card hidden on AP
  assert.equal(v['wifi-wg'], false);         // WG SSID still shown on AP
  assert.equal(v['wg-help-router'], true);   // router help hidden on AP
});

test('deriveVisibility: pppoe / iot / guest / wg gating', () => {
  assert.equal(deriveVisibility({ wan_type: 'pppoe' })['pppoe-only'], false);
  assert.equal(deriveVisibility({ wan_type: 'dhcp' })['pppoe-only'], true);
  const iotWg = deriveVisibility({ IOT_ENABLE: '1', WG_ENABLE: '1' });
  assert.equal(iotWg['iot-only'], false);
  assert.equal(iotWg['wifi-iot'], false);
  assert.equal(iotWg['iot-wg-only'], false);
  assert.equal(iotWg['wg-only'], false);     // wg client shown (router + wg)
  assert.equal(deriveVisibility({ IOT_ENABLE: '1' })['iot-wg-only'], true);  // needs wg too
  assert.equal(deriveVisibility({ GUEST_ENABLE: '1' })['wifi-guest'], false);
});

test('deriveVisibility: ssh-pw-row, mesh, wan-tagged, wan-b flags', () => {
  assert.equal(deriveVisibility({ SSH_PUBLIC_KEY: 'ssh-ed25519 AAA' })['ssh-pw-row'], false);
  assert.equal(deriveVisibility({ SSH_PUBLIC_KEY: '   ' })['ssh-pw-row'], true);
  assert.equal(deriveVisibility({ WIRELESS_MESH: '1' })['mesh-only'], false);
  assert.equal(deriveVisibility({ WAN_IS_TAGGED: '1' })['wan-tagged-only'], false);
  assert.equal(deriveVisibility({ WAN_B_ENABLE: '1' })['wan-b-only'], false);
});

// ---------------------------------------------------------------------------
// deriveNetRows
// ---------------------------------------------------------------------------

test('deriveNetRows: defaults - lan always on, prefix/vid/subnet fallbacks', () => {
  const rows = deriveNetRows({});
  const lan = rows.find(r => r.key === 'lan');
  assert.equal(lan.on, true);
  assert.equal(lan.effPfx, '192.168');   // no BASE_NET_PREFIX -> 192.168
  assert.equal(lan.effVid, '1');          // default vid
  assert.equal(lan.effSub, '/24');        // no DEFAULT_SUBNET -> /24
  assert.equal(lan.hasIp, true);
  assert.equal(lan.lastOct, '1');         // router
  const guest = rows.find(r => r.key === 'guest');
  assert.equal(guest.on, false);          // GUEST_ENABLE not set here
  assert.equal(guest.hasIp, false);
});

test('deriveNetRows: BASE_NET_PREFIX + DEFAULT_SUBNET propagate as fallbacks', () => {
  const rows = deriveNetRows({ BASE_NET_PREFIX: '10.0', DEFAULT_SUBNET: '/22', GUEST_ENABLE: '1' });
  const guest = rows.find(r => r.key === 'guest');
  assert.equal(guest.basePfx, '10.0');
  assert.equal(guest.effPfx, '10.0');
  assert.equal(guest.effVid, '5');
  assert.equal(guest.effSub, '/22');
  assert.equal(guest.hasIp, true);
});

test('deriveNetRows: per-net override wins over base', () => {
  const wg = deriveNetRows({ WG_ENABLE: '1', LAN_WG_BASE_PREFIX: '172.16', LAN_WG_VLAN_ID: '99' })
    .find(r => r.key === 'wg');
  assert.equal(wg.effPfx, '172.16');
  assert.equal(wg.effVid, '99');
});

test('deriveNetRows: AP mode - lan uses AP_INDEX octet, others get no IP', () => {
  const rows = deriveNetRows({ AP_MODE: '1', AP_INDEX: '7', GUEST_ENABLE: '1' });
  const lan = rows.find(r => r.key === 'lan');
  assert.equal(lan.hasIp, true);
  assert.equal(lan.lastOct, '7');
  const guest = rows.find(r => r.key === 'guest');
  assert.equal(guest.on, true);
  assert.equal(guest.hasIp, false);   // proto=none on AP
});

// ---------------------------------------------------------------------------
// resolveVlanAssignment - the frontend-owned allocator
// ---------------------------------------------------------------------------

test('resolveVlanAssignment: all-default participates only lan + wan', () => {
  const { byKey, conflict } = resolveVlanAssignment({});
  assert.equal(byKey.lan.vid, 1);
  assert.equal(byKey.wan.vid, 20);
  assert.equal(byKey.guest.participates, false);   // GUEST_ENABLE not set
  assert.equal(byKey.wanb.participates, false);    // WAN_B_ENABLE not set
  assert.equal(conflict.anchorCollision, false);
  assert.equal(conflict.trunkCollision, false);
  assert.equal(conflict.exhausted, false);
});

test('resolveVlanAssignment: anchors fixed, untouched WAN bumps off a taken id', () => {
  // The reported bug: LAN=10, Guest=20, WAN untouched (defaults to 20).
  const { byKey, conflict } = resolveVlanAssignment({
    LAN_VLAN_ID: '10', GUEST_ENABLE: '1', GUEST_VLAN_ID: '20',
  });
  assert.equal(byKey.lan.vid, 10);
  assert.equal(byKey.guest.vid, 20);
  assert.equal(byKey.wan.vid, 21);     // 20 taken by guest anchor -> next free
  assert.equal(conflict.anchorCollision, false);
});

test('resolveVlanAssignment: disabling a net frees its id for an auto field', () => {
  const on = resolveVlanAssignment({ GUEST_ENABLE: '1', GUEST_VLAN_ID: '10', IOT_ENABLE: '1' });
  assert.equal(on.byKey.iot.vid, 11);  // 10 reserved by guest anchor -> bump
  const off = resolveVlanAssignment({ IOT_ENABLE: '1' });
  assert.equal(off.byKey.iot.vid, 10); // guest gone -> iot keeps its default
});

test('resolveVlanAssignment: AP mode excludes wan/wanb', () => {
  const { byKey } = resolveVlanAssignment({ AP_MODE: '1', WAN_B_ENABLE: '1' });
  assert.equal(byKey.wan.participates, false);
  assert.equal(byKey.wanb.participates, false);
});

test('resolveVlanAssignment: trunk exhaustion is flagged, not infinite', () => {
  const { conflict } = resolveVlanAssignment({ GUEST_ENABLE: '1', ADDITIONAL_VLAN_LIST: '1-255' });
  assert.equal(conflict.exhausted, true);
});

// ---------------------------------------------------------------------------
// detectVlanConflict - only genuine, unresolvable conflicts
// ---------------------------------------------------------------------------

test('detectVlanConflict: clean default config has no conflict', () => {
  assert.equal(detectVlanConflict({ GUEST_ENABLE: '1', IOT_ENABLE: '1', WG_ENABLE: '1' }), false);
});

test('detectVlanConflict: default colliding with an untouched WAN is auto-resolved', () => {
  // LAN=10, Guest=20, WAN untouched: WAN auto-bumps, so NO conflict (was a false positive).
  assert.equal(detectVlanConflict({ LAN_VLAN_ID: '10', GUEST_ENABLE: '1', GUEST_VLAN_ID: '20' }), false);
});

test('detectVlanConflict: two typed anchors sharing a VID warns', () => {
  assert.equal(detectVlanConflict({ GUEST_ENABLE: '1', GUEST_VLAN_ID: '10', IOT_ENABLE: '1', IOT_VLAN_ID: '10' }), true);
  assert.equal(detectVlanConflict({ WAN_B_ENABLE: '1', WAN_VLAN_ID: '30', WAN_B_VLAN_ID: '30' }), true);
});

test('detectVlanConflict: a typed anchor on a trunk VLAN warns', () => {
  assert.equal(detectVlanConflict({ ADDITIONAL_VLAN_LIST: '5-7', GUEST_ENABLE: '1', GUEST_VLAN_ID: '6' }), true);
});

test('detectVlanConflict: a default net/WAN on a trunk VLAN auto-bumps away (no warn)', () => {
  assert.equal(detectVlanConflict({ ADDITIONAL_VLAN_LIST: '5', GUEST_ENABLE: '1' }), false); // guest default 5 bumps
  assert.equal(detectVlanConflict({ ADDITIONAL_VLAN_LIST: '20' }), false);                   // WAN default 20 bumps
  assert.equal(detectVlanConflict({ AP_MODE: '1', ADDITIONAL_VLAN_LIST: '20' }), false);     // AP: WAN excluded anyway
});

// ---------------------------------------------------------------------------
// resolveVlanEmit - resolved value when != natural default, else ''
// ---------------------------------------------------------------------------

test('resolveVlanEmit: all-default emits nothing (no redundant defaults)', () => {
  const e = resolveVlanEmit({});
  for (const k of ['LAN_VLAN_ID', 'GUEST_VLAN_ID', 'IOT_VLAN_ID', 'LAN_WG_VLAN_ID', 'WAN_VLAN_ID', 'WAN_B_VLAN_ID']) {
    assert.equal(e[k], '');
  }
});

test('resolveVlanEmit: emits the resolved non-default ids', () => {
  const e = resolveVlanEmit({ LAN_VLAN_ID: '10', GUEST_ENABLE: '1', GUEST_VLAN_ID: '20' });
  assert.equal(e.LAN_VLAN_ID, '10');
  assert.equal(e.GUEST_VLAN_ID, '20');
  assert.equal(e.WAN_VLAN_ID, '21');   // auto-bumped, so written explicitly
});

test('resolveVlanEmit: a typed value equal to the natural default is not emitted', () => {
  const e = resolveVlanEmit({ WAN_VLAN_ID: '20' });
  assert.equal(e.WAN_VLAN_ID, '');     // 20 == default -> redundant, drop
});

test('resolveVlanEmit: disabled / AP-excluded fields emit empty', () => {
  const e = resolveVlanEmit({ AP_MODE: '1', GUEST_VLAN_ID: '20', WAN_VLAN_ID: '30' });
  assert.equal(e.GUEST_VLAN_ID, '');   // GUEST_ENABLE off
  assert.equal(e.WAN_VLAN_ID, '');     // AP excludes WAN
});
