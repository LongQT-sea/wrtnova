// Constitution V: never emit a value identical to the script's own default.
//
// The default that matters is the runtime fallback in the script BODY
// (`${KEY:-...}`), not the assignment in the config section at the top — the
// browser discards that whole section. This test parses the real script and
// fails when the schema disagrees with it, so a drift is caught rather than
// shipped. See specs/001-frontend-rewrite/research.md R1.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_KEYS, FIELDS } from '../../src/core/schema';
import { derive } from '../../src/core/derive';
import { renderConfigBlock, resolveScriptDefault } from '../../src/core/render-config';
import { MARKER } from '../../src/core/script';
import type { ConfigKey } from '../../src/core/types';

const SCRIPT = readFileSync(resolve(__dirname, '../../wrtnova.sh'), 'utf8');
const BODY = SCRIPT.slice(SCRIPT.indexOf(MARKER) + MARKER.length);

/** Shell variables the script uses as fallbacks, and what they resolve to. */
const SHELL_VARS: Record<string, { key: ConfigKey; fallback: string } | { literal: string }> = {
  $base_pfx: { key: 'BASE_NET_PREFIX', fallback: '192.168' },
  $def_subnet: { key: 'DEFAULT_SUBNET', fallback: '/24' },
  $def_pass: { literal: '12345678' },
};

/**
 * Every distinct fallback the body applies per key. Both `:-` (use if unset)
 * and `:=` (use and assign if unset) count. A key with more than one distinct
 * fallback is path-dependent and cannot be suppressed against any single value.
 */
function parseBodyDefaults(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  // Brace-balanced, because expansions nest: the HOST_NAME default itself
  // contains ${AP_MODE:+-${AP_INDEX:=2}}, and a non-greedy [^}]* would swallow
  // the inner one and hide AP_INDEX's default entirely.
  const start = /\$\{([A-Z_][A-Z_0-9]*):[-=]/g;
  let m: RegExpExecArray | null;
  while ((m = start.exec(BODY)) !== null) {
    const key = m[1];
    if (!key) continue;
    let depth = 1;
    let i = start.lastIndex;
    for (; i < BODY.length && depth > 0; i++) {
      if (BODY[i] === '{' && BODY[i - 1] === '$') depth++;
      else if (BODY[i] === '}') depth--;
    }
    const fallback = BODY.slice(start.lastIndex, i - 1).trim();
    const set = out.get(key) ?? new Set<string>();
    set.add(fallback);
    out.set(key, set);
    // Deliberately do NOT advance past the whole expansion: nested defaults
    // must be found too.
  }
  return out;
}

const bodyDefaults = parseBodyDefaults();
const soleDefault = (key: string): string | undefined => {
  const set = bodyDefaults.get(key);
  if (!set || set.size !== 1) return undefined;
  return [...set][0];
};

describe('script defaults', () => {
  it('agrees with the real wrtnova.sh body for every key the script falls back on', () => {
    const mismatches: string[] = [];

    for (const key of CONFIG_KEYS) {
      const spec = FIELDS[key].scriptDefault;
      const all = bodyDefaults.get(key);

      if (all && all.size > 1) {
        // Path-dependent: suppressing against one path's value would be wrong
        // on the other, so the schema must decline to suppress at all.
        if (spec.k !== 'multi' && spec.k !== 'device') {
          mismatches.push(
            `${key}: script has ${all.size} different fallbacks, schema must be 'multi'`,
          );
        }
        continue;
      }

      const scriptFallback = soleDefault(key);

      if (scriptFallback === undefined) {
        // The script has no fallback, so the schema must not claim a literal
        // one — claiming one would suppress a value the script needs.
        if (spec.k === 'lit' || spec.k === 'ref') {
          mismatches.push(`${key}: schema claims a default but the script body has no fallback`);
        }
        continue;
      }

      const shell = SHELL_VARS[scriptFallback];
      if (shell) {
        if ('literal' in shell) {
          if (spec.k !== 'lit' || spec.v !== shell.literal) {
            mismatches.push(`${key}: script falls back to ${scriptFallback} (${shell.literal})`);
          }
        } else if (spec.k !== 'ref' || spec.key !== shell.key) {
          mismatches.push(`${key}: script falls back to ${scriptFallback} (${shell.key})`);
        }
        continue;
      }

      // A fallback containing a command substitution or a nested expansion is
      // computed on the device; the schema must mark it as such.
      if (/[$`(]/.test(scriptFallback)) {
        if (spec.k !== 'device' && spec.k !== 'hostname') {
          mismatches.push(`${key}: script default is device-computed (${scriptFallback})`);
        }
        continue;
      }

      if (spec.k !== 'lit' || spec.v !== scriptFallback) {
        const got = spec.k === 'lit' ? spec.v : spec.k;
        mismatches.push(`${key}: script says '${scriptFallback}', schema says '${got}'`);
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });

  it('does not emit a key whose value equals the script default', () => {
    const block = renderConfigBlock(
      derive({
        BASE_NET_PREFIX: '192.168',
        DEFAULT_SUBNET: '/24',
        LAN_WIFI_SSID: 'WrtNova',
        LAN_VLAN_ID: '1',
        WAN_VLAN_ID: '20',
        NTP_IP: '162.159.200.1',
        WIFI_LOG_LVL: '4',
        MESH_ID: 'mesh_trunk_backhaul',
      }),
    );
    for (const key of ['BASE_NET_PREFIX', 'DEFAULT_SUBNET', 'LAN_WIFI_SSID', 'LAN_VLAN_ID', 'WAN_VLAN_ID', 'NTP_IP', 'WIFI_LOG_LVL']) {
      expect(block, `${key} equals its default and must not be emitted`).not.toContain(`${key}=`);
    }
  });

  it('emits a key whose value differs from the script default', () => {
    const block = renderConfigBlock(derive({ BASE_NET_PREFIX: '10.0', LAN_WIFI_SSID: 'Home' }));
    expect(block).toContain("BASE_NET_PREFIX='10.0'");
    expect(block).toContain("LAN_WIFI_SSID='Home'");
  });

  it('resolves a referencing default against the config, not a fixed literal', () => {
    // GUEST_BASE_PREFIX falls back to $base_pfx, so with a custom base prefix a
    // matching guest prefix is still redundant.
    const cfg = derive({ BASE_NET_PREFIX: '10.0', GUEST_ENABLE: '1', GUEST_BASE_PREFIX: '10.0' });
    expect(resolveScriptDefault('GUEST_BASE_PREFIX', cfg)).toBe('10.0');
    expect(renderConfigBlock(cfg)).not.toContain('GUEST_BASE_PREFIX=');

    const differs = derive({ BASE_NET_PREFIX: '10.0', GUEST_ENABLE: '1', GUEST_BASE_PREFIX: '10.9' });
    expect(renderConfigBlock(differs)).toContain("GUEST_BASE_PREFIX='10.9'");
  });

  it('never suppresses a device-computed default', () => {
    expect(resolveScriptDefault('ULA_PREFIX', {})).toBeNull();
    expect(resolveScriptDefault('WG_PRIVATE_KEY', {})).toBeNull();
  });

  it('resolves the hostname default per role', () => {
    expect(resolveScriptDefault('HOST_NAME', {})).toBe('WrtNova');
    expect(resolveScriptDefault('HOST_NAME', { AP_MODE: '1', AP_INDEX: '3' })).toBe('WrtNova-3');
    // ...and therefore drops a hostname the script would have chosen anyway.
    expect(renderConfigBlock(derive({ HOST_NAME: 'WrtNova' }))).not.toContain('HOST_NAME=');
  });

  it('still emits an enable flag the script has no fallback for', () => {
    // The regression this guards: reading `GUEST_ENABLE=1` from the discarded
    // config section as "the default" would suppress the key and silently turn
    // the guest network off for everyone who left it on.
    expect(bodyDefaults.has('GUEST_ENABLE')).toBe(false);
    expect(renderConfigBlock(derive({ GUEST_ENABLE: '1' }))).toContain("GUEST_ENABLE='1'");
    expect(renderConfigBlock(derive({ DOT11KV: '1' }))).toContain("DOT11KV='1'");
  });
});
