// One node's own settings, on top of the network's.
//
// Everything here is device-specific: which board it is, which release it builds
// at, what it is called, and the handful of options that depend on the silicon in
// front of you rather than on how the house is wired. Everything else -- all 110
// fields of it -- comes from the shared configuration, which is the whole point of
// managing a fleet in one place.

import { useMemo, useState } from 'react';
import type { Flag, FleetNode, Network, RawConfig } from '@core/types';
import { nodeLanAddress } from '@core/merge';
import { validateField } from '@core/validate';
import {
  hasAth10kCt,
  hasWireless,
  isWedCapable,
  loadDeviceTarget,
  searchTitles,
} from '@core/openwrt';
import { capsFor, clearUnsupported, dnsDefaultFor } from '@state/capabilities';
import { createConfigStore, type ConfigStore } from '@state/configStore';
import { ConfigScope } from '@state/ConfigScope';
import { useDeviceIndex, useReleases } from '@state/deviceIndex';
import { nodeRawCached } from '@state/fleet';
import { useFleetBuildStore } from '@state/fleetBuild';
import { isAp, nodeVersion, useNetworksStore } from '@state/networksStore';
import { messageFor } from '@state/validation';
import { peekSharedScope } from '@state/sharedScope';
import { ConfigDisclosure } from '@ui/ConfigDisclosure';
import { ConfirmDialog } from '@ui/ConfirmDialog';
import { Combobox } from '@ui/Combobox';
import { PlanPanel } from '@ui/PlanPanel';
import { SelectField } from '@ui/SelectField';
import { TextField } from '@ui/TextField';
import { Toggle } from '@ui/Toggle';
import { t } from '@i18n/index';
import { useSyncedStore } from './useSyncedStore';

export interface NodePanelProps {
  net: Network;
  node: FleetNode;
  asuUrl: string;
}

export function NodePanel({ net, node, asuUrl }: NodePanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const store = useNetworksStore.getState();
  const ap = isAp(node);
  const board = node.device_target;
  const configured = board.profile !== '';

  const setOverride = <K extends keyof RawConfig>(key: K, value: RawConfig[K]): void =>
    useNetworksStore.getState().patchOverrides(net.id, node.id, { [key]: value });

  const flag = (key: keyof RawConfig, label: string, help?: string) => (
    <Toggle
      id={`${node.id}-${String(key)}`}
      label={label}
      {...(help === undefined ? {} : { help })}
      value={(node.overrides[key] as Flag) ?? ''}
      onChange={(v) => setOverride(key, v as RawConfig[typeof key])}
    />
  );

  return (
    <div className="border-t border-rule bg-sunken px-3 py-4 sm:px-4">
      <p className="field-help">{t('deviceSpecificNote')}</p>

      <div className="mt-3 space-y-1">
        <NodeRelease net={net} node={node} />
        <NodeDevice net={net} node={node} />

        <TextField
          id={`${node.id}-name`}
          label={t('nodeName')}
          value={node.name}
          onChange={(v) => store.patchNode(net.id, node.id, { name: v })}
        />

        {ap ? (
          <>
            <TextField
              id={`${node.id}-host`}
              label={t('hostname')}
              value={node.overrides.HOST_NAME ?? ''}
              onChange={(v) => setOverride('HOST_NAME', v)}
              placeholder={'WrtNova-' + (node.overrides.AP_INDEX || '2')}
              mono
            />
            {/* The validator is the core rule, so the message this field shows
                is the one the build refuses on. */}
            <TextField
              id={`${node.id}-apidx`}
              label={t('apIndex')}
              help={t('apIndexHelp') + nodeLanAddress(net, node)}
              value={node.overrides.AP_INDEX ?? '2'}
              onChange={(v) => setOverride('AP_INDEX', v.replace(/\D/g, '').slice(0, 3))}
              validate={(v) => {
                const issue = validateField('AP_INDEX', v, {});
                return issue ? messageFor(issue) : null;
              }}
              inputMode="numeric"
              mono
              inline
            />
          </>
        ) : null}

        {configured && hasWireless(board) ? (
          <>
            {flag('WIRELESS_MESH', t('wirelessMesh'), t('wiredBackhaulNote'))}
            {/* Only where the network opted into a 2.4 GHz backhaul at all. */}
            {net.shared_config.WIRELESS_MESH_2G === '1'
              ? flag('WIRELESS_MESH_2G', t('wirelessMesh2g'), t('mesh2gNote'))
              : null}
            {flag('AP_DISABLE', t('backhaulOnly'), t('disableAllAps'))}
          </>
        ) : null}

        {configured && hasAth10kCt(board) ? flag('NON_CT_ATH10K', t('nonCtAth10k')) : null}
        {configured && isWedCapable(board) ? flag('WED_ENABLE', t('wedAccel'), t('wedAccelHelp')) : null}
        {configured ? flag('IRQBALANCE', t('irqbalance'), t('useIrqbalance')) : null}

        <TextField
          id={`${node.id}-pkgs`}
          label={t('additionalPackages')}
          help={t('extraPackagesHelp')}
          value={node.overrides.additional_packages ?? ''}
          onChange={(v) => setOverride('additional_packages', v)}
          placeholder={t('packagesSeparatorPh')}
          mono
          multiline
          rows={2}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!configured}
          onClick={() => void useFleetBuildStore.getState().buildNode(net.id, node.id, asuUrl)}
        >
          {configured ? t('buildFirmware') : t('selectDeviceFirst')}
        </button>
        {ap ? (
          <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            {t('deleteNode')}
          </button>
        ) : null}
      </div>

      {/* The node's plan and the config it will actually be built with, in the
          node's own scope -- the same panel and the same masked disclosure
          /builder shows, reading the merged configuration (FR-040). */}
      <NodeInspection net={net} node={node} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteNodeTitle')}
        body={node.name}
        onConfirm={() => useNetworksStore.getState().removeNode(net.id, node.id)}
      />
    </div>
  );
}

/** The release this node builds at: the network's, or one it pinned for itself. */
function NodeRelease({ net, node }: { net: Network; node: FleetNode }) {
  const releases = useReleases();
  const shared = net.shared_config.shared_version ?? '';
  const options = [
    { value: '', label: shared ? t('defaultVersion', { v: shared }) : t('defaultVersion', { v: '—' }) },
    ...releases.versions.map((v) => ({ value: v, label: v })),
  ];

  return (
    <SelectField
      id={`${node.id}-release`}
      label={t('openWrtVersion')}
      value={node.version ?? ''}
      options={options}
      onChange={(v) => useNetworksStore.getState().patchNode(net.id, node.id, { version: v })}
      inline
      mono
    />
  );
}

/** The board. Picking one resolves its package lists at the node's release. */
function NodeDevice({ net, node }: { net: Network; node: FleetNode }) {
  const releases = useReleases();
  const version = nodeVersion(net, node) || releases.stable;
  const { index, error } = useDeviceIndex(version, releases.versions);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const titles = index ? Object.keys(index) : [];

  const pick = async (title: string) => {
    const profile = index?.[title];
    if (!profile) return;
    setBusy(true);
    setPickError(null);
    try {
      const resolved = await loadDeviceTarget(version, profile, title);
      useNetworksStore.getState().patchNode(net.id, node.id, { device_target: resolved });

      // The shared configuration is gated against the router's board, so choosing
      // it re-runs the same two gates /builder runs (FR-022, FR-023). An access
      // point's hardware decides nothing shared.
      const scope = isAp(node) ? undefined : peekSharedScope(net.id);
      if (scope) {
        const state = scope.getState();
        const patch = {
          ...(state.dnsModeTouched ? {} : dnsDefaultFor(resolved)),
          ...clearUnsupported(state.raw, capsFor(resolved, version)),
        };
        if (Object.keys(patch).length) state.patch(patch);
      }
    } catch (e) {
      setPickError(t('errorDeviceDetails', { msg: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Combobox
        id={`${node.id}-device`}
        label={t('device')}
        help={t('deviceRequirement')}
        value={node.device_target.title}
        items={titles}
        search={(q) => (q ? searchTitles(index, q) : titles)}
        placeholder={t('deviceSearchPlaceholder')}
        emptyLabel={index ? t('noDevicesFound') : t('loadingDevices')}
        loading={index === null || busy}
        onChange={(title) => void pick(title)}
      />
      {pickError ?? error ? (
        <p className="field-error" role="alert">
          {pickError ?? error}
        </p>
      ) : null}
    </>
  );
}

/**
 * A read-only scope holding the node's merged configuration, so the plan panel and
 * the config disclosure -- both of which read the store rather than props -- can be
 * reused for a node without either of them learning what a fleet is.
 */
function NodeInspection({ net, node }: { net: Network; node: FleetNode }) {
  const raw = nodeRawCached(net, node);
  const target = node.device_target.profile ? node.device_target : null;
  const version = nodeVersion(net, node);

  // One store per node, seeded at creation so the first paint is already the
  // node's own plan rather than an empty one; useSyncedStore keeps it current
  // from there. Deliberately not keyed on `raw`: the store outlives each merge.
  const store: ConfigStore = useMemo(() => {
    const s = createConfigStore();
    s.setState({ raw, target, version });
    return s;
  }, [node.id]);

  useSyncedStore(store, { raw, target, version });

  return (
    <div className="mt-4">
      <ConfigScope store={store}>
        <PlanPanel />
        <ConfigDisclosure />
      </ConfigScope>
    </div>
  );
}
