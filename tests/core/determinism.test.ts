// FR-032 / SC-005: the same configuration must assemble byte-identically, so
// the build server can serve the second build from its cache.

import { describe, expect, it } from 'vitest';
import { derive } from '../../src/core/derive';
import { renderConfigBlock, shQuote } from '../../src/core/render-config';
import { resolvePackages } from '../../src/core/packages';
import type { RawConfig } from '../../src/core/types';

const sample: Partial<RawConfig> = {
  HOST_NAME: 'attic-router',
  ROOT_PASSWD: "it's a secret",
  GUEST_ENABLE: '1',
  IOT_ENABLE: '1',
  WG_ENABLE: '1',
  ENDPOINT: '198.51.100.7:51821',
  BASE_NET_PREFIX: '10.20',
  COUNTRY_CODE: 'vn',
  DNS_MODE: 'adguardhome',
  BANIP_COUNTRY_LIST: 'lk in',
};

describe('determinism', () => {
  it('renders the same block twice', () => {
    expect(renderConfigBlock(derive(sample))).toBe(renderConfigBlock(derive(sample)));
  });

  it('is insensitive to the order keys were written into the raw config', () => {
    const reversed = Object.fromEntries(
      Object.entries(sample).reverse(),
    ) as Partial<RawConfig>;
    expect(renderConfigBlock(derive(reversed))).toBe(renderConfigBlock(derive(sample)));
  });

  it('resolves packages to the same ordered list every time', () => {
    const args = {
      base: ['luci', 'dnsmasq', 'wpad-basic-mbedtls'],
      device: ['kmod-mt7915e'],
      extra: ['htop', 'nano'],
      config: derive(sample),
    };
    expect(resolvePackages(args)).toEqual(resolvePackages(args));
    expect(resolvePackages(args)).toEqual([...resolvePackages(args)].sort((a, b) =>
      a.replace(/^-/, '').localeCompare(b.replace(/^-/, '')),
    ));
  });

  it('quotes with single quotes so a bcrypt hash is not expanded by the shell', () => {
    const hash = '$2a$10$abcdefghijklmnopqrstuv';
    expect(shQuote(hash)).toBe("'" + hash + "'");
    expect(shQuote(hash)).not.toContain('\\$');
  });

  it('falls back to escaped double quotes only when the value contains a quote', () => {
    expect(shQuote("it's")).toBe('"it\'s"');
    expect(shQuote('a$b`c"d\'e')).toBe('"a\\$b\\`c\\"d\'e"');
  });
});
