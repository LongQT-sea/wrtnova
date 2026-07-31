// Performance, maintenance, and the escape hatch.
//
// The disclosure at the bottom holds the three things that let a user leave the
// product's opinions behind: extra packages, an arbitrary shell script, and which
// build server to use. They are last and folded away on purpose -- someone who
// needs them will look, and nobody else should have to read past them.

import { useEffect, useState } from 'react';
import { loadAsuServers, type AsuServer } from '@core/asu';
import { useConfigStore, useField } from '@state/configStore';
import { SegmentMark } from '@ui/SegmentGroup';
import { t } from '@i18n/index';
import { BoundText, BoundToggle, Disclosure, Note, SectionPage } from './bound';

export function Advanced() {
  const guest = useField('GUEST_ENABLE');
  const apMode = useField('AP_MODE');

  return (
    <SectionPage title="perfMisc">
      <BoundToggle k="SOFTWARE_OFFLOAD" label="softwareOffload" help="softwareOffloadHelp" />
      <BoundToggle k="HARDWARE_OFFLOAD" label="hardwareOffload" help="hardwareOffloadHelp" />
      <BoundToggle k="IRQBALANCE" label="irqbalance" help="irqbalanceHelp" richLabel />
      <BoundToggle k="LUCI_HTTPS" label="luciHttps" help="luciHttpsHelp" />
      <BoundText
        k="NTP_IP"
        label="ntpServer"
        help="ntpServerHelp"
        placeholder="162.159.200.1"
        mono
        inline
        unvalidated
      />
      <BoundToggle k="QUARTERLY_REBOOT" label="quarterlyReboot" help="quarterlyRebootHelp" />
      {guest === '1' && apMode !== '1' ? (
        <SegmentMark segment="guest">
          <BoundToggle k="DENY_GUEST_NIGHT" label="denyGuestNight" help="denyGuestNightHelp" />
        </SegmentMark>
      ) : null}
      <BoundToggle k="LOG" label="buildLog" help="buildLogHelp" />

      <Disclosure title="advancedOptions">
        <BoundText
          k="additional_packages"
          label="extraPackages"
          help="extraPackagesHelp"
          placeholderId="packagesSeparatorPh"
          multiline
          rows={2}
          mono
          unvalidated
        />
        <BoundText
          k="CUSTOM_SCRIPT"
          label="customScript"
          placeholderId="customScriptPh"
          multiline
          rows={4}
          mono
          unvalidated
        />
        <AsuServerPicker />
        <Note id="asuSecurityWarning" rich danger />
      </Disclosure>
    </SectionPage>
  );
}

/**
 * The build server the assembled script -- secrets included -- is POSTed to
 * (Constitution III). Only shown when the operator has configured more than one:
 * with a single choice there is nothing to decide.
 */
function AsuServerPicker() {
  const [servers, setServers] = useState<AsuServer[]>([]);
  const asuUrl = useConfigStore((s) => s.asuUrl);
  const setAsuUrl = useConfigStore((s) => s.setAsuUrl);

  useEffect(() => {
    let live = true;
    void loadAsuServers().then((list) => {
      if (!live) return;
      setServers(list);
      const first = list[0];
      if (first) setAsuUrl(first.url);
    });
    return () => {
      live = false;
    };
  }, [setAsuUrl]);

  if (servers.length < 2) return null;

  return (
    <label className="block py-1.5">
      <span className="field-label">{t('asuEndpoint')}</span>
      <select
        className="input input-mono mt-1"
        value={asuUrl}
        onChange={(e) => setAsuUrl(e.target.value)}
      >
        {servers.map((s) => (
          <option key={s.url} value={s.url}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
