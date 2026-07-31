// The resolved package set, before the build (FR-025).
//
// The browser sends diff_packages, so this list is the complete desired set rather
// than a delta -- which makes it worth showing: a user who turns on AdGuard Home
// and wonders what it costs can see exactly what arrives, and a user hunting a
// too-big-for-flash failure can see what to drop.

import { useMemo } from 'react';
import { parseAdditionalPackages, resolvePackages } from '@core/packages';
import { useConfigStore } from '@state/configStore';
import { t } from '@i18n/index';

export function PackagePanel() {
  const target = useConfigStore((s) => s.target);
  const raw = useConfigStore((s) => s.raw);

  const packages = useMemo(() => {
    if (!target) return [];
    return resolvePackages({
      base: target.default_packages,
      device: target.device_packages,
      extra: parseAdditionalPackages(raw.additional_packages),
      config: raw,
    });
  }, [target, raw]);

  if (!packages.length) return null;

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
        {t('finalPackages')} ({packages.length})
      </summary>
      <ul className="mt-2 flex flex-wrap gap-1">
        {packages.map((p) => (
          <li key={p}>
            {/* A leading '-' is a removal token: the package is taken back out. */}
            <span className={'chip' + (p.startsWith('-') ? ' line-through opacity-60' : '')}>
              {p}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
