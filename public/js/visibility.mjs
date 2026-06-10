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
  const wgRouter = wg && !ap;
  const hasKeys = String(cfg.SSH_PUBLIC_KEY || '').trim().length > 0;
  return {
    'router-only': ap,
    'ap-only': !ap,
    'pppoe-only': cfg.wan_type !== 'pppoe',
    'iot-only': !iot,
    'wifi-iot': !iot,
    'wifi-guest': !guest,
    'iot-wg-only': !(iot && wg),
    'wifi-wg': !wg,
    'wg-only': !wgRouter,
    'wg-help-router': ap,
    'ssh-pw-row': !hasKeys,
    'mesh-only': !on(cfg, 'WIRELESS_MESH'),
    'wan-tagged-only': !on(cfg, 'WAN_IS_TAGGED'),
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
  return NETS.map((n) => {
    const isLan = n.key === 'lan';
    const rowOn = isLan || on(cfg, n.on);
    const effPfx = String(cfg[n.pfx] || '').trim() || basePfx;
    const effVid = String(cfg[n.vid] || '').trim() || n.defVid;
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
 * True when two enabled networks (or trunk/WAN VLANs) collide on a VLAN id.
 * Mirrors the order the view counted them: WAN/WAN_B (router only) first, then
 * lan/guest/iot/wg.
 * @param {Config} cfg
 * @returns {boolean}
 */
export function detectVlanConflict(cfg) {
  const ap = on(cfg, 'AP_MODE');
  const trunk = trunkVids(cfg.ADDITIONAL_VLAN_LIST || '');
  const seen = new Set();
  let dup = false;
  const count = (vid) => {
    if (seen.has(vid) || trunk.has(vid)) dup = true;
    seen.add(vid);
  };

  if (!ap) {
    count(+(cfg.WAN_VLAN_ID || '') || 20);
    if (on(cfg, 'WAN_B_ENABLE')) count(+(cfg.WAN_B_VLAN_ID || '') || 21);
  }
  for (const n of NETS) {
    const rowOn = n.key === 'lan' || on(cfg, n.on);
    const effVid = String(cfg[n.vid] || '').trim() || n.defVid;
    if (rowOn && effVid) count(+effVid);
  }
  return dup;
}
