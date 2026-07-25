// @ts-check
// Single typed Config contract (Section 0 "Typing Policy"), derived from
// Section 1's variable dictionary. This is the shape the store holds, the
// shared modules consume/produce, and the build payload carries. Every value
// is a string: checkboxes normalize to '' (off) or '1' (on) - never '0' - and
// text/select fields carry their raw string. Keys are optional because callers
// routinely pass partial configs (per-node overrides, raw form snapshots); a
// fully-derived config has them all present.
//
// This module is type-only: it carries the Config typedef and no runtime code,
// so it never ships in the browser payload (referenced solely via JSDoc
// import('./types.mjs')). The sensitive-field set lives in ui.js (its only
// consumer, as ui.SENSITIVE_FIELDS); BUILD_ONLY_KEYS lives in render-config.mjs.

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
 * @property {string} [TIME_FORMAT]        '' auto | 'h23' 24-hour | 'h12' 12-hour (OpenWrt >= 25)
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
 * @property {string} [TAGGED_LAN_VLAN]    flag: tag the LAN VLAN (trunk) on all ports
 * @property {string} [P_STEERING]         packet steering: '' | '1' | '2' (all CPUs, 24+)
 * @property {string} [ULA_PREFIX]         IPv6 ULA prefix override
 * @property {string} [COUNTRY_CODE]
 * @property {string} [DENSE_ENV]          flag
 * @property {string} [DOT11KV]            flag (802.11k/v)
 * @property {string} [DOT11R]             flag (802.11r)
 * @property {string} [PSK_VLAN]           flag (per-VLAN PSK)
 * @property {string} [BAND_SUFFIX]        flag (append band to SSID)
 * @property {string} [INDEX_SUFFIX]       flag (append AP index to SSID in AP mode)
 * @property {string} [AP_DISABLE]         flag (disable all AP ifaces; backhaul-only node)
 * @property {string} [WIRELESS_MESH]      flag (5GHz 802.11s backhaul)
 * @property {string} [WIRELESS_MESH_2G]   flag (2.4GHz 802.11s backhaul)
 * @property {string} [BRIDGE_STP]         flag
 * @property {string} [BATMAN_ADV]         flag (batman-adv on top of 802.11s mesh; adds luci-proto-batman-adv)
 * @property {string} [BATMAN_ALL_VLAN]    flag (also trunk WAN-B + ADDITIONAL_VLAN_LIST over bat0)
 * @property {string} [MESH_ID]
 * @property {string} [MESH_PASSWD]        sensitive
 * @property {string} [LAN_WIFI_SSID]
 * @property {string} [LAN_WIFI_PASSWD]    sensitive
 * @property {string} [GUEST_WIFI_SSID]
 * @property {string} [GUEST_WIFI_PASSWD]  sensitive
 * @property {string} [GUEST_ISOLATE]      flag
 * @property {string} [IOT_WIFI_SSID]
 * @property {string} [IOT_WIFI_PASSWD]    sensitive
 * @property {string} [IOT_NO_DOT11R]      flag (disable 802.11r for IoT)
 * @property {string} [LAN_WG_WIFI_SSID]
 * @property {string} [LAN_WG_WIFI_PASSWD] sensitive
 * @property {string} [CHANNEL_2G]
 * @property {string} [CHANNEL_5G]
 * @property {string} [CHANNEL_5G_2]
 * @property {string} [CHANNEL_6G]
 * @property {string} [WIFI_LOG_LVL]
 * @property {string} [WG_PRIVATE_KEY]     sensitive
 * @property {string} [PEER_PUBLIC_KEY]    sensitive
 * @property {string} [ENDPOINT]           sensitive (form holds "host:port"; emitted host-only)
 * @property {string} [ENDPOINT_PORT]      sensitive (emitted only; split out of ENDPOINT)
 * @property {string} [PRESHARED_KEY]      sensitive
 * @property {string} [WG_IPV4]            sensitive
 * @property {string} [WG_IPV6]            sensitive
 * @property {string} [WG_DNS_V4]
 * @property {string} [WG_DNS_V6]
 * @property {string} [WG_MTU]             WireGuard tunnel MTU (empty = driver default)
 * @property {string} [ALLOWED_IPS]        sensitive
 * @property {string} [SPLIT_TUNNEL_V4]
 * @property {string} [SPLIT_TUNNEL_V6]
 * @property {string} [PORT_FORWARD_LIST]
 * @property {string} [IPV6_SERVER_LIST]
 * @property {string} [DDNS_ENABLE]        flag
 * @property {string} [LOOKUP_HOSTNAME]
 * @property {string} [CLOUDFLARE_API_KEY] sensitive
 * @property {string} [CELLULAR_MODEM]     flag
 * @property {string} [USB_TETHERING]      flag
 * @property {string} [DNS_MODE]           BUILD-ONLY: 'adguardhome' | 'dnsproxy' | 'https-dns-proxy' | 'adblock-fast' | 'none'
 * @property {string} [ADGUARD_MAIN_DNS]   flag
 * @property {string} [DOH_UPSTREAMS]      DoH upstream URLs (space/newline list)
 * @property {string} [BOOTSTRAP_DNS]      bootstrap/fallback IPs (space/newline list)
 * @property {string} [DNSMASQ_MULTI_INSTANCE]  flag (UI-only, default off; inverse drives DNSMASQ_SINGLE_INSTANCE)
 * @property {string} [DNSMASQ_SINGLE_INSTANCE] flag (emitted; default on, cleared when the user turns multi on)
 * @property {string} [SOFTWARE_OFFLOAD]   flag
 * @property {string} [HARDWARE_OFFLOAD]   flag
 * @property {string} [BLOCK_DOT_DOQ]      flag
 * @property {string} [BLOCK_DOH]          flag
 * @property {string} [FORCE_DNS]          flag
 * @property {string} [BANIP_COUNTRY_LIST] space-separated lowercase country codes
 * @property {string} [BANIP_FEEDS]        space-separated banIP feed names (country auto-added)
 * @property {string} [DENY_GUEST_NIGHT]   flag
 * @property {string} [QUARTERLY_REBOOT]   flag
 * @property {string} [LOG]                flag
 * @property {string} [NON_CT_ATH10K]      BUILD-ONLY flag
 * @property {string} [WED_ENABLE]         flag (MediaTek Filogic WED wireless offload)
 * @property {string} [IRQBALANCE]         BUILD-ONLY flag (adds luci-app-irqbalance)
 * @property {string} [LUCI_HTTPS]         flag (adds luci-ssl; forces LuCI HTTPS redirect)
 * @property {string} [NTP_IP]             raw IP for last-resort NTP server
 * @property {string} [CUSTOM_SCRIPT]      custom script run after wrtnova (gzip+base64 -> /tmp/_user_script.sh)
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
