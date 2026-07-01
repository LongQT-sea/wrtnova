// @ts-check
// Single typed Config contract (Section 0 "Typing Policy"), derived from
// Section 1's variable dictionary. This is the shape the store holds, the
// shared modules consume/produce, and the build payload carries. Every value
// is a string: checkboxes normalize to '' (off) or '1' (on) - never '0' - and
// text/select fields carry their raw string. Keys are optional because callers
// routinely pass partial configs (per-node overrides, raw form snapshots); a
// fully-derived config has them all present.
//
// The metadata sets (SENSITIVE_KEYS, BUILD_ONLY_KEYS) encode strip/skip rules
// as data so they are checkable, not prose. BUILD_ONLY_KEYS lives in
// render-config.mjs (the renderer is its primary consumer) and is re-exported
// here so the contract has one import surface.

export { BUILD_ONLY_KEYS } from './render-config.mjs';

/**
 * Keys the masked preview renders as '****' and which are stripped from saved
 * build history so secrets are never persisted in plaintext. Single source for
 * ui.SENSITIVE_FIELDS.
 * @type {ReadonlySet<string>}
 */
export const SENSITIVE_KEYS = new Set([
  'ROOT_PASSWD', 'PPPOE_PASSWD',
  'LAN_WIFI_PASSWD', 'GUEST_WIFI_PASSWD', 'IOT_WIFI_PASSWD', 'LAN_WG_WIFI_PASSWD',
  'MESH_PASSWD',
  'WG_PRIVATE_KEY', 'PEER_PUBLIC_KEY', 'PRESHARED_KEY',
  'ENDPOINT', 'ENDPOINT_PORT', 'WG_IPV4', 'WG_IPV6', 'ALLOWED_IPS',
  'CLOUDFLARE_API_KEY', 'ADGUARD_PASSWD',
]);

/**
 * The WrtNova firmware config. All values are strings; boolean flags are ''
 * (off) or '1' (on). DNS_MODE and NON_CT_ATH10K are BUILD-ONLY (consumed for
 * package resolution, never emitted into wrtnova.sh). wan_type is a gating-only
 * helper read by deriveConfig and never emitted.
 *
 * @typedef {Object} Config
 * @property {string} [AP_MODE]            '1' = access point, '' = router
 * @property {string} [AP_INDEX]           LAN host octet for an AP (2-254)
 * @property {string} [HOST_NAME]
 * @property {string} [ROOT_PASSWD]        sensitive
 * @property {string} [SSH_PUBLIC_KEY]
 * @property {string} [SSH_PASSWD_AUTH]
 * @property {string} [ZONE_NAME]
 * @property {string} [TIME_ZONE]
 * @property {string} [wan_type]           gating-only: 'dhcp' | 'pppoe' (not emitted)
 * @property {string} [PPPOE_USERNAME]
 * @property {string} [PPPOE_PASSWD]       sensitive
 * @property {string} [WAN_MAC_ADDR]
 * @property {string} [WAN_IS_TAGGED]      flag
 * @property {string} [WAN_VLAN_ID]
 * @property {string} [WAN_B_ENABLE]       flag
 * @property {string} [WAN_B_VLAN_ID]
 * @property {string} [BRIDGE_WAN_PORT]    flag
 * @property {string} [BASE_NET_PREFIX]
 * @property {string} [DEFAULT_SUBNET]
 * @property {string} [GUEST_ENABLE]       flag
 * @property {string} [IOT_ENABLE]         flag
 * @property {string} [IOT_INTERNET]       flag
 * @property {string} [IOT_ROUTE_VIA_WG]   flag
 * @property {string} [WG_ENABLE]          flag
 * @property {string} [LAN_BASE_PREFIX]
 * @property {string} [LAN_IFACE]
 * @property {string} [LAN_VLAN_ID]
 * @property {string} [LAN_SUBNET]
 * @property {string} [GUEST_BASE_PREFIX]
 * @property {string} [GUEST_IFACE]
 * @property {string} [GUEST_VLAN_ID]
 * @property {string} [GUEST_SUBNET]
 * @property {string} [IOT_BASE_PREFIX]
 * @property {string} [IOT_IFACE]
 * @property {string} [IOT_VLAN_ID]
 * @property {string} [IOT_SUBNET]
 * @property {string} [LAN_WG_BASE_PREFIX]
 * @property {string} [LAN_WG_IFACE]
 * @property {string} [LAN_WG_VLAN_ID]
 * @property {string} [LAN_WG_SUBNET]
 * @property {string} [ADDITIONAL_VLAN_LIST]
 * @property {string} [P_STEERING]         packet steering: '' | '1' | '2' (all CPUs, 24+)
 * @property {string} [ULA_PREFIX]         IPv6 ULA prefix override
 * @property {string} [COUNTRY_CODE]
 * @property {string} [DENSE_ENV]          flag
 * @property {string} [WIFI_KVR]           flag
 * @property {string} [WIRELESS_MESH]      flag
 * @property {string} [BRIDGE_STP]         flag
 * @property {string} [MESH_ID]
 * @property {string} [MESH_PASSWD]        sensitive
 * @property {string} [LAN_WIFI_SSID]
 * @property {string} [LAN_WIFI_PASSWD]    sensitive
 * @property {string} [GUEST_WIFI_SSID]
 * @property {string} [GUEST_WIFI_PASSWD]  sensitive
 * @property {string} [GUEST_ISOLATE]      flag
 * @property {string} [IOT_WIFI_SSID]
 * @property {string} [IOT_WIFI_PASSWD]    sensitive
 * @property {string} [LAN_WG_WIFI_SSID]
 * @property {string} [LAN_WG_WIFI_PASSWD] sensitive
 * @property {string} [CHANNEL_2G]
 * @property {string} [CHANNEL_5G]
 * @property {string} [CHANNEL_6G]
 * @property {string} [WIFI_LOG_LVL]
 * @property {string} [WG_PRIVATE_KEY]     sensitive
 * @property {string} [PEER_PUBLIC_KEY]    sensitive
 * @property {string} [ENDPOINT]           sensitive
 * @property {string} [ENDPOINT_PORT]      sensitive
 * @property {string} [PRESHARED_KEY]      sensitive
 * @property {string} [WG_IPV4]            sensitive
 * @property {string} [WG_IPV6]            sensitive
 * @property {string} [WG_DNS_V4]
 * @property {string} [WG_DNS_V6]
 * @property {string} [ALLOWED_IPS]        sensitive
 * @property {string} [PORT_FORWARD_LIST]
 * @property {string} [IPV6_SERVER_LIST]
 * @property {string} [DDNS_ENABLE]        flag
 * @property {string} [LOOKUP_HOSTNAME]
 * @property {string} [CLOUDFLARE_API_KEY] sensitive
 * @property {string} [CELLULAR_MODEM]     flag
 * @property {string} [USB_TETHERING]      flag
 * @property {string} [DNS_MODE]           BUILD-ONLY: 'adguardhome' | 'dnsproxy' | 'https-dns-proxy' | 'none'
 * @property {string} [ADGUARD_MAIN_DNS]   flag
 * @property {string} [DOH_UPSTREAMS]      DoH upstream URLs (space/newline list)
 * @property {string} [BOOTSTRAP_DNS]      bootstrap/fallback IPs (space/newline list)
 * @property {string} [DNSMASQ_MULTI_INSTANCE]  flag (UI-only, default off; inverse drives DNSMASQ_SINGLE_INSTANCE)
 * @property {string} [DNSMASQ_SINGLE_INSTANCE] flag (emitted; default on, cleared when the user turns multi on)
 * @property {string} [SOFTWARE_OFFLOAD]   flag
 * @property {string} [HARDWARE_OFFLOAD]   flag
 * @property {string} [BLOCK_DOT_DOQ]      flag
 * @property {string} [BLOCK_DOH]          flag
 * @property {string} [BANIP_COUNTRY_LIST] space-separated lowercase country codes
 * @property {string} [DENY_GUEST_NIGHT]   flag
 * @property {string} [QUARTERLY_REBOOT]   flag
 * @property {string} [LOG]                flag
 * @property {string} [NON_CT_ATH10K]      BUILD-ONLY flag
 * @property {string} [ADGUARD_PASSWD]     sensitive; build-time bcrypt only
 */

/**
 * A fleet node: per-node overrides layered onto a network's shared_config via
 * mergeNodeConfig. Carries a few non-config fields the UI tracks per node.
 * @typedef {Object} Node
 * @property {string} [id]
 * @property {string} [name]
 * @property {string} [target]             OpenWrt target/profile id
 * @property {Config} [overrides]
 * @property {string} [warp_refresh_token]
 */

/**
 * A saved fleet network.
 * @typedef {Object} Network
 * @property {string} [id]
 * @property {string} [name]
 * @property {Config} [shared_config]
 * @property {Node[]} [nodes]
 * @property {string} [warp_refresh_token]
 */

// The typedefs above are erased by tsc; only the metadata sets are runtime.
