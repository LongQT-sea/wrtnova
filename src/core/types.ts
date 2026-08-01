// The configuration contract.
//
// Constitution IV: an off control emits '' and never '0'. That is enforced here
// by the type: `Flag` has no '0' member, so a boolean key holding '0' does not
// type-check. The renderer still skips '0' defensively, for values arriving from
// history written by an older version of the app.

export type Flag = '' | '1';

export type SectionId =
  | 'device'
  | 'access'
  | 'networks'
  | 'wifi'
  | 'internet'
  | 'filtering'
  | 'security'
  | 'advanced';

/** The four LAN-side networks. Their order is the T568 cable-pair order. */
export type SegmentId = 'lan' | 'guest' | 'iot' | 'vpn';

export type DnsMode =
  | 'adguardhome'
  | 'dnsproxy'
  | 'https-dns-proxy'
  | 'adblock-fast'
  | 'none';

/**
 * Keys written into the config block, plus the build-only keys the browser
 * consumes for package resolution. Every value is a string; '' means "leave the
 * provisioning script's own default in force".
 */
export interface Config {
  // -- role -----------------------------------------------------------------
  AP_MODE: Flag;
  AP_INDEX: string;
  AP_DISABLE: Flag;
  INDEX_SUFFIX: Flag;

  // -- identity and access --------------------------------------------------
  HOST_NAME: string;
  ROOT_PASSWD: string;
  SSH_PUBLIC_KEY: string;
  SSH_PASSWD_AUTH: string;
  ZONE_NAME: string;
  TIME_ZONE: string;
  TIME_FORMAT: string;

  // -- upstream -------------------------------------------------------------
  PPPOE_USERNAME: string;
  PPPOE_PASSWD: string;
  WAN_MAC_ADDR: string;
  WAN_IS_TAGGED: Flag;
  WAN_VLAN_ID: string;
  WAN_B_ENABLE: Flag;
  WAN_B_VLAN_ID: string;
  BRIDGE_WAN_PORT: Flag;
  CELLULAR_MODEM: Flag;
  USB_TETHERING: Flag;

  // -- networks -------------------------------------------------------------
  BASE_NET_PREFIX: string;
  DEFAULT_SUBNET: string;
  GUEST_ENABLE: Flag;
  IOT_ENABLE: Flag;
  IOT_INTERNET: Flag;
  IOT_ROUTE_VIA_WG: Flag;
  LAN_BASE_PREFIX: string;
  LAN_IFACE: string;
  LAN_VLAN_ID: string;
  LAN_SUBNET: string;
  GUEST_BASE_PREFIX: string;
  GUEST_IFACE: string;
  GUEST_VLAN_ID: string;
  GUEST_SUBNET: string;
  IOT_BASE_PREFIX: string;
  IOT_IFACE: string;
  IOT_VLAN_ID: string;
  IOT_SUBNET: string;
  LAN_VPN_BASE_PREFIX: string;
  LAN_VPN_IFACE: string;
  LAN_VPN_VLAN_ID: string;
  LAN_VPN_SUBNET: string;
  ADDITIONAL_VLAN_LIST: string;
  TAGGED_LAN_VLAN: Flag;
  BRIDGE_STP: Flag;
  P_STEERING: string;
  ULA_PREFIX: string;

  // -- wireless -------------------------------------------------------------
  COUNTRY_CODE: string;
  DOT11KV: Flag;
  DOT11R: Flag;
  DENSE_ENV: Flag;
  PSK_VLAN: Flag;
  BAND_SUFFIX: Flag;
  LAN_WIFI_SSID: string;
  LAN_WIFI_PASSWD: string;
  GUEST_WIFI_SSID: string;
  GUEST_WIFI_PASSWD: string;
  GUEST_ISOLATE: Flag;
  IOT_WIFI_SSID: string;
  IOT_WIFI_PASSWD: string;
  IOT_NO_DOT11R: Flag;
  LAN_VPN_WIFI_SSID: string;
  LAN_VPN_WIFI_PASSWD: string;
  CHANNEL_2G: string;
  CHANNEL_5G: string;
  CHANNEL_5G_2: string;
  CHANNEL_6G: string;
  WIFI_LOG_LVL: string;
  WED_ENABLE: Flag;

  // -- mesh backhaul --------------------------------------------------------
  WIRELESS_MESH: Flag;
  WIRELESS_MESH_2G: Flag;
  BATMAN_ADV: Flag;
  BATMAN_ALL_VLAN: Flag;
  MESH_ID: string;
  MESH_PASSWD: string;

  // -- WireGuard client -----------------------------------------------------
  WG_ENABLE: Flag;
  WG_PRIVATE_KEY: string;
  PEER_PUBLIC_KEY: string;
  /** Emitted host-only; the port is split out into ENDPOINT_PORT. */
  ENDPOINT: string;
  ENDPOINT_PORT: string;
  PRESHARED_KEY: string;
  WG_IPV4: string;
  WG_IPV6: string;
  WG_DNS_V4: string;
  WG_DNS_V6: string;
  WG_MTU: string;
  ALLOWED_IPS: string;
  SPLIT_TUNNEL_V4: string;
  SPLIT_TUNNEL_V6: string;

  // -- exposure and dynamic DNS ---------------------------------------------
  PORT_FORWARD_LIST: string;
  IPV6_SERVER_LIST: string;
  DDNS_ENABLE: Flag;
  LOOKUP_HOSTNAME: string;
  CLOUDFLARE_API_KEY: string;

  // -- DNS and filtering ----------------------------------------------------
  /** BUILD-ONLY: drives package selection, never written to the block. */
  DNS_MODE: DnsMode;
  ADGUARD_MAIN_DNS: Flag;
  /** Derived from ROOT_PASSWD at build time. */
  ADGUARD_PASSWD: string;
  DOH_UPSTREAMS: string;
  BOOTSTRAP_DNS: string;
  DNSMASQ_SINGLE_INSTANCE: Flag;
  FORCE_DNS: Flag;
  BLOCK_DOT_DOQ: Flag;
  BLOCK_DOH: Flag;
  BANIP_COUNTRY_LIST: string;
  BANIP_FEEDS: string;

  // -- performance and maintenance ------------------------------------------
  SOFTWARE_OFFLOAD: Flag;
  HARDWARE_OFFLOAD: Flag;
  /** BUILD-ONLY. */
  IRQBALANCE: Flag;
  /** BUILD-ONLY. */
  NON_CT_ATH10K: Flag;
  LUCI_HTTPS: Flag;
  NTP_IP: string;
  QUARTERLY_REBOOT: Flag;
  DENY_GUEST_NIGHT: Flag;
  LOG: Flag;

  // -- escape hatch ---------------------------------------------------------
  /** Emitted as a decode block, not KEY=value. */
  CUSTOM_SCRIPT: string;
}

export type ConfigKey = keyof Config;

/**
 * Entry conveniences the form holds that are transformed before emission. They
 * are never written into the config block.
 */
export interface UiOnly {
  /** Gates PPPOE_*. */
  wan_type: 'dhcp' | 'pppoe';
  /**
   * Shown as the positive ("IoT fast transition", default on); the config key
   * IOT_NO_DOT11R is the negative, so this inverts on emit.
   */
  IOT_DOT11R_UI: Flag;
  /** Inverts into DNSMASQ_SINGLE_INSTANCE. */
  DNSMASQ_MULTI_INSTANCE: Flag;
  /** BUILD-ONLY free-form package list. */
  additional_packages: string;
}

/** What the store holds and the form writes. */
export type RawConfig = Config & UiOnly;

/** What derive() produces and the renderer consumes. */
export type EmittedConfig = Config;

// -- device ------------------------------------------------------------------

export interface DeviceImage {
  name: string;
  type: string;
  sha256?: string;
}

export interface DeviceTarget {
  title: string;
  profile: string;
  target: string;
  version: string;
  version_code: string;
  default_packages: string[];
  device_packages: string[];
  images: DeviceImage[];
}

// -- fleet -------------------------------------------------------------------

export interface FleetNode {
  id: string;
  name: string;
  device_target: DeviceTarget;
  overrides: Partial<RawConfig>;
  /**
   * A release this node builds at instead of the network's. Absent or empty
   * means it follows `shared_version`, so raising the fleet default carries every
   * node that had not pinned one.
   */
  version?: string;
  last_build: { ts: number; firmware_url: string | null } | null;
}

export interface Network {
  id: string;
  name: string;
  shared_config: Partial<RawConfig> & { shared_version?: string };
  nodes: FleetNode[];
  warp_refresh_token?: string;
}

// -- history -----------------------------------------------------------------

export interface BuildResult {
  status: 'queued' | 'success' | 'error';
  firmware_url: string | null;
}

export interface HistoryEntry {
  ts: number;
  device: { title: string; profile: string; target: string; version: string };
  /** Secrets are stripped before this is written (FR-034). */
  config: Partial<Config>;
  additional_packages: string[];
  warp_refresh_token: string;
  result: BuildResult;
}

// -- WARP --------------------------------------------------------------------

/** Uppercase keys, exactly as /api/warp/register returns them (Constitution VI). */
export interface WarpRegistration {
  WG_PRIVATE_KEY: string;
  PEER_PUBLIC_KEY: string;
  ENDPOINT: string;
  ENDPOINT_PORT: string;
  WG_IPV4: string;
  WG_IPV6: string;
  ALLOWED_IPS: string;
  warp_refresh_token: string;
}
