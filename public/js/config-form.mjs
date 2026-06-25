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

// -- Field schema ------------------------------------------------------------
// Each descriptor is [key, kind, opt?, radioDefault?]:
//   text|checkbox  : key === control id
//   radio          : key === input name; radioDefault is the write-side fallback
//   select         : opt === control id (when it differs from the config key)
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
  ['__tz__', 'tz'],
  ['BASE_NET_PREFIX', 'text'], ['DEFAULT_SUBNET', 'text'],
  ['LAN_BASE_PREFIX', 'text'], ['LAN_VLAN_ID', 'text'], ['LAN_SUBNET', 'text'],
  ['GUEST_ENABLE', 'checkbox'], ['GUEST_BASE_PREFIX', 'text'], ['GUEST_VLAN_ID', 'text'], ['GUEST_SUBNET', 'text'],
  ['IOT_ENABLE', 'checkbox'], ['IOT_BASE_PREFIX', 'text'], ['IOT_VLAN_ID', 'text'], ['IOT_SUBNET', 'text'],
  ['IOT_INTERNET', 'checkbox'], ['IOT_ROUTE_VIA_WG', 'checkbox'],
  ['WG_ENABLE', 'checkbox'], ['LAN_WG_BASE_PREFIX', 'text'], ['LAN_WG_VLAN_ID', 'text'], ['LAN_WG_SUBNET', 'text'],
  ['ADDITIONAL_VLAN_LIST', 'text'],
  ['P_STEERING', 'select'], ['ULA_PREFIX', 'text'],
  ['WG_PRIVATE_KEY', 'text'], ['PEER_PUBLIC_KEY', 'text'], ['ENDPOINT', 'text'], ['ENDPOINT_PORT', 'text'],
  ['PRESHARED_KEY', 'text'], ['WG_IPV4', 'text'], ['WG_IPV6', 'text'],
  ['WG_DNS_V4', 'text'], ['WG_DNS_V6', 'text'], ['ALLOWED_IPS', 'text'],
  ['wan_type', 'radio', undefined, 'dhcp'], ['PPPOE_USERNAME', 'text'], ['PPPOE_PASSWD', 'text'],
  ['WAN_MAC_ADDR', 'text'], ['WAN_IS_TAGGED', 'checkbox'], ['WAN_VLAN_ID', 'text'],
  ['WAN_B_ENABLE', 'checkbox'], ['WAN_B_VLAN_ID', 'text'], ['BRIDGE_WAN_PORT', 'checkbox'],
  ['COUNTRY_CODE', 'country'],
  ['DENSE_ENV', 'checkbox'], ['WIRELESS_MESH', 'checkbox'],
  ['MESH_ID', 'text'], ['MESH_PASSWD', 'text'],
  ['LAN_WIFI_SSID', 'text'], ['LAN_WIFI_PASSWD', 'text'],
  ['GUEST_WIFI_SSID', 'text'], ['GUEST_WIFI_PASSWD', 'text'], ['GUEST_ISOLATE', 'checkbox'],
  ['IOT_WIFI_SSID', 'text'], ['IOT_WIFI_PASSWD', 'text'],
  ['LAN_WG_WIFI_SSID', 'text'], ['LAN_WG_WIFI_PASSWD', 'text'],
  ['CHANNEL_2G', 'select'], ['CHANNEL_5G', 'select'], ['CHANNEL_6G', 'select'], ['WIFI_LOG_LVL', 'select'],
  ['WIFI_KVR', 'checkbox'],
  ['PORT_FORWARD_LIST', 'table', 'portfwd'], ['IPV6_SERVER_LIST', 'table', 'ipv6'],
  ['DDNS_ENABLE', 'checkbox'], ['LOOKUP_HOSTNAME', 'text'], ['CLOUDFLARE_API_KEY', 'text'],
  ['USB_TETHERING', 'checkbox'], ['CELLULAR_MODEM', 'checkbox'],
  ['DNS_MODE', 'radio', undefined, 'adguardhome'], ['ADGUARD_MAIN_DNS', 'checkbox'], ['BLOCK_DOT_DOQ', 'checkbox'],
  ['BLOCK_DOH', 'checkbox'], ['BANIP_COUNTRY_LIST', 'text'],
  ['DOH_UPSTREAMS', 'text'], ['BOOTSTRAP_DNS', 'text'],
  ['DENY_GUEST_NIGHT', 'checkbox'], ['QUARTERLY_REBOOT', 'checkbox'], ['LOG', 'checkbox'],
  ['SOFTWARE_OFFLOAD', 'checkbox'], ['HARDWARE_OFFLOAD', 'checkbox'],
  // Not a config key (deriveConfig never emits it); carried in the store as a raw
  // passthrough so editing extras re-renders the final package list.
  ['additional_packages', 'text'],
]);

export const BUILDER_SCHEMA = /** @type {[string,string,(string|undefined)?,(string|undefined)?][]} */ ([
  ...BASE_SCHEMA, ['AP_MODE', 'radio'], ['AP_INDEX', 'text'], ['NON_CT_ATH10K', 'checkbox'],
]);

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
      case 'radio':    out[key] = radioVal(key); break;
      case 'select':   out[key] = selectVal(opt || key); break;
      case 'country':  out[key] = textVal(key).toUpperCase(); break;
      case 'tz':       Object.assign(out, ui.collectTimezone()); break;
      case 'table':    out[key] = ui.serializeRows(opt); break;
    }
  }
  return out;
}

// -- Key-kind sets (for the patch-style write inverse on /builder) -----------
export function keySets(schema) {
  const radio = new Set(), checkbox = new Set();
  for (const [key, kind] of schema) {
    if (kind === 'radio') radio.add(key);
    else if (kind === 'checkbox') checkbox.add(key);
  }
  return { radio, checkbox };
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
    else el.value = cfg[key] || '';
  }
}
