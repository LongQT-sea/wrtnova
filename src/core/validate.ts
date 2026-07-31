// Field validation: which fields are checked, and what a bad value says.
//
// The predicates live in list-grammar.ts and vlan.ts; this is the layer above
// them, mapping a field to a message id the interface localizes. Returning a
// message id rather than a string keeps this module free of the i18n runtime,
// so it stays testable without a DOM or a locale loaded.

import type { ConfigKey, RawConfig } from './types';
import {
  countryValid,
  ddnsHostnameValid,
  firstInvalidHost,
  firstInvalidIpv6Octet,
  firstInvalidPort,
  hostnameValid,
  macValid,
  prefixValid,
  wifiTextValid,
} from './list-grammar';
import { IFACE_KEY_BY_FIELD, ifaceValid, resolveIfaceAssignment } from './vlan';

export interface FieldIssue {
  key: string;
  /** A key into the message catalogue. */
  messageId: string;
  /** Interpolation values for the message. */
  vars?: Record<string, string>;
}

const PREFIX_FIELDS: ConfigKey[] = [
  'BASE_NET_PREFIX',
  'LAN_BASE_PREFIX',
  'GUEST_BASE_PREFIX',
  'IOT_BASE_PREFIX',
  'LAN_VPN_BASE_PREFIX',
];

const IFACE_FIELDS: ConfigKey[] = ['LAN_IFACE', 'GUEST_IFACE', 'IOT_IFACE', 'LAN_VPN_IFACE'];

/** Packed into the pipe-delimited wifi_networks table, so '|' would corrupt it. */
const WIFI_TEXT_FIELDS: ConfigKey[] = [
  'LAN_WIFI_SSID', 'LAN_WIFI_PASSWD',
  'GUEST_WIFI_SSID', 'GUEST_WIFI_PASSWD',
  'IOT_WIFI_SSID', 'IOT_WIFI_PASSWD',
  'LAN_VPN_WIFI_SSID', 'LAN_VPN_WIFI_PASSWD',
];

const VLAN_RANGE: Partial<Record<ConfigKey, { min: number; max: number; noun: string }>> = {
  LAN_VLAN_ID: { min: 1, max: 255, noun: 'lan' },
  GUEST_VLAN_ID: { min: 1, max: 255, noun: 'guest' },
  IOT_VLAN_ID: { min: 1, max: 255, noun: 'iot' },
  LAN_VPN_VLAN_ID: { min: 1, max: 255, noun: 'vpn' },
  WAN_VLAN_ID: { min: 1, max: 4094, noun: 'wan' },
  WAN_B_VLAN_ID: { min: 1, max: 4094, noun: 'wanb' },
};

const MIN_WIFI_PASSWORD = 8;

/** A single field's issue, or null when it is acceptable. */
export function validateField(
  key: string,
  value: string,
  cfg: Partial<RawConfig>,
): FieldIssue | null {
  const v = String(value ?? '');

  const range = VLAN_RANGE[key as ConfigKey];
  if (range) {
    if (v === '') return null;
    const n = Number(v);
    if (!/^\d+$/.test(v) || n < range.min || n > range.max) {
      return {
        key,
        messageId: 'rangeMsg',
        vars: { label: range.noun, min: String(range.min), max: String(range.max) },
      };
    }
    return null;
  }

  if (IFACE_FIELDS.includes(key as ConfigKey)) {
    if (!ifaceValid(v)) return { key, messageId: 'ifaceInvalid', vars: { field: v } };
    // Uniqueness depends on the sibling fields, so it is resolved against the
    // whole config rather than this value alone.
    const rowKey = IFACE_KEY_BY_FIELD[key];
    if (rowKey) {
      const conflict = resolveIfaceAssignment(cfg).byKey[rowKey]?.conflict;
      if (conflict === 'reserved') return { key, messageId: 'ifaceReserved', vars: { field: v } };
      if (conflict === 'dup') return { key, messageId: 'ifaceDup', vars: { field: v } };
    }
    return null;
  }

  if (PREFIX_FIELDS.includes(key as ConfigKey)) {
    return prefixValid(v) ? null : { key, messageId: 'prefixInvalid', vars: { field: v } };
  }

  if (WIFI_TEXT_FIELDS.includes(key as ConfigKey)) {
    if (!wifiTextValid(v)) return { key, messageId: 'wifiPipeInvalid', vars: { field: key } };
    // A passphrase shorter than 8 characters is rejected by WPA itself.
    if (key.endsWith('_PASSWD') && v !== '' && v.length < MIN_WIFI_PASSWORD) {
      return { key, messageId: 'wifiPassTooShort', vars: { field: key } };
    }
    return null;
  }

  switch (key) {
    case 'COUNTRY_CODE':
      return countryValid(v) ? null : { key, messageId: 'countryInvalid', vars: { field: v } };
    case 'HOST_NAME':
      return hostnameValid(v) ? null : { key, messageId: 'hostnameInvalid', vars: { field: v } };
    case 'LOOKUP_HOSTNAME':
      return ddnsHostnameValid(v)
        ? null
        : { key, messageId: 'ddnsHostnameInvalid', vars: { field: v } };
    case 'WAN_MAC_ADDR':
      return macValid(v) ? null : { key, messageId: 'macInvalid', vars: { field: v } };
    case 'MESH_PASSWD':
      return v !== '' && v.length < MIN_WIFI_PASSWORD
        ? { key, messageId: 'wifiPassTooShort', vars: { field: key } }
        : null;
    case 'PORT_FORWARD_LIST': {
      const badHost = firstInvalidHost(v);
      if (badHost) return { key, messageId: 'hostnameInvalid', vars: { field: badHost } };
      const badPort = firstInvalidPort(v);
      if (badPort) return { key, messageId: 'portInvalid', vars: { field: badPort } };
      return null;
    }
    case 'IPV6_SERVER_LIST': {
      const badHost = firstInvalidHost(v);
      if (badHost) return { key, messageId: 'hostnameInvalid', vars: { field: badHost } };
      const badOctet = firstInvalidIpv6Octet(v);
      if (badOctet !== null) return { key, messageId: 'octetV6Invalid', vars: { field: badOctet } };
      const badPort = firstInvalidPort(v);
      if (badPort) return { key, messageId: 'portInvalid', vars: { field: badPort } };
      return null;
    }
    default:
      return null;
  }
}

/**
 * Under a shared-password VLAN scheme there is one SSID and the password the
 * client types is what selects its network, so the participating networks'
 * passwords must differ. A blank field resolves to the script's shared default,
 * so at most one participant may be blank.
 */
export function pskVlanIssue(cfg: Partial<RawConfig>): FieldIssue | null {
  if (cfg.PSK_VLAN !== '1') return null;
  const participants = [
    { label: 'LAN', pass: cfg.LAN_WIFI_PASSWD ?? '', active: true },
    { label: 'Guest', pass: cfg.GUEST_WIFI_PASSWD ?? '', active: cfg.GUEST_ENABLE === '1' },
    { label: 'VPN', pass: cfg.LAN_VPN_WIFI_PASSWD ?? '', active: cfg.WG_ENABLE === '1' },
    {
      label: 'IoT',
      pass: cfg.IOT_WIFI_PASSWD ?? '',
      // IoT keeps its own SSID when fast transition is off for it, so it is not
      // steered by password and does not participate.
      active: cfg.IOT_ENABLE === '1' && cfg.IOT_DOT11R_UI === '1',
    },
  ].filter((p) => p.active);

  if (participants.length < 2) return null;
  const effective = participants.map((p) => p.pass || '12345678');
  if (new Set(effective).size === effective.length) return null;
  return {
    key: 'PSK_VLAN',
    messageId: 'pskVlanPass',
    vars: { networks: participants.map((p) => p.label).join(', ') },
  };
}

/** Every issue in a configuration, in schema order. Empty means buildable. */
export function validateConfig(cfg: Partial<RawConfig>): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const [key, value] of Object.entries(cfg)) {
    if (typeof value !== 'string') continue;
    const issue = validateField(key, value, cfg);
    if (issue) issues.push(issue);
  }
  const psk = pskVlanIssue(cfg);
  if (psk) issues.push(psk);
  return issues;
}
