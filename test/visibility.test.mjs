// Unit tests for the pure conditional-visibility / net-row selectors
// (Section 0 "State Model": derived UI are pure selectors of the config).
// Run: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { deriveVisibility, deriveNetRows, detectVlanConflict,
         resolveVlanAssignment, resolveVlanEmit,
         isSwconfigTarget, countBaseVlanSlots, truncateAdditionalVlans,
         SWCONFIG_VLAN_MAX, deriveBootstrapDns, DOH_PROVIDERS } from '../public/js/visibility.mjs';

// ---------------------------------------------------------------------------
// deriveVisibility
// ---------------------------------------------------------------------------

test('deriveVisibility: router mode (AP_MODE absent) shows router, hides ap', () => {
  const v = deriveVisibility({});
  assert.equal(v['router-only'], false);   // shown
  assert.equal(v['ap-only'], true);          // hidden
  assert.equal(v['wg-help-router'], false);  // router help shown
});

test('deriveVisibility: AP mode hides router (incl wg-client), shows ap', () => {
  const v = deriveVisibility({ AP_MODE: '1', WG_ENABLE: '1' });
  assert.equal(v['router-only'], true);      // wg client card is router-only, hidden on AP
  assert.equal(v['ap-only'], false);
  assert.equal(v['wifi-wg'], false);         // WG SSID still shown on AP
  assert.equal(v['wg-help-router'], true);   // router help hidden on AP
});

test('deriveVisibility: pppoe / iot / guest / wg gating', () => {
  assert.equal(deriveVisibility({ wan_type: 'pppoe' })['pppoe-only'], false);
  assert.equal(deriveVisibility({ wan_type: 'dhcp' })['pppoe-only'], true);
  const iotWg = deriveVisibility({ IOT_ENABLE: '1', WG_ENABLE: '1' });
  assert.equal(iotWg['iot-internet-only'], false);
  assert.equal(iotWg['wifi-iot'], false);
  assert.equal(iotWg['iot-wg-only'], false);
  assert.equal(deriveVisibility({ IOT_ENABLE: '1' })['iot-wg-only'], true);  // needs wg too
  // AP mode has no L3, so the IoT internet / route-via-WG toggles hide even when on.
  const iotWgAp = deriveVisibility({ IOT_ENABLE: '1', WG_ENABLE: '1', AP_MODE: '1' });
  assert.equal(iotWgAp['iot-internet-only'], true);
  assert.equal(iotWgAp['iot-wg-only'], true);
  assert.equal(iotWgAp['wifi-iot'], false);  // IoT WiFi (L2) still shown in AP mode
  assert.equal(deriveVisibility({ GUEST_ENABLE: '1' })['wifi-guest'], false);
});

test('deriveVisibility: wg-off-notice (config entered but VPN off)', () => {
  // false = shown: router mode, WG off, at least one client field filled.
  assert.equal(deriveVisibility({ WG_ENABLE: '', ENDPOINT: 'vpn.example.com' })['wg-off-notice'], false);
  assert.equal(deriveVisibility({ WG_ENABLE: '', WG_PRIVATE_KEY: 'abc' })['wg-off-notice'], false);
  // true = hidden: WG already on, nothing entered, or AP mode (card itself hidden).
  assert.equal(deriveVisibility({ WG_ENABLE: '1', ENDPOINT: 'vpn.example.com' })['wg-off-notice'], true);
  assert.equal(deriveVisibility({ WG_ENABLE: '' })['wg-off-notice'], true);
  assert.equal(deriveVisibility({ AP_MODE: '1', WG_ENABLE: '', ENDPOINT: 'vpn.example.com' })['wg-off-notice'], true);
});

test('deriveVisibility: ssh-pw-row, mesh, wan-b flags', () => {
  assert.equal(deriveVisibility({ SSH_PUBLIC_KEY: 'ssh-ed25519 AAA' })['ssh-pw-row'], false);
  assert.equal(deriveVisibility({ SSH_PUBLIC_KEY: '   ' })['ssh-pw-row'], true);
  assert.equal(deriveVisibility({ WIRELESS_MESH: '1' })['mesh-only'], false);
  assert.equal(deriveVisibility({ WAN_B_ENABLE: '1' })['wan-b-only'], false);
});

// The WAN VLAN id has no visibility class on purpose, so nothing can start
// hiding it again: wrtnova.sh reads wan_vid=${WAN_VLAN_ID:-20} unconditionally,
// and forces WAN_IS_TAGGED=1 on a single-NIC board, so the field can be needed
// while the toggle reads off.
test('deriveVisibility: the WAN VLAN id is never conditional', () => {
  for (const cfg of [{}, { WAN_IS_TAGGED: '1' }, { WAN_IS_TAGGED: '' }, { BRIDGE_WAN_PORT: '1' }]) {
    assert.equal('wan-tagged-only' in deriveVisibility(cfg), false);
  }
});

// Hiding the WAN-B id is safe only because it is cosmetic: with WAN_B_ENABLE
// off the field emits '' whatever is typed in it, so a hidden value can never
// reach the built config.
test('WAN_B_VLAN_ID emits nothing while WAN-B is off, typed or not', () => {
  assert.equal(resolveVlanEmit({ WAN_B_ENABLE: '', WAN_B_VLAN_ID: '25' }).WAN_B_VLAN_ID, '');
  assert.equal(resolveVlanEmit({ WAN_B_ENABLE: '1', WAN_B_VLAN_ID: '25' }).WAN_B_VLAN_ID, '25');
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

// ---------------------------------------------------------------------------
// isSwconfigTarget / countBaseVlanSlots / truncateAdditionalVlans - the
// swconfig 16-slot VLAN cap
// ---------------------------------------------------------------------------

test('isSwconfigTarget: ath79 (any subtarget), mt7620, mt76x8 only', () => {
  assert.equal(isSwconfigTarget('ath79/generic'), true);
  assert.equal(isSwconfigTarget('ath79/nand'), true);
  assert.equal(isSwconfigTarget('ath79/tiny'), true);
  assert.equal(isSwconfigTarget('ramips/mt7620'), true);
  assert.equal(isSwconfigTarget('ramips/mt76x8'), true);
  assert.equal(isSwconfigTarget('ramips/mt7621'), false); // DSA, not swconfig
  assert.equal(isSwconfigTarget('mediatek/filogic'), false);
  assert.equal(isSwconfigTarget(''), false);
  assert.equal(isSwconfigTarget(undefined), false);
});

test('countBaseVlanSlots: lan+wan by default; flags and AP mode adjust it', () => {
  assert.equal(countBaseVlanSlots({}), 2);                                   // lan + wan
  assert.equal(countBaseVlanSlots({ GUEST_ENABLE: '1', IOT_ENABLE: '1', WG_ENABLE: '1' }), 5); // +3
  assert.equal(countBaseVlanSlots({ WAN_B_ENABLE: '1' }), 3);               // lan + wan + wanb
  assert.equal(countBaseVlanSlots({ AP_MODE: '1' }), 1);                    // AP excludes wan/wanb -> lan only
});

test('truncateAdditionalVlans: no-op on DSA targets and empty lists', () => {
  const cfg = { ADDITIONAL_VLAN_LIST: '100 101 102' };
  const dsa = truncateAdditionalVlans(cfg, 'ramips/mt7621');
  assert.equal(dsa.truncated, false);
  assert.equal(dsa.list, '100 101 102');
  const empty = truncateAdditionalVlans({ ADDITIONAL_VLAN_LIST: '' }, 'ath79/generic');
  assert.equal(empty.truncated, false);
});

test('truncateAdditionalVlans: within budget passes through unchanged', () => {
  // base = lan + wan = 2, so budget = 14; 3 trunk VLANs fit.
  const r = truncateAdditionalVlans({ ADDITIONAL_VLAN_LIST: '100 101 102' }, 'ath79/generic');
  assert.equal(r.truncated, false);
  assert.equal(r.list, '100 101 102');
});

test('truncateAdditionalVlans: drops overflow past the 16-slot table', () => {
  // base = lan + wan = 2 -> budget 14. A 30-item range keeps 14, drops 16.
  const r = truncateAdditionalVlans({ ADDITIONAL_VLAN_LIST: '100-129' }, 'ramips/mt7620');
  assert.equal(r.truncated, true);
  assert.equal(SWCONFIG_VLAN_MAX, 16);
  assert.equal(r.list, '100-113');      // first 14, range-compressed
  assert.equal(r.dropped, '114-129');   // remaining 16
});

test('truncateAdditionalVlans: budget shrinks as base networks are enabled', () => {
  // base = lan+guest+iot+wg+wan+wanb = 6 -> budget 10.
  const cfg = {
    GUEST_ENABLE: '1', IOT_ENABLE: '1', WG_ENABLE: '1', WAN_B_ENABLE: '1',
    ADDITIONAL_VLAN_LIST: '200-220',
  };
  const r = truncateAdditionalVlans(cfg, 'ramips/mt76x8');
  assert.equal(r.truncated, true);
  assert.equal(r.list, '200-209');      // 10 kept
  assert.equal(r.dropped, '210-220');   // 11 dropped
});

test('truncateAdditionalVlans: dedupes and keeps first-typed VIDs before dropping', () => {
  // budget 14; typed order preserved for the keep/drop split, output sorted.
  const list = '50 50 60 70 80 90 100 110 120 130 140 150 160 170 180 190';
  const r = truncateAdditionalVlans({ ADDITIONAL_VLAN_LIST: list }, 'ath79/generic');
  assert.equal(r.truncated, true);
  // 16 tokens, one dupe (50) -> 15 unique; keep first 14, drop the 15th (190).
  assert.equal(r.dropped, '190');
});

// deriveVisibility is only half of a rule - the other half is an element that
// actually carries the class. `wan-b-only` lost its element in June 2026
// (0ec92a6, the WAN advanced-options collapse) and went on being computed every
// render with nothing to apply it to; `wan-tagged-only` sat beside it encoding a
// rule wrtnova.sh does not have. Neither failed anything, because a selector
// with no subscriber is silent by construction. This is that missing check.
test('every visibility class is used by at least one element', () => {
  const sources = ['public/builder/index.html', 'public/networks/index.html', 'public/js/networks.js']
    .map(p => readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
  const classes = Object.keys(deriveVisibility({}));
  assert.ok(classes.length > 0);
  // '-' is a word boundary for \\b, so the class is matched between explicit
  // delimiters instead - otherwise 'ap-only' would match inside 'iot-wg-only'.
  const orphans = classes.filter(cls =>
    !sources.some(src => new RegExp(`[\\s"']${cls}[\\s"']`).test(src)));
  assert.deepEqual(orphans, [], `visibility classes computed but never applied:\n${orphans.join('\n')}`);
});

// ---------------------------------------------------------------------------
// deriveBootstrapDns
// ---------------------------------------------------------------------------
// The "Add DoH preset" control used to append a provider's plain-DNS IPs into
// the BOOTSTRAP_DNS textarea. Nothing removed them again, and wrtnova.sh feeds
// BOOTSTRAP_DNS to fallback_dns as well as bootstrap_dns - so dropping a
// provider left its plaintext resolver reachable as a fallback. Deriving from
// the upstream list instead is what makes removal work.

const CF = 'https://cloudflare-dns.com/dns-query';
const GOOG = 'https://dns.google/dns-query';

test('deriveBootstrapDns: a listed provider contributes its bootstrap IPs', () => {
  assert.equal(deriveBootstrapDns({ DOH_UPSTREAMS: CF }),
    '1.0.0.1\n2606:4700:4700::1001');
});

test('deriveBootstrapDns: removing the URL removes its IPs - the whole point', () => {
  const withCf = deriveBootstrapDns({ DOH_UPSTREAMS: `${CF}\n${GOOG}` });
  assert.ok(withCf.includes('1.0.0.1'));
  const without = deriveBootstrapDns({ DOH_UPSTREAMS: GOOG });
  assert.equal(without.includes('1.0.0.1'), false);
  assert.equal(without.includes('2606:4700:4700::1001'), false);
  assert.equal(without, '8.8.8.8\n2001:4860:4860::8888');
});

test('deriveBootstrapDns: the user\'s own entries survive alongside derived ones', () => {
  const out = deriveBootstrapDns({ DOH_UPSTREAMS: CF, BOOTSTRAP_DNS: '192.0.2.1' });
  assert.deepEqual(out.split('\n'), ['1.0.0.1', '2606:4700:4700::1001', '192.0.2.1']);
});

test('deriveBootstrapDns: no duplicates when the user typed a derived IP too', () => {
  const out = deriveBootstrapDns({ DOH_UPSTREAMS: CF, BOOTSTRAP_DNS: '1.0.0.1' });
  assert.deepEqual(out.split('\n'), ['1.0.0.1', '2606:4700:4700::1001']);
});

test('deriveBootstrapDns: an unknown custom resolver contributes nothing', () => {
  assert.equal(deriveBootstrapDns({ DOH_UPSTREAMS: 'https://doh.example.com/dns-query' }), '');
  // ...but the user can still supply its bootstrap by hand
  assert.equal(deriveBootstrapDns({
    DOH_UPSTREAMS: 'https://doh.example.com/dns-query', BOOTSTRAP_DNS: '198.51.100.1',
  }), '198.51.100.1');
});

test('deriveBootstrapDns: empty config emits nothing, so no redundant default', () => {
  assert.equal(deriveBootstrapDns({}), '');
});

test('every DoH provider has a url and at least one bootstrap IP', () => {
  assert.ok(DOH_PROVIDERS.length > 0);
  for (const p of DOH_PROVIDERS) {
    assert.match(p.url, /^https:\/\/\S+$/, `${p.name} url`);
    assert.ok(p.bootstrap.split(/\s+/).filter(Boolean).length >= 1, `${p.name} bootstrap`);
  }
});
