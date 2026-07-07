// @ts-check
// /builder config derivation - the pure cross-field gating selector.
//
// deriveConfig(raw) takes the raw, already-normalized form values (the store
// state) and applies the same conditional suppression rules the old
// collectConfig() applied inline while scraping the DOM: AP-vs-router blanking,
// parent-flag gating (guest/iot/wg/mesh), wan_type gating, and BUILD-ONLY key
// passthrough. It is a pure function of the raw object - the testable selector
// the store, the build payload, the preview and the package chips all consume.
//
// Behavior is a verbatim port of the previous collectConfig() gating; the known
// AP-leak (WAN_MAC_ADDR/WAN_IS_TAGGED emitted in AP mode) is preserved here.
// WAN_VLAN_ID is now owned by the VLAN allocator
// (resolveVlanEmit), which excludes WAN in AP mode, so it no longer leaks there.
//
// raw carries a few gating-only helpers (wan_type) that are NOT emitted, exactly
// as the old collectConfig output omitted them.

import { resolveVlanEmit } from './visibility.mjs';

/**
 * @param {import('./types.mjs').Config} raw
 * @returns {import('./types.mjs').Config}
 */
export function deriveConfig(raw) {
  const r = raw || {};
  const v = k => r[k] || '';                 // textVal semantics: '' default, '0' kept
  const ipList = k => (r[k] || '').trim().replace(/[\s,]+/g, ' ');
  // Frontend-owned VLAN ids: resolved value when it differs from the field's
  // natural default, else '' (participation/AP gating handled by the allocator).
  const vlan = resolveVlanEmit(r);

  const apMode   = v('AP_MODE');             // '1' (AP) or ''
  const wanType  = v('wan_type') || 'dhcp';
  const isRouter = apMode !== '1';
  const wgOn     = r.WG_ENABLE     === '1';
  const meshOn   = r.WIRELESS_MESH === '1';
  const guestOn  = r.GUEST_ENABLE  === '1';
  const iotOn    = r.IOT_ENABLE    === '1';

  return {
    AP_MODE:  apMode,
    AP_INDEX: isRouter ? '' : v('AP_INDEX'),

    HOST_NAME:       v('HOST_NAME'),
    ROOT_PASSWD:     v('ROOT_PASSWD'),
    SSH_PUBLIC_KEY:  v('SSH_PUBLIC_KEY'),
    SSH_PASSWD_AUTH: v('SSH_PASSWD_AUTH'),
    ZONE_NAME:       v('ZONE_NAME'),
    TIME_ZONE:       v('TIME_ZONE'),

    PPPOE_USERNAME: wanType === 'pppoe' ? v('PPPOE_USERNAME') : '',
    PPPOE_PASSWD:   wanType === 'pppoe' ? v('PPPOE_PASSWD')   : '',
    WAN_MAC_ADDR:   v('WAN_MAC_ADDR'),
    WAN_IS_TAGGED:  v('WAN_IS_TAGGED'),
    WAN_VLAN_ID:    vlan.WAN_VLAN_ID,
    WAN_B_ENABLE:   isRouter ? v('WAN_B_ENABLE') : '',
    WAN_B_VLAN_ID:  vlan.WAN_B_VLAN_ID,
    BRIDGE_WAN_PORT: isRouter ? v('BRIDGE_WAN_PORT') : '',

    BASE_NET_PREFIX: v('BASE_NET_PREFIX'),
    DEFAULT_SUBNET:  v('DEFAULT_SUBNET'),
    GUEST_ENABLE:    v('GUEST_ENABLE'),
    IOT_ENABLE:      v('IOT_ENABLE'),
    IOT_INTERNET:    (iotOn && apMode !== '1') ? v('IOT_INTERNET') : '',
    IOT_ROUTE_VIA_WG: (iotOn && wgOn && apMode !== '1') ? v('IOT_ROUTE_VIA_WG') : '',
    WG_ENABLE:       wgOn ? '1' : '',

    LAN_BASE_PREFIX:    v('LAN_BASE_PREFIX'),
    LAN_IFACE:          v('LAN_IFACE'),
    LAN_VLAN_ID:        vlan.LAN_VLAN_ID,
    LAN_SUBNET:         v('LAN_SUBNET'),
    GUEST_BASE_PREFIX:  guestOn ? v('GUEST_BASE_PREFIX') : '',
    GUEST_IFACE:        guestOn ? v('GUEST_IFACE')       : '',
    GUEST_VLAN_ID:      vlan.GUEST_VLAN_ID,
    GUEST_SUBNET:       guestOn ? v('GUEST_SUBNET')      : '',
    IOT_BASE_PREFIX:    iotOn   ? v('IOT_BASE_PREFIX')   : '',
    IOT_IFACE:          iotOn   ? v('IOT_IFACE')         : '',
    IOT_VLAN_ID:        vlan.IOT_VLAN_ID,
    IOT_SUBNET:         iotOn   ? v('IOT_SUBNET')        : '',
    LAN_WG_BASE_PREFIX: wgOn ? v('LAN_WG_BASE_PREFIX') : '',
    LAN_WG_IFACE:       wgOn ? v('LAN_WG_IFACE')       : '',
    LAN_WG_VLAN_ID:     vlan.LAN_WG_VLAN_ID,
    LAN_WG_SUBNET:      wgOn ? v('LAN_WG_SUBNET')      : '',
    ADDITIONAL_VLAN_LIST: v('ADDITIONAL_VLAN_LIST'),
    TAGGED_LAN_VLAN: v('TAGGED_LAN_VLAN'),
    P_STEERING:     v('P_STEERING'),
    ULA_PREFIX:     v('ULA_PREFIX'),

    COUNTRY_CODE:   v('COUNTRY_CODE'),         // uppercased at the store boundary
    DENSE_ENV:      v('DENSE_ENV'),
    DOT11KV:        v('DOT11KV'),
    DOT11R:         v('DOT11R'),
    PSK_VLAN:       v('PSK_VLAN'),
    BAND_SUFFIX:    v('BAND_SUFFIX'),
    WIRELESS_MESH:  v('WIRELESS_MESH'),
    BRIDGE_STP:     meshOn ? v('BRIDGE_STP')  : '',
    MESH_ID:        meshOn ? v('MESH_ID')     : '',
    MESH_PASSWD:    meshOn ? v('MESH_PASSWD') : '',

    LAN_WIFI_SSID:      v('LAN_WIFI_SSID'),
    LAN_WIFI_PASSWD:    v('LAN_WIFI_PASSWD'),
    GUEST_WIFI_SSID:    guestOn ? v('GUEST_WIFI_SSID')   : '',
    GUEST_WIFI_PASSWD:  guestOn ? v('GUEST_WIFI_PASSWD') : '',
    GUEST_ISOLATE:      guestOn ? v('GUEST_ISOLATE')     : '',
    IOT_WIFI_SSID:      iotOn   ? v('IOT_WIFI_SSID')     : '',
    IOT_WIFI_PASSWD:    iotOn   ? v('IOT_WIFI_PASSWD')   : '',
    IOT_NO_DOT11R:      iotOn   ? v('IOT_NO_DOT11R')     : '',
    LAN_WG_WIFI_SSID:   wgOn ? v('LAN_WG_WIFI_SSID')   : '',
    LAN_WG_WIFI_PASSWD: wgOn ? v('LAN_WG_WIFI_PASSWD') : '',
    CHANNEL_2G:   v('CHANNEL_2G'),
    CHANNEL_5G:   v('CHANNEL_5G'),
    CHANNEL_6G:   v('CHANNEL_6G'),
    WIFI_LOG_LVL: v('WIFI_LOG_LVL'),

    WG_PRIVATE_KEY:  wgOn ? v('WG_PRIVATE_KEY')  : '',
    PEER_PUBLIC_KEY: wgOn ? v('PEER_PUBLIC_KEY') : '',
    ENDPOINT:        wgOn ? v('ENDPOINT')        : '',
    ENDPOINT_PORT:   wgOn ? v('ENDPOINT_PORT')   : '',
    PRESHARED_KEY:   wgOn ? v('PRESHARED_KEY')   : '',
    WG_IPV4:         wgOn ? v('WG_IPV4')         : '',
    WG_IPV6:         wgOn ? v('WG_IPV6')         : '',
    WG_DNS_V4:       wgOn ? v('WG_DNS_V4')       : '',
    WG_DNS_V6:       wgOn ? v('WG_DNS_V6')       : '',
    ALLOWED_IPS:     wgOn ? ipList('ALLOWED_IPS') : '',

    PORT_FORWARD_LIST: isRouter ? v('PORT_FORWARD_LIST') : '',
    IPV6_SERVER_LIST:  isRouter ? v('IPV6_SERVER_LIST')  : '',

    DDNS_ENABLE:        isRouter ? v('DDNS_ENABLE')        : '',
    LOOKUP_HOSTNAME:    isRouter ? v('LOOKUP_HOSTNAME')    : '',
    CLOUDFLARE_API_KEY: isRouter ? v('CLOUDFLARE_API_KEY') : '',

    CELLULAR_MODEM: isRouter ? v('CELLULAR_MODEM') : '',
    USB_TETHERING:  isRouter ? v('USB_TETHERING')  : '',

    DNS_MODE:         v('DNS_MODE') || 'https-dns-proxy',
    // Only meaningful with AdGuard Home; never emit it for dnsproxy/none.
    ADGUARD_MAIN_DNS: (v('DNS_MODE') || 'https-dns-proxy') === 'adguardhome' ? v('ADGUARD_MAIN_DNS') : '',
    // Encrypted-DNS upstreams apply only to the DoH engines, not the plain
    // dnsmasq modes ('none' and 'adblock-fast').
    DOH_UPSTREAMS:    !['none', 'adblock-fast'].includes(v('DNS_MODE') || 'https-dns-proxy') ? v('DOH_UPSTREAMS') : '',
    BOOTSTRAP_DNS:    !['none', 'adblock-fast'].includes(v('DNS_MODE') || 'https-dns-proxy') ? v('BOOTSTRAP_DNS') : '',
    // UI toggle "Per-Network Dnsmasq" defaults off; emit the single-instance flag
    // unless the user turns multi on (applies in AP mode too).
    DNSMASQ_SINGLE_INSTANCE: v('DNSMASQ_MULTI_INSTANCE') !== '1' ? '1' : '',
    SOFTWARE_OFFLOAD: v('SOFTWARE_OFFLOAD'),
    HARDWARE_OFFLOAD: v('HARDWARE_OFFLOAD'),
    BLOCK_DOT_DOQ:    v('BLOCK_DOT_DOQ'),
    BLOCK_DOH:        v('BLOCK_DOH'),
    FORCE_DNS:        v('FORCE_DNS'),
    BANIP_COUNTRY_LIST: v('BANIP_COUNTRY_LIST'),
    DENY_GUEST_NIGHT: v('DENY_GUEST_NIGHT'),
    QUARTERLY_REBOOT: v('QUARTERLY_REBOOT'),
    LOG:              v('LOG'),
    NON_CT_ATH10K:    v('NON_CT_ATH10K'),
  };
}
