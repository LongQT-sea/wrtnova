// The fleet: saved networks and the nodes in them.
//
// A network is a shared configuration plus a list of nodes that layer overrides
// on top of it (core/merge.ts). This store owns the list and writes every change
// straight through to localStorage, because there is no save button: the previous
// version of the app saved on change and losing a half-configured fleet to a
// closed tab would be a worse trade than a few extra writes.
//
// The stored shape is UNCHANGED from that version, and core/storage.ts migrates
// what older ones wrote (renamed VPN keys, a stray WAN_MAC_ADDR in router
// overrides, HOST_NAME moved out of the shared config).

import { create } from 'zustand';
import type { DeviceTarget, FleetNode, Network, RawConfig } from '@core/types';
import { nextApIndex } from '@core/merge';
import { readNetworks, writeNetworks } from '@core/storage';
import { INITIAL_RAW } from './configStore';

export const uid = (): string => Math.random().toString(36).slice(2, 10);

/** A node before its hardware is chosen. Every field the picker will fill. */
export function emptyTarget(): DeviceTarget {
  return {
    title: '',
    profile: '',
    target: '',
    version: '',
    version_code: '',
    default_packages: [],
    device_packages: [],
    images: [],
  };
}

/**
 * The configuration a new network starts from: the same opinionated defaults
 * /builder opens with, so a fleet and a single router agree on what "untouched"
 * means.
 */
export function initialShared(): Network['shared_config'] {
  return { ...INITIAL_RAW, shared_version: '' };
}

export interface NetworksState {
  networks: Network[];
  /** Read and migrate what previous versions wrote. */
  load: () => void;

  create: (name: string) => Network;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;

  setShared: (id: string, shared: Network['shared_config']) => void;

  /** Append an access point, at the lowest index not already taken (FR-039). */
  addAp: (id: string, name: (index: number) => string) => FleetNode | null;
  patchNode: (netId: string, nodeId: string, patch: Partial<FleetNode>) => void;
  patchOverrides: (netId: string, nodeId: string, patch: Partial<RawConfig>) => void;
  removeNode: (netId: string, nodeId: string) => void;
  recordBuild: (netId: string, nodeId: string, firmwareUrl: string | null) => void;
}

function persist(networks: Network[]): Network[] {
  writeNetworks(networks);
  return networks;
}

/** Replace one network in place, leaving the others' identities untouched. */
function mapNet(networks: Network[], id: string, fn: (net: Network) => Network): Network[] {
  return networks.map((n) => (n.id === id ? fn(n) : n));
}

function mapNode(net: Network, nodeId: string, fn: (node: FleetNode) => FleetNode): Network {
  return { ...net, nodes: net.nodes.map((n) => (n.id === nodeId ? fn(n) : n)) };
}

export const useNetworksStore = create<NetworksState>((set, get) => ({
  networks: [],

  load: () => set({ networks: readNetworks() }),

  create: (name) => {
    // Every network has a router. An access point without one has nothing to
    // point at, so the first node is not the user's to add or delete.
    const net: Network = {
      id: uid(),
      name,
      shared_config: initialShared(),
      nodes: [
        {
          id: uid(),
          name,
          device_target: emptyTarget(),
          overrides: { AP_MODE: '' },
          last_build: null,
        },
      ],
    };
    set({ networks: persist([...get().networks, net]) });
    return net;
  },

  rename: (id, name) =>
    set({ networks: persist(mapNet(get().networks, id, (net) => ({ ...net, name }))) }),

  remove: (id) => set({ networks: persist(get().networks.filter((n) => n.id !== id)) }),

  setShared: (id, shared) =>
    set({
      networks: persist(mapNet(get().networks, id, (net) => ({ ...net, shared_config: shared }))),
    }),

  addAp: (id, name) => {
    const net = get().networks.find((n) => n.id === id);
    if (!net) return null;
    const index = nextApIndex(net);
    const node: FleetNode = {
      id: uid(),
      name: name(index),
      device_target: emptyTarget(),
      overrides: { AP_MODE: '1', AP_INDEX: String(index) },
      last_build: null,
    };
    set({
      networks: persist(mapNet(get().networks, id, (n) => ({ ...n, nodes: [...n.nodes, node] }))),
    });
    return node;
  },

  patchNode: (netId, nodeId, patch) =>
    set({
      networks: persist(
        mapNet(get().networks, netId, (net) =>
          mapNode(net, nodeId, (node) => ({ ...node, ...patch })),
        ),
      ),
    }),

  patchOverrides: (netId, nodeId, patch) =>
    set({
      networks: persist(
        mapNet(get().networks, netId, (net) =>
          mapNode(net, nodeId, (node) => ({ ...node, overrides: { ...node.overrides, ...patch } })),
        ),
      ),
    }),

  removeNode: (netId, nodeId) =>
    set({
      networks: persist(
        mapNet(get().networks, netId, (net) => ({
          ...net,
          nodes: net.nodes.filter((n) => n.id !== nodeId),
        })),
      ),
    }),

  recordBuild: (netId, nodeId, firmwareUrl) =>
    set({
      networks: persist(
        mapNet(get().networks, netId, (net) =>
          mapNode(net, nodeId, (node) => ({
            ...node,
            last_build: { ts: Date.now(), firmware_url: firmwareUrl },
          })),
        ),
      ),
    }),
}));

// -- reading a network -------------------------------------------------------

export const isAp = (node: FleetNode): boolean => node.overrides.AP_MODE === '1';

/** The node every other one points at. A network always has exactly one. */
export function routerNode(net: Network): FleetNode | undefined {
  return net.nodes.find((n) => !isAp(n));
}

/**
 * The release a node builds at: its own pick, else the board it resolved
 * against, else the network default.
 */
export function nodeVersion(net: Network, node: FleetNode): string {
  return node.version || node.device_target.version || (net.shared_config.shared_version ?? '');
}

export const isConfigured = (node: FleetNode): boolean => node.device_target.profile !== '';
