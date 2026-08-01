// The OpenWrt downloads server: release list, per-release device index, and the
// cache in front of both. Pure apart from fetch and localStorage.

import type { DeviceTarget } from './types';
import { cacheGet, cacheSet } from './storage';

export const DOWNLOADS = 'https://downloads.openwrt.org';
export const BRANCHES = ['23.05', '24.10', '25.12'] as const;
/** Branches that publish snapshot builds alongside their releases. */
const SNAPSHOT_BRANCHES = new Set<string>(['24.10', '25.12']);

/** SNAPSHOT lives outside /releases. */
export function versionToUrl(v: string): string {
  return v === 'SNAPSHOT' ? DOWNLOADS + '/snapshots' : DOWNLOADS + '/releases/' + v;
}

export interface OverviewProfile {
  id: string;
  target: string;
  titles?: Array<{ title?: string; vendor?: string; model?: string; variant?: string }>;
}

export function titleFor(profile: OverviewProfile): string {
  const t = profile.titles?.[0] ?? {};
  if (t.title) return t.title.trim();
  return [t.vendor, t.model, t.variant].filter(Boolean).join(' ').trim();
}

/** Numeric compare, not lexical: 24.10.10 outranks 24.10.9. */
export function pickLatestPatches(versions: string[], branch: string, n: number): string[] {
  return versions
    .filter((v) => v.startsWith(branch + '.'))
    .sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pb[i] ?? 0) - (pa[i] ?? 0);
        if (d) return d;
      }
      return 0;
    })
    .slice(0, n)
    .reverse();
}

/** The releases offered in the picker, oldest first, snapshots last. */
export function buildVersionList(versionsList: string[]): string[] {
  const picks: string[] = [];
  for (const b of BRANCHES) {
    picks.push(...pickLatestPatches(versionsList, b, 2));
    if (SNAPSHOT_BRANCHES.has(b)) picks.push(b + '-SNAPSHOT');
  }
  picks.push('SNAPSHOT');
  return picks;
}

/**
 * Two boards can share a title across targets (same model, different SoC), so a
 * collision is suffixed with its target instead of silently overwriting.
 */
export function indexByTitle(profiles: OverviewProfile[]): Record<string, OverviewProfile> {
  const seen: Record<string, OverviewProfile> = {};
  const dups = new Set<string>();
  for (const p of profiles ?? []) {
    const t = titleFor(p);
    if (seen[t]) dups.add(t);
    seen[t] = p;
  }
  const out: Record<string, OverviewProfile> = {};
  for (const p of profiles ?? []) {
    const t = titleFor(p);
    out[dups.has(t) ? `${t} (${p.target})` : t] = p;
  }
  return out;
}

/** Word-wise, so "archer c7" finds "TP-Link Archer C7 v5"; a substring test does not. */
export function searchTitles(
  byTitle: Record<string, OverviewProfile> | null,
  q: string,
): string[] {
  if (!byTitle) return [];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return Object.keys(byTitle)
    .filter((t) => {
      const lc = t.toLowerCase();
      return words.every((w) => lc.includes(w));
    })
    .sort();
}

// -- fetching ----------------------------------------------------------------

interface VersionsPayload {
  versions_list?: string[];
  stable_version?: string;
}

export async function loadVersions(): Promise<{ versions: string[]; stable: string }> {
  const KEY = 'wrtnova_versions';
  const cached = cacheGet<VersionsPayload>(KEY);
  if (cached) {
    // Refresh in the background so the cache stays current without blocking.
    void fetch(DOWNLOADS + '/.versions.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('versions'))))
      .then((d) => cacheSet(KEY, d))
      .catch(() => {});
    return shapeVersions(cached);
  }
  const res = await fetch(DOWNLOADS + '/.versions.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load the OpenWrt release list.');
  const data = (await res.json()) as VersionsPayload;
  cacheSet(KEY, data);
  return shapeVersions(data);
}

function shapeVersions(data: VersionsPayload): { versions: string[]; stable: string } {
  const versions = buildVersionList(data.versions_list ?? []);
  const advertised = data.stable_version ?? '';
  const stable = advertised && versions.includes(advertised)
    ? advertised
    : (versions.filter((v) => !v.includes('SNAPSHOT')).pop() ?? versions[0] ?? '');
  return { versions, stable };
}

export interface Overview {
  profiles: OverviewProfile[];
}

export async function loadOverview(version: string): Promise<Record<string, OverviewProfile>> {
  const KEY = 'wrtnova_overview_' + version;
  const cached = cacheGet<Overview>(KEY);
  if (cached) {
    void fetch(versionToUrl(version) + '/.overview.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('overview'))))
      .then((d) => cacheSet(KEY, d))
      .catch(() => {});
    return indexByTitle(cached.profiles ?? []);
  }
  const res = await fetch(versionToUrl(version) + '/.overview.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('device index unavailable for ' + version);
  const data = (await res.json()) as Overview;
  cacheSet(KEY, data);
  return indexByTitle(data.profiles ?? []);
}

/**
 * The release advertised as stable may 404 mid-rollout, because its device
 * index is not published yet. Fall back one step and say so (FR-005).
 */
export async function loadOverviewWithFallback(
  version: string,
  versions: string[],
): Promise<{ index: Record<string, OverviewProfile>; usedVersion: string; fellBackFrom?: string }> {
  try {
    return { index: await loadOverview(version), usedVersion: version };
  } catch (err) {
    const idx = versions.indexOf(version);
    const fallback = versions
      .slice(0, idx)
      .reverse()
      .find((v) => !v.includes('SNAPSHOT'));
    if (!fallback) throw err;
    return {
      index: await loadOverview(fallback),
      usedVersion: fallback,
      fellBackFrom: version,
    };
  }
}

interface ProfilesPayload {
  version_code?: string;
  default_packages?: string[];
  profiles?: Record<string, { device_packages?: string[]; images?: DeviceTarget['images'] }>;
}

/** Resolve the full target for one board. */
export async function loadDeviceTarget(
  version: string,
  profile: OverviewProfile,
  title: string,
): Promise<DeviceTarget> {
  const url = versionToUrl(version) + '/targets/' + profile.target + '/profiles.json';
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load details for this device (' + res.status + ').');
  const data = (await res.json()) as ProfilesPayload;
  const dev = data.profiles?.[profile.id] ?? {};
  return {
    title,
    profile: profile.id,
    target: profile.target,
    version,
    version_code: data.version_code ?? '',
    default_packages: data.default_packages ?? [],
    device_packages: dev.device_packages ?? [],
    images: dev.images ?? [],
  };
}

// -- capability flags derived from the resolved package sets -----------------

export function hasAth10kCt(target: DeviceTarget): boolean {
  return [...target.default_packages, ...target.device_packages].some((p) =>
    /^ath10k-firmware-|^kmod-ath10k-ct/.test(p),
  );
}

/** A board with no radio has no Wi-Fi settings worth offering, mesh least of all. */
export function hasWireless(target: DeviceTarget): boolean {
  return [...target.default_packages, ...target.device_packages].some((p) =>
    /^wpad|^hostapd|mac80211/.test(p),
  );
}

/**
 * WED needs the mt7915e MediaTek Filogic driver (MT7622/7981/7986); the kmod's
 * presence is the capability signal. Newer mt7996e parts use a different module
 * name and are deliberately out of scope.
 */
export function isWedCapable(target: DeviceTarget): boolean {
  return [...target.default_packages, ...target.device_packages].some(
    (p) => p === 'kmod-mt7915e',
  );
}

/** Find the closest available release to one a restored build asked for. */
export function findBestVersion(stored: string, available: string[]): string | null {
  if (!stored || !available.length) return null;
  if (available.includes(stored)) return stored;
  if (stored === 'SNAPSHOT') {
    return available.includes('SNAPSHOT') ? 'SNAPSHOT' : (available[0] ?? null);
  }
  const branch = stored.split('.').slice(0, 2).join('.');
  const matches = available.filter((v) => v.startsWith(branch + '.'));
  return matches[matches.length - 1] ?? available[0] ?? null;
}
