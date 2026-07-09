// @ts-check
// Shared node-config merge - one definition, two runtimes.
//
// Imported by the browser UI (networks.js) to merge shared network config with
// per-node overrides, applying all conditional suppression rules (AP vs router,
// sub-fields gated on their parent flag, etc.).
//
// Boolean flags use flag(v) so '0' never leaks through (Section 1 invariant:
// off-state is '' never '0').

import { resolveVlanEmit, DNS_DEFAULT, isAdguard, isDohEngine } from './visibility.mjs';
import { assembleBanipFeeds } from './packages.mjs';

/**
 * @param {import('./types.mjs').Config} sharedConfig
 * @param {import('./types.mjs').Config} nodeOverrides
 * @returns {import('./types.mjs').Config}
 */
export function mergeNodeConfig(sharedConfig, nodeOverrides) {
  const c = Object.assign({}, sharedConfig, nodeOverrides);
  const isAp    = c.AP_MODE       === '1';
  const wgOn    = c.WG_ENABLE     === '1';
  const meshOn  = c.WIRELESS_MESH === '1';
  const guestOn = c.GUEST_ENABLE  === '1';
  const iotOn   = c.IOT_ENABLE    === '1';
  const flag = v => v === '1' ? '1' : '';
  const ipList = s => String(s || '').trim().replace(/[\s,]+/g, ' ');
  // Frontend-owned VLAN ids: resolved value when it differs from the natural
  // default, else '' (participation/AP gating handled by the allocator).
  const vlan = resolveVlanEmit(c);
  return {
    AP_MODE: isAp ? '1' : '', AP_INDEX: isAp ? (c.AP_INDEX || '2') : '',
    HOST_NAME: c.HOST_NAME || '', ROOT_PASSWD: c.ROOT_PASSWD || '',
    SSH_PUBLIC_KEY: c.SSH_PUBLIC_KEY || '', SSH_PASSWD_AUTH: c.SSH_PASSWD_AUTH || '',
    ZONE_NAME: c.ZONE_NAME || '', TIME_ZONE: c.TIME_ZONE || '', TIME_FORMAT: c.TIME_FORMAT || '',
    PPPOE_USERNAME: !isAp && c.wan_type === 'pppoe' ? (c.PPPOE_USERNAME || '') : '',
    PPPOE_PASSWD:   !isAp && c.wan_type === 'pppoe' ? (c.PPPOE_PASSWD   || '') : '',
    WAN_MAC_ADDR:   !isAp ? (c.WAN_MAC_ADDR  || '') : '',
    WAN_IS_TAGGED:  !isAp ? flag(c.WAN_IS_TAGGED) : '',
    WAN_VLAN_ID:    vlan.WAN_VLAN_ID,
    WAN_B_ENABLE:   !isAp ? flag(c.WAN_B_ENABLE) : '',
    WAN_B_VLAN_ID:  vlan.WAN_B_VLAN_ID,
    BRIDGE_WAN_PORT: !isAp ? flag(c.BRIDGE_WAN_PORT) : '',
    BASE_NET_PREFIX: c.BASE_NET_PREFIX || '', DEFAULT_SUBNET: c.DEFAULT_SUBNET || '',
    GUEST_ENABLE: guestOn ? '1' : '', IOT_ENABLE: iotOn ? '1' : '',
    IOT_INTERNET: (iotOn && !isAp) ? flag(c.IOT_INTERNET) : '', IOT_ROUTE_VIA_WG: (iotOn && wgOn && !isAp) ? flag(c.IOT_ROUTE_VIA_WG) : '', WG_ENABLE: wgOn ? '1' : '',
    LAN_BASE_PREFIX: c.LAN_BASE_PREFIX || '', LAN_IFACE: c.LAN_IFACE || '', LAN_VLAN_ID: vlan.LAN_VLAN_ID, LAN_SUBNET: c.LAN_SUBNET || '',
    GUEST_BASE_PREFIX: guestOn ? (c.GUEST_BASE_PREFIX || '') : '', GUEST_IFACE: guestOn ? (c.GUEST_IFACE || '') : '', GUEST_VLAN_ID: vlan.GUEST_VLAN_ID, GUEST_SUBNET: guestOn ? (c.GUEST_SUBNET || '') : '',
    IOT_BASE_PREFIX:   iotOn   ? (c.IOT_BASE_PREFIX   || '') : '', IOT_IFACE:   iotOn   ? (c.IOT_IFACE   || '') : '', IOT_VLAN_ID:   vlan.IOT_VLAN_ID, IOT_SUBNET:   iotOn   ? (c.IOT_SUBNET   || '') : '', IOT_NO_DOT11R: iotOn ? flag(c.IOT_NO_DOT11R) : '',
    LAN_WG_BASE_PREFIX: wgOn  ? (c.LAN_WG_BASE_PREFIX || '') : '', LAN_WG_IFACE: wgOn  ? (c.LAN_WG_IFACE || '') : '', LAN_WG_VLAN_ID: vlan.LAN_WG_VLAN_ID, LAN_WG_SUBNET: wgOn  ? (c.LAN_WG_SUBNET || '') : '',
    ADDITIONAL_VLAN_LIST: c.ADDITIONAL_VLAN_LIST || '', TAGGED_LAN_VLAN: flag(c.TAGGED_LAN_VLAN),
    P_STEERING: c.P_STEERING || '', ULA_PREFIX: c.ULA_PREFIX || '',
    COUNTRY_CODE: c.COUNTRY_CODE || '', DENSE_ENV: flag(c.DENSE_ENV), WIRELESS_MESH: flag(c.WIRELESS_MESH), DOT11KV: flag(c.DOT11KV), DOT11R: flag(c.DOT11R), PSK_VLAN: flag(c.PSK_VLAN), BAND_SUFFIX: flag(c.BAND_SUFFIX), GUEST_ISOLATE: guestOn ? flag(c.GUEST_ISOLATE) : '',
    BRIDGE_STP: meshOn ? flag(c.BRIDGE_STP) : '',
    MESH_ID: meshOn ? (c.MESH_ID || '') : '', MESH_PASSWD: meshOn ? (c.MESH_PASSWD || '') : '',
    LAN_WIFI_SSID: c.LAN_WIFI_SSID || '', LAN_WIFI_PASSWD: c.LAN_WIFI_PASSWD || '',
    GUEST_WIFI_SSID:  guestOn ? (c.GUEST_WIFI_SSID   || '') : '', GUEST_WIFI_PASSWD:  guestOn ? (c.GUEST_WIFI_PASSWD   || '') : '',
    IOT_WIFI_SSID:    iotOn   ? (c.IOT_WIFI_SSID     || '') : '', IOT_WIFI_PASSWD:    iotOn   ? (c.IOT_WIFI_PASSWD     || '') : '',
    LAN_WG_WIFI_SSID: wgOn   ? (c.LAN_WG_WIFI_SSID  || '') : '', LAN_WG_WIFI_PASSWD: wgOn   ? (c.LAN_WG_WIFI_PASSWD  || '') : '',
    CHANNEL_2G: c.CHANNEL_2G || '', CHANNEL_5G: c.CHANNEL_5G || '', CHANNEL_6G: c.CHANNEL_6G || '',
    WIFI_LOG_LVL: c.WIFI_LOG_LVL || '',
    WG_PRIVATE_KEY:  wgOn && !isAp ? (c.WG_PRIVATE_KEY  || '') : '',
    PEER_PUBLIC_KEY: wgOn && !isAp ? (c.PEER_PUBLIC_KEY  || '') : '',
    ENDPOINT:        wgOn && !isAp ? (c.ENDPOINT         || '') : '',
    ENDPOINT_PORT:   wgOn && !isAp ? (c.ENDPOINT_PORT    || '') : '',
    PRESHARED_KEY:   wgOn && !isAp ? (c.PRESHARED_KEY    || '') : '',
    WG_IPV4:         wgOn && !isAp ? (c.WG_IPV4          || '') : '',
    WG_IPV6:         wgOn && !isAp ? (c.WG_IPV6          || '') : '',
    WG_DNS_V4:       wgOn && !isAp ? (c.WG_DNS_V4        || '') : '',
    WG_DNS_V6:       wgOn && !isAp ? (c.WG_DNS_V6        || '') : '',
    ALLOWED_IPS:     wgOn && !isAp ? ipList(c.ALLOWED_IPS)       : '',
    PORT_FORWARD_LIST: !isAp ? (c.PORT_FORWARD_LIST || '') : '',
    IPV6_SERVER_LIST:  !isAp ? (c.IPV6_SERVER_LIST  || '') : '',
    DDNS_ENABLE:        !isAp ? flag(c.DDNS_ENABLE)        : '',
    LOOKUP_HOSTNAME:    !isAp ? (c.LOOKUP_HOSTNAME    || '') : '',
    CLOUDFLARE_API_KEY: !isAp ? (c.CLOUDFLARE_API_KEY || '') : '',
    CELLULAR_MODEM: !isAp ? flag(c.CELLULAR_MODEM) : '',
    USB_TETHERING:  !isAp ? flag(c.USB_TETHERING)  : '',
    DNS_MODE:         c.DNS_MODE || DNS_DEFAULT,
    // Only meaningful with AdGuard Home; never emit it for dnsproxy/none.
    ADGUARD_MAIN_DNS: isAdguard(c.DNS_MODE) ? flag(c.ADGUARD_MAIN_DNS) : '',
    // Encrypted-DNS upstreams apply only to the DoH engines, not the plain
    // dnsmasq modes ('none' and 'adblock-fast').
    DOH_UPSTREAMS:    isDohEngine(c.DNS_MODE) ? (c.DOH_UPSTREAMS || '') : '',
    BOOTSTRAP_DNS:    isDohEngine(c.DNS_MODE) ? (c.BOOTSTRAP_DNS || '') : '',
    DNSMASQ_SINGLE_INSTANCE: flag(c.DNSMASQ_MULTI_INSTANCE) !== '1' ? '1' : '',
    SOFTWARE_OFFLOAD: flag(c.SOFTWARE_OFFLOAD), HARDWARE_OFFLOAD: flag(c.HARDWARE_OFFLOAD),
    BLOCK_DOT_DOQ:    flag(c.BLOCK_DOT_DOQ),
    BLOCK_DOH:        flag(c.BLOCK_DOH),
    FORCE_DNS:        flag(c.FORCE_DNS),
    BANIP_COUNTRY_LIST: c.BANIP_COUNTRY_LIST || '',
    BANIP_FEEDS:      assembleBanipFeeds(c.BANIP_FEEDS, c.BANIP_COUNTRY_LIST),
    DENY_GUEST_NIGHT: flag(c.DENY_GUEST_NIGHT),
    QUARTERLY_REBOOT: flag(c.QUARTERLY_REBOOT),
    LOG:              flag(c.LOG),
    NON_CT_ATH10K:    flag(c.NON_CT_ATH10K),
    WED_ENABLE:       flag(c.WED_ENABLE),
    IRQBALANCE:       flag(c.IRQBALANCE),
    LUCI_HTTPS:       flag(c.LUCI_HTTPS),
  };
}
