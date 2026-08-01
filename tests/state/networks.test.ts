// The fleet: what a network holds, and what a node inherits from it (US4).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceTarget, FleetNode, Network } from '@core/types';
import { MARKER, __resetScriptCache } from '@core/script';
import { KEYS } from '@core/storage';
import { INITIAL_RAW } from '@state/configStore';
import { nodeIssues, nodePlan, nodeRaw } from '@state/fleet';
import { buildOf, useFleetBuildStore } from '@state/fleetBuild';
import { isConfigured, nodeVersion, routerNode, useNetworksStore } from '@state/networksStore';

const board = (over: Partial<DeviceTarget> = {}): DeviceTarget => ({
  title: 'GL.iNet GL-MT6000',
  profile: 'glinet_gl-mt6000',
  target: 'mediatek/filogic',
  version: '25.12.5',
  version_code: 'r1',
  default_packages: [],
  device_packages: [],
  images: [],
  ...over,
});

// jsdom is not loaded for these, so localStorage is stubbed the way core/storage
// expects: a failure to persist must never break the build path.
const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  globalThis.localStorage = {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
    clear: () => stored.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
  useNetworksStore.setState({ networks: [] });
  useFleetBuildStore.setState({ builds: {} });
  __resetScriptCache();
});

const store = () => useNetworksStore.getState();
const saved = (): Network[] => JSON.parse(stored.get(KEYS.networks) ?? '[]') as Network[];

describe('a network', () => {
  it('starts with a router node and the shipped defaults', () => {
    const net = store().create('Home');
    expect(net.nodes).toHaveLength(1);
    expect(routerNode(net)?.overrides.AP_MODE).toBe('');
    expect(net.shared_config.GUEST_ENABLE).toBe(INITIAL_RAW.GUEST_ENABLE);
    expect(isConfigured(net.nodes[0] as FleetNode)).toBe(false);
  });

  it('persists every change as it is made', () => {
    const net = store().create('Home');
    expect(saved()).toHaveLength(1);
    store().rename(net.id, 'Cabin');
    expect(saved()[0]?.name).toBe('Cabin');
    store().remove(net.id);
    expect(saved()).toHaveLength(0);
  });

  it('gives each access point the lowest index not already taken (FR-039)', () => {
    const net = store().create('Home');
    store().addAp(net.id, (n) => 'AP ' + n);
    store().addAp(net.id, (n) => 'AP ' + n);
    const aps = () => store().networks[0]?.nodes.filter((n) => n.overrides.AP_MODE === '1') ?? [];
    expect(aps().map((n) => n.overrides.AP_INDEX)).toEqual(['2', '3']);

    // Freeing one hands its index back rather than counting ever upwards.
    store().removeNode(net.id, aps()[0]?.id ?? '');
    store().addAp(net.id, (n) => 'AP ' + n);
    expect(aps().map((n) => n.overrides.AP_INDEX).sort()).toEqual(['2', '3']);
  });

  it('records a build against the node that produced it', () => {
    const net = store().create('Home');
    const nodeId = net.nodes[0]?.id ?? '';
    store().recordBuild(net.id, nodeId, 'https://example.test/image.bin');
    expect(saved()[0]?.nodes[0]?.last_build?.firmware_url).toBe('https://example.test/image.bin');
  });
});

describe('what a node is', () => {
  const fleet = (): Network => {
    const net = store().create('Home');
    store().setShared(net.id, {
      ...net.shared_config,
      shared_version: '25.12.5',
      IOT_ENABLE: '1',
      LAN_BASE_PREFIX: '10.0',
    });
    store().patchNode(net.id, net.nodes[0]?.id ?? '', { device_target: board() });
    store().addAp(net.id, (n) => 'AP ' + n);
    return store().networks[0] as Network;
  };

  it('is the shared config with its own overrides on top', () => {
    const net = fleet();
    const [router, ap] = net.nodes as [FleetNode, FleetNode];
    expect(nodeRaw(net, router).IOT_ENABLE).toBe('1');
    expect(nodeRaw(net, ap).IOT_ENABLE).toBe('1');
    expect(nodeRaw(net, router).AP_MODE).toBe('');
    expect(nodeRaw(net, ap).AP_MODE).toBe('1');
  });

  it('answers on its own address, the router on .1 and an access point on its index', () => {
    const net = fleet();
    const [router, ap] = net.nodes as [FleetNode, FleetNode];
    expect(nodePlan(net, router).address).toBe('10.0.1.1');
    expect(nodePlan(net, ap).address).toBe('10.0.1.2');
    expect(nodePlan(net, ap).accessPoint).toBe(true);
  });

  it('follows the network release until it pins one of its own', () => {
    const net = fleet();
    const ap = net.nodes[1] as FleetNode;
    expect(nodeVersion(net, ap)).toBe('25.12.5');
    store().patchNode(net.id, ap.id, { version: '24.10.8' });
    const updated = store().networks[0] as Network;
    expect(nodeVersion(updated, updated.nodes[1] as FleetNode)).toBe('24.10.8');
  });

  it('inherits a conflict in the shared config, on every node (FR-013)', () => {
    const net = fleet();
    store().setShared(net.id, {
      ...net.shared_config,
      LAN_VLAN_ID: '5',
      GUEST_VLAN_ID: '5',
    });
    const conflicted = store().networks[0] as Network;
    for (const node of conflicted.nodes) {
      expect(nodeIssues(conflicted, node)[0]?.messageId).toBe('fixVlanConflict');
    }
  });
});

describe('building a fleet', () => {
  /** A server that fails one board and serves the other from cache. */
  const asu = (failProfile: string) =>
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/wrtnova.sh')) return new Response('#!/bin/sh\n' + MARKER + 'exit 0\n');
      const body = JSON.parse(String(init?.body ?? '{}')) as { profile: string };
      if (body.profile === failProfile) {
        return Response.json({ detail: 'no image for this board' }, { status: 500 });
      }
      return Response.json(
        { bin_dir: 'dir', images: [{ name: 'sysupgrade.bin', type: 'sysupgrade' }] },
        { status: 200 },
      );
    });

  it('lets one node fail without stopping the others (FR-041, SC-006)', async () => {
    const net = store().create('Home');
    store().patchNode(net.id, net.nodes[0]?.id ?? '', { device_target: board() });
    const ap = store().addAp(net.id, () => 'AP');
    store().patchNode(net.id, ap?.id ?? '', {
      device_target: board({ profile: 'broken_board', title: 'Broken' }),
    });

    globalThis.fetch = asu('broken_board') as unknown as typeof fetch;
    await useFleetBuildStore.getState().buildAll(net.id, 'https://asu.test');

    const builds = useFleetBuildStore.getState().builds;
    expect(buildOf(builds, net.nodes[0]?.id ?? '').phase).toBe('done');
    expect(buildOf(builds, ap?.id ?? '').phase).toBe('error');
    expect(buildOf(builds, ap?.id ?? '').error).toContain('no image for this board');
    // The successful node still recorded its image.
    expect(saved()[0]?.nodes[0]?.last_build?.firmware_url).toContain('sysupgrade.bin');
  });

  it('refuses a node whose configuration would not build, before submitting', async () => {
    const net = store().create('Home');
    store().patchNode(net.id, net.nodes[0]?.id ?? '', { device_target: board() });
    store().setShared(net.id, { ...net.shared_config, LAN_VLAN_ID: '5', GUEST_VLAN_ID: '5' });

    const server = asu('none');
    globalThis.fetch = server as unknown as typeof fetch;
    await useFleetBuildStore.getState().buildNode(net.id, net.nodes[0]?.id ?? '', 'https://asu.test');

    expect(server).not.toHaveBeenCalled();
    expect(buildOf(useFleetBuildStore.getState().builds, net.nodes[0]?.id ?? '').phase).toBe(
      'error',
    );
  });
});
