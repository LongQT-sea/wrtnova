// Keep a derived configuration store in step with what it is derived from.
//
// The plan panel and the config disclosure read a store, not props. A fleet node
// has no store of its own -- it is the shared config with overrides layered on --
// so the page makes one and pushes the merged result into it whenever either half
// moves. The write happens in an effect rather than during render, so nothing that
// is already subscribed can be torn by it.

import { useEffect } from 'react';
import type { ConfigState, ConfigStore } from '@state/configStore';

export function useSyncedStore(store: ConfigStore, state: Partial<ConfigState>): void {
  const { raw, target, version } = state;
  useEffect(() => {
    store.setState({
      ...(raw === undefined ? {} : { raw }),
      ...(target === undefined ? {} : { target }),
      ...(version === undefined ? {} : { version }),
    });
  }, [store, raw, target, version]);
}
