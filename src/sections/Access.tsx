// Identity and how you get in: hostname, root password, SSH, clock.

import { useEffect, useMemo, useState } from 'react';
import { useConfigStore, useDevice, useField } from '@state/configStore';
import { capsFor } from '@state/capabilities';
import { loadZones, type Zone } from '@state/staticData';
import { Combobox } from '@ui/Combobox';
import { t } from '@i18n/index';
import { BoundRadio, BoundText, Note, SectionPage } from './bound';

export function Access() {
  return (
    <SectionPage title="system">
      <BoundText k="HOST_NAME" label="hostname" placeholder="WrtNova" mono />
      <BoundText
        k="ROOT_PASSWD"
        label="rootPassword"
        help="rootPasswordHelp"
        secret
        unvalidated
      />
      <BoundText
        k="SSH_PUBLIC_KEY"
        label="sshPublicKeys"
        help="oneKeyPerLine"
        multiline
        rows={3}
        mono
        unvalidated
        placeholder="ssh-ed25519 AAAA..."
      />
      <BoundRadio
        k="SSH_PASSWD_AUTH"
        label="sshPasswordAuth"
        help="sshPasswordAuthHelp"
        options={[
          { value: '', label: t('sshAuthOn') },
          { value: 'off', label: t('sshAuthOff') },
        ]}
      />

      <TimezoneField />
      <TimeFormatField />

      <Note id="asuSecurityWarning" rich danger />
    </SectionPage>
  );
}

/**
 * One control, two keys: the tz database name the user picks (ZONE_NAME) and the
 * POSIX TZ string the router needs (TIME_ZONE). They are only ever written
 * together, which is why the derivation treats TIME_ZONE as derived rather than
 * as something the form owns.
 */
function TimezoneField() {
  const [zones, setZones] = useState<Zone[]>([]);
  const zoneName = useField('ZONE_NAME');
  const tzString = useField('TIME_ZONE');
  const patch = useConfigStore((s) => s.patch);

  useEffect(() => {
    let live = true;
    void loadZones().then((z) => {
      if (live) setZones(z);
    });
    return () => {
      live = false;
    };
  }, []);

  const names = useMemo(() => zones.map((z) => z.zoneName), [zones]);

  return (
    <>
      <Combobox
        id="ZONE_NAME"
        label={t('timezone')}
        value={zoneName}
        items={names}
        placeholder={t('tzSearchPlaceholder')}
        loading={zones.length === 0}
        mono
        onChange={(name) => {
          const zone = zones.find((z) => z.zoneName === name);
          patch({ ZONE_NAME: name, TIME_ZONE: zone?.tzString ?? '' });
        }}
      />
      {tzString ? <p className="field-help mono -mt-1 mb-1">TZ={tzString}</p> : null}
    </>
  );
}

/** Withheld before OpenWrt 25, which has no such setting (FR-023). */
function TimeFormatField() {
  const { target, version } = useDevice();
  const caps = capsFor(target, version);
  if (!caps.timeFormat) return null;
  return (
    <BoundRadio
      k="TIME_FORMAT"
      label="timeFormat"
      help="timeFormatHelp"
      options={[
        { value: '', label: t('timeFormatDefault') },
        { value: 'h23', label: t('timeFormat24') },
        { value: 'h12', label: t('timeFormat12') },
      ]}
    />
  );
}
