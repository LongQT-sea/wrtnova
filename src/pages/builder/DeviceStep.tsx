// The opening question, and the only one that has to be answered first.
//
// Nothing else renders until hardware is chosen (US1): the release determines
// which options exist, the board determines which of those it can honour, and a
// form that offers WED to an ath79 router has already misled the person filling it
// in. Once a device is picked this collapses to a single line with a way back.

import { useCallback, useEffect, useState } from 'react';
import {
  loadDeviceTarget,
  loadOverviewWithFallback,
  loadVersions,
  searchTitles,
  type OverviewProfile,
} from '@core/openwrt';
import { useConfigStore } from '@state/configStore';
import { capsFor, clearUnsupported, dnsDefaultFor } from '@state/capabilities';
import { Combobox } from '@ui/Combobox';
import { SelectField } from '@ui/SelectField';
import { t } from '@i18n/index';

type Index = Record<string, OverviewProfile>;

export function DeviceStep() {
  const target = useConfigStore((s) => s.target);
  const version = useConfigStore((s) => s.version);
  const fellBackFrom = useConfigStore((s) => s.fellBackFrom);

  const [versions, setVersions] = useState<string[]>([]);
  const [index, setIndex] = useState<Index | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The release list, and the release to start on.
  useEffect(() => {
    let live = true;
    void loadVersions()
      .then(({ versions: list, stable }) => {
        if (!live) return;
        setVersions(list);
        const state = useConfigStore.getState();
        if (!state.version) state.setVersion(stable);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  // The device index for the chosen release, with the one-step stable fallback
  // when the release advertised as stable has no published index yet (FR-005).
  useEffect(() => {
    if (!version || !versions.length) return;
    let live = true;
    setIndex(null);
    setError(null);
    void loadOverviewWithFallback(version, versions)
      .then((res) => {
        if (!live) return;
        const state = useConfigStore.getState();
        setIndex(res.index);
        state.setFellBackFrom(res.fellBackFrom ?? null);
        if (res.usedVersion !== version) state.setVersion(res.usedVersion);
      })
      .catch((e: Error) => live && setError(t('errorLoadingDevices', { msg: e.message })));
    return () => {
      live = false;
    };
  }, [version, versions]);

  const pick = useCallback(
    async (title: string) => {
      const profile = index?.[title];
      if (!profile) return;
      setBusy(true);
      setError(null);
      try {
        const resolved = await loadDeviceTarget(version, profile, title);
        const state = useConfigStore.getState();
        state.setTarget(resolved);

        // A board and a release together decide which options exist, so a device
        // change re-runs both gates (FR-022, FR-023).
        const patch = {
          ...(state.dnsModeTouched ? {} : dnsDefaultFor(resolved)),
          ...clearUnsupported(state.raw, capsFor(resolved, version)),
        };
        if (Object.keys(patch).length) state.patch(patch);
      } catch (e) {
        setError(t('errorDeviceDetails', { msg: (e as Error).message }));
      } finally {
        setBusy(false);
      }
    },
    [index, version],
  );

  const titles = index ? Object.keys(index) : [];

  return (
    <section className="card p-4 sm:p-5">
      {target ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="field-help">{t('firmwareTarget')}</p>
            <p className="font-display truncate text-lg font-semibold">{target.title}</p>
            <p className="field-help mono">
              {target.target} / {target.profile} / {target.version}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => useConfigStore.getState().setTarget(null)}
          >
            {t('changeDevice')}
          </button>
        </div>
      ) : (
        <>
          <h2 className="text-xl">{t('deviceQuestion')}</h2>
          <p className="field-help mt-1">{t('deviceQuestionHelp')}</p>
        </>
      )}

      <div className={target ? 'mt-3 border-t border-rule pt-3' : 'mt-3'}>
        <SelectField
          id="release"
          label={t('openWrtVersion')}
          value={version}
          options={
            versions.length
              ? versions.map((v) => ({ value: v, label: v }))
              : [{ value: '', label: t('loading') }]
          }
          onChange={(v) => {
            // The index is release-scoped, so the resolved board no longer
            // applies; the user re-picks against the release they chose.
            useConfigStore.getState().setTarget(null);
            useConfigStore.getState().setVersion(v);
          }}
          inline
          mono
        />

        {fellBackFrom ? (
          <p className="note mt-2" role="status">
            {t('releaseFellBack', { from: fellBackFrom, to: version })}
          </p>
        ) : null}

        {target ? null : (
          <Combobox
            id="device"
            label={t('device')}
            help={t('deviceRequirement')}
            value=""
            items={titles}
            search={(q) => (q ? searchTitles(index, q) : titles)}
            placeholder={t('deviceSearchPlaceholder')}
            emptyLabel={index ? t('noDevicesFound') : t('loadingDevices')}
            loading={index === null || busy}
            onChange={(title) => void pick(title)}
          />
        )}

        {error ? (
          <p className="field-error mt-2" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
