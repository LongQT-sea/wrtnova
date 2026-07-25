// @ts-check
// Pure conditional-visibility and network-row selectors (Section 0 "State
// Model": derived UI are pure selectors of the config, not DOM readers).
//
// These compute *what* should be shown/derived from a config object; the DOM
// writing (toggling .hidden, painting derived IPs, the dup warning) stays in
// the ui.js view layer that consumes them. Shared by /builder (raw form store)
// and /networks (shared_config store); AP_MODE/AP_INDEX are absent from the
// /networks shared config, so they default to router / index 2 here - matching
// the hidden AP_MODE='' radio on that page.

/** @typedef {import('./types.mjs').Config} Config */

// The four LAN-side networks, in net-table row order, with their config-key
// triples and default VLAN ids (data-def-vid in the HTML). 'lan' is always on.
const NETS = [
  { key: 'lan',   on: '',            pfx: 'LAN_BASE_PREFIX',    vid: 'LAN_VLAN_ID',    sub: 'LAN_SUBNET',    defVid: '1'  },
  { key: 'guest', on: 'GUEST_ENABLE', pfx: 'GUEST_BASE_PREFIX',  vid: 'GUEST_VLAN_ID',  sub: 'GUEST_SUBNET',  defVid: '5'  },
  { key: 'iot',   on: 'IOT_ENABLE',   pfx: 'IOT_BASE_PREFIX',    vid: 'IOT_VLAN_ID',    sub: 'IOT_SUBNET',    defVid: '10' },
  { key: 'wg',    on: 'WG_ENABLE',    pfx: 'LAN_WG_BASE_PREFIX', vid: 'LAN_WG_VLAN_ID', sub: 'LAN_WG_SUBNET', defVid: '15' },
];

const on = (cfg, k) => cfg[k] === '1';

// -- DNS-mode predicates (shared by builder-config.mjs / config-merge.mjs) ----
// Kept here once so a change to the DoH-engine set or the default mode does not
// have to be mirrored across the two build paths. 'none' and 'adblock-fast' are
// the plain dnsmasq modes (no encrypted upstream); the rest are DoH engines.
export const DNS_DEFAULT = 'https-dns-proxy';
export const dnsMode = m => m || DNS_DEFAULT;
export const isAdguard = m => dnsMode(m) === 'adguardhome';
export const isDohEngine = m => !['none', 'adblock-fast'].includes(dnsMode(m));

// WG client config fields (Interface + Peer); drive the "config entered but VPN off" notice.
const WG_CLIENT_FIELDS = [
  'WG_PRIVATE_KEY', 'WG_IPV4', 'WG_IPV6', 'WG_DNS_V4', 'WG_DNS_V6', 'WG_MTU',
  'PEER_PUBLIC_KEY', 'PRESHARED_KEY', 'ENDPOINT', 'ALLOWED_IPS',
];

// Full VLAN table in resolve priority order, mirroring wrtnova.sh resolve_vlans
// (lan, guest, iot, wg, wan, wanb) with each field's natural default and max.
// The four LAN-side rows overlap NETS above; wan/wanb live in the advanced WAN
// section. `flag` = the enable key (absent => always on, except wan which is
// router-only). This is the single source of truth for VLAN assignment - the
// frontend owns it so the backend resolve_vlans is a no-op on our output.
//
// NOTE: targets DSA / bridge-vlan and swconfig-with-vid hardware. The
// swconfig-without-vid path (wrtnova.sh: lan=1,guest=2,...) force-renumbers VLANs
// on-device and cannot be predicted at config time - best-effort only there.
const VLAN_TABLE = [
  { key: 'lan',   field: 'LAN_VLAN_ID',    def: 1,  max: 255  },
  { key: 'guest', field: 'GUEST_VLAN_ID',  def: 5,  max: 255,  flag: 'GUEST_ENABLE' },
  { key: 'iot',   field: 'IOT_VLAN_ID',    def: 10, max: 255,  flag: 'IOT_ENABLE'   },
  { key: 'wg',    field: 'LAN_WG_VLAN_ID', def: 15, max: 255,  flag: 'WG_ENABLE'    },
  { key: 'wan',   field: 'WAN_VLAN_ID',    def: 20, max: 4094, wan: true },
  { key: 'wanb',  field: 'WAN_B_VLAN_ID',  def: 21, max: 4094, wan: true, flag: 'WAN_B_ENABLE' },
];

/**
 * Map of CSS class -> whether elements with that class should be hidden.
 * The view toggles `.hidden` on `.<class>` elements accordingly.
 * @param {Config} cfg
 * @returns {Record<string, boolean>}
 */
export function deriveVisibility(cfg) {
  const ap = on(cfg, 'AP_MODE');
  const iot = on(cfg, 'IOT_ENABLE');
  const guest = on(cfg, 'GUEST_ENABLE');
  const wg = on(cfg, 'WG_ENABLE');
  const hasKeys = String(cfg.SSH_PUBLIC_KEY || '').trim().length > 0;
  const feedCount = String(cfg.BANIP_FEEDS || '').trim().split(/\s+/).filter(Boolean).length;
  const countryCount = String(cfg.BANIP_COUNTRY_LIST || '').trim().split(/\s+/).filter(Boolean).length;
  // WG client config present but the VPN is off (config would be dropped at build).
  const wgConfigEntered = WG_CLIENT_FIELDS.some(k => String(cfg[k] || '').trim() !== '');
  return {
    'router-only': ap,
    'ap-only': !ap,
    'banip-multi-feed': feedCount <= 1 && countryCount <= 1,
    'pppoe-only': cfg.wan_type !== 'pppoe',
    'wifi-iot': !iot,
    'wifi-guest': !guest,
    // Dense-env tightens usteer thresholds, which only run with 802.11k/v.
    'dense-env-only': !on(cfg, 'DOT11KV'),
    // Guest isolation is meaningless in Per-VLAN PSK mode (one shared SSID).
    'guest-isolate-only': !guest || on(cfg, 'PSK_VLAN'),
    // The Per-VLAN PSK note only applies when that mode is on.
    'psk-vlan-only': !on(cfg, 'PSK_VLAN'),
    // "AdGuard Home as main DNS resolver" only applies in AdGuard Home mode.
    'adguard-main-only': !isAdguard(cfg.DNS_MODE),
    // AdGuard Home RAM-requirement note only shows in AdGuard Home mode.
    'adguard-only': !isAdguard(cfg.DNS_MODE),
    // IoT internet access and route-via-WG are L3 decisions that do not exist in
    // AP mode (IoT is L2-only there), so hide these two when AP mode is on too.
    // Each class is used only for its one control block.
    'iot-internet-only': !iot || ap,
    'iot-wg-only': !(iot && wg) || ap,
    'wifi-wg': !wg,
    'wg-off-notice': wg || ap || !wgConfigEntered,
    'wg-help-router': ap,
    'ssh-pw-row': !hasKeys,
    'mesh-only': !(on(cfg, 'WIRELESS_MESH') || on(cfg, 'WIRELESS_MESH_2G')),
    // BATMAN_ALL_VLAN only makes sense once batman-adv is on over an active mesh.
    'batman-only': !(on(cfg, 'BATMAN_ADV') && (on(cfg, 'WIRELESS_MESH') || on(cfg, 'WIRELESS_MESH_2G'))),
    'dot11r-only': !on(cfg, 'DOT11R'),
    'dnsmasq-multi-only': !on(cfg, 'DNSMASQ_MULTI_INSTANCE'),
    // No 'wan-tagged-only': the WAN VLAN id is NOT conditional on WAN_IS_TAGGED.
    // wrtnova.sh takes wan_vid=${WAN_VLAN_ID:-20} unconditionally, and on a
    // single-NIC board it forces WAN_IS_TAGGED=1 itself ([ -z "$wan_port" ]),
    // so the field can matter even with the toggle off - hiding it would hide a
    // value the user still has to set. Mirror vlanParticipates(), not the toggle.
    'wan-b-only': !on(cfg, 'WAN_B_ENABLE'),
  };
}

/**
 * Per-network derived view: on/off state, effective prefix/vlan/subnet, and the
 * derived router IP pieces. AP mode gives LAN the AP index as last octet and
 * suppresses IPs on guest/iot/wg (proto=none).
 * @param {Config} cfg
 * @returns {Array<{ key: string, on: boolean, basePfx: string, defSub: string,
 *   effPfx: string, effVid: string, effSub: string, hasIp: boolean, lastOct: string }>}
 */
export function deriveNetRows(cfg) {
  const ap = on(cfg, 'AP_MODE');
  const basePfx = String(cfg.BASE_NET_PREFIX || '') || '192.168';
  const defSub = String(cfg.DEFAULT_SUBNET || '') || '/24';
  const byKey = resolveVlanAssignment(cfg).byKey;
  return NETS.map((n) => {
    const isLan = n.key === 'lan';
    const rowOn = isLan || on(cfg, n.on);
    const effPfx = String(cfg[n.pfx] || '').trim() || basePfx;
    // Resolved vid for enabled rows; disabled (greyed) rows show their
    // typed-or-default vid cosmetically (they participate in nothing, emit '').
    const a = byKey[n.key];
    const effVid = a.participates && a.vid != null
      ? String(a.vid)
      : (String(cfg[n.vid] || '').trim() || n.defVid);
    const effSub = String(cfg[n.sub] || '') || defSub;
    const hasIp = !!(rowOn && effVid && (!ap || isLan));
    const lastOct = (ap && isLan) ? (String(cfg.AP_INDEX || '') || '2') : '1';
    return { key: n.key, on: rowOn, basePfx, defSub, effPfx, effVid, effSub, hasIp, lastOct };
  });
}

/**
 * Parse the ADDITIONAL_VLAN_LIST trunk tokens ("5 10-12 20") into a VID set.
 * @param {string} list
 * @returns {Set<number>}
 */
function trunkVids(list) {
  const set = new Set();
  String(list || '').trim().split(/\s+/).forEach((tok) => {
    const rng = tok.match(/^(\d+)-(\d+)$/);
    if (rng) { for (let v = +rng[1]; v <= +rng[2]; v++) set.add(v); }
    else if (/^\d+$/.test(tok)) set.add(+tok);
  });
  return set;
}

/**
 * Whether a VLAN-table row participates in (contributes a VLAN to) this config:
 * lan always; guest/iot/wg on their enable flag; wan router-only; wanb router +
 * WAN_B_ENABLE. Non-participating rows reserve nothing and emit ''.
 * @param {Config} cfg
 * @param {(typeof VLAN_TABLE)[number]} row
 * @returns {boolean}
 */
function vlanParticipates(cfg, row) {
  if (row.key === 'lan') return true;
  if (row.wan && on(cfg, 'AP_MODE')) return false;   // WAN/WAN-B excluded in AP mode
  if (row.flag) return on(cfg, row.flag);
  return true;                                        // wan in router mode
}

/**
 * Frontend-owned VLAN allocator. Typed values are fixed anchors; every untouched
 * (default) field is auto-assigned to the lowest free id at/above its natural
 * default, skipping anchors, already-assigned ids, and trunk VLANs. This mirrors
 * the INTENT of wrtnova.sh resolve_vlans but does it up front so the emitted
 * config is already conflict-free (the backend function becomes a no-op).
 *
 * conflict flags are the ONLY cases that block a build:
 *  - anchorCollision: two participating user-typed ids are equal (ambiguous)
 *  - trunkCollision:  a participating anchor lands on a trunk VLAN (autos bump
 *                     away, so only an explicit anchor can collide with trunk)
 *  - exhausted:       an auto field found no free id in 1..max
 *
 * @param {Config} cfg
 * @returns {{ byKey: Record<string, { vid: number|null, userSet: boolean,
 *   participates: boolean, def: number, exhausted: boolean }>,
 *   conflict: { anchorCollision: boolean, trunkCollision: boolean, exhausted: boolean } }}
 */
export function resolveVlanAssignment(cfg) {
  const trunk = trunkVids(cfg.ADDITIONAL_VLAN_LIST || '');
  const conflict = { anchorCollision: false, trunkCollision: false, exhausted: false };

  // Pass 1: classify each field as anchor (valid typed value) or auto.
  const entries = VLAN_TABLE.map((row) => {
    const raw = String(cfg[row.field] || '').trim();
    const num = /^\d+$/.test(raw) ? +raw : NaN;
    const valid = Number.isFinite(num) && num >= 1 && num <= row.max;
    return { row, part: vlanParticipates(cfg, row), userSet: valid, anchor: valid ? num : null };
  });

  // Reserve participating anchors + trunk; flag anchor/trunk collisions.
  const reserved = new Set(trunk);
  const anchorSeen = new Set();
  for (const e of entries) {
    if (!e.part || !e.userSet) continue;
    if (anchorSeen.has(e.anchor)) conflict.anchorCollision = true;
    anchorSeen.add(e.anchor);
    if (trunk.has(e.anchor)) conflict.trunkCollision = true;
    reserved.add(e.anchor);
  }

  // Pass 2: allocate the auto (untouched) fields around the reserved set.
  /** @type {Record<string, { vid: number|null, userSet: boolean, participates: boolean, def: number, exhausted: boolean }>} */
  const byKey = {};
  for (const e of entries) {
    const { key, def, max } = e.row;
    if (!e.part) { byKey[key] = { vid: null, userSet: e.userSet, participates: false, def, exhausted: false }; continue; }
    if (e.userSet) { byKey[key] = { vid: e.anchor, userSet: true, participates: true, def, exhausted: false }; continue; }
    let pick = null;
    for (let v = def; v <= max && pick === null; v++) if (!reserved.has(v)) pick = v;
    for (let v = 1; v < def && pick === null; v++) if (!reserved.has(v)) pick = v;
    const exhausted = pick === null;
    if (exhausted) { conflict.exhausted = true; pick = def; }
    else reserved.add(pick);
    byKey[key] = { vid: pick, userSet: false, participates: true, def, exhausted };
  }

  return { byKey, conflict };
}

/**
 * The VLAN id strings to emit for each of the six fields: the resolved value when
 * it participates and differs from the field's natural default, else '' (so we
 * never write a redundant default - Section 1 invariant). Consumed by the two
 * emit paths (builder-config.mjs deriveConfig, config-merge.mjs mergeNodeConfig).
 * @param {Config} cfg
 * @returns {Record<string, string>}
 */
export function resolveVlanEmit(cfg) {
  const { byKey } = resolveVlanAssignment(cfg);
  /** @type {Record<string, string>} */
  const out = {};
  for (const row of VLAN_TABLE) {
    const a = byKey[row.key];
    out[row.field] = (a.participates && a.vid != null && a.vid !== a.def) ? String(a.vid) : '';
  }
  return out;
}

/**
 * True only for genuine, unresolvable VLAN conflicts (anchor-vs-anchor,
 * anchor-vs-trunk, or allocation exhaustion). A default field colliding with an
 * anchor/trunk is auto-allocated, not a conflict.
 * @param {Config} cfg
 * @returns {boolean}
 */
export function detectVlanConflict(cfg) {
  const { conflict } = resolveVlanAssignment(cfg);
  return conflict.anchorCollision || conflict.trunkCollision || conflict.exhausted;
}

/** Max VLAN table slots on a swconfig switch (see isSwconfigTarget). */
export const SWCONFIG_VLAN_MAX = 16;

/**
 * OpenWrt targets whose built-in switch is driven by swconfig and exposes only a
 * 16-entry hardware VLAN table: ath79 (all subtargets), ramips/mt7620,
 * ramips/mt76x8. Each add_vlan in wrtnova.sh consumes one slot. ramips/mt7621 is
 * DSA (bridge-vlan, no such limit) and is deliberately excluded.
 * @param {string} target  e.g. "ath79/generic", "ramips/mt7620"
 * @returns {boolean}
 */
export function isSwconfigTarget(target) {
  const t = String(target || '');
  return t.startsWith('ath79/') || t === 'ramips/mt7620' || t === 'ramips/mt76x8';
}

/**
 * Hardware VLAN slots the base networks (lan/guest/iot/wg/wan/wanb) consume -
 * one per participating add_vlan call. Trunk VLANs take one slot each on top.
 * @param {Config} cfg
 * @returns {number}
 */
export function countBaseVlanSlots(cfg) {
  return VLAN_TABLE.reduce((n, row) => n + (vlanParticipates(cfg, row) ? 1 : 0), 0);
}

// Compress an ascending unique VID list into "low-high" range tokens.
function compressVids(sorted) {
  const out = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(i === j ? String(sorted[i]) : sorted[i] + '-' + sorted[j]);
    i = j + 1;
  }
  return out.join(' ');
}

/**
 * Fit ADDITIONAL_VLAN_LIST to a swconfig switch's SWCONFIG_VLAN_MAX slots: base
 * networks reserve countBaseVlanSlots(cfg), the rest is the trunk budget. Keeps
 * the first `budget` trunk VLANs (typed order), drops the overflow, re-emits both
 * range-compressed. Unchanged on DSA / empty / within-budget (truncated: false).
 * @param {Config} cfg
 * @param {string} target
 * @returns {{ list: string, dropped: string, truncated: boolean, budget: number }}
 */
export function truncateAdditionalVlans(cfg, target) {
  const raw = String((cfg && cfg.ADDITIONAL_VLAN_LIST) || '').trim();
  if (!isSwconfigTarget(target) || !raw) {
    return { list: raw, dropped: '', truncated: false, budget: SWCONFIG_VLAN_MAX };
  }

  // Expand to individual VIDs in typed order, unique (dupes reserve no slot).
  const seen = new Set();
  const vids = [];
  for (const tok of raw.split(/\s+/)) {
    const rng = tok.match(/^(\d+)-(\d+)$/);
    if (rng) {
      for (let v = +rng[1]; v <= +rng[2]; v++) if (!seen.has(v)) { seen.add(v); vids.push(v); }
    } else if (/^\d+$/.test(tok)) {
      const v = +tok;
      if (!seen.has(v)) { seen.add(v); vids.push(v); }
    }
  }

  const budget = Math.max(0, SWCONFIG_VLAN_MAX - countBaseVlanSlots(cfg));
  if (vids.length <= budget) {
    return { list: raw, dropped: '', truncated: false, budget };
  }

  const kept = vids.slice(0, budget).sort((a, b) => a - b);
  const dropped = vids.slice(budget).sort((a, b) => a - b);
  return { list: compressVids(kept), dropped: compressVids(dropped), truncated: true, budget };
}
