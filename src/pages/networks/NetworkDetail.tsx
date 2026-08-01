// One network, in the same three-region chassis /builder uses.
//
// The rail and the centre edit the shared configuration -- the eight sections,
// reused as they are, writing to this network's store instead of the builder's --
// and the right region shows the fleet those settings will be built into.

import { useEffect, useState } from 'react';
import type { Network, SectionId } from '@core/types';
import { loadAsuServers } from '@core/asu';
import { ConfigScope } from '@state/ConfigScope';
import { useReleases } from '@state/deviceIndex';
import { routerNode } from '@state/networksStore';
import { sharedScope } from '@state/sharedScope';
import { AppShell, type ShellSection } from '@ui/AppShell';
import { SectionFlag } from '@ui/SectionFlag';
import { Access } from '@sections/Access';
import { Advanced } from '@sections/Advanced';
import { Filtering } from '@sections/Filtering';
import { Internet } from '@sections/Internet';
import { Networks } from '@sections/Networks';
import { Security } from '@sections/Security';
import { Wifi } from '@sections/Wifi';
import { t, type MessageId } from '@i18n/index';
import { FleetPanel } from './FleetPanel';
import { NodesSection } from './NodesSection';

/** The fleet's own first item, then the shared configuration in builder order. */
type FleetSection = SectionId | 'nodes';

const SECTIONS: ReadonlyArray<{ id: FleetSection; label: MessageId }> = [
  { id: 'nodes', label: 'nodesTitle' },
  { id: 'access', label: 'system' },
  { id: 'networks', label: 'networkSection' },
  { id: 'wifi', label: 'wifi' },
  { id: 'internet', label: 'wan' },
  { id: 'filtering', label: 'encryptedDns' },
  { id: 'security', label: 'sectionSecurity' },
  { id: 'advanced', label: 'advancedOptions' },
];

export interface NetworkDetailProps {
  net: Network;
  onBack: () => void;
}

export function NetworkDetail({ net, onBack }: NetworkDetailProps) {
  const store = sharedScope(net);
  const [active, setActive] = useState<FleetSection>('nodes');
  const [openNode, setOpenNode] = useState<string | null>(null);
  const releases = useReleases();

  // The board the shared configuration is gated against is the router's: it is
  // the node that terminates everything the shared settings describe. Per-node
  // hardware options live in the node's own panel.
  const router = routerNode(net);
  const routerTarget = router && router.device_target.profile ? router.device_target : null;

  useEffect(() => {
    store.setState({ target: routerTarget, versions: releases.versions });
    if (!store.getState().version && releases.stable) store.getState().setVersion(releases.stable);
  }, [store, routerTarget, releases]);

  // The build server every node in this network is POSTed to (Constitution III).
  useEffect(() => {
    let live = true;
    void loadAsuServers().then((list) => {
      const first = list[0];
      if (live && first) store.getState().setAsuUrl(first.url);
    });
    return () => {
      live = false;
    };
  }, [store]);

  const sections: ShellSection[] = SECTIONS.map((s) => ({
    id: s.id,
    label: t(s.label),
    badge: s.id === 'nodes' ? null : <SectionFlag id={s.id} />,
  }));

  return (
    <ConfigScope store={store}>
      <AppShell
        title={net.name}
        subtitle={net.name}
        headerExtra={
          <button type="button" className="btn btn-quiet" onClick={onBack}>
            {t('backToNetworks')}
          </button>
        }
        sections={sections}
        active={active}
        onSelect={(id) => setActive(id as FleetSection)}
        panel={<FleetPanel net={net} onOpen={(id) => {
          setActive('nodes');
          setOpenNode(id);
        }} />}
        panelTitle={t('nodesTitle')}
        panelSummary={<FleetSummary net={net} />}
      >
        {active === 'nodes' ? (
          <NodesSection net={net} openId={openNode} onToggle={setOpenNode} />
        ) : (
          <p className="field-help mb-3">{t('sharedConfigDesc')}</p>
        )}
        {active === 'access' ? <Access /> : null}
        {active === 'networks' ? <Networks /> : null}
        {active === 'wifi' ? <Wifi /> : null}
        {active === 'internet' ? <Internet /> : null}
        {active === 'filtering' ? <Filtering /> : null}
        {active === 'security' ? <Security /> : null}
        {active === 'advanced' ? <Advanced /> : null}
      </AppShell>
    </ConfigScope>
  );
}

function FleetSummary({ net }: { net: Network }) {
  const total = net.nodes.length;
  const built = net.nodes.filter((n) => n.last_build).length;
  return (
    <span className="block truncate">
      <span className="text-ink">{t(total === 1 ? 'nodeCount' : 'nodesCount', { n: total })}</span>{' '}
      <span className="text-ink-soft">{t('builtCount', { n: built })}</span>
    </span>
  );
}
