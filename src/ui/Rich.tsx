// A few catalogue strings carry inline markup -- <code>br-vlan</code>,
// <strong>sysupgrade</strong> -- because the emphasis is part of the sentence and
// splitting it into fragments per locale would make the catalogues unmaintainable.
//
// The only input is our own message catalogue, which is TypeScript source, not
// user or network data. No user-supplied string is ever routed through here.

import type { MessageId } from '@i18n/index';
import { t } from '@i18n/index';

export function Rich({
  id,
  vars,
  className,
}: {
  id: MessageId;
  vars?: Record<string, string | number>;
  className?: string;
}) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: t(id, vars) }} />;
}
