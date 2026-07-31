// Version- and hardware-gated options (FR-022, FR-023).

import { describe, expect, it } from 'vitest';
import type { DeviceTarget, RawConfig } from '@core/types';
import { INITIAL_RAW } from '@state/configStore';
import { capsFor, clearUnsupported, dnsDefaultFor, majorOf } from '@state/capabilities';

const target = (over: Partial<DeviceTarget>): DeviceTarget => ({
  title: 'Test board',
  profile: 'test_board',
  target: 'mediatek/filogic',
  version: '25.12.5',
  version_code: 'r1',
  default_packages: [],
  device_packages: [],
  images: [],
  ...over,
});

const raw = (over: Partial<RawConfig>): RawConfig => ({ ...INITIAL_RAW, ...over });

describe('majorOf', () => {
  it('reads the release major', () => {
    expect(majorOf('23.05.5')).toBe(23);
    expect(majorOf('25.12.5')).toBe(25);
  });

  it('treats snapshots as newest, because they are ahead of the last release', () => {
    expect(majorOf('SNAPSHOT')).toBe(Number.POSITIVE_INFINITY);
    expect(majorOf('')).toBe(Number.POSITIVE_INFINITY);
  });

  it('reads a branch snapshot as its own branch', () => {
    expect(majorOf('24.10-SNAPSHOT')).toBe(24);
  });
});

describe('capsFor', () => {
  it('withholds packet steering "all CPUs" before OpenWrt 24', () => {
    expect(capsFor(target({}), '23.05.6').steeringAllCpus).toBe(false);
    expect(capsFor(target({}), '24.10.8').steeringAllCpus).toBe(true);
  });

  it('withholds the time format before OpenWrt 25', () => {
    expect(capsFor(target({}), '24.10.8').timeFormat).toBe(false);
    expect(capsFor(target({}), '25.12.5').timeFormat).toBe(true);
  });

  it('offers WED only where the mt7915e driver is', () => {
    expect(capsFor(target({ default_packages: ['kmod-mt7915e'] }), 'SNAPSHOT').wed).toBe(true);
    expect(capsFor(target({ default_packages: ['kmod-mt7996e'] }), 'SNAPSHOT').wed).toBe(false);
  });

  it('offers the ath10k swap only where Candela firmware ships', () => {
    const ct = target({ device_packages: ['ath10k-firmware-qca988x-ct'] });
    expect(capsFor(ct, 'SNAPSHOT').ath10kCt).toBe(true);
    expect(capsFor(target({}), 'SNAPSHOT').ath10kCt).toBe(false);
  });

  it('reports a swconfig switch, which is what caps the VLAN table', () => {
    expect(capsFor(target({ target: 'ath79/generic' }), 'SNAPSHOT').swconfig).toBe(true);
    expect(capsFor(target({ target: 'ramips/mt7621' }), 'SNAPSHOT').swconfig).toBe(false);
  });

  it('withholds everything hardware-dependent with no device chosen', () => {
    const caps = capsFor(null, 'SNAPSHOT');
    expect(caps.wed).toBe(false);
    expect(caps.ath10kCt).toBe(false);
    expect(caps.swconfig).toBe(false);
  });
});

describe('clearUnsupported', () => {
  it('erases a stored value the target cannot honour', () => {
    const patch = clearUnsupported(
      raw({ WED_ENABLE: '1', P_STEERING: '2', TIME_FORMAT: 'h12', NON_CT_ATH10K: '1' }),
      capsFor(target({ target: 'ath79/generic' }), '23.05.6'),
    );
    expect(patch).toEqual({
      P_STEERING: '',
      TIME_FORMAT: '',
      NON_CT_ATH10K: '',
      WED_ENABLE: '',
    });
  });

  it('leaves packet steering "on" alone, which every release supports', () => {
    const patch = clearUnsupported(raw({ P_STEERING: '1' }), capsFor(target({}), '23.05.6'));
    expect(patch.P_STEERING).toBeUndefined();
  });

  it('is empty when there is nothing to clear, so the store is not written', () => {
    const caps = capsFor(target({ default_packages: ['kmod-mt7915e'] }), '25.12.5');
    expect(clearUnsupported(raw({ WED_ENABLE: '1' }), caps)).toEqual({});
  });
});

describe('dnsDefaultFor', () => {
  it('gives a roomy board AdGuard Home', () => {
    expect(dnsDefaultFor(target({ target: 'mediatek/filogic' }))).toEqual({
      DNS_MODE: 'adguardhome',
    });
  });

  it('gives a low-flash swconfig board the lightweight engine', () => {
    expect(dnsDefaultFor(target({ target: 'ath79/generic' }))).toEqual({
      DNS_MODE: 'https-dns-proxy',
      // Leaving AdGuard Home drops its port-53 sub-option with it.
      ADGUARD_MAIN_DNS: '',
    });
  });
});
