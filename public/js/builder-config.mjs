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
// AP-leak (WAN_MAC_ADDR/WAN_IS_TAGGED/WAN_VLAN_ID emitted in AP mode) and the
// vestigial WWAN_ENABLE are preserved here, not changed.
//
// raw carries a few gating-only helpers (wan_type) that are NOT emitted, exactly
// as the old collectConfig output omitted them.

/**
 * @param {import('./types.mjs').Config} raw
 * @returns {import('./types.mjs').Config}
 */
export function deriveConfig(raw) {
  const r = raw || {};
  const v = k => r[k] || '';                 // textVal semantics: '' default, '0' kept

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
    WAN_VLAN_ID:    v('WAN_VLAN_ID'),
    WAN_B_ENABLE:   isRouter ? v('WAN_B_ENABLE') : '',
    WAN_B_VLAN_ID:  (isRouter && r.WAN_B_ENABLE === '1') ? v('WAN_B_VLAN_ID') : '',
    BRIDGE_WAN_PORT: isRouter ? v('BRIDGE_WAN_PORT') : '',

    BASE_NET_PREFIX: v('BASE_NET_PREFIX'),
    DEFAULT_SUBNET:  v('DEFAULT_SUBNET'),
    GUEST_ENABLE:    v('GUEST_ENABLE'),
    IOT_ENABLE:      v('IOT_ENABLE'),
    IOT_INTERNET:    iotOn ? v('IOT_INTERNET') : '',
    IOT_ROUTE_VIA_WG: (iotOn && wgOn) ? v('IOT_ROUTE_VIA_WG') : '',
    WG_ENABLE:       wgOn ? '1' : '',

    LAN_BASE_PREFIX:    v('LAN_BASE_PREFIX'),
    LAN_VLAN_ID:        v('LAN_VLAN_ID'),
    LAN_SUBNET:         v('LAN_SUBNET'),
    GUEST_BASE_PREFIX:  guestOn ? v('GUEST_BASE_PREFIX') : '',
    GUEST_VLAN_ID:      guestOn ? v('GUEST_VLAN_ID')     : '',
    GUEST_SUBNET:       guestOn ? v('GUEST_SUBNET')      : '',
    IOT_BASE_PREFIX:    iotOn   ? v('IOT_BASE_PREFIX')   : '',
    IOT_VLAN_ID:        iotOn   ? v('IOT_VLAN_ID')       : '',
    IOT_SUBNET:         iotOn   ? v('IOT_SUBNET')        : '',
    LAN_WG_BASE_PREFIX: wgOn ? v('LAN_WG_BASE_PREFIX') : '',
    LAN_WG_VLAN_ID:     wgOn ? v('LAN_WG_VLAN_ID')     : '',
    LAN_WG_SUBNET:      wgOn ? v('LAN_WG_SUBNET')      : '',
    ADDITIONAL_VLAN_LIST: v('ADDITIONAL_VLAN_LIST'),

    COUNTRY_CODE:   v('COUNTRY_CODE'),         // uppercased at the store boundary
    DENSE_ENV:      v('DENSE_ENV'),
    WIFI_KVR:       v('WIFI_KVR'),
    WIRELESS_MESH:  v('WIRELESS_MESH'),
    MESH_ID:        meshOn ? v('MESH_ID')     : '',
    MESH_PASSWD:    meshOn ? v('MESH_PASSWD') : '',

    LAN_WIFI_SSID:      v('LAN_WIFI_SSID'),
    LAN_WIFI_PASSWD:    v('LAN_WIFI_PASSWD'),
    GUEST_WIFI_SSID:    guestOn ? v('GUEST_WIFI_SSID')   : '',
    GUEST_WIFI_PASSWD:  guestOn ? v('GUEST_WIFI_PASSWD') : '',
    GUEST_ISOLATE:      guestOn ? v('GUEST_ISOLATE')     : '',
    IOT_WIFI_SSID:      iotOn   ? v('IOT_WIFI_SSID')     : '',
    IOT_WIFI_PASSWD:    iotOn   ? v('IOT_WIFI_PASSWD')   : '',
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
    ALLOWED_IPS:     wgOn ? v('ALLOWED_IPS')     : '',

    PORT_FORWARD_LIST: isRouter ? v('PORT_FORWARD_LIST') : '',
    IPV6_SERVER_LIST:  isRouter ? v('IPV6_SERVER_LIST')  : '',

    DDNS_ENABLE:        isRouter ? v('DDNS_ENABLE')        : '',
    LOOKUP_HOSTNAME:    isRouter ? v('LOOKUP_HOSTNAME')    : '',
    CLOUDFLARE_API_KEY: isRouter ? v('CLOUDFLARE_API_KEY') : '',

    CELLULAR_MODEM: isRouter ? v('CELLULAR_MODEM') : '',
    USB_TETHERING:  isRouter ? v('USB_TETHERING')  : '',

    DNS_MODE:         v('DNS_MODE') || 'adguardhome',
    // Only meaningful with AdGuard Home; never emit it for dnsproxy/none.
    ADGUARD_MAIN_DNS: (v('DNS_MODE') || 'adguardhome') === 'adguardhome' ? v('ADGUARD_MAIN_DNS') : '',
    SOFTWARE_OFFLOAD: v('SOFTWARE_OFFLOAD'),
    HARDWARE_OFFLOAD: v('HARDWARE_OFFLOAD'),
    BLOCK_DOT_DOQ:    v('BLOCK_DOT_DOQ'),
    DENY_GUEST_NIGHT: v('DENY_GUEST_NIGHT'),
    QUARTERLY_REBOOT: v('QUARTERLY_REBOOT'),
    LOG:              v('LOG'),
    NON_CT_ATH10K:    v('NON_CT_ATH10K'),
  };
}
