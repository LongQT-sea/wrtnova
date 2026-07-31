// The store's starting configuration, and the pre-flight sweep over it.

import { describe, expect, it } from 'vitest';
import { derive } from '@core/derive';
import { renderConfigBlock } from '@core/render-config';
import { CONFIG_KEYS, FLAG_KEYS, UI_ONLY_KEYS } from '@core/schema';
import type { RawConfig } from '@core/types';
import { INITIAL_RAW } from '@state/configStore';
import { flaggedSections, sweep } from '@state/validation';

const raw = (over: Partial<RawConfig>): RawConfig => ({ ...INITIAL_RAW, ...over });

describe('INITIAL_RAW', () => {
  it('holds every config key and every UI-only key, and nothing else', () => {
    const expected = [...CONFIG_KEYS, ...UI_ONLY_KEYS].sort();
    expect(Object.keys(INITIAL_RAW).sort()).toEqual(expected);
  });

  it('never seeds a flag with anything but the two representable values', () => {
    for (const key of FLAG_KEYS) {
      expect(['', '1'], key).toContain(INITIAL_RAW[key]);
    }
  });

  it('emits only the product opinions the script would not apply itself', () => {
    // Constitution V: an untouched form is an override layer carrying just the
    // defaults this product chooses that wrtnova.sh does not.
    const block = renderConfigBlock(derive(INITIAL_RAW));
    expect(block.trim().split('\n').sort()).toEqual([
      "DNSMASQ_SINGLE_INSTANCE='1'",
      "DOT11KV='1'",
      "DOT11R='1'",
      "FORCE_DNS='1'",
      "GUEST_ENABLE='1'",
      "SOFTWARE_OFFLOAD='1'",
    ]);
  });

  it('is buildable as it stands, so a first-timer can accept the defaults', () => {
    expect(sweep(INITIAL_RAW)).toEqual([]);
  });
});

describe('sweep', () => {
  it('reports a bad value that will be emitted', () => {
    const issues = sweep(raw({ HOST_NAME: 'bad_host!' }));
    expect(issues.map((i) => i.key)).toEqual(['HOST_NAME']);
    expect(issues[0]?.messageId).toBe('hostnameInvalid');
  });

  it('ignores a bad value the gating blanks, because it is never emitted', () => {
    // IoT is off, so IOT_WIFI_PASSWD contributes nothing to the built image.
    expect(sweep(raw({ IOT_ENABLE: '', IOT_WIFI_PASSWD: 'short' }))).toEqual([]);
    expect(sweep(raw({ IOT_ENABLE: '1', IOT_WIFI_PASSWD: 'short' })).map((i) => i.key)).toEqual([
      'IOT_WIFI_PASSWD',
    ]);
  });

  it('reports an interface name the provisioning script already owns', () => {
    const issues = sweep(raw({ GUEST_IFACE: 'wan' }));
    expect(issues[0]?.messageId).toBe('ifaceReserved');
  });

  it('reports a duplicate interface name on both sides of the collision', () => {
    const issues = sweep(raw({ LAN_IFACE: 'shared', GUEST_IFACE: 'shared' }));
    expect(issues.map((i) => i.key).sort()).toEqual(['GUEST_IFACE', 'LAN_IFACE']);
  });

  it('requires distinct passwords under a shared-password VLAN scheme', () => {
    const issues = sweep(
      raw({ PSK_VLAN: '1', LAN_WIFI_PASSWD: 'samepass1', GUEST_WIFI_PASSWD: 'samepass1' }),
    );
    expect(issues.map((i) => i.messageId)).toContain('pskVlanPass');
  });

  it('accepts distinct passwords under that scheme', () => {
    const issues = sweep(
      raw({ PSK_VLAN: '1', LAN_WIFI_PASSWD: 'lanpass12', GUEST_WIFI_PASSWD: 'guestpass12' }),
    );
    expect(issues).toEqual([]);
  });
});

describe('flaggedSections', () => {
  it('points at the section holding the offender', () => {
    expect([...flaggedSections(raw({ HOST_NAME: 'bad_host!' }))]).toEqual(['access']);
    expect([...flaggedSections(raw({ GUEST_IFACE: 'wan' }))]).toEqual(['networks']);
  });

  it('flags nothing for a configuration that builds', () => {
    expect(flaggedSections(INITIAL_RAW).size).toBe(0);
  });

  it('agrees with the sweep the build itself runs', () => {
    const cfg = raw({ HOST_NAME: 'bad_host!', COUNTRY_CODE: 'XYZ' });
    const fromSweep = new Set(sweep(cfg).map((i) => i.key));
    expect(fromSweep).toEqual(new Set(['HOST_NAME', 'COUNTRY_CODE']));
    expect([...flaggedSections(cfg)].sort()).toEqual(['access', 'wifi']);
  });
});
