// The editing store behind a network's shared configuration.
//
// The eight sections write to a `ConfigState` store -- that is the whole reason
// they can be reused unchanged -- and a network stores a flat `shared_config`.
// This is the one place that maps between them: one store per network, seeded
// from what was saved, writing every change straight back through
// networksStore.
//
// HOST_NAME is the single field that does not belong to the shared config: a
// hostname is per-node, or every access point in the house answers to the same
// name (core/storage.ts migrates away exactly that bug). The Access section still
// asks for it, and the answer is routed to the router node, which is the node it
// describes.

import type { Network, RawConfig } from '@core/types';
import { DNS_DEFAULT } from '@core/dns';
import { createConfigStore, INITIAL_RAW, type ConfigStore } from './configStore';
import { routerNode, useNetworksStore } from './networksStore';

const scopes = new Map<string, ConfigStore>();

/** The store for this network, created and wired on first use. */
export function sharedScope(net: Network): ConfigStore {
  const existing = scopes.get(net.id);
  if (existing) return existing;

  const store = createConfigStore();
  const router = routerNode(net);
  store.setState({
    raw: {
      ...INITIAL_RAW,
      ...(net.shared_config as Partial<RawConfig>),
      HOST_NAME: router?.overrides.HOST_NAME ?? '',
    },
    version: net.shared_config.shared_version ?? '',
    // A saved engine that is not the one every network starts with was chosen by
    // someone, and picking hardware must not move it back (FR-022). Within a
    // session the Filtering section sets this flag itself; this is what carries
    // the same fact across a reload, which is all the stored shape can say.
    dnsModeTouched:
      net.shared_config.DNS_MODE !== undefined && net.shared_config.DNS_MODE !== DNS_DEFAULT,
  });

  store.subscribe((state, prev) => {
    if (state.raw === prev.raw && state.version === prev.version) return;
    persist(net.id, state.raw, state.version);
  });

  scopes.set(net.id, store);
  return store;
}

/** The store for a network being edited right now, if there is one. */
export function peekSharedScope(netId: string): ConfigStore | undefined {
  return scopes.get(netId);
}

export function dropSharedScope(netId: string): void {
  scopes.delete(netId);
}

function persist(netId: string, raw: RawConfig, version: string): void {
  const store = useNetworksStore.getState();
  const net = store.networks.find((n) => n.id === netId);
  if (!net) return;

  const { HOST_NAME, ...shared } = raw;
  store.setShared(netId, { ...shared, shared_version: version });

  const router = routerNode(net);
  if (router && (router.overrides.HOST_NAME ?? '') !== HOST_NAME) {
    store.patchOverrides(netId, router.id, { HOST_NAME });
  }
}
