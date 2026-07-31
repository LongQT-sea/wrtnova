// FR-011 to FR-014: allocation, conflicts, and the switch-target VLAN cap.

import { describe, expect, it } from 'vitest';
import {
  countBaseVlanSlots,
  detectIfaceConflict,
  detectVlanConflict,
  isSwconfigTarget,
  resolveIfaceAssignment,
  resolveIfaceEmit,
  resolveVlanAssignment,
  resolveVlanEmit,
  truncateAdditionalVlans,
} from '../../src/core/vlan';
import type { RawConfig } from '../../src/core/types';

const all: Partial<RawConfig> = { GUEST_ENABLE: '1', IOT_ENABLE: '1', WG_ENABLE: '1' };

describe('VLAN allocation', () => {
  it('leaves untouched fields on their natural defaults and emits nothing', () => {
    const emit = resolveVlanEmit(all);
    expect(emit.LAN_VLAN_ID).toBe('');
    expect(emit.GUEST_VLAN_ID).toBe('');
    expect(emit.WAN_VLAN_ID).toBe('');
  });

  it('moves an auto out of the way of an anchor rather than colliding', () => {
    // The user pins guest to 1, which LAN would have taken.
    const cfg = { ...all, GUEST_VLAN_ID: '1' };
    const { byKey } = resolveVlanAssignment(cfg);
    expect(byKey.guest?.vid).toBe(1);
    expect(byKey.lan?.vid).toBe(2); // auto yields
    expect(detectVlanConflict(cfg)).toBe(false);
    expect(resolveVlanEmit(cfg).LAN_VLAN_ID).toBe('2');
  });

  it('blocks the build when two anchors collide', () => {
    expect(detectVlanConflict({ ...all, GUEST_VLAN_ID: '7', IOT_VLAN_ID: '7' })).toBe(true);
  });

  it('does not treat a collision with a disabled network as a conflict', () => {
    // IoT is off, so its id participates in nothing.
    expect(detectVlanConflict({ GUEST_ENABLE: '1', GUEST_VLAN_ID: '7', IOT_VLAN_ID: '7' })).toBe(
      false,
    );
  });

  it('blocks the build when an anchor lands on a trunked VLAN', () => {
    expect(
      detectVlanConflict({ ...all, ADDITIONAL_VLAN_LIST: '30-40', GUEST_VLAN_ID: '35' }),
    ).toBe(true);
  });

  it('routes an auto around a trunked VLAN without complaining', () => {
    const cfg = { ...all, ADDITIONAL_VLAN_LIST: '5 6 7' };
    const { byKey } = resolveVlanAssignment(cfg);
    expect(byKey.guest?.vid).toBe(8);
    expect(detectVlanConflict(cfg)).toBe(false);
  });

  it('drops WAN entirely on an access point', () => {
    const { byKey } = resolveVlanAssignment({ ...all, AP_MODE: '1' });
    expect(byKey.wan?.participates).toBe(false);
    expect(resolveVlanEmit({ ...all, AP_MODE: '1' }).WAN_VLAN_ID).toBe('');
  });
});

describe('interface names', () => {
  it('emits nothing when the defaults are free', () => {
    expect(resolveIfaceEmit(all).GUEST_IFACE).toBe('');
  });

  it('renames an auto whose default was claimed by an anchor', () => {
    const cfg = { ...all, LAN_IFACE: 'guest' };
    const { byKey } = resolveIfaceAssignment(cfg);
    expect(byKey.lan?.name).toBe('guest');
    expect(byKey.guest?.name).toBe('vlan5');
    expect(detectIfaceConflict(cfg)).toBe(false);
  });

  it('blocks a name the system already owns', () => {
    const cfg = { ...all, GUEST_IFACE: 'wan' };
    expect(detectIfaceConflict(cfg)).toBe(true);
    expect(resolveIfaceAssignment(cfg).byKey.guest?.conflict).toBe('reserved');
  });

  it('blocks two networks claiming the same name, flagging both', () => {
    const cfg = { ...all, GUEST_IFACE: 'shared', IOT_IFACE: 'shared' };
    expect(detectIfaceConflict(cfg)).toBe(true);
    expect(resolveIfaceAssignment(cfg).byKey.guest?.conflict).toBe('dup');
    expect(resolveIfaceAssignment(cfg).byKey.iot?.conflict).toBe('dup');
  });

  it('keeps the default and reports invalid rather than emitting a bad name', () => {
    const { byKey } = resolveIfaceAssignment({ ...all, GUEST_IFACE: 'has spaces!' });
    expect(byKey.guest?.conflict).toBe('invalid');
    expect(byKey.guest?.name).toBe('guest');
  });
});

describe('switch-target VLAN cap', () => {
  it('recognises swconfig targets and excludes DSA ones', () => {
    expect(isSwconfigTarget('ath79/generic')).toBe(true);
    expect(isSwconfigTarget('ramips/mt7620')).toBe(true);
    expect(isSwconfigTarget('ramips/mt7621')).toBe(false);
    expect(isSwconfigTarget('mediatek/filogic')).toBe(false);
  });

  it('counts the slots the base networks consume', () => {
    expect(countBaseVlanSlots({})).toBe(2); // lan + wan
    expect(countBaseVlanSlots(all)).toBe(5); // + guest, iot, vpn
  });

  it('leaves the trunk alone on a DSA target', () => {
    const r = truncateAdditionalVlans({ ADDITIONAL_VLAN_LIST: '30-60' }, 'ramips/mt7621');
    expect(r.truncated).toBe(false);
  });

  it('truncates to the budget and reports what it dropped', () => {
    const r = truncateAdditionalVlans({ ...all, ADDITIONAL_VLAN_LIST: '30-45' }, 'ath79/generic');
    expect(r.truncated).toBe(true);
    expect(r.budget).toBe(11); // 16 - 5 base slots
    expect(r.list).toBe('30-40');
    expect(r.dropped).toBe('41-45');
  });
});
