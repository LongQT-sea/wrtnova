// /networks: the fleet builder.
//
// Two views. The list, which is where you land and which has to make a saved
// network recognisable; and one network, which is the same three-region chassis
// /builder uses -- rail and centre editing the shared configuration, right region
// showing the nodes it will be built into.

import { useEffect, useState } from 'react';
import { useNetworksStore } from '@state/networksStore';
import { PageBar } from '@ui/AppShell';
import { useLocaleTick } from '@ui/useLocale';
import { t } from '@i18n/index';
import { NetworkDetail } from './NetworkDetail';
import { NetworkList } from './NetworkList';

export function App() {
  // A locale landing has to invalidate the whole tree, so the subscription lives
  // here rather than in the shell: only a re-render of THIS component produces
  // fresh child elements, and without them React skips the subtree.
  useLocaleTick();
  const networks = useNetworksStore((s) => s.networks);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => useNetworksStore.getState().load(), []);

  const open = networks.find((n) => n.id === openId) ?? null;

  if (open) return <NetworkDetail net={open} onBack={() => setOpenId(null)} />;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-rule bg-surface/95 backdrop-blur">
        <PageBar
          title={t('networks')}
          subtitle={t('networks')}
          headerExtra={
            <a href="/builder/" className="btn btn-quiet no-underline">
              {t('singleBuilderLink')}
            </a>
          }
        />
      </header>
      <NetworkList onOpen={setOpenId} />
    </div>
  );
}
