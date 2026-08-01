// The provider that decides which configuration the sections below it edit.
//
// /builder mounts none of these and everything resolves to the builder's own
// store. /networks mounts one around the shared-configuration editor, and one
// around each node's read-only plan and config preview -- so the same eight
// sections, the same plan panel and the same masked config disclosure serve both
// pages without a second copy of any of them.

import type { ReactNode } from 'react';
import { ConfigScopeContext, type ConfigStore } from './configStore';

export function ConfigScope({ store, children }: { store: ConfigStore; children: ReactNode }) {
  return <ConfigScopeContext.Provider value={store}>{children}</ConfigScopeContext.Provider>;
}
