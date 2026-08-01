// The fleet, as the right-hand region.
//
// /builder puts one network plan here. A fleet puts one card per node: its board,
// the address it will answer on, the lanes it will carry, and where its build got
// to. The build action is for the whole fleet, and every node also carries its own
// -- because the reason to open this page is that a house has more than one router
// in it, and rebuilding all four to change one is not a workflow.

import type { FleetNode, Network } from '@core/types';
import { nodeLanAddress } from '@core/merge';
import { useConfigStore } from '@state/configStore';
import { nodePlan } from '@state/fleet';
import { buildOf, useFleetBuildStore } from '@state/fleetBuild';
import { isAp, isConfigured } from '@state/networksStore';
import { SEGMENT_NAME } from '@ui/PlanPanel';
import { SEGMENT_VAR } from '@ui/SegmentGroup';
import { t } from '@i18n/index';

export interface FleetPanelProps {
  net: Network;
  /** Bring a node's own settings forward in the centre region. */
  onOpen: (nodeId: string) => void;
}

export function FleetPanel({ net, onOpen }: FleetPanelProps) {
  const asuUrl = useConfigStore((s) => s.asuUrl);
  const ready = net.nodes.filter(isConfigured);
  const running = useFleetBuildStore((s) =>
    net.nodes.some((n) => buildOf(s.builds, n.id).phase === 'running'),
  );

  return (
    <div className="space-y-3">
      <section className="card p-3">
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={ready.length === 0 || running}
          onClick={() => void useFleetBuildStore.getState().buildAll(net.id, asuUrl)}
        >
          {running ? t('building') : t('buildAllNodes')}
        </button>
        <p className="field-help mt-1.5">
          {ready.length === 0 ? t('noDevicesSelected') : t('buildsInParallel')}
        </p>
      </section>

      <ul className="space-y-3">
        {net.nodes.map((node) => (
          <NodeCard key={node.id} net={net} node={node} asuUrl={asuUrl} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

function NodeCard({
  net,
  node,
  asuUrl,
  onOpen,
}: {
  net: Network;
  node: FleetNode;
  asuUrl: string;
  onOpen: (nodeId: string) => void;
}) {
  const build = useFleetBuildStore((s) => buildOf(s.builds, node.id));
  const plan = nodePlan(net, node);
  const configured = isConfigured(node);

  return (
    <li className="card p-3">
      <button type="button" className="block w-full text-left" onClick={() => onOpen(node.id)}>
        <p className="field-help">{isAp(node) ? t('accessPoint') : t('mainRouter')}</p>
        <p className="font-display truncate text-base font-semibold">{node.name}</p>
        <p className="field-help truncate">
          {configured ? node.device_target.title : t('noDeviceSelected')}
        </p>
        <p className="field-help mono mt-0.5">{nodeLanAddress(net, node)}</p>
      </button>

      {/* The lanes this node carries, in cable-pair order. Colour is never the
          only signal: each one carries its name and its VLAN id. */}
      <ul className="mt-2 flex flex-wrap gap-1">
        {plan.lanes
          .filter((lane) => lane.enabled)
          .map((lane) => (
            <li
              key={lane.id}
              className="chip border-l-[3px]"
              style={{ ['--seg' as string]: SEGMENT_VAR[lane.id], borderLeftColor: 'var(--seg)' }}
            >
              <span className="text-[var(--seg)]">{t(SEGMENT_NAME[lane.id])}</span>
              {lane.vlanId}
            </li>
          ))}
      </ul>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="btn btn-quiet py-1"
          disabled={!configured || build.phase === 'running'}
          onClick={() => void useFleetBuildStore.getState().buildNode(net.id, node.id, asuUrl)}
        >
          {build.phase === 'running' ? t('building') : t('build')}
        </button>
        {!configured ? <span className="field-help">{t('selectDeviceFirst')}</span> : null}
      </div>

      <NodeBuildState nodeId={node.id} />
    </li>
  );
}

/**
 * One node's build, and nothing else's. A failure here is reported here and stops
 * nothing: the other nodes keep going (FR-041, SC-006).
 */
export function NodeBuildState({ nodeId }: { nodeId: string }) {
  const build = useFleetBuildStore((s) => buildOf(s.builds, nodeId));
  if (build.phase === 'idle') return null;

  return (
    <div className="mt-2">
      {build.phase === 'running' ? (
        <>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-valuenow={build.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={build.message}
          >
            <div
              className="h-full bg-seg-lan transition-all"
              style={{ width: build.percent + '%' }}
            />
          </div>
          <p className="field-help mt-1">{build.message}</p>
        </>
      ) : null}

      {build.note ? (
        <p className="note mt-1.5" role="status">
          {build.note}
        </p>
      ) : null}

      {build.error ? (
        <p className="note note-danger mt-1.5 whitespace-pre-wrap" role="alert">
          {build.error}
        </p>
      ) : null}

      {build.images.length ? (
        <ul className="mt-1.5 space-y-1">
          {build.images.map((im) => (
            <li key={im.name}>
              {im.url ? (
                <a href={im.url} className="mono text-xs font-semibold text-seg-lan underline">
                  {im.type}
                </a>
              ) : (
                <span className="mono text-xs font-semibold">{im.type}</span>
              )}
              <p className="field-help mono break-all">{im.name}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
