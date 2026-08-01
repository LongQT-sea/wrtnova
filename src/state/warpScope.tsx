// Where a prefilled tunnel identity is remembered.
//
// The prefill button is one component mounted inside the Security section, which
// is itself mounted in two places: /builder, editing the builder's store, and
// /networks, editing a network's shared configuration. The FIELDS follow the
// config scope already (state/configStore.ts), and the refresh token has to
// follow the same boundary -- a network that registered a tunnel must come back
// to that tunnel and not to the last one the single-node builder made.
//
// So the token gets a scope of its own, resolved exactly the way the config
// store is: the default is the browser's, and /networks provides the network's.
// The localStorage key is `wrtnova_warp_refresh` in both cases (Constitution VI);
// the network additionally keeps its own copy on the saved network.

import { createContext, useContext, type ReactNode } from 'react';
import { readWarpToken, writeWarpToken } from '@core/storage';
import { useNetworksStore } from './networksStore';

/** Reading and writing the token for whichever configuration is being edited. */
export interface WarpIdentity {
  read: () => string;
  write: (token: string) => void;
}

/** The single-node builder's: the browser's own, which a build also records. */
const browserIdentity: WarpIdentity = {
  read: readWarpToken,
  write: writeWarpToken,
};

const byNetwork = new Map<string, WarpIdentity>();

/**
 * A network's, kept stable per id so a re-render does not hand the button a new
 * object every time.
 *
 * Reading falls back to the browser's token: a network that has never registered
 * one should reuse the device this browser already owns rather than asking
 * Cloudflare for another (FR-044). Writing lands in both places, so the next
 * prefill finds it whichever page it happens on.
 */
export function networkIdentity(netId: string): WarpIdentity {
  const existing = byNetwork.get(netId);
  if (existing) return existing;

  const identity: WarpIdentity = {
    read: () => {
      const net = useNetworksStore.getState().networks.find((n) => n.id === netId);
      return net?.warp_refresh_token || readWarpToken();
    },
    write: (token) => {
      writeWarpToken(token);
      useNetworksStore.getState().setWarpToken(netId, token);
    },
  };
  byNetwork.set(netId, identity);
  return identity;
}

export const WarpScopeContext = createContext<WarpIdentity | null>(null);

export function WarpScope({
  identity,
  children,
}: {
  identity: WarpIdentity;
  children: ReactNode;
}) {
  return <WarpScopeContext.Provider value={identity}>{children}</WarpScopeContext.Provider>;
}

/** The identity in force where this control is mounted. */
export function useWarpIdentity(): WarpIdentity {
  return useContext(WarpScopeContext) ?? browserIdentity;
}
