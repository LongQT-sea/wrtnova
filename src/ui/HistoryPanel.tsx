// Recent builds, with a way back into any of them.
//
// Restoring is the point (US3): the same router gets rebuilt every few months on a
// newer release, and retyping 110 fields to do it is the reason people keep a text
// file of their settings instead. What cannot come back is the secrets -- they were
// never stored -- so the panel says that rather than letting the user discover it
// at the router.

import { useEffect, useState } from 'react';
import type { HistoryEntry } from '@core/types';
import { findBestVersion } from '@core/openwrt';
import { useConfigStore } from '@state/configStore';
import { rawFromEntry, targetFromEntry, useHistoryStore } from '@state/historyStore';
import { t } from '@i18n/index';

/** Plain-language age, in the terms the catalogue already has. */
function age(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return t('today');
  if (days === 1) return t('yesterday');
  return t('daysAgo', { n: days });
}

export function HistoryPanel() {
  // The releases currently on offer, for the nearest-release fallback (FR-036).
  const versions = useConfigStore((s) => s.versions);
  const entries = useHistoryStore((s) => s.entries);
  const load = useHistoryStore((s) => s.load);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => load(), [load]);

  const restore = async (entry: HistoryEntry) => {
    setBusy(entry.ts);
    setError(null);
    setNote(null);
    try {
      // The release it was built on may be gone; take the nearest one still
      // offered and say so rather than failing (FR-036).
      const version = findBestVersion(entry.device.version, versions) ?? entry.device.version;
      const target = await targetFromEntry(entry, version);
      const state = useConfigStore.getState();
      state.setVersion(version);
      state.setTarget(target);
      state.patch(rawFromEntry(entry));
      // A restored configuration is the user's explicit choice of DNS engine, so
      // the hardware default must not overwrite it on the next device change.
      state.markDnsTouched();
      setNote(
        version === entry.device.version
          ? t('restoredSecrets')
          : t('restoredRelease', { from: entry.device.version, to: version }) +
              ' ' +
              t('restoredSecrets'),
      );
    } catch (e) {
      setError(t('restoreFailed', { msg: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <details className="card mt-3 p-3">
      <summary className="disclosure-summary">
        <svg
          className="chev"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {t('recentBuilds')}
        {entries.length ? ` (${entries.length})` : null}
      </summary>

      {entries.length === 0 ? (
        <p className="field-help mt-2">{t('noBuildsYet')}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {entries.map((entry) => (
            <li key={entry.ts} className="border-t border-rule pt-2 first:border-0 first:pt-0">
              <p className="truncate text-sm font-semibold">{entry.device.title}</p>
              <p className="field-help mono">
                {entry.device.version} · {t('builtAgo', { ago: age(entry.ts) })}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-quiet py-1"
                  disabled={busy !== null}
                  onClick={() => void restore(entry)}
                >
                  {busy === entry.ts ? t('loading') : t('restore')}
                </button>
                {entry.result.firmware_url ? (
                  <a
                    href={entry.result.firmware_url}
                    className="text-xs font-semibold text-seg-lan underline"
                  >
                    {t('download')}
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {note ? (
        <p className="note mt-2" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="field-error mt-2" role="alert">
          {error}
        </p>
      ) : null}
    </details>
  );
}
