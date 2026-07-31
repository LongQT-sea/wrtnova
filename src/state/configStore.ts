// The single source of truth for /builder.
//
// The store holds one flat `RawConfig` -- exactly what the form writes, with no
// cross-field gating applied -- and everything the interface shows is a pure
// selector over it. That is the model the previous codebase converged on, and it
// is the right one: gating lives in core/derive.ts, is tested without a DOM, and
// cannot drift from what gets built.
//
// Zustand rather than context, for selector-level subscriptions: typing in one of
// roughly 110 inputs must not re-render the other 109.

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { DeviceTarget, EmittedConfig, RawConfig } from '@core/types';
import { derive } from '@core/derive';
import { DNS_DEFAULT } from '@core/dns';
import { resolveIfaceAssignment, resolveVlanAssignment, type IfaceResult, type VlanResult } from '@core/vlan';
import { ASU_DEFAULT } from '@core/asu';

/**
 * The starting configuration.
 *
 * Every value here is what the form shows before the user touches anything. It is
 * NOT the same thing as a wrtnova.sh default: a key whose value equals the
 * script's own fallback is dropped at render time (Constitution V), so seeding a
 * field with '' and seeding it with the script's default are both correct and ''
 * is the honest one. The non-empty entries below are the opinionated defaults
 * this product ships -- guest network on, roaming on, forced DNS on.
 */
export const INITIAL_RAW: RawConfig = {
  AP_MODE: '',
  AP_INDEX: '2',
  AP_DISABLE: '',
  INDEX_SUFFIX: '',

  HOST_NAME: '',
  ROOT_PASSWD: '',
  SSH_PUBLIC_KEY: '',
  SSH_PASSWD_AUTH: '',
  ZONE_NAME: '',
  TIME_ZONE: '',
  TIME_FORMAT: '',

  PPPOE_USERNAME: '',
  PPPOE_PASSWD: '',
  WAN_MAC_ADDR: '',
  WAN_IS_TAGGED: '',
  WAN_VLAN_ID: '',
  WAN_B_ENABLE: '',
  WAN_B_VLAN_ID: '',
  BRIDGE_WAN_PORT: '',
  CELLULAR_MODEM: '',
  USB_TETHERING: '',

  BASE_NET_PREFIX: '',
  DEFAULT_SUBNET: '',
  GUEST_ENABLE: '1',
  IOT_ENABLE: '',
  IOT_INTERNET: '1',
  IOT_ROUTE_VIA_WG: '',
  LAN_BASE_PREFIX: '',
  LAN_IFACE: '',
  LAN_VLAN_ID: '',
  LAN_SUBNET: '',
  GUEST_BASE_PREFIX: '',
  GUEST_IFACE: '',
  GUEST_VLAN_ID: '',
  GUEST_SUBNET: '',
  IOT_BASE_PREFIX: '',
  IOT_IFACE: '',
  IOT_VLAN_ID: '',
  IOT_SUBNET: '',
  LAN_VPN_BASE_PREFIX: '',
  LAN_VPN_IFACE: '',
  LAN_VPN_VLAN_ID: '',
  LAN_VPN_SUBNET: '',
  ADDITIONAL_VLAN_LIST: '',
  TAGGED_LAN_VLAN: '',
  BRIDGE_STP: '',
  P_STEERING: '',
  ULA_PREFIX: '',

  COUNTRY_CODE: '',
  DOT11KV: '1',
  DOT11R: '1',
  DENSE_ENV: '',
  PSK_VLAN: '',
  BAND_SUFFIX: '',
  LAN_WIFI_SSID: '',
  LAN_WIFI_PASSWD: '',
  GUEST_WIFI_SSID: '',
  GUEST_WIFI_PASSWD: '',
  GUEST_ISOLATE: '',
  IOT_WIFI_SSID: '',
  IOT_WIFI_PASSWD: '',
  IOT_NO_DOT11R: '',
  LAN_VPN_WIFI_SSID: '',
  LAN_VPN_WIFI_PASSWD: '',
  CHANNEL_2G: '',
  CHANNEL_5G: '',
  CHANNEL_5G_2: '',
  CHANNEL_6G: '',
  WIFI_LOG_LVL: '',
  WED_ENABLE: '',

  WIRELESS_MESH: '',
  WIRELESS_MESH_2G: '',
  BATMAN_ADV: '',
  BATMAN_ALL_VLAN: '',
  MESH_ID: '',
  MESH_PASSWD: '',

  WG_ENABLE: '',
  WG_PRIVATE_KEY: '',
  PEER_PUBLIC_KEY: '',
  ENDPOINT: '',
  ENDPOINT_PORT: '',
  PRESHARED_KEY: '',
  WG_IPV4: '',
  WG_IPV6: '',
  WG_DNS_V4: '',
  WG_DNS_V6: '',
  WG_MTU: '',
  ALLOWED_IPS: '',
  SPLIT_TUNNEL_V4: '',
  SPLIT_TUNNEL_V6: '',

  PORT_FORWARD_LIST: '',
  IPV6_SERVER_LIST: '',
  DDNS_ENABLE: '',
  LOOKUP_HOSTNAME: '',
  CLOUDFLARE_API_KEY: '',

  DNS_MODE: DNS_DEFAULT,
  ADGUARD_MAIN_DNS: '',
  ADGUARD_PASSWD: '',
  DOH_UPSTREAMS: '',
  BOOTSTRAP_DNS: '',
  DNSMASQ_SINGLE_INSTANCE: '',
  FORCE_DNS: '1',
  BLOCK_DOT_DOQ: '',
  BLOCK_DOH: '',
  BANIP_COUNTRY_LIST: '',
  BANIP_FEEDS: '',

  SOFTWARE_OFFLOAD: '1',
  HARDWARE_OFFLOAD: '',
  IRQBALANCE: '',
  NON_CT_ATH10K: '',
  LUCI_HTTPS: '',
  NTP_IP: '',
  QUARTERLY_REBOOT: '',
  DENY_GUEST_NIGHT: '',
  LOG: '',

  CUSTOM_SCRIPT: '',

  // UI-only entry conveniences, transformed away by derive().
  wan_type: 'dhcp',
  IOT_DOT11R_UI: '1',
  DNSMASQ_MULTI_INSTANCE: '',
  additional_packages: '',
};

export interface ConfigState {
  raw: RawConfig;

  /** The chosen board, resolved from the release's device index. */
  target: DeviceTarget | null;
  /** The release being built, which the device index is read from. */
  version: string;
  /** Set when the requested release had no published index (FR-005). */
  fellBackFrom: string | null;

  /**
   * Whether the user has picked a DNS engine themselves. Until they do, the
   * default tracks the selected hardware; afterwards their choice is sticky
   * across device changes (FR-022).
   */
  dnsModeTouched: boolean;

  /** The build server, always one the user chose (Constitution III). */
  asuUrl: string;

  set: <K extends keyof RawConfig>(key: K, value: RawConfig[K]) => void;
  patch: (p: Partial<RawConfig>) => void;
  setTarget: (target: DeviceTarget | null) => void;
  setVersion: (version: string) => void;
  setFellBackFrom: (from: string | null) => void;
  markDnsTouched: () => void;
  setAsuUrl: (url: string) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  raw: INITIAL_RAW,
  target: null,
  version: '',
  fellBackFrom: null,
  dnsModeTouched: false,
  asuUrl: ASU_DEFAULT,

  set: (key, value) =>
    set((s) => (s.raw[key] === value ? s : { raw: { ...s.raw, [key]: value } })),
  patch: (p) => set((s) => ({ raw: { ...s.raw, ...p } })),
  setTarget: (target) => set({ target }),
  setVersion: (version) => set({ version }),
  setFellBackFrom: (fellBackFrom) => set({ fellBackFrom }),
  markDnsTouched: () => set({ dnsModeTouched: true }),
  setAsuUrl: (asuUrl) => set({ asuUrl }),
}));

// -- derived selectors -------------------------------------------------------
//
// Keyed on the raw object's identity, which only changes when a value changes, so
// a selector that returns a fresh object still hands React a stable reference and
// does not force a re-render.

function memo1<T>(fn: (raw: RawConfig) => T): (raw: RawConfig) => T {
  const cache = new WeakMap<RawConfig, T>();
  return (raw) => {
    const hit = cache.get(raw);
    if (hit !== undefined) return hit;
    const out = fn(raw);
    cache.set(raw, out);
    return out;
  };
}

const emittedOf = memo1(derive);
const vlanOf = memo1(resolveVlanAssignment);
const ifaceOf = memo1(resolveIfaceAssignment);

/** One field's value. The narrowest possible subscription. */
export function useField<K extends keyof RawConfig>(key: K): RawConfig[K] {
  return useConfigStore((s) => s.raw[key]);
}

/** A field plus its setter, which is what almost every control needs. */
export function useFieldState<K extends keyof RawConfig>(
  key: K,
): [RawConfig[K], (v: RawConfig[K]) => void] {
  const value = useConfigStore((s) => s.raw[key]);
  const set = useConfigStore((s) => s.set);
  return [value, (v) => set(key, v)];
}

export function useRaw(): RawConfig {
  return useConfigStore((s) => s.raw);
}

/** The gated config: what would actually be written into the script. */
export function useEmitted(): EmittedConfig {
  return useConfigStore((s) => emittedOf(s.raw));
}

export function useVlanPlan(): VlanResult {
  return useConfigStore((s) => vlanOf(s.raw));
}

export function useIfacePlan(): IfaceResult {
  return useConfigStore((s) => ifaceOf(s.raw));
}

export function useDevice(): { target: DeviceTarget | null; version: string } {
  return useConfigStore(useShallow((s) => ({ target: s.target, version: s.version })));
}

/** Non-reactive read, for the build path and for tests. */
export const readState = (): ConfigState => useConfigStore.getState();

export const emittedFrom = emittedOf;
