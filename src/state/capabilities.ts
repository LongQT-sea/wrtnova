// What the selected release and board actually support.
//
// FR-023: a setting the target cannot honour must be withheld, and any stored
// value for it cleared -- otherwise a config saved against a Filogic board keeps
// emitting WED_ENABLE after the user switches to an ath79 one, and the build
// quietly carries a setting that board has no driver for.
//
// Kept pure and separate from the store so both halves are testable: `capsFor`
// answers what is supported, `clearUnsupported` answers what to erase.

import type { DeviceTarget, RawConfig } from '@core/types';
import { hasAth10kCt, isWedCapable } from '@core/openwrt';
import { isSwconfigTarget } from '@core/vlan';

export interface Capabilities {
  /** Packet steering "all CPUs" (P_STEERING=2) landed in OpenWrt 24. */
  steeringAllCpus: boolean;
  /** The 12/24-hour LuCI setting landed in OpenWrt 25. */
  timeFormat: boolean;
  /** The board ships Candela (CT) ath10k firmware, so swapping it is meaningful. */
  ath10kCt: boolean;
  /** The board has the mt7915e driver WED needs. */
  wed: boolean;
  /** A 16-slot swconfig hardware VLAN table rather than DSA bridge-vlan. */
  swconfig: boolean;
}

/**
 * The release's major version. SNAPSHOT and anything unparseable are treated as
 * newest: withholding a new option on a snapshot build would be wrong, and a
 * snapshot is by definition ahead of the last release.
 */
export function majorOf(version: string): number {
  const major = parseInt(String(version).split('.')[0] ?? '', 10);
  return Number.isNaN(major) ? Number.POSITIVE_INFINITY : major;
}

export function capsFor(target: DeviceTarget | null, version: string): Capabilities {
  const major = majorOf(version);
  return {
    steeringAllCpus: major >= 24,
    timeFormat: major >= 25,
    ath10kCt: target !== null && hasAth10kCt(target),
    wed: target !== null && isWedCapable(target),
    swconfig: target !== null && isSwconfigTarget(target.target),
  };
}

/**
 * The patch that erases values the target cannot honour. Empty when there is
 * nothing to clear, so the caller can skip a no-op store write.
 */
export function clearUnsupported(raw: RawConfig, caps: Capabilities): Partial<RawConfig> {
  const patch: Partial<RawConfig> = {};
  if (!caps.steeringAllCpus && raw.P_STEERING === '2') patch.P_STEERING = '';
  if (!caps.timeFormat && raw.TIME_FORMAT !== '') patch.TIME_FORMAT = '';
  if (!caps.ath10kCt && raw.NON_CT_ATH10K !== '') patch.NON_CT_ATH10K = '';
  if (!caps.wed && raw.WED_ENABLE !== '') patch.WED_ENABLE = '';
  return patch;
}

/**
 * The DNS engine a board should default to: AdGuard Home wants >=32 MB flash and
 * >=230 MB RAM, which the low-flash swconfig targets do not have, so they fall
 * back to the lightweight https-dns-proxy. Never applied over an explicit choice
 * (FR-022) -- that check belongs to the caller, which knows whether the user has
 * touched the control.
 */
export function dnsDefaultFor(target: DeviceTarget | null): Partial<RawConfig> {
  const desired = target && isSwconfigTarget(target.target) ? 'https-dns-proxy' : 'adguardhome';
  // Leaving AdGuard Home also drops its port-53 sub-option, which is meaningless
  // for any other engine.
  return desired === 'adguardhome'
    ? { DNS_MODE: 'adguardhome' }
    : { DNS_MODE: desired, ADGUARD_MAIN_DNS: '' };
}
