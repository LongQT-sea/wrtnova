// Radios, SSIDs, roaming, and the mesh backhaul.
//
// Each network's SSID and passphrase live in that network's cable-pair group, so
// the wireless section and the addressing section agree about what "Guest" means.

import { useEffect, useMemo, useState } from 'react';
import type { SegmentId } from '@core/types';
import { useConfigStore, useDevice, useField } from '@state/configStore';
import { capsFor } from '@state/capabilities';
import { usePskVlanError } from '@state/validation';
import { loadCountries, type Country } from '@state/staticData';
import { Combobox } from '@ui/Combobox';
import { SegmentGroup, SegmentMark } from '@ui/SegmentGroup';
import { t } from '@i18n/index';
import {
  BoundSelect,
  BoundText,
  BoundToggle,
  Disclosure,
  Note,
  SectionPage,
  type FlagKey,
  type TextKey,
} from './bound';

// 2.4 GHz: 1-13. 5 GHz: the UNII bands. 6 GHz: every 4th channel from 1.
const CHANNELS_2G = Array.from({ length: 13 }, (_, i) => i + 1);
const CHANNELS_5G = [
  36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144,
  149, 153, 157, 161, 165,
];
// The high-band radio on a tri-band board: UNII-2C and UNII-3 only, because
// wrtnova.sh always assigns this key to the higher-frequency radio and a low
// channel here would be nonsensical.
const CHANNELS_5G_2 = [100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165];
const CHANNELS_6G = Array.from({ length: 59 }, (_, i) => 1 + i * 4);

const channelOptions = (list: readonly number[]) => [
  { value: '', label: t('channelDefault') },
  { value: 'auto', label: t('channelAuto') },
  ...list.map((n) => ({ value: String(n), label: String(n) })),
];

interface WifiSeg {
  id: SegmentId;
  name: 'segLan' | 'segGuest' | 'segIot' | 'segVpn';
  ssid: TextKey;
  passwd: TextKey;
  enable: FlagKey | null;
  defaultSsid: string;
}

const WIFI_SEGMENTS: readonly WifiSeg[] = [
  { id: 'lan', name: 'segLan', ssid: 'LAN_WIFI_SSID', passwd: 'LAN_WIFI_PASSWD', enable: null, defaultSsid: 'WrtNova' },
  { id: 'guest', name: 'segGuest', ssid: 'GUEST_WIFI_SSID', passwd: 'GUEST_WIFI_PASSWD', enable: 'GUEST_ENABLE', defaultSsid: 'WrtNova_Guest' },
  { id: 'iot', name: 'segIot', ssid: 'IOT_WIFI_SSID', passwd: 'IOT_WIFI_PASSWD', enable: 'IOT_ENABLE', defaultSsid: 'WrtNova_IoT' },
  { id: 'vpn', name: 'segVpn', ssid: 'LAN_VPN_WIFI_SSID', passwd: 'LAN_VPN_WIFI_PASSWD', enable: 'WG_ENABLE', defaultSsid: 'WrtNova_VPN' },
];

export function Wifi() {
  const pskError = usePskVlanError();

  return (
    <SectionPage title="wifi">
      <CountryField />
      <Note id="wifiDefaultBlank" />

      {WIFI_SEGMENTS.map((seg) => (
        <WifiSegment key={seg.id} seg={seg} />
      ))}

      {pskError ? <p className="field-error mt-2">{pskError}</p> : null}

      <div className="mt-4">
        <BoundToggle k="PSK_VLAN" label="pskVlan" help="pskVlanHelp" />
        <PskVlanNote />
        <GuestIsolate />
        <BoundToggle k="BAND_SUFFIX" label="bandSuffix" help="bandSuffixHelp" richHelp />
        <WedToggle />
        <Ath10kToggle />
      </div>

      <MeshGroup />

      <Disclosure title="advancedChannels">
        <BoundToggle k="DOT11KV" label="dot11kv" help="dot11kvHelp" />
        <DenseEnv />
        <BoundToggle k="DOT11R" label="dot11r" help="dot11rHelp" />
        <IotFastTransition />
        <Note id="dot11rBuggyNote" rich />
        <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
          <BoundSelect k="CHANNEL_2G" label="channel2g" options={channelOptions(CHANNELS_2G)} mono />
          <BoundSelect k="CHANNEL_5G" label="channel5g" options={channelOptions(CHANNELS_5G)} mono />
          <BoundSelect
            k="CHANNEL_5G_2"
            label="channel5g2"
            options={channelOptions(CHANNELS_5G_2)}
            mono
          />
          <BoundSelect k="CHANNEL_6G" label="channel6g" options={channelOptions(CHANNELS_6G)} mono />
        </div>
        <BoundSelect
          k="WIFI_LOG_LVL"
          label="wifiLogLevel"
          options={[
            { value: '', label: t('logLevelDefault') },
            { value: '1', label: t('logLevelDebug') },
            { value: '2', label: t('logLevelInfo') },
            { value: '3', label: t('logLevelNotice') },
            { value: '4', label: t('logLevelWarn') },
          ]}
          inline
        />
      </Disclosure>
    </SectionPage>
  );
}

function WifiSegment({ seg }: { seg: WifiSeg }) {
  const enableKey = seg.enable;
  const on = useConfigStore((s) => enableKey === null || s.raw[enableKey] === '1');
  if (!on) return null;

  return (
    <SegmentGroup segment={seg.id} title={t(seg.name)}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <BoundText k={seg.ssid} label="ssidField" placeholder={seg.defaultSsid} mono />
        <BoundText k={seg.passwd} label="wifiPassword" secret />
      </div>
    </SegmentGroup>
  );
}

/**
 * The regulatory domain. The country list is the same file banIP's country
 * blocking reads, so the interface pays for it once.
 */
function CountryField() {
  const [countries, setCountries] = useState<Country[]>([]);
  const value = useField('COUNTRY_CODE');
  const set = useConfigStore((s) => s.set);

  useEffect(() => {
    let live = true;
    void loadCountries().then((c) => {
      if (live) setCountries(c);
    });
    return () => {
      live = false;
    };
  }, []);

  const items = useMemo(
    () => countries.map((c) => `${c.code.toUpperCase()} - ${c.name}`),
    [countries],
  );
  const shown = useMemo(() => {
    const hit = countries.find((c) => c.code.toUpperCase() === value);
    return hit ? `${hit.code.toUpperCase()} - ${hit.name}` : value;
  }, [countries, value]);

  return (
    <Combobox
      id="COUNTRY_CODE"
      label={t('countryCode')}
      value={shown}
      items={items}
      placeholder={t('countryDefault')}
      loading={countries.length === 0}
      mono
      onChange={(picked) => set('COUNTRY_CODE', (picked.split(' - ')[0] ?? '').toUpperCase())}
    />
  );
}

function PskVlanNote() {
  const on = useField('PSK_VLAN');
  return on === '1' ? <Note id="wifiPskVlanNote" /> : null;
}

/** Client isolation is meaningless when one shared SSID is selected by password. */
function GuestIsolate() {
  const guest = useField('GUEST_ENABLE');
  const psk = useField('PSK_VLAN');
  if (guest !== '1' || psk === '1') return null;
  return (
    <SegmentMark segment="guest">
      <BoundToggle k="GUEST_ISOLATE" label="guestIsolate" help="guestIsolateHelp" />
    </SegmentMark>
  );
}

/** Dense-environment tuning only tightens usteer thresholds, which need 802.11k/v. */
function DenseEnv() {
  const kv = useField('DOT11KV');
  if (kv !== '1') return null;
  return <BoundToggle k="DENSE_ENV" label="denseEnvironment" help="tightenRoaming" richHelp />;
}

/**
 * Shown as the positive; the config key IOT_NO_DOT11R is the negative and the
 * derivation inverts it. Only meaningful while base 802.11r is on.
 */
function IotFastTransition() {
  const iot = useField('IOT_ENABLE');
  const dot11r = useField('DOT11R');
  if (iot !== '1' || dot11r !== '1') return null;
  return (
    <SegmentMark segment="iot">
      <BoundToggle k="IOT_DOT11R_UI" label="iotNoDot11r" help="iotNoDot11rHelp" />
    </SegmentMark>
  );
}

/** Withheld unless the board has the mt7915e driver WED needs (FR-023). */
function WedToggle() {
  const { target, version } = useDevice();
  if (!capsFor(target, version).wed) return null;
  return <BoundToggle k="WED_ENABLE" label="wedAccel" help="wedAccelHelp" />;
}

/** Only meaningful on a board that actually ships Candela ath10k firmware. */
function Ath10kToggle() {
  const { target, version } = useDevice();
  if (!capsFor(target, version).ath10kCt) return null;
  return <BoundToggle k="NON_CT_ATH10K" label="nonCtAth10k" help="replaceCandela" />;
}

function MeshGroup() {
  const mesh5 = useField('WIRELESS_MESH');
  const mesh2 = useField('WIRELESS_MESH_2G');
  const batman = useField('BATMAN_ADV');
  const meshOn = mesh5 === '1' || mesh2 === '1';
  const bothMesh = mesh5 === '1' && mesh2 === '1';

  return (
    <div className="mt-4 border-t border-rule pt-3">
      <h3 className="field-label">{t('meshSection')}</h3>
      <Note id="wiredBackhaulNote" />
      <BoundToggle k="WIRELESS_MESH" label="wirelessMesh" />
      <BoundToggle k="WIRELESS_MESH_2G" label="wirelessMesh2g" help="mesh2gNote" />
      {meshOn ? (
        <>
          <Note id="meshTrunkNote" />
          <div className="grid gap-x-4 sm:grid-cols-2">
            <BoundText
              k="MESH_ID"
              label="meshIdLabel"
              placeholder="mesh_trunk_backhaul"
              mono
              unvalidated
            />
            <BoundText k="MESH_PASSWD" label="wifiPassword" secret />
          </div>
          <BoundToggle k="BATMAN_ADV" label="batmanAdv" help="batmanAdvHelp" />
          {batman === '1' ? (
            <BoundToggle k="BATMAN_ALL_VLAN" label="batmanAllVlan" help="batmanAllVlanHelp" />
          ) : null}
          {/* Two meshpoints in one bridge can form an L2 loop, so with both radios
              meshing the derivation forces STP on and the control would be a lie. */}
          {bothMesh ? (
            <Note id="stpNote" />
          ) : (
            <BoundToggle k="BRIDGE_STP" label="bridgeStp" help="stpNote" richLabel />
          )}
        </>
      ) : null}
      <BoundToggle k="INDEX_SUFFIX" label="indexSuffix" help="indexSuffixHelp" />
      <BoundToggle k="AP_DISABLE" label="backhaulOnly" help="disableAllAps" />
    </div>
  );
}
