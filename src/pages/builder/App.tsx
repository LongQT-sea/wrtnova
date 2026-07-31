// /builder: the single-node builder.
//
// The device question comes first and gates everything else. After that the eight
// sections are directly addressable from the rail -- not a wizard, because a
// returning user changing one setting should not walk a sequence.
//
// This component deliberately does NOT subscribe to the configuration. It
// subscribes to the selected device and to its own active-section state, both of
// which change rarely, so a keystroke in a field re-renders that field and the
// panels that asked for it -- not the whole page.

import { useState } from 'react';
import type { SectionId } from '@core/types';
import { useConfigStore } from '@state/configStore';
import { flaggedSections } from '@state/validation';
import { AppShell, type ShellSection } from '@ui/AppShell';
import { useLocaleTick } from '@ui/useLocale';
import { Access } from '@sections/Access';
import { Advanced } from '@sections/Advanced';
import { Filtering } from '@sections/Filtering';
import { Internet } from '@sections/Internet';
import { Networks } from '@sections/Networks';
import { Security } from '@sections/Security';
import { Wifi } from '@sections/Wifi';
import { t, type MessageId } from '@i18n/index';
import { BuildAction } from './BuildAction';
import { DeviceStep } from './DeviceStep';
import { PackagePanel } from './PackagePanel';

/** The order a first-timer would answer them in. */
const SECTIONS: ReadonlyArray<{ id: SectionId; label: MessageId }> = [
  { id: 'device', label: 'firmwareTarget' },
  { id: 'access', label: 'system' },
  { id: 'networks', label: 'networkSection' },
  { id: 'wifi', label: 'wifi' },
  { id: 'internet', label: 'wan' },
  { id: 'filtering', label: 'encryptedDns' },
  { id: 'security', label: 'sectionSecurity' },
  { id: 'advanced', label: 'advancedOptions' },
];

export function App() {
  // A locale landing has to invalidate the whole tree, so the subscription lives
  // here rather than in the shell: only a re-render of THIS component produces
  // fresh child elements, and without them React skips the subtree.
  useLocaleTick();
  const [active, setActive] = useState<SectionId>('device');
  const target = useConfigStore((s) => s.target);

  const sections: ShellSection[] = SECTIONS.map((s) => ({
    id: s.id,
    label: t(s.label),
    badge: <SectionFlag id={s.id} />,
  }));

  return (
    <AppShell
      title={t('firmwareBuilderSubtitle')}
      subtitle={t('firmwareBuilderSubtitle')}
      sections={sections}
      active={active}
      onSelect={(id) => setActive(id as SectionId)}
      panel={
        <>
          <BuildAction onNavigate={(id) => setActive(id as SectionId)} />
          <PackagePanel />
        </>
      }
      panelTitle={t('buildFirmware')}
      panelSummary={<DeviceSummary />}
    >
      {/* Until hardware is chosen there is nothing else worth showing: the
          release decides which options exist and the board decides which of them
          it can honour. */}
      {target === null || active === 'device' ? <DeviceStep /> : null}
      {target === null ? null : (
        <>
          {active === 'access' ? <Access /> : null}
          {active === 'networks' ? <Networks /> : null}
          {active === 'wifi' ? <Wifi /> : null}
          {active === 'internet' ? <Internet /> : null}
          {active === 'filtering' ? <Filtering /> : null}
          {active === 'security' ? <Security /> : null}
          {active === 'advanced' ? <Advanced /> : null}
        </>
      )}
    </AppShell>
  );
}

/** Owns its own subscription, so the rail can be live without the shell being. */
function SectionFlag({ id }: { id: SectionId }) {
  const flagged = useConfigStore((s) => flaggedSections(s.raw).has(id));
  if (!flagged) return null;
  return (
    <span
      className="size-1.5 flex-none rounded-full bg-danger"
      role="img"
      aria-label={t('fixBeforeBuild')}
    />
  );
}

function DeviceSummary() {
  const target = useConfigStore((s) => s.target);
  return (
    <span className="mono block truncate text-ink-soft">
      {target ? target.title : t('pickDeviceHint')}
    </span>
  );
}
