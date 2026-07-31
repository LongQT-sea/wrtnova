// The network plan behind the signature element (US2, FR-011, FR-012).

import { describe, expect, it } from 'vitest';
import type { RawConfig, SegmentId } from '@core/types';
import { INITIAL_RAW } from '@state/configStore';
import { buildPlan, type Lane } from '@state/plan';

const raw = (over: Partial<RawConfig>): RawConfig => ({ ...INITIAL_RAW, ...over });
const lane = (cfg: RawConfig, id: SegmentId): Lane => {
  const found = buildPlan(cfg).lanes.find((l) => l.id === id);
  if (!found) throw new Error('no lane ' + id);
  return found;
};

describe('lanes', () => {
  it('draws all four, in cable-pair order, whether enabled or not', () => {
    expect(buildPlan(INITIAL_RAW).lanes.map((l) => l.id)).toEqual([
      'lan',
      'guest',
      'iot',
      'vpn',
    ]);
  });

  it('keeps a disabled lane visible, so the user sees what they are not getting', () => {
    const plan = buildPlan(INITIAL_RAW);
    expect(plan.lanes.map((l) => l.enabled)).toEqual([true, true, false, false]);
  });

  it('addresses each lane at prefix.<vlan id>.1, the way the script does', () => {
    expect(lane(INITIAL_RAW, 'lan').address).toBe('192.168.1.1');
    expect(lane(INITIAL_RAW, 'guest').address).toBe('192.168.5.1');
    expect(lane(raw({ IOT_ENABLE: '1' }), 'iot').address).toBe('192.168.10.1');
  });

  it('follows a per-lane prefix, and the base prefix otherwise', () => {
    const cfg = raw({ BASE_NET_PREFIX: '10.20', GUEST_BASE_PREFIX: '172.16' });
    expect(lane(cfg, 'lan').address).toBe('10.20.1.1');
    expect(lane(cfg, 'guest').address).toBe('172.16.5.1');
  });

  it('follows a per-lane mask, and the default otherwise', () => {
    const cfg = raw({ DEFAULT_SUBNET: '/23', GUEST_SUBNET: '/22' });
    expect(lane(cfg, 'lan').subnet).toBe('/23');
    expect(lane(cfg, 'guest').subnet).toBe('/22');
  });
});

describe('resolved ids and names are visible before building', () => {
  it('shows an untouched lane its resolved values without calling them out', () => {
    // Every lane is auto by default, so marking all of them would say nothing.
    const l = lane(INITIAL_RAW, 'guest');
    expect(l.vlanId).toBe(5);
    expect(l.iface).toBe('guest');
    expect(l.vlanReassigned).toBe(false);
    expect(l.ifaceReassigned).toBe(false);
  });

  it('does not mark a value the user typed', () => {
    const l = lane(raw({ GUEST_VLAN_ID: '7', GUEST_IFACE: 'visitors' }), 'guest');
    expect(l.vlanId).toBe(7);
    expect(l.vlanReassigned).toBe(false);
    expect(l.iface).toBe('visitors');
    expect(l.ifaceReassigned).toBe(false);
  });

  it('shows the id an auto lane was moved to when a trunk VLAN takes its default', () => {
    // 5 is trunked, so the guest lane yields to the next free id -- and the plan is
    // where the user finds that out (FR-011).
    const l = lane(raw({ ADDITIONAL_VLAN_LIST: '5' }), 'guest');
    expect(l.vlanId).toBe(6);
    expect(l.address).toBe('192.168.6.1');
    expect(l.vlanReassigned).toBe(true);
  });

  it('shows the name an auto lane was moved to when its default is taken', () => {
    // LAN anchored on 'guest' pushes the guest lane off its default name.
    const l = lane(raw({ LAN_IFACE: 'guest' }), 'guest');
    expect(l.iface).toBe('vlan5');
    expect(l.ifaceReassigned).toBe(true);
  });
});

describe('reachability', () => {
  it('gives LAN the internet', () => {
    expect(lane(INITIAL_RAW, 'lan').reach).toEqual(['internet']);
  });

  it('reports guest client isolation alongside its internet access', () => {
    expect(lane(raw({ GUEST_ISOLATE: '1' }), 'guest').reach).toEqual(['internet', 'isolated']);
    expect(lane(INITIAL_RAW, 'guest').reach).toEqual(['internet']);
  });

  it('says so when IoT has no internet at all', () => {
    expect(lane(raw({ IOT_ENABLE: '1', IOT_INTERNET: '' }), 'iot').reach).toEqual(['noInternet']);
  });

  it('reports IoT leaving through the tunnel rather than the WAN', () => {
    const cfg = raw({
      IOT_ENABLE: '1',
      IOT_INTERNET: '1',
      WG_ENABLE: '1',
      IOT_ROUTE_VIA_WG: '1',
    });
    expect(lane(cfg, 'iot').reach).toEqual(['tunnel']);
  });

  it('sends the VPN lane through the tunnel', () => {
    expect(lane(raw({ WG_ENABLE: '1' }), 'vpn').reach).toEqual(['tunnel']);
  });

  it('claims no reachability on an access point, which routes nothing', () => {
    const plan = buildPlan(raw({ AP_MODE: '1' }));
    expect(plan.accessPoint).toBe(true);
    expect(plan.lanes.every((l) => l.reach.length === 0)).toBe(true);
  });
});

describe('the node address', () => {
  it('is the router itself on the LAN', () => {
    expect(buildPlan(INITIAL_RAW).address).toBe('192.168.1.1');
  });

  it('is the AP index on an access point', () => {
    expect(buildPlan(raw({ AP_MODE: '1', AP_INDEX: '4' })).address).toBe('192.168.1.4');
  });

  it('falls back to index 2 when an access point has none set', () => {
    expect(buildPlan(raw({ AP_MODE: '1', AP_INDEX: '' })).address).toBe('192.168.1.2');
  });
});
