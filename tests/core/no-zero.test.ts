// Constitution IV: an off control emits '' and never '0'.
//
// KEY='0' would SET the shell variable; the script tests for a set variable, so
// '0' would enable the feature the user just turned off. Only an absent
// assignment leaves it unset.
//
// This replaces the retired scripts/ci/check-no-zero.mjs gate.

import { describe, expect, it } from 'vitest';
import { CONFIG_KEYS, FLAG_KEYS } from '../../src/core/schema';
import { derive } from '../../src/core/derive';
import { renderConfigBlock } from '../../src/core/render-config';
import type { RawConfig } from '../../src/core/types';

/** Everything a user could switch on, switched on. */
function allFlagsOn(): Partial<RawConfig> {
  const raw: Record<string, string> = {};
  for (const k of FLAG_KEYS) raw[k] = '1';
  raw.IOT_DOT11R_UI = '1';
  raw.DNSMASQ_MULTI_INSTANCE = '1';
  return raw as Partial<RawConfig>;
}

describe('off-state never emits a zero', () => {
  it('emits no key at all when every flag is off', () => {
    const emitted = derive({});
    for (const key of FLAG_KEYS) {
      expect(emitted[key], `${key} should be '' when off`).toBe('');
    }
    const block = renderConfigBlock(emitted);
    for (const key of FLAG_KEYS) {
      expect(block).not.toContain(`${key}=`);
    }
  });

  it("never produces the literal '0' for any key, flags on or off", () => {
    for (const raw of [{}, allFlagsOn()]) {
      const emitted = derive(raw);
      for (const key of CONFIG_KEYS) {
        expect(String(emitted[key] ?? ''), `${key}`).not.toBe('0');
      }
    }
  });

  it("drops a '0' arriving from an older stored config rather than emitting it", () => {
    // History written by a previous version could carry '0'. The type forbids
    // it going forward; the renderer is the belt to that suspenders.
    const block = renderConfigBlock({ GUEST_ENABLE: '0' as never, LOG: '0' as never });
    expect(block.trim()).toBe('');
  });

  it("turning a flag off after it was on emits nothing, not '0'", () => {
    const on = derive({ GUEST_ENABLE: '1', LOG: '1' });
    expect(renderConfigBlock(on)).toContain("GUEST_ENABLE='1'");

    const off = derive({ GUEST_ENABLE: '', LOG: '' });
    const block = renderConfigBlock(off);
    expect(block).not.toContain('GUEST_ENABLE');
    expect(block).not.toContain('LOG');
  });
});
