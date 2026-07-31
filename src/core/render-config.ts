// Rendering the per-build config block, and the POSIX quoting it needs.
//
// The block is an OVERRIDE LAYER (Constitution V): it carries only what the
// user actually changed. A key is dropped when its value equals the fallback
// the provisioning script's BODY would apply anyway.
//
// Keys are emitted in schema order, which is what makes two builds of the same
// configuration byte-identical and lets the build server serve a cached image.

import type { Config, ConfigKey, EmittedConfig } from './types';
import { BUILD_ONLY_KEYS, CONFIG_KEYS, FIELDS, SECRET_KEYS } from './schema';
import type { DefaultSpec } from './schema';

/**
 * POSIX-safe quoting. Single quotes suppress all expansion, which is critical
 * for values like bcrypt hashes that contain '$'. Fall back to double-quote
 * escaping only when the value itself contains a single quote.
 */
export function shQuote(s: string): string {
  if (!s.includes("'")) return "'" + s + "'";
  return (
    '"' +
    s.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/`/g, '\\`').replace(/"/g, '\\"') +
    '"'
  );
}

/**
 * The value the script would use for `key` if we emitted nothing.
 *
 * `null` means "unknowable" — the script computes it on the device (an existing
 * ULA prefix, a freshly generated WireGuard key), so nothing can be suppressed
 * against it.
 */
export function resolveScriptDefault(
  key: ConfigKey,
  cfg: Partial<Config>,
): string | null {
  const spec: DefaultSpec = FIELDS[key].scriptDefault;
  switch (spec.k) {
    case 'unset':
      return '';
    case 'lit':
      return spec.v;
    case 'ref': {
      const referenced = String(cfg[spec.key] ?? '').trim();
      return referenced || spec.fallback;
    }
    case 'hostname':
      return cfg.AP_MODE === '1' ? 'WrtNova-' + (String(cfg.AP_INDEX ?? '') || '2') : 'WrtNova';
    case 'device':
    case 'multi':
      return null;
  }
}

/** Would emitting this key be a no-op against the script's own default? */
export function isRedundantDefault(
  key: ConfigKey,
  value: string,
  cfg: Partial<Config>,
): boolean {
  const def = resolveScriptDefault(key, cfg);
  if (def === null) return false;
  if (def === '') return false; // no fallback: emitting is always meaningful
  return value === def;
}

export interface RenderOptions {
  /** Render these keys as KEY='****' instead of their value. Display only. */
  mask?: ReadonlySet<ConfigKey>;
}

/**
 * Turn a config into the shell assignment block prepended to the script body.
 *
 * Dropped:
 *   - build-only keys (consumed for package resolution, never read by the script)
 *   - CUSTOM_SCRIPT (emitted as its own decode block)
 *   - '' and '0'  (Constitution IV; '0' cannot occur from the type, but a
 *     restored history entry written by an older version might carry one)
 *   - anything equal to the script's own default (Constitution V)
 */
export function renderConfigBlock(cfg: Partial<EmittedConfig>, opts: RenderOptions = {}): string {
  const lines: string[] = [];
  for (const key of CONFIG_KEYS) {
    if (BUILD_ONLY_KEYS.has(key)) continue;
    if (FIELDS[key].ownBlock) continue;

    const raw = cfg[key];
    if (raw === undefined || raw === null) continue;
    const value = String(raw);
    if (value === '' || value === '0') continue;
    if (isRedundantDefault(key, value, cfg)) continue;

    lines.push(opts.mask?.has(key) ? key + "='****'" : key + '=' + shQuote(value));
  }
  return lines.join('\n') + '\n';
}

/** The masked form used by every on-screen preview. */
export function renderConfigBlockMasked(cfg: Partial<EmittedConfig>): string {
  return renderConfigBlock(cfg, { mask: SECRET_KEYS });
}

/** Strip secrets before persisting to history (FR-034). */
export function stripSecrets(cfg: Partial<Config>): Partial<Config> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (SECRET_KEYS.has(k as ConfigKey)) continue;
    out[k] = v;
  }
  return out as Partial<Config>;
}
