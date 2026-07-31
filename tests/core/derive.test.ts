// FR-009 / FR-010: gating. A value stored in the form must not reach the built
// image when the thing it belongs to is off, or when the node cannot own it.

import { describe, expect, it } from 'vitest';
import { derive } from '../../src/core/derive';
import { deriveNodeConfig, mergeNodeConfig, nextApIndex } from '../../src/core/merge';
import { renderConfigBlock } from '../../src/core/render-config';
import type { FleetNode, Network, RawConfig } from '../../src/core/types';

const withTunnel: Partial<RawConfig> = {
  WG_ENABLE: '1',
  WG_PRIVATE_KEY: 'privkey',
  PEER_PUBLIC_KEY: 'pubkey',
  ENDPOINT: '198.51.100.7:51821',
  LAN_VPN_WIFI_SSID: 'Home VPN',
};

describe('parent gating', () => {
  it('drops guest settings when the guest network is off', () => {
    const c = derive({ GUEST_ENABLE: '', GUEST_WIFI_SSID: 'Guests', GUEST_ISOLATE: '1' });
    expect(c.GUEST_WIFI_SSID).toBe('');
    expect(c.GUEST_ISOLATE).toBe('');
  });

  it('drops tunnel settings when the tunnel is off', () => {
    const c = derive({ ...withTunnel, WG_ENABLE: '' });
    expect(c.WG_PRIVATE_KEY).toBe('');
    expect(c.ENDPOINT).toBe('');
    expect(c.LAN_VPN_WIFI_SSID).toBe('');
  });

  it('drops mesh settings when no mesh band is on', () => {
    const c = derive({ MESH_ID: 'backhaul', BATMAN_ADV: '1' });
    expect(c.MESH_ID).toBe('');
    expect(c.BATMAN_ADV).toBe('');
  });

  it('forces spanning tree on when both mesh bands are on', () => {
    const c = derive({ WIRELESS_MESH: '1', WIRELESS_MESH_2G: '1', BRIDGE_STP: '' });
    expect(c.BRIDGE_STP).toBe('1');
  });

  it('keeps batman-adv to one radio, preferring 5 GHz', () => {
    const c = derive({ WIRELESS_MESH: '1', WIRELESS_MESH_2G: '1', BATMAN_ADV: '1' });
    expect(c.WIRELESS_MESH).toBe('1');
    expect(c.WIRELESS_MESH_2G).toBe('');
  });

  it('drops dense-environment tuning without 802.11k/v to run it', () => {
    expect(derive({ DENSE_ENV: '1', DOT11KV: '' }).DENSE_ENV).toBe('');
    expect(derive({ DENSE_ENV: '1', DOT11KV: '1' }).DENSE_ENV).toBe('1');
  });

  it('drops client isolation under a shared-password VLAN scheme', () => {
    const c = derive({ GUEST_ENABLE: '1', GUEST_ISOLATE: '1', PSK_VLAN: '1' });
    expect(c.GUEST_ISOLATE).toBe('');
  });
});

describe('role gating', () => {
  const ap: Partial<RawConfig> = {
    AP_MODE: '1',
    AP_INDEX: '3',
    ...withTunnel,
    PORT_FORWARD_LIST: '\tnas | 20 | 80\n',
    DDNS_ENABLE: '1',
    CLOUDFLARE_API_KEY: 'token',
    WAN_MAC_ADDR: 'F0:B4:29:2E:33:11',
    CELLULAR_MODEM: '1',
  };

  it('drops what an access point cannot own', () => {
    const c = derive(ap);
    expect(c.WG_PRIVATE_KEY).toBe('');
    expect(c.PORT_FORWARD_LIST).toBe('');
    expect(c.DDNS_ENABLE).toBe('');
    expect(c.CLOUDFLARE_API_KEY).toBe('');
    expect(c.WAN_MAC_ADDR).toBe('');
    expect(c.CELLULAR_MODEM).toBe('');
  });

  it('keeps the VPN VLAN on an access point, because it still trunks it', () => {
    const c = derive(ap);
    expect(c.WG_ENABLE).toBe('1');
    expect(c.LAN_VPN_WIFI_SSID).toBe('Home VPN');
  });

  it('keeps the access point index, and drops it on a router', () => {
    expect(derive(ap).AP_INDEX).toBe('3');
    expect(derive({ AP_INDEX: '3' }).AP_INDEX).toBe('');
  });

  it('lets an access point bridge the WAN port and gives it the WAN VLAN id', () => {
    const c = derive({ AP_MODE: '1', BRIDGE_WAN_PORT: '1', WAN_VLAN_ID: '42' });
    expect(c.BRIDGE_WAN_PORT).toBe('1');
    expect(c.WAN_VLAN_ID).toBe('42');
  });
});

describe('interface-only transforms', () => {
  it('splits the endpoint into host and port', () => {
    const c = derive(withTunnel);
    expect(c.ENDPOINT).toBe('198.51.100.7');
    expect(c.ENDPOINT_PORT).toBe('51821');
  });

  it('keeps a bracketed IPv6 endpoint whole and still finds its port', () => {
    const c = derive({ ...withTunnel, ENDPOINT: '[2001:db8::1]:51820' });
    expect(c.ENDPOINT).toBe('2001:db8::1');
    expect(c.ENDPOINT_PORT).toBe('51820');
  });

  it('inverts the fast-transition toggle shown to the user', () => {
    const base = { IOT_ENABLE: '1', DOT11R: '1' } as const;
    expect(derive({ ...base, IOT_DOT11R_UI: '1' }).IOT_NO_DOT11R).toBe('');
    expect(derive({ ...base, IOT_DOT11R_UI: '' }).IOT_NO_DOT11R).toBe('1');
  });

  it('inverts the dnsmasq instance toggle', () => {
    expect(derive({}).DNSMASQ_SINGLE_INSTANCE).toBe('1');
    expect(derive({ DNSMASQ_MULTI_INSTANCE: '1' }).DNSMASQ_SINGLE_INSTANCE).toBe('');
  });

  it('emits PPPoE credentials only on the PPPoE path', () => {
    const creds = { PPPOE_USERNAME: 'user', PPPOE_PASSWD: 'pw' } as const;
    expect(derive({ ...creds, wan_type: 'dhcp' }).PPPOE_USERNAME).toBe('');
    expect(derive({ ...creds, wan_type: 'pppoe' }).PPPOE_USERNAME).toBe('user');
  });

  it('never emits the interface-only helpers themselves', () => {
    const block = renderConfigBlock(
      derive({ wan_type: 'pppoe', DNSMASQ_MULTI_INSTANCE: '1', IOT_DOT11R_UI: '1' }),
    );
    expect(block).not.toContain('wan_type');
    expect(block).not.toContain('DNSMASQ_MULTI_INSTANCE');
    expect(block).not.toContain('IOT_DOT11R_UI');
  });

  it('does not write build-only keys into the block', () => {
    const block = renderConfigBlock(derive({ DNS_MODE: 'adguardhome', IRQBALANCE: '1' }));
    expect(block).not.toContain('DNS_MODE');
    expect(block).not.toContain('IRQBALANCE');
  });

  it('uppercases the country code', () => {
    expect(derive({ COUNTRY_CODE: 'vn' }).COUNTRY_CODE).toBe('VN');
  });

  it('adds the country feed to banIP only when a country is selected', () => {
    expect(derive({ BANIP_FEEDS: 'threat' }).BANIP_FEEDS).toBe('threat');
    expect(derive({ BANIP_FEEDS: 'threat', BANIP_COUNTRY_LIST: 'lk' }).BANIP_FEEDS).toBe(
      'threat country',
    );
  });
});

describe('fleet merge', () => {
  const shared: Partial<RawConfig> = { GUEST_ENABLE: '1', LAN_WIFI_SSID: 'Home', DOT11KV: '1' };

  it('layers a node override without touching the shared value', () => {
    const merged = mergeNodeConfig(shared, { LAN_WIFI_SSID: 'Attic' });
    expect(merged.LAN_WIFI_SSID).toBe('Attic');
    expect(shared.LAN_WIFI_SSID).toBe('Home');
    expect(merged.GUEST_ENABLE).toBe('1');
  });

  it('runs the same gating as the single-node builder', () => {
    const node = deriveNodeConfig(shared, { AP_MODE: '1', AP_INDEX: '4', ...withTunnel });
    const direct = derive({ ...shared, AP_MODE: '1', AP_INDEX: '4', ...withTunnel });
    expect(node).toEqual(direct);
  });

  it('gives an access point a management index by default', () => {
    expect(mergeNodeConfig(shared, { AP_MODE: '1' }).AP_INDEX).toBe('2');
  });

  it('allocates the next free access point index', () => {
    const node = (i: string): FleetNode => ({
      id: i,
      name: 'ap' + i,
      device_target: {
        title: '', profile: '', target: '', version: '', version_code: '',
        default_packages: [], device_packages: [], images: [],
      },
      overrides: { AP_MODE: '1', AP_INDEX: i },
      last_build: null,
    });
    const net: Network = { id: 'n', name: 'Home', shared_config: {}, nodes: [node('2'), node('4')] };
    expect(nextApIndex(net)).toBe(3);
  });
});
