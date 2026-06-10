// @ts-check
// Shared config-block rendering + POSIX shell quoting - one definition, two runtimes.
//
// renderConfigBlock turns a config object into the per-build shell assignment
// block that is prepended to the wrtnova.sh body. It drops:
//   - keys beginning with '_' (internal)
//   - BUILD-ONLY keys (consumed for package resolution, never read by wrtnova.sh)
//   - values equal to '' or '0' (off-state; Section 1 invariant)
//
// Optional maskKeys (a Set) renders those keys as KEY='****' instead of their
// value - used by the browser preview to hide secrets.

// Keys consumed by the website for package resolution only - not read by wrtnova.sh.
export const BUILD_ONLY_KEYS = new Set(['DNS_MODE', 'NON_CT_ATH10K']);

// POSIX-safe quoting. Single quotes suppress all expansion (critical for values
// like bcrypt hashes that contain $). Fall back to double-quote escaping only
// when the value itself contains a single quote.
/**
 * @param {string} s
 * @returns {string}
 */
export function shQuote(s) {
  if (!s.includes("'")) return "'" + s + "'";
  return '"' + s.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/`/g, '\\`').replace(/"/g, '\\"') + '"';
}

/**
 * @param {import('./types.mjs').Config} cfg
 * @param {ReadonlySet<string>} [maskKeys]
 * @returns {string}
 */
export function renderConfigBlock(cfg, maskKeys) {
  const lines = [];
  for (const [k, v] of Object.entries(cfg)) {
    if (k.startsWith('_')) continue;
    if (BUILD_ONLY_KEYS.has(k)) continue;
    if (v === undefined || v === null) continue;
    const s = String(v);
    if (s === '' || s === '0') continue;
    if (maskKeys && maskKeys.has(k)) lines.push(k + "='****'");
    else lines.push(k + '=' + shQuote(s));
  }
  return lines.join('\n') + '\n';
}
