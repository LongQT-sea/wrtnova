// Constitution II: the section marker is byte-load-bearing.
//
// This replaces the retired scripts/ci/check-marker.mjs gate.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKER, sliceBody } from '../../src/core/script';

const SCRIPT = readFileSync(resolve(__dirname, '../../wrtnova.sh'), 'utf8');

describe('section marker', () => {
  it('is the exact three lines, byte for byte', () => {
    expect(MARKER).toBe('# ===================\n# End config section\n# ===================\n');
  });

  it('occurs exactly once in the real wrtnova.sh', () => {
    expect(SCRIPT.split(MARKER).length - 1).toBe(1);
  });

  it('splits the script into a non-empty config section and a non-empty body', () => {
    const idx = SCRIPT.indexOf(MARKER);
    expect(idx).toBeGreaterThan(0);
    const body = sliceBody(SCRIPT);
    expect(body.length).toBeGreaterThan(1000);
    // The body must not carry the config-section assignments, or the user's
    // overrides would be shadowed by the script's own shipped values.
    expect(body).not.toMatch(/^GUEST_ENABLE=/m);
    expect(body).not.toMatch(/^BASE_NET_PREFIX=/m);
  });

  it('refuses a script without the marker rather than guessing', () => {
    expect(() => sliceBody('#!/bin/sh\necho hi\n')).toThrow(/marker not found/);
  });
});
