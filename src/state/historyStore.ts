// Recent builds.
//
// FR-034: SECRETS ARE NEVER WRITTEN HERE. The root password, Wi-Fi passphrases,
// WireGuard keys and API tokens are stripped before an entry is stored, which is
// why a restored build comes back with those fields empty and the interface says
// so. localStorage is readable by anything that can run script on the origin, and
// the product's promise is that these values live in the browser tab only.
//
// FR-033: bounded to five, and a rebuild of the same configuration replaces the
// top entry rather than pushing a sixth -- retrying after a failure should not
// fill the list with identical rows.

import { create } from 'zustand';
import type { BuildResult, DeviceTarget, HistoryEntry, RawConfig } from '@core/types';
import { joinEndpoint } from '@core/list-grammar';
import { loadDeviceTarget } from '@core/openwrt';
import { parseAdditionalPackages } from '@core/packages';
import { stripSecrets } from '@core/render-config';
import { HISTORY_MAX, pushHistory, readHistory, writeHistory } from '@core/storage';
import { INITIAL_RAW, emissionFor } from './configStore';

export interface HistoryState {
  entries: HistoryEntry[];
  /** Read (and migrate) what previous versions of the app wrote. */
  load: () => void;
  /**
   * Record a build. Returns the entry so the caller can hand back its firmware
   * url once the server has one.
   */
  record: (args: {
    raw: RawConfig;
    target: DeviceTarget;
    result: BuildResult;
    warpRefreshToken?: string;
  }) => HistoryEntry;
  /** Attach the download link to the newest entry once the build finishes. */
  completeTop: (result: BuildResult) => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],

  load: () => set({ entries: readHistory() }),

  record: ({ raw, target, result, warpRefreshToken }) => {
    // The emission, not the raw form: history should restore what was BUILT,
    // including the board's own VLAN-table cut, so a rebuild is byte-identical.
    const emitted = emissionFor(raw, target.target).config;
    const entry: HistoryEntry = {
      ts: Date.now(),
      device: {
        title: target.title,
        profile: target.profile,
        target: target.target,
        version: target.version,
      },
      config: stripSecrets(emitted),
      additional_packages: parseAdditionalPackages(raw.additional_packages),
      warp_refresh_token: warpRefreshToken ?? '',
      result,
    };
    const entries = pushHistory(entry, get().entries).slice(0, HISTORY_MAX);
    writeHistory(entries);
    set({ entries });
    return entry;
  },

  completeTop: (result) => {
    const entries = get().entries.slice();
    const top = entries[0];
    if (!top) return;
    entries[0] = { ...top, result };
    writeHistory(entries);
    set({ entries });
  },
}));

// -- restoring ---------------------------------------------------------------

/**
 * Turn a stored entry back into something the form can hold.
 *
 * The stored shape is the EMITTED config, so the UI-only conveniences the
 * derivation transformed away have to be reconstructed (FR-035): the WAN type is
 * implied by PPPoE credentials being present, the two inverted flags flip back,
 * the split endpoint is rejoined, and the package list becomes text again.
 *
 * The endpoint rejoin is a no-op for a history entry, because the endpoint names
 * the user's VPN server and is stripped as a secret. It is here because the fleet
 * page restores node configs through the same function, and those are kept whole.
 *
 * Everything absent falls back to the starting configuration rather than to '',
 * so a key added to the schema after the entry was written gets this version's
 * default instead of being silently off.
 */
export function rawFromEntry(entry: HistoryEntry): RawConfig {
  const stored = entry.config;
  const raw: RawConfig = { ...INITIAL_RAW, ...stored };

  raw.wan_type = String(stored.PPPOE_USERNAME ?? '') !== '' ? 'pppoe' : 'dhcp';
  // The form asks the positive question in both cases; the config key is the
  // negative, so restoring has to invert what emitting inverted.
  raw.DNSMASQ_MULTI_INSTANCE = stored.DNSMASQ_SINGLE_INSTANCE === '1' ? '' : '1';
  raw.IOT_DOT11R_UI = stored.IOT_NO_DOT11R === '1' ? '' : '1';
  raw.additional_packages = entry.additional_packages.join(' ');
  // One "host:port" field in the form, two variables in the script.
  raw.ENDPOINT = joinEndpoint(stored.ENDPOINT, stored.ENDPOINT_PORT);
  raw.ENDPOINT_PORT = '';

  return raw;
}

/**
 * Re-resolve the board a stored entry names. The device index is not consulted:
 * the entry already carries the profile and target, and the index for the release
 * being restored to may not even list that board any more.
 */
export function targetFromEntry(entry: HistoryEntry, version: string): Promise<DeviceTarget> {
  return loadDeviceTarget(
    version,
    { id: entry.device.profile, target: entry.device.target },
    entry.device.title,
  );
}
