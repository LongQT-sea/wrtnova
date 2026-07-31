// @ts-check
// The OpenWrt downloads server, as both pages read it: version list, per-version
// device index, and the localStorage cache in front of both - one definition,
// two runtimes. Pure - no DOM, no page state.
//
// Fetch orchestration stays page-local and should: /builder refreshes the cache
// in the background and falls back a version when a fresh stable's
// .overview.json is not published yet; /networks populates a different <select>
// and tracks a per-node desired version.

export const DL = 'https://downloads.openwrt.org';
export const CACHE_TTL = 6 * 60 * 60 * 1000;   // 6 hours
export const BRANCHES = ['23.05', '24.10', '25.12'];

/** @param {string} key @returns {any} cached payload, or null when absent/stale */
export function cacheGet(key) {
  try {
    const item = JSON.parse(localStorage.getItem(key) || 'null');
    return item && (Date.now() - item.ts < CACHE_TTL) ? item.data : null;
  } catch (e) { return null; }
}

/** @param {string} key @param {any} data */
export function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch (e) {}
}

/** Release dir for a version; SNAPSHOT lives outside /releases. @param {string} v */
export function versionToUrl(v) {
  return v === 'SNAPSHOT' ? DL + '/snapshots' : DL + '/releases/' + v;
}

/** @param {any} profile an .overview.json entry @returns {string} display name */
export function titleFor(profile) {
  const t = (profile.titles && profile.titles[0]) || {};
  if (t.title) return t.title.trim();
  return [t.vendor, t.model, t.variant].filter(Boolean).join(' ').trim();
}

/**
 * Numeric compare, not lexical: 24.10.10 outranks 24.10.9.
 * @param {string[]} versions @param {string} branch @param {number} n
 * @returns {string[]} the n newest patches of that branch, oldest first
 */
export function pickLatestPatches(versions, branch, n) {
  return versions.filter(v => v.startsWith(branch + '.'))
    .sort((a, b) => {
      const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pb[i] || 0) - (pa[i] || 0);
        if (d) return d;
      }
      return 0;
    })
    .slice(0, n)
    .reverse();
}

/**
 * Two boards can share a title across targets (same model, different SoC), so a
 * collision is suffixed with its target instead of overwriting silently.
 * @param {any[]} profiles
 * @returns {Record<string, any>} profiles keyed by display title
 */
export function indexByTitle(profiles) {
  const list = profiles || [];
  const seen = {}, dups = new Set();
  list.forEach(p => { const t = titleFor(p); if (seen[t]) dups.add(t); seen[t] = p; });
  const out = {};
  list.forEach(p => {
    const t = titleFor(p);
    out[dups.has(t) ? t + ' (' + p.target + ')' : t] = p;
  });
  return out;
}

/**
 * Word-wise, so "archer c7" finds "TP-Link Archer C7 v5"; a substring test does not.
 * @param {Record<string, any>|null} byTitle @param {string} q
 * @returns {string[]} matching titles, sorted
 */
export function searchTitles(byTitle, q) {
  if (!byTitle) return [];
  const qs = q.toLowerCase().split(/\s+/).filter(Boolean);
  return Object.keys(byTitle).filter(t => {
    const lc = t.toLowerCase();
    return qs.every(w => lc.includes(w));
  }).sort();
}
