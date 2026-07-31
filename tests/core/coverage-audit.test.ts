// SC-002 / FR-006: every configuration key has a home in the interface.
//
// The contract document is the checklist a human maintains; this test is what
// stops the schema drifting away from it.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_KEYS, FIELDS, SECTIONS, SEGMENTS, UI_ONLY_KEYS } from '../../src/core/schema';
import type { ConfigKey } from '../../src/core/types';

const CONTRACT = readFileSync(
  resolve(__dirname, '../../specs/001-frontend-rewrite/contracts/config-keys.md'),
  'utf8',
);

/** Keys named in backticks in the contract's tables. */
function keysInContract(): Set<string> {
  const out = new Set<string>();
  for (const m of CONTRACT.matchAll(/`([A-Z][A-Z_0-9]{2,})`/g)) {
    if (m[1]) out.add(m[1]);
  }
  return out;
}

/** Keys the contract explicitly lists as not exposed. */
const NOT_EXPOSED = new Set([
  'DEFAULT_WIFI_PASSWD',
  'LAN_DHCP_START',
  'GUEST_DHCP_START',
  'WG_IFACE',
  'MODEM_PATH',
  'MODEM_APN',
]);

describe('configuration key coverage', () => {
  it('gives every key a section', () => {
    for (const key of CONFIG_KEYS) {
      expect(SECTIONS, `${key} has no valid section`).toContain(FIELDS[key].section);
    }
  });

  it('covers every key the contract requires', () => {
    const contract = keysInContract();
    // A key has a home if it is emitted, or if it is an entry convenience the
    // derivation transforms away.
    const covered = new Set<string>([...CONFIG_KEYS, ...UI_ONLY_KEYS]);
    const missing = [...contract].filter(
      (k) => !covered.has(k) && !NOT_EXPOSED.has(k) && k !== 'KEY',
    );
    expect(missing, 'keys named in the contract but absent from the schema').toEqual([]);
  });

  it('does not expose a key the contract says stays unexposed', () => {
    const leaked = [...NOT_EXPOSED].filter((k) => (CONFIG_KEYS as string[]).includes(k));
    expect(leaked).toEqual([]);
  });

  it('keeps the four segments wired to real keys', () => {
    for (const seg of SEGMENTS) {
      for (const key of [seg.prefixKey, seg.ifaceKey, seg.vlanKey, seg.subnetKey]) {
        expect(CONFIG_KEYS, `${seg.id}: ${key}`).toContain(key);
      }
      if (seg.enableKey) expect(CONFIG_KEYS).toContain(seg.enableKey);
    }
  });

  it('emits keys in a stable order', () => {
    // Object key order drives the block, which is what makes rebuilds cacheable.
    expect(CONFIG_KEYS).toEqual(Object.keys(FIELDS) as ConfigKey[]);
    expect(new Set(CONFIG_KEYS).size).toBe(CONFIG_KEYS.length);
  });
});
