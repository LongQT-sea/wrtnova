// The four LAN-side networks, their addressing, and the switch behaviour around
// them.
//
// Each segment is a tinted, hairline-edged group in its cable-pair colour, so a
// field here and a lane in the plan panel are visibly the same object. A disabled
// segment stays on screen, greyed, because a first-timer needs to see what they
// are not getting as much as what they are.

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import type { SegmentId } from '@core/types';
import {
  useConfigStore,
  useDevice,
  useField,
  useFieldState,
  useIfacePlan,
  useVlanPlan,
} from '@state/configStore';
import { capsFor } from '@state/capabilities';
import { useIfaceConflict } from '@state/validation';
import { SegmentGroup, SegmentToggle } from '@ui/SegmentGroup';
import { Toggle } from '@ui/Toggle';
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

const SUBNET_OPTIONS = [
  { value: '', label: '/24' },
  { value: '/23', label: '/23' },
  { value: '/22', label: '/22' },
] as const;

interface SegFields {
  id: SegmentId;
  /** The row key the VLAN and interface allocators use. */
  row: string;
  name: 'segLan' | 'segGuest' | 'segIot' | 'segVpn';
  enable: FlagKey | null;
  prefix: TextKey;
  iface: TextKey;
  vlan: TextKey;
  subnet: TextKey;
  defaultIface: string;
}

const SEGMENTS: readonly SegFields[] = [
  {
    id: 'lan',
    row: 'lan',
    name: 'segLan',
    enable: null,
    prefix: 'LAN_BASE_PREFIX',
    iface: 'LAN_IFACE',
    vlan: 'LAN_VLAN_ID',
    subnet: 'LAN_SUBNET',
    defaultIface: 'lan',
  },
  {
    id: 'guest',
    row: 'guest',
    name: 'segGuest',
    enable: 'GUEST_ENABLE',
    prefix: 'GUEST_BASE_PREFIX',
    iface: 'GUEST_IFACE',
    vlan: 'GUEST_VLAN_ID',
    subnet: 'GUEST_SUBNET',
    defaultIface: 'guest',
  },
  {
    id: 'iot',
    row: 'iot',
    name: 'segIot',
    enable: 'IOT_ENABLE',
    prefix: 'IOT_BASE_PREFIX',
    iface: 'IOT_IFACE',
    vlan: 'IOT_VLAN_ID',
    subnet: 'IOT_SUBNET',
    defaultIface: 'iot',
  },
  {
    id: 'vpn',
    row: 'vpn',
    name: 'segVpn',
    enable: 'WG_ENABLE',
    prefix: 'LAN_VPN_BASE_PREFIX',
    iface: 'LAN_VPN_IFACE',
    vlan: 'LAN_VPN_VLAN_ID',
    subnet: 'LAN_VPN_SUBNET',
    defaultIface: 'lan_vpn',
  },
];

export function Networks() {
  const apMode = useField('AP_MODE');

  return (
    <SectionPage title="networksAddressing">
      <BoundText
        k="BASE_NET_PREFIX"
        label="defaultIpPrefix"
        placeholder="192.168"
        mono
        inline
      />
      <BoundSelect
        k="DEFAULT_SUBNET"
        label="defaultSubnet"
        options={SUBNET_OPTIONS}
        inline
        mono
      />

      {apMode === '1' ? <Note id="apModeNetworkNote" /> : null}

      {SEGMENTS.map((seg) => (
        <Segment key={seg.id} seg={seg} />
      ))}

      <ConflictNotices />

      <Disclosure title="advancedNetwork">
        <BoundText
          k="ADDITIONAL_VLAN_LIST"
          label="additionalTrunkVlans"
          help="additionalTrunkHelp"
          placeholder="30 40-42"
          mono
          unvalidated
        />
        <TaggedLanGuard />
        <PacketSteering />
        <BoundText
          k="ULA_PREFIX"
          label="ulaPrefix"
          help="ulaPrefixHelp"
          placeholder="fdXX:XXXX:XXXX::/48"
          mono
          unvalidated
        />
      </Disclosure>
    </SectionPage>
  );
}

function Segment({ seg }: { seg: SegFields }) {
  const enableKey = seg.enable;
  const on = useConfigStore((s) => enableKey === null || s.raw[enableKey] === '1');
  const vlan = useVlanPlan();
  const assignment = vlan.byKey[seg.row];
  // Subscribed for its side effect on rendering: a name becoming a duplicate
  // because the *sibling* field changed has to re-evaluate this group too.
  void useIfaceConflict(seg.row);

  const prefix = useField(seg.prefix);
  const basePrefix = useField('BASE_NET_PREFIX');
  const effectivePrefix = prefix || basePrefix || '192.168';
  const vid = assignment?.vid ?? assignment?.def ?? 1;

  return (
    <SegmentGroup
      segment={seg.id}
      title={t(seg.name)}
      muted={!on}
      {...(seg.enable
        ? { control: <BoundSegmentToggle k={seg.enable} name={t(seg.name)} /> }
        : {})}
      aside={
        <span className="mono flex items-center gap-2 text-xs text-ink-soft">
          <span>
            {t('routerIpLabel')} {effectivePrefix}.{vid}.1
          </span>
          <span className="chip">vlan {vid}</span>
        </span>
      }
      {...(seg.id === 'vpn' ? { help: t('wgNetworkDesc') } : {})}
    >
      {on ? (
        <div className="grid gap-x-4 sm:grid-cols-2">
          <BoundText
            k={seg.prefix}
            label="tableIpPrefix"
            placeholder={basePrefix || '192.168'}
            mono
          />
          <BoundText
            k={seg.iface}
            label="tableIface"
            placeholder={seg.defaultIface}
            mono
          />
          <BoundText k={seg.vlan} label="tableVlanId" placeholder={String(vid)} mono />
          <BoundSelect k={seg.subnet} label="tableSubnet" options={SUBNET_OPTIONS} mono />
        </div>
      ) : null}

      {seg.id === 'iot' && on ? <IotExtras /> : null}
    </SegmentGroup>
  );
}

/** Bound to a segment's enable key, for the group header. */
function BoundSegmentToggle({ k, name }: { k: FlagKey; name: string }) {
  const [value, set] = useFieldState(k);
  return <SegmentToggle id={k} name={name} value={value} onChange={set} />;
}

function IotExtras() {
  const apMode = useField('AP_MODE');
  const wg = useField('WG_ENABLE');
  if (apMode === '1') return null;
  return (
    <>
      <BoundToggle k="IOT_INTERNET" label="enableIotInternet" />
      {wg === '1' ? <BoundToggle k="IOT_ROUTE_VIA_WG" label="iotRouteViaWg" /> : null}
    </>
  );
}

/**
 * The group-level warnings. An auto-reassignment is normal operation and is
 * surfaced as the badge above; only a genuinely unresolvable collision is worth a
 * warning, because only that blocks a build (FR-013).
 */
function ConflictNotices() {
  const vlan = useVlanPlan();
  const iface = useIfacePlan();

  const vlanBad =
    vlan.conflict.anchorCollision || vlan.conflict.trunkCollision || vlan.conflict.exhausted;
  const ifaceBad =
    iface.conflict.anchorCollision || iface.conflict.reservedCollision || iface.conflict.exhausted;

  return (
    <>
      {vlanBad ? <Note id="vlanDupWarn" danger /> : null}
      {ifaceBad ? <Note id="ifaceDupWarn" danger /> : null}
    </>
  );
}

/**
 * Tagging the LAN VLAN turns every LAN port into a trunk-only port, which locks
 * out anything that does not speak VLANs -- including, often, the computer the user
 * is holding. It is the one setting that gets a confirmation gate.
 */
function TaggedLanGuard() {
  const [value, set] = useFieldState('TAGGED_LAN_VLAN');
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);

  return (
    <>
      <Toggle
        id="TAGGED_LAN_VLAN"
        label={t('tagLanVlan')}
        help={t('tagLanVlanHelp')}
        value={value}
        onChange={(next) => {
          if (next === '1') {
            setArmed(false);
            setOpen(true);
          } else {
            set('');
          }
        }}
      />

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="card fixed top-1/2 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 p-4">
            <Dialog.Title className="text-lg">{t('tagLanVlanTitle')}</Dialog.Title>
            <Dialog.Description asChild>
              <p
                className="field-help mt-2"
                dangerouslySetInnerHTML={{ __html: t('tagLanVlanBody') }}
              />
            </Dialog.Description>
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                checked={armed}
                onChange={(e) => setArmed(e.target.checked)}
                className="mt-0.5"
              />
              <span className="field-label cursor-pointer">{t('tagLanVlanConfirm')}</span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close className="btn btn-quiet">{t('cancel')}</Dialog.Close>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!armed}
                onClick={() => {
                  set('1');
                  setOpen(false);
                }}
              >
                {t('tagLanVlanEnable')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/** "All CPUs" (P_STEERING=2) needs OpenWrt 24 or newer (FR-023). */
function PacketSteering() {
  const { target, version } = useDevice();
  const caps = capsFor(target, version);
  const options = [
    { value: '', label: t('packetSteeringDefault') },
    { value: '1', label: t('packetSteeringOn') },
    ...(caps.steeringAllCpus ? [{ value: '2', label: t('packetSteeringAll') }] : []),
  ];
  return (
    <BoundSelect
      k="P_STEERING"
      label="packetSteering"
      help="packetSteeringHelp"
      options={options}
      inline
    />
  );
}
