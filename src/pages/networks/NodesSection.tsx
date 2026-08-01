// The nodes in this network: what they are, and what is different about each.
//
// The list is the spine of the page. A row says everything a glance needs -- role,
// board, address, whether it has been built -- and opens onto the settings that
// belong to that node alone.

import type { FleetNode, Network } from '@core/types';
import { nodeLanAddress } from '@core/merge';
import { useConfigStore } from '@state/configStore';
import { useReleases } from '@state/deviceIndex';
import { buildOf, useFleetBuildStore } from '@state/fleetBuild';
import { isAp, isConfigured, useNetworksStore } from '@state/networksStore';
import { age } from '@ui/age';
import { SelectField } from '@ui/SelectField';
import { t } from '@i18n/index';
import { NodePanel } from './NodePanel';

export interface NodesSectionProps {
  net: Network;
  /** The node whose panel is open, if any. */
  openId: string | null;
  onToggle: (nodeId: string | null) => void;
}

export function NodesSection({ net, openId, onToggle }: NodesSectionProps) {
  const releases = useReleases();
  const version = useConfigStore((s) => s.version);
  const setVersion = useConfigStore((s) => s.setVersion);
  const asuUrl = useConfigStore((s) => s.asuUrl);

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-xl">{t('nodesTitle')}</h2>
      <p className="field-help mt-1">{t('eachNetworkHolds')}</p>

      <div className="mt-3">
        <SelectField
          id="shared-version"
          label={t('openWrtVersion')}
          help={t('defaultVersionForAll')}
          value={version}
          options={
            releases.versions.length
              ? releases.versions.map((v) => ({ value: v, label: v }))
              : [{ value: version, label: version || t('loading') }]
          }
          onChange={setVersion}
          inline
          mono
        />
      </div>

      <ul className="mt-3 divide-y divide-rule border-y border-rule">
        {net.nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 py-3 text-left"
              aria-expanded={openId === node.id}
              onClick={() => onToggle(openId === node.id ? null : node.id)}
            >
              <StateDot node={node} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{node.name}</span>
                <span className="field-help block truncate">{describe(net, node)}</span>
              </span>
              <span className="btn btn-quiet flex-none py-1">
                {isConfigured(node) ? t('config') : t('setup')}
              </span>
            </button>

            {openId === node.id ? (
              <div className="-mx-4 sm:-mx-5">
                <NodePanel net={net} node={node} asuUrl={asuUrl} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn-quiet mt-4"
        onClick={() => {
          const node = useNetworksStore.getState().addAp(net.id, (n) => t('apNum', { n }));
          if (node) onToggle(node.id);
        }}
      >
        {t('addApNode')}
      </button>
    </section>
  );
}

/** Built, ready to build, or still missing its hardware. */
function StateDot({ node }: { node: FleetNode }) {
  const phase = useFleetBuildStore((s) => buildOf(s.builds, node.id).phase);
  const colour =
    phase === 'error'
      ? 'bg-danger'
      : node.last_build || phase === 'done'
        ? 'bg-seg-iot'
        : isConfigured(node)
          ? 'bg-seg-lan'
          : 'bg-rule';
  return <span className={'size-2 flex-none rounded-full ' + colour} aria-hidden="true" />;
}

function describe(net: Network, node: FleetNode): string {
  return [
    isConfigured(node) ? node.device_target.title : t('noDeviceSelected'),
    isAp(node) ? t('apNum', { n: node.overrides.AP_INDEX || '2' }) : t('router'),
    nodeLanAddress(net, node),
    node.last_build ? t('builtAgo', { ago: age(node.last_build.ts) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
