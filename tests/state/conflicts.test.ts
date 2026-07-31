// The guard rails: what blocks a build, what does not, and what the board's own
// limits change (US6, FR-013, FR-014).

import { describe, expect, it } from 'vitest';
import type { RawConfig } from '@core/types';
import { renderConfigBlock } from '@core/render-config';
import { SWCONFIG_VLAN_MAX } from '@core/vlan';
import { INITIAL_RAW, emissionFor } from '@state/configStore';
import { buildPlan } from '@state/plan';
import { flaggedSections, sweep } from '@state/validation';

const raw = (over: Partial<RawConfig>): RawConfig => ({ ...INITIAL_RAW, ...over });
const conflicts = (cfg: RawConfig): Record<string, string> =>
  Object.fromEntries(buildPlan(cfg).lanes.filter((l) => l.conflict).map((l) => [l.id, l.conflict]));

describe('what the plan calls a conflict', () => {
  it('is nothing, for a configuration that builds', () => {
    expect(conflicts(INITIAL_RAW)).toEqual({});
    expect(buildPlan(INITIAL_RAW).blocked).toBe(false);
  });

  it('does NOT flag an auto-reassignment, which is normal operation', () => {
    // Trunking 5 moves the guest lane to 6. That is the allocator working.
    const plan = buildPlan(raw({ ADDITIONAL_VLAN_LIST: '5' }));
    expect(plan.blocked).toBe(false);
    expect(plan.lanes.find((l) => l.id === 'guest')?.conflict).toBe('');
  });

  it('flags both lanes when two explicit ids collide', () => {
    const cfg = raw({ LAN_VLAN_ID: '9', GUEST_VLAN_ID: '9' });
    expect(conflicts(cfg)).toEqual({ lan: 'vlanDuplicate', guest: 'vlanDuplicate' });
    expect(buildPlan(cfg).blocked).toBe(true);
  });

  it('flags an explicit id that lands on a trunked VLAN', () => {
    const cfg = raw({ GUEST_VLAN_ID: '30', ADDITIONAL_VLAN_LIST: '30 31' });
    expect(conflicts(cfg)).toEqual({ guest: 'vlanTrunked' });
  });

  it('flags a name the provisioning script already owns', () => {
    expect(conflicts(raw({ GUEST_IFACE: 'wan' }))).toEqual({ guest: 'ifaceReserved' });
  });

  it('flags a duplicated name on both lanes', () => {
    const cfg = raw({ LAN_IFACE: 'shared', GUEST_IFACE: 'shared' });
    expect(conflicts(cfg)).toEqual({ lan: 'ifaceDuplicate', guest: 'ifaceDuplicate' });
  });

  it('flags a name that is not a legal UCI section name', () => {
    expect(conflicts(raw({ GUEST_IFACE: 'has spaces' }))).toEqual({ guest: 'ifaceInvalid' });
  });

  it('says nothing about a lane that is switched off', () => {
    // The IoT lane is off, so its reserved name never reaches the device.
    expect(conflicts(raw({ IOT_ENABLE: '', IOT_IFACE: 'wan' }))).toEqual({});
  });
});

describe('the swconfig VLAN table', () => {
  const SWCONFIG = 'ath79/generic';
  const DSA = 'mediatek/filogic';
  // Three networks participate by default -- LAN, guest and WAN -- so 13 of the 16
  // hardware slots are left for the trunk.
  const longTrunk = { ADDITIONAL_VLAN_LIST: '100-130' };

  it('leaves a DSA board trunk list alone', () => {
    const e = emissionFor(raw(longTrunk), DSA);
    expect(e.truncated).toBe(false);
    expect(e.config.ADDITIONAL_VLAN_LIST).toBe('100-130');
  });

  it('cuts a swconfig board list to the free slots and names the rest', () => {
    const e = emissionFor(raw(longTrunk), SWCONFIG);
    expect(e.truncated).toBe(true);
    expect(e.budget).toBe(SWCONFIG_VLAN_MAX - 3);
    expect(e.config.ADDITIONAL_VLAN_LIST).toBe('100-112');
    expect(e.dropped).toBe('113-130');
  });

  it('emits the CUT list, so the preview cannot promise a VLAN the image lacks', () => {
    const e = emissionFor(raw(longTrunk), SWCONFIG);
    const block = renderConfigBlock(e.config);
    expect(block).toContain("ADDITIONAL_VLAN_LIST='" + e.config.ADDITIONAL_VLAN_LIST + "'");
    expect(block).not.toContain('100-130');
  });

  it('does not cut a list that already fits', () => {
    const e = emissionFor(raw({ ADDITIONAL_VLAN_LIST: '100 101' }), SWCONFIG);
    expect(e.truncated).toBe(false);
    expect(e.dropped).toBe('');
  });

  it('is stable for the same config and board, so the build server can cache', () => {
    const cfg = raw(longTrunk);
    expect(emissionFor(cfg, SWCONFIG)).toBe(emissionFor(cfg, SWCONFIG));
  });

  it('answers per board, not once per config', () => {
    const cfg = raw(longTrunk);
    expect(emissionFor(cfg, SWCONFIG).truncated).toBe(true);
    expect(emissionFor(cfg, DSA).truncated).toBe(false);
  });
});

describe('a VLAN collision blocks the build', () => {
  // The plan showing a conflict is not enough: the sweep is what refuses, and a
  // build that emitted two networks on one VLAN would produce a broken image.
  it('refuses two explicit ids on the same VLAN, naming both fields', () => {
    const issues = sweep(raw({ LAN_VLAN_ID: '9', GUEST_VLAN_ID: '9' }));
    expect(issues.map((i) => i.key).sort()).toEqual(['GUEST_VLAN_ID', 'LAN_VLAN_ID']);
    expect(issues[0]?.messageId).toBe('fixVlanConflict');
  });

  it('refuses an explicit id that lands on a trunked VLAN', () => {
    const issues = sweep(raw({ GUEST_VLAN_ID: '30', ADDITIONAL_VLAN_LIST: '30' }));
    expect(issues.map((i) => i.key)).toEqual(['GUEST_VLAN_ID']);
  });

  it('allows an auto lane to be moved by the trunk without complaint', () => {
    expect(sweep(raw({ ADDITIONAL_VLAN_LIST: '5 10' }))).toEqual([]);
  });

  it('ignores a collision on a lane that is switched off', () => {
    // The VPN lane is off, so its id is never emitted.
    expect(sweep(raw({ LAN_VLAN_ID: '9', LAN_VPN_VLAN_ID: '9' }))).toEqual([]);
  });

  it('flags the section holding the offender, so the rail can point at it', () => {
    expect([...flaggedSections(raw({ LAN_VLAN_ID: '9', GUEST_VLAN_ID: '9' }))]).toEqual([
      'networks',
    ]);
  });
});
