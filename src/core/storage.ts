// Browser-local persistence.
//
// The keys and payload shapes below are UNCHANGED from the previous version of
// the app, deliberately: a user with saved networks and build history must not
// lose them to a redesign. The three migrations at the bottom carry forward
// data written by older versions.
//
// Every access is wrapped, so a disabled or full localStorage degrades the
// feature without breaking the build path.

import type { HistoryEntry, Network, RawConfig } from './types';

export const KEYS = {
  history: 'wrtnova_history',
  networks: 'wrtnova_networks',
  warpRefresh: 'wrtnova_warp_refresh',
  lang: 'lang',
  theme: 'theme',
} as const;

export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const HISTORY_MAX = 5;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* full or unavailable: the build path does not depend on this */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = read(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    write(key, JSON.stringify(value));
  } catch {
    /* circular or unserializable: nothing useful to do */
  }
}

// -- TTL cache ---------------------------------------------------------------

interface CacheEnvelope<T> {
  data: T;
  ts: number;
}

export function cacheGet<T>(key: string): T | null {
  const item = readJson<CacheEnvelope<T> | null>(key, null);
  if (!item || typeof item.ts !== 'number') return null;
  return Date.now() - item.ts < CACHE_TTL_MS ? item.data : null;
}

export function cacheSet<T>(key: string, data: T): void {
  writeJson(key, { data, ts: Date.now() } satisfies CacheEnvelope<T>);
}

// -- WARP refresh token (Constitution VI) ------------------------------------

export function readWarpToken(): string {
  return read(KEYS.warpRefresh) ?? '';
}

export function writeWarpToken(token: string): void {
  if (token) write(KEYS.warpRefresh, token);
}

// -- history -----------------------------------------------------------------

export function readHistory(): HistoryEntry[] {
  const list = readJson<HistoryEntry[]>(KEYS.history, []);
  return Array.isArray(list) ? list.map(migrateHistoryEntry) : [];
}

export function writeHistory(entries: HistoryEntry[]): void {
  writeJson(KEYS.history, entries.slice(0, HISTORY_MAX));
}

/**
 * Prepend an entry, replacing the top one when it is the same build repeated —
 * rebuilding after a failed attempt should not push five identical rows.
 */
export function pushHistory(entry: HistoryEntry, existing: HistoryEntry[]): HistoryEntry[] {
  const top = existing[0];
  const same =
    top &&
    top.device.profile === entry.device.profile &&
    top.device.version === entry.device.version &&
    JSON.stringify(top.config) === JSON.stringify(entry.config);
  return (same ? [entry, ...existing.slice(1)] : [entry, ...existing]).slice(0, HISTORY_MAX);
}

// -- networks ----------------------------------------------------------------

export function readNetworks(): Network[] {
  const list = readJson<Network[]>(KEYS.networks, []);
  return Array.isArray(list) ? list.map(migrateNetwork) : [];
}

export function writeNetworks(networks: Network[]): void {
  writeJson(KEYS.networks, networks);
}

// -- migrations --------------------------------------------------------------
//
// Data written by older versions of the app. Each is idempotent, so running
// them on already-migrated data is a no-op.

const VPN_SUFFIXES = ['BASE_PREFIX', 'SUBNET', 'IFACE', 'VLAN_ID', 'WIFI_SSID', 'WIFI_PASSWD'];

/**
 * The VPN network's keys were renamed LAN_WG_* -> LAN_VPN_*. Deliberately
 * untyped in and out: it renames keys, so the input type never describes the
 * result.
 */
export function migrateVpnKeys(cfg: Record<string, unknown>): Record<string, unknown> {
  const out = { ...cfg };
  for (const suffix of VPN_SUFFIXES) {
    const oldKey = 'LAN_WG_' + suffix;
    const newKey = 'LAN_VPN_' + suffix;
    if (!(oldKey in out)) continue;
    const v = out[oldKey];
    delete out[oldKey];
    if (v && !out[newKey]) out[newKey] = v;
  }
  return out;
}

export function migrateHistoryEntry(entry: HistoryEntry): HistoryEntry {
  return { ...entry, config: migrateVpnKeys(entry.config as Record<string, unknown>) as never };
}

export function migrateNetwork(net: Network): Network {
  const shared = migrateVpnKeys(
    (net.shared_config ?? {}) as Record<string, unknown>,
  ) as Network['shared_config'];

  const nodes = (net.nodes ?? []).map((node) => {
    const overrides = migrateVpnKeys({ ...(node.overrides ?? {}) } as Record<string, unknown>);
    // WAN_MAC_ADDR was mistakenly written into router overrides, where it
    // clobbered the shared value with an empty string.
    if (overrides.AP_MODE !== '1' && 'WAN_MAC_ADDR' in overrides) delete overrides.WAN_MAC_ADDR;
    return { ...node, overrides: overrides as Partial<RawConfig> };
  });

  // HOST_NAME moved from the shared config to per-node overrides, seeded onto
  // the main router only — otherwise a fleet ends up with one hostname on every
  // node, and the access points would collide.
  if ('HOST_NAME' in shared) {
    const hostname = shared.HOST_NAME;
    delete shared.HOST_NAME;
    const router = nodes.find((n) => n.overrides.AP_MODE !== '1');
    if (hostname && router && !router.overrides.HOST_NAME) {
      router.overrides = { ...router.overrides, HOST_NAME: hostname };
    }
  }

  return { ...net, shared_config: shared, nodes };
}
