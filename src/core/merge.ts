// Fleet configuration: shared settings plus per-node overrides.
//
// There is deliberately no second derivation here. merge() produces a plain
// RawConfig and derive() runs on the result, so the single-node builder and
// every fleet node share one gating path. The previous codebase had two copies
// of these rules and they drifted — an access point's IoT fast-transition
// handling existed in one and not the other.

import type { FleetNode, Network, RawConfig } from './types';
import { derive } from './derive';
import type { EmittedConfig } from './types';

/** Shared config with a node's overrides layered on top. */
export function mergeNodeConfig(
  shared: Partial<RawConfig>,
  overrides: Partial<RawConfig>,
): Partial<RawConfig> {
  const merged: Partial<RawConfig> = { ...shared, ...overrides };
  // An access point always has a management address; default it here rather
  // than letting the script pick, so the interface can show the node's IP.
  if (merged.AP_MODE === '1' && !merged.AP_INDEX) merged.AP_INDEX = '2';
  return merged;
}

/** The emitted config for one node of a fleet. */
export function deriveNodeConfig(
  shared: Partial<RawConfig>,
  overrides: Partial<RawConfig>,
): EmittedConfig {
  return derive(mergeNodeConfig(shared, overrides));
}

/** The LAN-side address a node will answer on, for the plan panel. */
export function nodeLanAddress(net: Network, node: FleetNode): string {
  const cfg = mergeNodeConfig(net.shared_config, node.overrides);
  const prefix = String(cfg.LAN_BASE_PREFIX || cfg.BASE_NET_PREFIX || '192.168');
  const vlan = String(cfg.LAN_VLAN_ID || '1');
  const last = cfg.AP_MODE === '1' ? String(cfg.AP_INDEX || '2') : '1';
  return `${prefix}.${vlan}.${last}`;
}

/** The lowest access-point index not already taken in this network. */
export function nextApIndex(net: Network): number {
  const used = net.nodes
    .filter((n) => n.overrides.AP_MODE === '1')
    .map((n) => parseInt(String(n.overrides.AP_INDEX ?? ''), 10) || 2);
  let i = 2;
  while (used.includes(i)) i++;
  return i;
}
