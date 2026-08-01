// The release list and the per-release device index, as hooks.
//
// Both pages ask the same two questions -- which OpenWrt releases can I build,
// and which boards does this one list -- so the fetch, the cancellation on
// unmount and the one-step stable fallback (FR-005) live here once. The caches in
// core/openwrt.ts mean the second page to ask pays nothing.

import { useEffect, useState } from 'react';
import { loadOverviewWithFallback, loadVersions, type OverviewProfile } from '@core/openwrt';
import { t } from '@i18n/index';

export interface Releases {
  versions: string[];
  /** The release to start on when the caller has no stored preference. */
  stable: string;
  error: string | null;
}

export function useReleases(): Releases {
  const [state, setState] = useState<Releases>({ versions: [], stable: '', error: null });

  useEffect(() => {
    let live = true;
    void loadVersions()
      .then(({ versions, stable }) => live && setState({ versions, stable, error: null }))
      .catch((e: Error) => live && setState((s) => ({ ...s, error: e.message })));
    return () => {
      live = false;
    };
  }, []);

  return state;
}

export interface DeviceIndex {
  /** null while loading, and after a failure. */
  index: Record<string, OverviewProfile> | null;
  /** The release the index actually came from, which the fallback may have moved. */
  usedVersion: string;
  /** Set when the requested release had no published index (FR-005). */
  fellBackFrom: string | null;
  error: string | null;
}

const EMPTY: DeviceIndex = { index: null, usedVersion: '', fellBackFrom: null, error: null };

export function useDeviceIndex(version: string, versions: readonly string[]): DeviceIndex {
  const [state, setState] = useState<DeviceIndex>(EMPTY);

  useEffect(() => {
    if (!version || !versions.length) return;
    let live = true;
    setState(EMPTY);
    void loadOverviewWithFallback(version, [...versions])
      .then((res) => {
        if (!live) return;
        setState({
          index: res.index,
          usedVersion: res.usedVersion,
          fellBackFrom: res.fellBackFrom ?? null,
          error: null,
        });
      })
      .catch(
        (e: Error) =>
          live && setState({ ...EMPTY, error: t('errorLoadingDevices', { msg: e.message }) }),
      );
    return () => {
      live = false;
    };
  }, [version, versions]);

  return state;
}
