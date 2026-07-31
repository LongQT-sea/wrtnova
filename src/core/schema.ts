// The single field table.
//
// Adding a configuration key means one edit here. `FIELDS` is typed
// `Record<ConfigKey, FieldDef>`, so a key added to `Config` without an entry is
// a compile error, and there is no second place to mirror.
//
// `scriptDefault` is the runtime fallback in the wrtnova.sh BODY (`${KEY:-...}`),
// NOT the assignment in the config section at the top of the file. The browser
// discards that section and replaces it with the rendered block, so those
// assignments are never in force. Reading them as defaults would, for example,
// silently disable the guest network for everyone who left it on. See
// specs/001-frontend-rewrite/research.md R1.

import type { ConfigKey, SectionId, SegmentId } from './types';

export type FieldKind =
  | 'text'
  | 'secret'
  | 'textarea'
  | 'flag'
  | 'radio'
  | 'select'
  | 'subnet'
  | 'table'
  | 'tz'
  | 'country'
  | 'chips'
  | 'derived';

/**
 * How a key's default is determined, for the "never emit a redundant default"
 * rule (Constitution V).
 *
 * - `unset`   there is no fallback; the feature is off unless the key is
 *             emitted, so emitting a value is always meaningful.
 * - `lit`     a literal fallback; a value equal to it is dropped.
 * - `ref`     the fallback is another key's effective value (`$base_pfx`,
 *             `$def_subnet`).
 * - `hostname` `WrtNova`, or `WrtNova-<AP_INDEX>` in access-point mode.
 * - `device`  resolved on the router at boot (an existing ULA, a generated
 *             key). Never suppressed, because we cannot know it.
 * - `multi`   the script applies DIFFERENT fallbacks on different code paths,
 *             so there is no single value to suppress against. Never
 *             suppressed: pinning one path's default would be wrong on the
 *             other. DOH_UPSTREAMS is the case — the AdGuard Home path falls
 *             back to one URL and the generic path to three.
 */
export type DefaultSpec =
  | { k: 'unset' }
  | { k: 'lit'; v: string }
  | { k: 'ref'; key: ConfigKey; fallback: string }
  | { k: 'hostname' }
  | { k: 'device' }
  | { k: 'multi' };

export interface FieldDef {
  kind: FieldKind;
  section: SectionId;
  scriptDefault: DefaultSpec;
  /** Consumed for package resolution; never written to the config block. */
  buildOnly?: true;
  /** Masked in any displayed config and stripped from stored history. */
  secret?: true;
  /** Owns a LAN-side segment's identity colour in the interface. */
  segment?: SegmentId;
  /** Emitted as its own block rather than KEY=value. */
  ownBlock?: true;
}

const unset: DefaultSpec = { k: 'unset' };
const lit = (v: string): DefaultSpec => ({ k: 'lit', v });
const basePfx: DefaultSpec = { k: 'ref', key: 'BASE_NET_PREFIX', fallback: '192.168' };
const defSubnet: DefaultSpec = { k: 'ref', key: 'DEFAULT_SUBNET', fallback: '/24' };
/** `$def_pass` is `${DEFAULT_WIFI_PASSWD:-12345678}`, and that key is not exposed. */
const defPass = lit('12345678');

export const FIELDS: Record<ConfigKey, FieldDef> = {
  // -- role -----------------------------------------------------------------
  AP_MODE: { kind: 'radio', section: 'device', scriptDefault: unset },
  AP_INDEX: { kind: 'text', section: 'device', scriptDefault: lit('2') },
  AP_DISABLE: { kind: 'flag', section: 'device', scriptDefault: unset },
  INDEX_SUFFIX: { kind: 'flag', section: 'device', scriptDefault: unset },

  // -- identity and access --------------------------------------------------
  HOST_NAME: { kind: 'text', section: 'access', scriptDefault: { k: 'hostname' } },
  ROOT_PASSWD: { kind: 'secret', section: 'access', scriptDefault: unset, secret: true },
  SSH_PUBLIC_KEY: { kind: 'textarea', section: 'access', scriptDefault: unset },
  SSH_PASSWD_AUTH: { kind: 'radio', section: 'access', scriptDefault: unset },
  ZONE_NAME: { kind: 'tz', section: 'access', scriptDefault: unset },
  TIME_ZONE: { kind: 'derived', section: 'access', scriptDefault: unset },
  TIME_FORMAT: { kind: 'radio', section: 'access', scriptDefault: unset },

  // -- upstream -------------------------------------------------------------
  PPPOE_USERNAME: { kind: 'text', section: 'internet', scriptDefault: unset },
  PPPOE_PASSWD: { kind: 'secret', section: 'internet', scriptDefault: unset, secret: true },
  WAN_MAC_ADDR: { kind: 'text', section: 'internet', scriptDefault: unset },
  WAN_IS_TAGGED: { kind: 'flag', section: 'internet', scriptDefault: unset },
  WAN_VLAN_ID: { kind: 'text', section: 'internet', scriptDefault: lit('20') },
  WAN_B_ENABLE: { kind: 'flag', section: 'internet', scriptDefault: unset },
  WAN_B_VLAN_ID: { kind: 'text', section: 'internet', scriptDefault: lit('21') },
  BRIDGE_WAN_PORT: { kind: 'flag', section: 'internet', scriptDefault: unset },
  CELLULAR_MODEM: { kind: 'flag', section: 'internet', scriptDefault: unset },
  USB_TETHERING: { kind: 'flag', section: 'internet', scriptDefault: unset },

  // -- networks -------------------------------------------------------------
  BASE_NET_PREFIX: { kind: 'text', section: 'networks', scriptDefault: lit('192.168') },
  DEFAULT_SUBNET: { kind: 'select', section: 'networks', scriptDefault: lit('/24') },

  GUEST_ENABLE: { kind: 'flag', section: 'networks', scriptDefault: unset, segment: 'guest' },
  IOT_ENABLE: { kind: 'flag', section: 'networks', scriptDefault: unset, segment: 'iot' },
  IOT_INTERNET: { kind: 'flag', section: 'networks', scriptDefault: unset, segment: 'iot' },
  IOT_ROUTE_VIA_WG: { kind: 'flag', section: 'networks', scriptDefault: unset, segment: 'iot' },

  LAN_BASE_PREFIX: { kind: 'text', section: 'networks', scriptDefault: basePfx, segment: 'lan' },
  LAN_IFACE: { kind: 'text', section: 'networks', scriptDefault: lit('lan'), segment: 'lan' },
  LAN_VLAN_ID: { kind: 'text', section: 'networks', scriptDefault: lit('1'), segment: 'lan' },
  LAN_SUBNET: { kind: 'subnet', section: 'networks', scriptDefault: defSubnet, segment: 'lan' },

  GUEST_BASE_PREFIX: { kind: 'text', section: 'networks', scriptDefault: basePfx, segment: 'guest' },
  GUEST_IFACE: { kind: 'text', section: 'networks', scriptDefault: lit('guest'), segment: 'guest' },
  GUEST_VLAN_ID: { kind: 'text', section: 'networks', scriptDefault: lit('5'), segment: 'guest' },
  GUEST_SUBNET: { kind: 'subnet', section: 'networks', scriptDefault: defSubnet, segment: 'guest' },

  IOT_BASE_PREFIX: { kind: 'text', section: 'networks', scriptDefault: basePfx, segment: 'iot' },
  IOT_IFACE: { kind: 'text', section: 'networks', scriptDefault: lit('iot'), segment: 'iot' },
  IOT_VLAN_ID: { kind: 'text', section: 'networks', scriptDefault: lit('10'), segment: 'iot' },
  IOT_SUBNET: { kind: 'subnet', section: 'networks', scriptDefault: defSubnet, segment: 'iot' },

  LAN_VPN_BASE_PREFIX: { kind: 'text', section: 'networks', scriptDefault: basePfx, segment: 'vpn' },
  LAN_VPN_IFACE: { kind: 'text', section: 'networks', scriptDefault: lit('lan_vpn'), segment: 'vpn' },
  LAN_VPN_VLAN_ID: { kind: 'text', section: 'networks', scriptDefault: lit('15'), segment: 'vpn' },
  LAN_VPN_SUBNET: { kind: 'subnet', section: 'networks', scriptDefault: defSubnet, segment: 'vpn' },

  ADDITIONAL_VLAN_LIST: { kind: 'text', section: 'networks', scriptDefault: unset },
  TAGGED_LAN_VLAN: { kind: 'flag', section: 'networks', scriptDefault: unset },
  BRIDGE_STP: { kind: 'flag', section: 'networks', scriptDefault: unset },
  P_STEERING: { kind: 'select', section: 'networks', scriptDefault: unset },
  ULA_PREFIX: { kind: 'text', section: 'networks', scriptDefault: { k: 'device' } },

  // -- wireless -------------------------------------------------------------
  COUNTRY_CODE: { kind: 'country', section: 'wifi', scriptDefault: unset },
  DOT11KV: { kind: 'flag', section: 'wifi', scriptDefault: unset },
  DOT11R: { kind: 'flag', section: 'wifi', scriptDefault: unset },
  DENSE_ENV: { kind: 'flag', section: 'wifi', scriptDefault: unset },
  PSK_VLAN: { kind: 'flag', section: 'wifi', scriptDefault: unset },
  BAND_SUFFIX: { kind: 'flag', section: 'wifi', scriptDefault: unset },

  LAN_WIFI_SSID: { kind: 'text', section: 'wifi', scriptDefault: lit('WrtNova'), segment: 'lan' },
  LAN_WIFI_PASSWD: { kind: 'secret', section: 'wifi', scriptDefault: defPass, secret: true, segment: 'lan' },
  GUEST_WIFI_SSID: { kind: 'text', section: 'wifi', scriptDefault: lit('WrtNova_Guest'), segment: 'guest' },
  GUEST_WIFI_PASSWD: { kind: 'secret', section: 'wifi', scriptDefault: defPass, secret: true, segment: 'guest' },
  GUEST_ISOLATE: { kind: 'flag', section: 'wifi', scriptDefault: unset, segment: 'guest' },
  IOT_WIFI_SSID: { kind: 'text', section: 'wifi', scriptDefault: lit('WrtNova_IoT'), segment: 'iot' },
  IOT_WIFI_PASSWD: { kind: 'secret', section: 'wifi', scriptDefault: defPass, secret: true, segment: 'iot' },
  IOT_NO_DOT11R: { kind: 'flag', section: 'wifi', scriptDefault: unset, segment: 'iot' },
  LAN_VPN_WIFI_SSID: { kind: 'text', section: 'wifi', scriptDefault: lit('WrtNova_VPN'), segment: 'vpn' },
  LAN_VPN_WIFI_PASSWD: { kind: 'secret', section: 'wifi', scriptDefault: defPass, secret: true, segment: 'vpn' },

  CHANNEL_2G: { kind: 'select', section: 'wifi', scriptDefault: unset },
  CHANNEL_5G: { kind: 'select', section: 'wifi', scriptDefault: unset },
  CHANNEL_5G_2: { kind: 'select', section: 'wifi', scriptDefault: unset },
  CHANNEL_6G: { kind: 'select', section: 'wifi', scriptDefault: unset },
  WIFI_LOG_LVL: { kind: 'select', section: 'wifi', scriptDefault: lit('4') },
  WED_ENABLE: { kind: 'flag', section: 'wifi', scriptDefault: unset },

  // -- mesh backhaul --------------------------------------------------------
  WIRELESS_MESH: { kind: 'flag', section: 'wifi', scriptDefault: unset },
  WIRELESS_MESH_2G: { kind: 'flag', section: 'wifi', scriptDefault: unset },
  BATMAN_ADV: { kind: 'flag', section: 'wifi', scriptDefault: unset },
  BATMAN_ALL_VLAN: { kind: 'flag', section: 'wifi', scriptDefault: unset },
  MESH_ID: { kind: 'text', section: 'wifi', scriptDefault: lit('mesh_trunk_backhaul') },
  MESH_PASSWD: { kind: 'secret', section: 'wifi', scriptDefault: defPass, secret: true },

  // -- WireGuard client -----------------------------------------------------
  WG_ENABLE: { kind: 'flag', section: 'security', scriptDefault: unset, segment: 'vpn' },
  WG_PRIVATE_KEY: { kind: 'secret', section: 'security', scriptDefault: { k: 'device' }, secret: true },
  PEER_PUBLIC_KEY: { kind: 'secret', section: 'security', scriptDefault: unset, secret: true },
  ENDPOINT: { kind: 'secret', section: 'security', scriptDefault: lit('1.2.3.4'), secret: true },
  ENDPOINT_PORT: { kind: 'derived', section: 'security', scriptDefault: lit('51820'), secret: true },
  PRESHARED_KEY: { kind: 'secret', section: 'security', scriptDefault: unset, secret: true },
  WG_IPV4: { kind: 'secret', section: 'security', scriptDefault: lit('172.16.0.2/32'), secret: true },
  WG_IPV6: { kind: 'secret', section: 'security', scriptDefault: lit('fd88::/128'), secret: true },
  WG_DNS_V4: { kind: 'text', section: 'security', scriptDefault: unset },
  WG_DNS_V6: { kind: 'text', section: 'security', scriptDefault: unset },
  WG_MTU: { kind: 'text', section: 'security', scriptDefault: unset },
  ALLOWED_IPS: { kind: 'secret', section: 'security', scriptDefault: lit('0.0.0.0/0 ::/0'), secret: true },
  SPLIT_TUNNEL_V4: { kind: 'text', section: 'security', scriptDefault: unset },
  SPLIT_TUNNEL_V6: { kind: 'text', section: 'security', scriptDefault: unset },

  // -- exposure and dynamic DNS ---------------------------------------------
  PORT_FORWARD_LIST: { kind: 'table', section: 'security', scriptDefault: unset },
  IPV6_SERVER_LIST: { kind: 'table', section: 'security', scriptDefault: unset },
  DDNS_ENABLE: { kind: 'flag', section: 'security', scriptDefault: lit('0') },
  LOOKUP_HOSTNAME: { kind: 'text', section: 'security', scriptDefault: lit('ddns.example.com') },
  CLOUDFLARE_API_KEY: { kind: 'secret', section: 'security', scriptDefault: lit('cf_api_key'), secret: true },

  // -- DNS and filtering ----------------------------------------------------
  DNS_MODE: { kind: 'radio', section: 'filtering', scriptDefault: unset, buildOnly: true },
  ADGUARD_MAIN_DNS: { kind: 'flag', section: 'filtering', scriptDefault: unset },
  ADGUARD_PASSWD: { kind: 'derived', section: 'filtering', scriptDefault: { k: 'device' }, secret: true },
  DOH_UPSTREAMS: { kind: 'textarea', section: 'filtering', scriptDefault: { k: 'multi' } },
  BOOTSTRAP_DNS: { kind: 'textarea', section: 'filtering', scriptDefault: lit('1.0.0.1\n9.9.9.9\n2620:fe::9') },
  DNSMASQ_SINGLE_INSTANCE: { kind: 'derived', section: 'filtering', scriptDefault: unset },
  FORCE_DNS: { kind: 'flag', section: 'filtering', scriptDefault: unset },
  BLOCK_DOT_DOQ: { kind: 'flag', section: 'filtering', scriptDefault: unset },
  BLOCK_DOH: { kind: 'flag', section: 'filtering', scriptDefault: unset },
  BANIP_COUNTRY_LIST: { kind: 'chips', section: 'filtering', scriptDefault: unset },
  BANIP_FEEDS: { kind: 'chips', section: 'filtering', scriptDefault: unset },

  // -- performance and maintenance ------------------------------------------
  SOFTWARE_OFFLOAD: { kind: 'flag', section: 'advanced', scriptDefault: unset },
  HARDWARE_OFFLOAD: { kind: 'flag', section: 'advanced', scriptDefault: unset },
  IRQBALANCE: { kind: 'flag', section: 'advanced', scriptDefault: unset, buildOnly: true },
  NON_CT_ATH10K: { kind: 'flag', section: 'advanced', scriptDefault: unset, buildOnly: true },
  LUCI_HTTPS: { kind: 'flag', section: 'advanced', scriptDefault: unset },
  NTP_IP: { kind: 'text', section: 'advanced', scriptDefault: lit('162.159.200.1') },
  QUARTERLY_REBOOT: { kind: 'flag', section: 'advanced', scriptDefault: unset },
  DENY_GUEST_NIGHT: { kind: 'flag', section: 'advanced', scriptDefault: unset, segment: 'guest' },
  LOG: { kind: 'flag', section: 'advanced', scriptDefault: unset },

  // -- escape hatch ---------------------------------------------------------
  CUSTOM_SCRIPT: { kind: 'textarea', section: 'advanced', scriptDefault: unset, ownBlock: true },
};

/**
 * Emission order. Object key order in `FIELDS` is already stable and is the
 * order the block is rendered in, which is what makes the assembled script
 * byte-identical across rebuilds (FR-032).
 */
export const CONFIG_KEYS = Object.keys(FIELDS) as ConfigKey[];

export const SECRET_KEYS: ReadonlySet<ConfigKey> = new Set(
  CONFIG_KEYS.filter((k) => FIELDS[k].secret),
);

export const BUILD_ONLY_KEYS: ReadonlySet<ConfigKey> = new Set(
  CONFIG_KEYS.filter((k) => FIELDS[k].buildOnly),
);

export const FLAG_KEYS: ReadonlySet<ConfigKey> = new Set(
  CONFIG_KEYS.filter((k) => FIELDS[k].kind === 'flag'),
);

/**
 * Entry conveniences the form holds and the derivation transforms away. They
 * have a home in the interface but are never written to the config block, so
 * they are listed separately rather than given a FieldDef.
 */
export const UI_ONLY_KEYS: readonly string[] = [
  'wan_type',
  'IOT_DOT11R_UI',
  'DNSMASQ_MULTI_INSTANCE',
  'additional_packages',
];

export const SECTIONS: readonly SectionId[] = [
  'device',
  'access',
  'networks',
  'wifi',
  'internet',
  'filtering',
  'security',
  'advanced',
];

/**
 * The four LAN-side segments in T568 cable-pair order, which is where their
 * identity colours come from. See specs/001-frontend-rewrite/plan.md.
 */
export const SEGMENTS: ReadonlyArray<{
  id: SegmentId;
  pair: 'blue' | 'orange' | 'green' | 'brown';
  enableKey: ConfigKey | null;
  prefixKey: ConfigKey;
  ifaceKey: ConfigKey;
  vlanKey: ConfigKey;
  subnetKey: ConfigKey;
  defaultVid: number;
}> = [
  { id: 'lan', pair: 'blue', enableKey: null, prefixKey: 'LAN_BASE_PREFIX', ifaceKey: 'LAN_IFACE', vlanKey: 'LAN_VLAN_ID', subnetKey: 'LAN_SUBNET', defaultVid: 1 },
  { id: 'guest', pair: 'orange', enableKey: 'GUEST_ENABLE', prefixKey: 'GUEST_BASE_PREFIX', ifaceKey: 'GUEST_IFACE', vlanKey: 'GUEST_VLAN_ID', subnetKey: 'GUEST_SUBNET', defaultVid: 5 },
  { id: 'iot', pair: 'green', enableKey: 'IOT_ENABLE', prefixKey: 'IOT_BASE_PREFIX', ifaceKey: 'IOT_IFACE', vlanKey: 'IOT_VLAN_ID', subnetKey: 'IOT_SUBNET', defaultVid: 10 },
  { id: 'vpn', pair: 'brown', enableKey: 'WG_ENABLE', prefixKey: 'LAN_VPN_BASE_PREFIX', ifaceKey: 'LAN_VPN_IFACE', vlanKey: 'LAN_VPN_VLAN_ID', subnetKey: 'LAN_VPN_SUBNET', defaultVid: 15 },
];
