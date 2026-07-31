// A user's saved networks and history must survive the rewrite. These fixtures
// are in the format the previous version wrote.

import { describe, expect, it } from 'vitest';
import { migrateNetwork, migrateVpnKeys, pushHistory } from '../../src/core/storage';
import type { HistoryEntry, Network } from '../../src/core/types';

describe('stored-data migrations', () => {
  it('renames the VPN network keys', () => {
    const migrated = migrateVpnKeys({
      LAN_WG_VLAN_ID: '15',
      LAN_WG_WIFI_SSID: 'Home VPN',
      LAN_WIFI_SSID: 'Home',
    });
    expect(migrated.LAN_VPN_VLAN_ID).toBe('15');
    expect(migrated.LAN_VPN_WIFI_SSID).toBe('Home VPN');
    expect(migrated.LAN_WG_VLAN_ID).toBeUndefined();
    expect(migrated.LAN_WIFI_SSID).toBe('Home');
  });

  it('does not clobber a value already stored under the new name', () => {
    const migrated = migrateVpnKeys({ LAN_WG_IFACE: 'old', LAN_VPN_IFACE: 'new' });
    expect(migrated.LAN_VPN_IFACE).toBe('new');
  });

  it('is idempotent', () => {
    const once = migrateVpnKeys({ LAN_WG_SUBNET: '/24' });
    expect(migrateVpnKeys(once)).toEqual(once);
  });

  const legacyNetwork = (): Network =>
    ({
      id: 'n1',
      name: 'Home',
      shared_config: { HOST_NAME: 'main-router', LAN_WIFI_SSID: 'Home' },
      nodes: [
        {
          id: 'r',
          name: 'Main Router',
          device_target: {
            title: '', profile: '', target: '', version: '', version_code: '',
            default_packages: [], device_packages: [], images: [],
          },
          overrides: { AP_MODE: '', WAN_MAC_ADDR: '' },
          last_build: null,
        },
        {
          id: 'a',
          name: 'Attic',
          device_target: {
            title: '', profile: '', target: '', version: '', version_code: '',
            default_packages: [], device_packages: [], images: [],
          },
          overrides: { AP_MODE: '1', AP_INDEX: '3' },
          last_build: null,
        },
      ],
    }) as Network;

  it('moves the hostname onto the router node only', () => {
    const net = migrateNetwork(legacyNetwork());
    expect(net.shared_config.HOST_NAME).toBeUndefined();
    expect(net.nodes[0]?.overrides.HOST_NAME).toBe('main-router');
    // The access point keeps its own default, or every node answers to the
    // same name.
    expect(net.nodes[1]?.overrides.HOST_NAME).toBeUndefined();
  });

  it('drops the WAN MAC from router overrides, where it clobbered the shared value', () => {
    const net = migrateNetwork(legacyNetwork());
    expect('WAN_MAC_ADDR' in (net.nodes[0]?.overrides ?? {})).toBe(false);
  });

  it('keeps a WAN MAC deliberately set on an access point', () => {
    const legacy = legacyNetwork();
    legacy.nodes[1]!.overrides.WAN_MAC_ADDR = 'F0:B4:29:2E:33:11';
    const net = migrateNetwork(legacy);
    expect(net.nodes[1]?.overrides.WAN_MAC_ADDR).toBe('F0:B4:29:2E:33:11');
  });

  it('survives a network with no nodes or no shared config', () => {
    expect(() => migrateNetwork({ id: 'x', name: 'Empty' } as Network)).not.toThrow();
  });
});

describe('history', () => {
  const entry = (version: string, hostname: string): HistoryEntry => ({
    ts: Date.now(),
    device: { title: 'Archer C7', profile: 'p', target: 'ath79/generic', version },
    config: { HOST_NAME: hostname },
    additional_packages: [],
    warp_refresh_token: '',
    result: { status: 'success', firmware_url: null },
  });

  it('replaces the top entry when the same build is repeated', () => {
    const first = [entry('24.10.1', 'router')];
    const again = pushHistory(entry('24.10.1', 'router'), first);
    expect(again).toHaveLength(1);
  });

  it('prepends a genuinely different build', () => {
    const list = pushHistory(entry('24.10.1', 'other'), [entry('24.10.1', 'router')]);
    expect(list).toHaveLength(2);
    expect(list[0]?.config.HOST_NAME).toBe('other');
  });

  it('keeps at most five entries', () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < 9; i++) list = pushHistory(entry('24.10.1', 'r' + i), list);
    expect(list).toHaveLength(5);
    expect(list[0]?.config.HOST_NAME).toBe('r8');
  });
});
