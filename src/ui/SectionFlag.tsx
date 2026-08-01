// The dot on a rail item holding something that would refuse a build.
//
// It owns its own subscription so the shell can stay still while the form moves,
// and it reads the same sweep() the build runs -- the dots cannot disagree with
// the refusal.

import type { SectionId } from '@core/types';
import { useConfigStore } from '@state/configStore';
import { flaggedSections } from '@state/validation';
import { t } from '@i18n/index';

export function SectionFlag({ id }: { id: SectionId }) {
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
