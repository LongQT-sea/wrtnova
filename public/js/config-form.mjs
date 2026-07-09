// @ts-check
// Shared form read/write boundary for the config editor used by BOTH /builder
// (build.js) and /networks (networks.js). One ordered field schema drives the
// DOM<->config translation, so the field list lives in exactly ONE place (SPEC
// Section 0 "Shared Logic: One Definition") - the two pages previously
// hand-mirrored it (readRawForm vs readConfig; renderConfigToDom vs loadConfig),
// which is precisely how copies drift.
//
// This module TOUCHES THE DOM, so it is a browser module imported directly by
// build.js / networks.js, not one of the pure typed .mjs. Gating/derivation
// stays elsewhere: deriveConfig (builder-config.mjs) and mergeNodeConfig
// (config-merge.mjs) consume the raw object readForm() produces; timezone +
// dynamic tables resolve via ui.collectTimezone / ui.serializeRows (published by
// tzdata.js / ui.js before readForm/writeForm ever run).

import { ui } from './ui-ns.mjs';

const $ = (sel, root) => (root || document).querySelector(sel);

// -- Read primitives: DOM control -> normalized string ('' / '1' / value) ----
export const checkboxVal = (id)   => { const el = $('#' + id); return el && el.checked ? '1' : ''; };
export const textVal     = (id)   => ($('#' + id) || {}).value || '';
export const radioVal    = (name) => ($('input[name="' + name + '"]:checked') || {}).value || '';
export const selectVal   = (id)   => ($('#' + id) || {}).value || '';
export const SUBNET_KEYS = new Set(['LAN_SUBNET', 'GUEST_SUBNET', 'IOT_SUBNET', 'LAN_WG_SUBNET']);
export const subnetVal   = (id)   => { const el = $('#' + id); return el && el.dataset.explicit ? (el.value || '') : ''; };
export function writeSubnet(el, val) {
  if (val) { el.value = val; el.dataset.explicit = '1'; }  // explicit override
  else delete el.dataset.explicit;                         // re-anchor
}

// -- Field schema ------------------------------------------------------------
// Each descriptor is [key, kind, opt?, radioDefault?]:
//   text|checkbox  : key === control id
//   radio          : key === input name; radioDefault is the write-side fallback
//   select         : opt === control id (when it differs from the config key)
//   subnet         : per-network subnet select; '' when anchored (see subnetVal)
//   country        : text + .toUpperCase()
//   tz             : emits ZONE_NAME + TIME_ZONE via ui.collectTimezone()
//   table          : opt === table kind for ui.serializeRows (write: page loads it)
// BASE_SCHEMA is the shared config (SPEC Section 1) in canonical contract order;
// it is also the exact order /networks readConfig produced, so the /networks
// store stays byte-identical. Pages compose it with their own extras:
//   /networks: [shared_version select, ...BASE_SCHEMA]
//   /builder : [...BASE_SCHEMA, AP_MODE, AP_INDEX, NON_CT_ATH10K] (device fields)
export const BASE_SCHEMA = /** @type {[string,string,(string|undefined)?,(string|undefined)?][]} */ ([
  ['HOST_NAME', 'text'], ['ROOT_PASSWD', 'text'], ['SSH_PUBLIC_KEY', 'text'],
  ['SSH_PASSWD_AUTH', 'radio', undefined, ''],
  ['__tz__', 'tz'], ['TIME_FORMAT', 'radio', undefined, ''],
  ['BASE_NET_PREFIX', 'text'], ['DEFAULT_SUBNET', 'text'],
  ['LAN_BASE_PREFIX', 'text'], ['LAN_IFACE', 'text'], ['LAN_VLAN_ID', 'text'], ['LAN_SUBNET', 'subnet'],
  ['GUEST_ENABLE', 'checkbox'], ['GUEST_BASE_PREFIX', 'text'], ['GUEST_IFACE', 'text'], ['GUEST_VLAN_ID', 'text'], ['GUEST_SUBNET', 'subnet'],
  ['IOT_ENABLE', 'checkbox'], ['IOT_BASE_PREFIX', 'text'], ['IOT_IFACE', 'text'], ['IOT_VLAN_ID', 'text'], ['IOT_SUBNET', 'subnet'],
  ['IOT_INTERNET', 'checkbox'], ['IOT_ROUTE_VIA_WG', 'checkbox'],
  ['WG_ENABLE', 'checkbox'], ['LAN_WG_BASE_PREFIX', 'text'], ['LAN_WG_IFACE', 'text'], ['LAN_WG_VLAN_ID', 'text'], ['LAN_WG_SUBNET', 'subnet'],
  ['ADDITIONAL_VLAN_LIST', 'text'], ['TAGGED_LAN_VLAN', 'checkbox'],
  ['P_STEERING', 'select'], ['ULA_PREFIX', 'text'],
  ['WG_PRIVATE_KEY', 'text'], ['PEER_PUBLIC_KEY', 'text'], ['ENDPOINT', 'text'], ['ENDPOINT_PORT', 'text'],
  ['PRESHARED_KEY', 'text'], ['WG_IPV4', 'text'], ['WG_IPV6', 'text'],
  ['WG_DNS_V4', 'text'], ['WG_DNS_V6', 'text'], ['ALLOWED_IPS', 'text'],
  ['wan_type', 'radio', undefined, 'dhcp'], ['PPPOE_USERNAME', 'text'], ['PPPOE_PASSWD', 'text'],
  ['WAN_MAC_ADDR', 'text'], ['WAN_IS_TAGGED', 'checkbox'], ['WAN_VLAN_ID', 'text'],
  ['WAN_B_ENABLE', 'checkbox'], ['WAN_B_VLAN_ID', 'text'], ['BRIDGE_WAN_PORT', 'checkbox'],
  ['COUNTRY_CODE', 'country'],
  ['DENSE_ENV', 'checkbox'], ['WIRELESS_MESH', 'checkbox'], ['BRIDGE_STP', 'checkbox'],
  ['MESH_ID', 'text'], ['MESH_PASSWD', 'text'],
  ['LAN_WIFI_SSID', 'text'], ['LAN_WIFI_PASSWD', 'text'],
  ['GUEST_WIFI_SSID', 'text'], ['GUEST_WIFI_PASSWD', 'text'], ['GUEST_ISOLATE', 'checkbox'],
  ['IOT_WIFI_SSID', 'text'], ['IOT_WIFI_PASSWD', 'text'], ['IOT_NO_DOT11R', 'checkbox-inv'],
  ['LAN_WG_WIFI_SSID', 'text'], ['LAN_WG_WIFI_PASSWD', 'text'],
  ['CHANNEL_2G', 'select'], ['CHANNEL_5G', 'select'], ['CHANNEL_6G', 'select'], ['WIFI_LOG_LVL', 'select'],
  ['DOT11KV', 'checkbox'], ['DOT11R', 'checkbox'], ['PSK_VLAN', 'checkbox'], ['BAND_SUFFIX', 'checkbox'],
  ['PORT_FORWARD_LIST', 'table', 'portfwd'], ['IPV6_SERVER_LIST', 'table', 'ipv6'],
  ['DDNS_ENABLE', 'checkbox'], ['LOOKUP_HOSTNAME', 'text'], ['CLOUDFLARE_API_KEY', 'text'],
  ['USB_TETHERING', 'checkbox'], ['CELLULAR_MODEM', 'checkbox'],
  ['DNS_MODE', 'radio', undefined, 'https-dns-proxy'], ['ADGUARD_MAIN_DNS', 'checkbox'], ['BLOCK_DOT_DOQ', 'checkbox'],
  ['BLOCK_DOH', 'checkbox'], ['FORCE_DNS', 'checkbox'], ['BANIP_COUNTRY_LIST', 'text'], ['BANIP_FEEDS', 'text'],
  ['DOH_UPSTREAMS', 'text'], ['BOOTSTRAP_DNS', 'text'], ['DNSMASQ_MULTI_INSTANCE', 'checkbox'],
  ['DENY_GUEST_NIGHT', 'checkbox'], ['QUARTERLY_REBOOT', 'checkbox'], ['LOG', 'checkbox'],
  ['SOFTWARE_OFFLOAD', 'checkbox'], ['HARDWARE_OFFLOAD', 'checkbox'], ['IRQBALANCE', 'checkbox'],
  ['LUCI_HTTPS', 'checkbox'],
  // Not a config key (deriveConfig never emits it); carried in the store as a raw
  // passthrough so editing extras re-renders the final package list.
  ['additional_packages', 'text'],
]);

export const BUILDER_SCHEMA = /** @type {[string,string,(string|undefined)?,(string|undefined)?][]} */ ([
  ...BASE_SCHEMA, ['AP_MODE', 'radio'], ['AP_INDEX', 'text'], ['NON_CT_ATH10K', 'checkbox'], ['WED_ENABLE', 'checkbox'],
]);

// Interface-name fields guard (Network card). Empty means "use the wrtnova.sh
// default" (lan/guest/iot/lan_vpn).
export const IFACE_FIELDS = ['LAN_IFACE', 'GUEST_IFACE', 'IOT_IFACE', 'LAN_WG_IFACE'];
export const IFACE_RE = /^[A-Za-z0-9_]{1,15}$/;
export function ifaceValid(v) { return !v || IFACE_RE.test(v); }

// IP-prefix fields (first two octets, e.g. "192.168"). Empty means "use the
// wrtnova.sh default". Only the two octets' numeric range (0-255) is checked;
// no RFC1918 restriction, so users with a real (public/ASN) range are allowed.
export const PREFIX_FIELDS = ['BASE_NET_PREFIX', 'LAN_BASE_PREFIX', 'GUEST_BASE_PREFIX', 'IOT_BASE_PREFIX', 'LAN_WG_BASE_PREFIX'];
export const PREFIX_RE = /^(\d{1,3})\.(\d{1,3})$/;
export function prefixValid(v) {
  if (!v) return true;
  const m = PREFIX_RE.exec(v);
  return !!m && +m[1] <= 255 && +m[2] <= 255;
}

// Per-VLAN PSK (PSK_VLAN): one shared SSID where the password a client types
// decides which VLAN it lands on, so the participating networks must have
// distinct WiFi passwords. Participants are LAN (always), Guest and VPN when
// enabled, and IoT when enabled unless IOT_NO_DOT11R keeps it on its own SSID
// (matches wrtnova.sh add_wifi_iface: IoT joins the LAN SSID VLAN only when
// IOT_NO_DOT11R is off). A blank field resolves to the shared default
// (wrtnova.sh def_pass, 12345678), so at most one participant may be blank; two
// blanks collide. With fewer than two participants there is nothing to steer
// between, so no check is needed. Returns null when OK, else { networks } listing
// the enabled participants (for the error message). Reads raw (untrimmed) values
// to match what the build emits (see textVal).
export function pskVlanPassIssue(cfg) {
  if (cfg.PSK_VLAN !== '1') return null;
  const parts = [
    { label: 'LAN',   pass: cfg.LAN_WIFI_PASSWD    || '', active: true },
    { label: 'Guest', pass: cfg.GUEST_WIFI_PASSWD  || '', active: cfg.GUEST_ENABLE === '1' },
    { label: 'VPN',   pass: cfg.LAN_WG_WIFI_PASSWD || '', active: cfg.WG_ENABLE === '1' },
    { label: 'IoT',   pass: cfg.IOT_WIFI_PASSWD    || '', active: cfg.IOT_ENABLE === '1' && cfg.IOT_NO_DOT11R !== '1' },
  ].filter((p) => p.active);
  if (parts.length < 2) return null;
  const def = cfg.DEFAULT_WIFI_PASSWD || '12345678';
  const eff = parts.map((p) => p.pass || def);
  return new Set(eff).size === eff.length ? null : { networks: parts.map((p) => p.label) };
}

// -- DOM -> raw config object ------------------------------------------------
// Normalized once at the boundary (checkboxes ''/'1', COUNTRY_CODE uppercased,
// tz + dynamic tables resolved). No cross-field gating. Keys are emitted in
// schema order so the resulting object is byte-stable.
export function readForm(schema) {
  const out = {};
  for (const [key, kind, opt] of schema) {
    switch (kind) {
      case 'text':     out[key] = textVal(key); break;
      case 'checkbox': out[key] = checkboxVal(key); break;
      // Inverted checkbox: the control shows the positive ("IoT: 802.11r", default
      // on) but the config key is the negative (IOT_NO_DOT11R). Unchecked -> '1'.
      case 'checkbox-inv': out[key] = checkboxVal(key) ? '' : '1'; break;
      case 'radio':    out[key] = radioVal(key); break;
      case 'select':   out[key] = selectVal(opt || key); break;
      case 'subnet':   out[key] = subnetVal(key); break;
      case 'country':  out[key] = textVal(key).toUpperCase(); break;
      case 'tz':       Object.assign(out, ui.collectTimezone()); break;
      case 'table':    out[key] = ui.serializeRows(opt); break;
    }
  }
  return out;
}

// -- Key-kind sets (for the patch-style write inverse on /builder) -----------
export function keySets(schema) {
  const radio = new Set(), checkbox = new Set(), invCheckbox = new Set();
  for (const [key, kind] of schema) {
    if (kind === 'radio') radio.add(key);
    else if (kind === 'checkbox') checkbox.add(key);
    // Inverted checkboxes are still checkbox controls (in `checkbox`), but the
    // store->DOM patch must invert the checked state, so track them separately.
    else if (kind === 'checkbox-inv') { checkbox.add(key); invCheckbox.add(key); }
  }
  return { radio, checkbox, invCheckbox };
}

// -- config -> DOM (full render, the /networks loadConfig per-field loop) -----
// Writes every simple field (text/select/checkbox/radio/country) from cfg. tz +
// table fields are page-orchestrated (setTimezone / loadTable) and skipped here.
export function writeForm(schema, cfg) {
  for (const [key, kind, opt, def] of schema) {
    if (kind === 'tz' || kind === 'table') continue;
    if (kind === 'radio') {
      const v = cfg[key] || def || '';
      document.querySelectorAll('input[name="' + key + '"]').forEach(r => { r.checked = r.value === v; });
      continue;
    }
    const id = kind === 'select' ? (opt || key) : key;
    const el = document.getElementById(id);
    if (!el) continue;
    if (kind === 'checkbox') el.checked = cfg[key] === '1' || cfg[key] === true;
    else if (kind === 'checkbox-inv') el.checked = !(cfg[key] === '1' || cfg[key] === true);
    else if (kind === 'subnet') writeSubnet(el, cfg[key] || '');
    else el.value = cfg[key] || '';
  }
}
