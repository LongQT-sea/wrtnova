// One node of a fleet, as the interface needs it.
//
// A node has no configuration of its own: it is the network's shared config with
// its overrides layered on top (core/merge.ts), and everything downstream --
// gating, the plan, validation, the package set, the emitted block -- runs on the
// result through exactly the same functions the single-node builder uses. There
// is deliberately no second derivation.

import type { FleetNode, Network, RawConfig } from '@core/types';
import { mergeNodeConfig } from '@core/merge';
import { planOf, type Plan } from './plan';
import { INITIAL_RAW } from './configStore';
import { sweep, type FieldIssue } from './validation';

/**
 * The merged configuration, completed against the starting config.
 *
 * The completion matters for two reasons: a network saved by an older version may
 * not carry a key this one has, and HOST_NAME is deliberately absent from every
 * shared config -- a hostname is per-node, or every access point answers to the
 * same name.
 */
export function nodeRaw(net: Network, node: FleetNode): RawConfig {
  return { ...INITIAL_RAW, ...mergeNodeConfig(net.shared_config, node.overrides) };
}

// Keyed on both halves of the merge, so a node's plan is recomputed when its own
// overrides change or when the shared config moves under it, and not otherwise.
const rawCache = new WeakMap<object, WeakMap<object, RawConfig>>();

export function nodeRawCached(net: Network, node: FleetNode): RawConfig {
  let byOverrides = rawCache.get(net.shared_config);
  if (!byOverrides) {
    byOverrides = new WeakMap();
    rawCache.set(net.shared_config, byOverrides);
  }
  const hit = byOverrides.get(node.overrides);
  if (hit) return hit;
  const raw = nodeRaw(net, node);
  byOverrides.set(node.overrides, raw);
  return raw;
}

/** The lanes this node will create, in the same shape the plan panel draws. */
export function nodePlan(net: Network, node: FleetNode): Plan {
  return planOf(nodeRawCached(net, node));
}

/** Everything that would refuse this node's build, most important first. */
export function nodeIssues(net: Network, node: FleetNode): FieldIssue[] {
  return sweep(nodeRawCached(net, node));
}
