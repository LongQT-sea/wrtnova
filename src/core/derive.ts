// The gating selector: RawConfig -> EmittedConfig.
//
// One pure function of the store's raw state. It applies, in order:
//   1. role gating      an access point drops what it cannot own
//   2. parent gating    sub-fields blank when their parent flag is off
//   3. UI-only transforms  wan_type -> PPPOE_*, endpoint split, inverted flags
//   4. allocation       resolved VLAN ids and interface names
//
// Default suppression (Constitution V) happens later, in render-config.ts,
// because it needs the whole config to resolve `$base_pfx`-style references.
//
// In access-point mode the WAN identity and WireGuard client fields are
// dropped: an access point has no upstream of its own and terminates no tunnel,
// so those values would be dead config.

import type { EmittedConfig, Flag, RawConfig } from './types';
import { resolveIfaceEmit, resolveVlanEmit } from './vlan';
import { normalizeEndpoint } from './list-grammar';
import { assembleBanipFeeds } from './packages';
import { DNS_DEFAULT, deriveBootstrapDns, isAdguard, isDohEngine } from './dns';

/** Never let a '0' through, whatever the source (restored history, hand-edited). */
const flag = (v: unknown): Flag => (v === '1' ? '1' : '');

const text = (v: unknown): string => (v == null ? '' : String(v));

/** Collapse whitespace and commas into single spaces, for IP lists. */
const ipList = (v: unknown): string => text(v).trim().replace(/[\s,]+/g, ' ');

export function derive(raw: Partial<RawConfig>): EmittedConfig {
  const r = raw ?? {};

  const vlan = resolveVlanEmit(r);
  const iface = resolveIfaceEmit(r);

  const apMode = flag(r.AP_MODE);
  const isRouter = apMode !== '1';

  // Bridging the WAN port into the LAN bridge is a switch-port decision, not an
  // upstream identity, so it is meaningful on an access point too (IPTV, VoIP,
  // multi-PPPoE trunking). The allocator drops WAN in access-point mode, so for
  // that one case the WAN VLAN id is resolved in router view to get a value.
  const bridgeWan = flag(r.BRIDGE_WAN_PORT);
  const wanVlanId =
    !isRouter && bridgeWan === '1'
      ? (resolveVlanEmit({ ...r, AP_MODE: '' }).WAN_VLAN_ID ?? '')
      : (vlan.WAN_VLAN_ID ?? '');
  const wanType = r.wan_type || 'dhcp';
  const isPppoe = wanType === 'pppoe';

  const guestOn = r.GUEST_ENABLE === '1';
  const iotOn = r.IOT_ENABLE === '1';
  const wgOn = r.WG_ENABLE === '1';
  const mesh5 = r.WIRELESS_MESH === '1';
  const mesh2g = r.WIRELESS_MESH_2G === '1';
  const meshOn = mesh5 || mesh2g;
  // Two meshpoints bridged into the same bridge can form an L2 loop, so
  // spanning tree is forced on rather than left to the user.
  const bothMesh = mesh5 && mesh2g;
  const batman = meshOn && flag(r.BATMAN_ADV) === '1';

  const endpoint = normalizeEndpoint(text(r.ENDPOINT));
  const wgRouter = wgOn && isRouter;

  const dns = r.DNS_MODE || DNS_DEFAULT;

  return {
    // -- role ---------------------------------------------------------------
    AP_MODE: apMode,
    AP_INDEX: isRouter ? '' : text(r.AP_INDEX),
    AP_DISABLE: flag(r.AP_DISABLE),
    INDEX_SUFFIX: flag(r.INDEX_SUFFIX),

    // -- identity and access ------------------------------------------------
    HOST_NAME: text(r.HOST_NAME),
    ROOT_PASSWD: text(r.ROOT_PASSWD),
    SSH_PUBLIC_KEY: text(r.SSH_PUBLIC_KEY),
    SSH_PASSWD_AUTH: text(r.SSH_PASSWD_AUTH),
    ZONE_NAME: text(r.ZONE_NAME),
    TIME_ZONE: text(r.TIME_ZONE),
    TIME_FORMAT: text(r.TIME_FORMAT),

    // -- upstream -----------------------------------------------------------
    PPPOE_USERNAME: isRouter && isPppoe ? text(r.PPPOE_USERNAME) : '',
    PPPOE_PASSWD: isRouter && isPppoe ? text(r.PPPOE_PASSWD) : '',
    WAN_MAC_ADDR: isRouter ? text(r.WAN_MAC_ADDR) : '',
    WAN_IS_TAGGED: isRouter ? flag(r.WAN_IS_TAGGED) : '',
    WAN_VLAN_ID: wanVlanId,
    WAN_B_ENABLE: isRouter ? flag(r.WAN_B_ENABLE) : '',
    WAN_B_VLAN_ID: vlan.WAN_B_VLAN_ID ?? '',
    BRIDGE_WAN_PORT: bridgeWan,
    CELLULAR_MODEM: isRouter ? flag(r.CELLULAR_MODEM) : '',
    USB_TETHERING: isRouter ? flag(r.USB_TETHERING) : '',

    // -- networks -----------------------------------------------------------
    BASE_NET_PREFIX: text(r.BASE_NET_PREFIX),
    DEFAULT_SUBNET: text(r.DEFAULT_SUBNET),
    GUEST_ENABLE: flag(r.GUEST_ENABLE),
    IOT_ENABLE: flag(r.IOT_ENABLE),
    // IoT internet access and route-via-tunnel are layer-3 decisions that do
    // not exist on an access point, where IoT is layer-2 only.
    IOT_INTERNET: iotOn && isRouter ? flag(r.IOT_INTERNET) : '',
    IOT_ROUTE_VIA_WG: iotOn && wgOn && isRouter ? flag(r.IOT_ROUTE_VIA_WG) : '',

    LAN_BASE_PREFIX: text(r.LAN_BASE_PREFIX),
    LAN_IFACE: iface.LAN_IFACE ?? '',
    LAN_VLAN_ID: vlan.LAN_VLAN_ID ?? '',
    LAN_SUBNET: text(r.LAN_SUBNET),

    GUEST_BASE_PREFIX: guestOn ? text(r.GUEST_BASE_PREFIX) : '',
    GUEST_IFACE: iface.GUEST_IFACE ?? '',
    GUEST_VLAN_ID: vlan.GUEST_VLAN_ID ?? '',
    GUEST_SUBNET: guestOn ? text(r.GUEST_SUBNET) : '',

    IOT_BASE_PREFIX: iotOn ? text(r.IOT_BASE_PREFIX) : '',
    IOT_IFACE: iface.IOT_IFACE ?? '',
    IOT_VLAN_ID: vlan.IOT_VLAN_ID ?? '',
    IOT_SUBNET: iotOn ? text(r.IOT_SUBNET) : '',

    LAN_VPN_BASE_PREFIX: wgOn ? text(r.LAN_VPN_BASE_PREFIX) : '',
    LAN_VPN_IFACE: iface.LAN_VPN_IFACE ?? '',
    LAN_VPN_VLAN_ID: vlan.LAN_VPN_VLAN_ID ?? '',
    LAN_VPN_SUBNET: wgOn ? text(r.LAN_VPN_SUBNET) : '',

    ADDITIONAL_VLAN_LIST: text(r.ADDITIONAL_VLAN_LIST),
    TAGGED_LAN_VLAN: flag(r.TAGGED_LAN_VLAN),
    BRIDGE_STP: meshOn ? (bothMesh ? '1' : flag(r.BRIDGE_STP)) : '',
    P_STEERING: text(r.P_STEERING),
    ULA_PREFIX: text(r.ULA_PREFIX),

    // -- wireless -----------------------------------------------------------
    COUNTRY_CODE: text(r.COUNTRY_CODE).toUpperCase(),
    DOT11KV: flag(r.DOT11KV),
    DOT11R: flag(r.DOT11R),
    // Dense-environment tuning only tightens usteer thresholds, and usteer runs
    // only with 802.11k/v.
    DENSE_ENV: r.DOT11KV === '1' ? flag(r.DENSE_ENV) : '',
    PSK_VLAN: flag(r.PSK_VLAN),
    BAND_SUFFIX: flag(r.BAND_SUFFIX),

    LAN_WIFI_SSID: text(r.LAN_WIFI_SSID),
    LAN_WIFI_PASSWD: text(r.LAN_WIFI_PASSWD),
    GUEST_WIFI_SSID: guestOn ? text(r.GUEST_WIFI_SSID) : '',
    GUEST_WIFI_PASSWD: guestOn ? text(r.GUEST_WIFI_PASSWD) : '',
    // Client isolation is meaningless with one shared SSID selected by password.
    GUEST_ISOLATE: guestOn && r.PSK_VLAN !== '1' ? flag(r.GUEST_ISOLATE) : '',
    IOT_WIFI_SSID: iotOn ? text(r.IOT_WIFI_SSID) : '',
    IOT_WIFI_PASSWD: iotOn ? text(r.IOT_WIFI_PASSWD) : '',
    // The form shows the positive ("IoT fast transition"); the config key is the
    // negative. Only meaningful while base 802.11r is on.
    IOT_NO_DOT11R: iotOn && r.DOT11R === '1' ? flag(r.IOT_DOT11R_UI) === '1' ? '' : '1' : '',
    LAN_VPN_WIFI_SSID: wgOn ? text(r.LAN_VPN_WIFI_SSID) : '',
    LAN_VPN_WIFI_PASSWD: wgOn ? text(r.LAN_VPN_WIFI_PASSWD) : '',

    CHANNEL_2G: text(r.CHANNEL_2G),
    CHANNEL_5G: text(r.CHANNEL_5G),
    CHANNEL_5G_2: text(r.CHANNEL_5G_2),
    CHANNEL_6G: text(r.CHANNEL_6G),
    WIFI_LOG_LVL: text(r.WIFI_LOG_LVL),
    WED_ENABLE: flag(r.WED_ENABLE),

    // -- mesh backhaul ------------------------------------------------------
    // batman-adv runs over one mesh radio; with it on, 5 GHz wins.
    WIRELESS_MESH: batman && bothMesh ? '1' : flag(r.WIRELESS_MESH),
    WIRELESS_MESH_2G: batman && bothMesh ? '' : flag(r.WIRELESS_MESH_2G),
    BATMAN_ADV: meshOn ? flag(r.BATMAN_ADV) : '',
    BATMAN_ALL_VLAN: batman ? flag(r.BATMAN_ALL_VLAN) : '',
    MESH_ID: meshOn ? text(r.MESH_ID) : '',
    MESH_PASSWD: meshOn ? text(r.MESH_PASSWD) : '',

    // -- WireGuard client ---------------------------------------------------
    WG_ENABLE: flag(r.WG_ENABLE),
    WG_PRIVATE_KEY: wgRouter ? text(r.WG_PRIVATE_KEY) : '',
    PEER_PUBLIC_KEY: wgRouter ? text(r.PEER_PUBLIC_KEY) : '',
    // One "host:port" field in the form, two variables in the script.
    ENDPOINT: wgRouter ? endpoint.host : '',
    ENDPOINT_PORT: wgRouter ? endpoint.port : '',
    PRESHARED_KEY: wgRouter ? text(r.PRESHARED_KEY) : '',
    WG_IPV4: wgRouter ? text(r.WG_IPV4) : '',
    WG_IPV6: wgRouter ? text(r.WG_IPV6) : '',
    WG_DNS_V4: wgRouter ? text(r.WG_DNS_V4) : '',
    WG_DNS_V6: wgRouter ? text(r.WG_DNS_V6) : '',
    WG_MTU: wgRouter ? text(r.WG_MTU) : '',
    ALLOWED_IPS: wgRouter ? ipList(r.ALLOWED_IPS) : '',
    SPLIT_TUNNEL_V4: wgRouter ? ipList(r.SPLIT_TUNNEL_V4) : '',
    SPLIT_TUNNEL_V6: wgRouter ? ipList(r.SPLIT_TUNNEL_V6) : '',

    // -- exposure and dynamic DNS -------------------------------------------
    PORT_FORWARD_LIST: isRouter ? text(r.PORT_FORWARD_LIST) : '',
    IPV6_SERVER_LIST: isRouter ? text(r.IPV6_SERVER_LIST) : '',
    DDNS_ENABLE: isRouter ? flag(r.DDNS_ENABLE) : '',
    LOOKUP_HOSTNAME: isRouter ? text(r.LOOKUP_HOSTNAME) : '',
    CLOUDFLARE_API_KEY: isRouter ? text(r.CLOUDFLARE_API_KEY) : '',

    // -- DNS and filtering --------------------------------------------------
    DNS_MODE: dns,
    ADGUARD_MAIN_DNS: isAdguard(dns) ? flag(r.ADGUARD_MAIN_DNS) : '',
    // Injected at build time from the root password; never entered.
    ADGUARD_PASSWD: text(r.ADGUARD_PASSWD),
    DOH_UPSTREAMS: isDohEngine(dns) ? text(r.DOH_UPSTREAMS) : '',
    BOOTSTRAP_DNS: isDohEngine(dns) ? deriveBootstrapDns(r) : '',
    // The form asks the positive question ("one dnsmasq per network?", default
    // no), so the single-instance flag is emitted unless the user turns multi on.
    DNSMASQ_SINGLE_INSTANCE: flag(r.DNSMASQ_MULTI_INSTANCE) === '1' ? '' : '1',
    FORCE_DNS: flag(r.FORCE_DNS),
    BLOCK_DOT_DOQ: flag(r.BLOCK_DOT_DOQ),
    BLOCK_DOH: flag(r.BLOCK_DOH),
    BANIP_COUNTRY_LIST: text(r.BANIP_COUNTRY_LIST),
    BANIP_FEEDS: assembleBanipFeeds(r.BANIP_FEEDS, r.BANIP_COUNTRY_LIST),

    // -- performance and maintenance ----------------------------------------
    SOFTWARE_OFFLOAD: flag(r.SOFTWARE_OFFLOAD),
    HARDWARE_OFFLOAD: flag(r.HARDWARE_OFFLOAD),
    IRQBALANCE: flag(r.IRQBALANCE),
    NON_CT_ATH10K: flag(r.NON_CT_ATH10K),
    LUCI_HTTPS: flag(r.LUCI_HTTPS),
    NTP_IP: text(r.NTP_IP),
    QUARTERLY_REBOOT: flag(r.QUARTERLY_REBOOT),
    DENY_GUEST_NIGHT: guestOn ? flag(r.DENY_GUEST_NIGHT) : '',
    LOG: flag(r.LOG),

    // -- escape hatch -------------------------------------------------------
    CUSTOM_SCRIPT: text(r.CUSTOM_SCRIPT),
  };
}
