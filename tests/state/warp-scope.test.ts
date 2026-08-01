// Where a prefilled tunnel identity is remembered (US5, FR-044).
//
// The decision this covers is the one the phase turns on: the prefill button is
// mounted in both pages, and on /networks the identity has to belong to the
// NETWORK, not to whatever the single-node builder last registered.

import { beforeEach, describe, expect, it } from 'vitest';
import { KEYS, readWarpToken, writeWarpToken } from '@core/storage';
import { useNetworksStore } from '@state/networksStore';
import { networkIdentity } from '@state/warpScope';

// jsdom is not loaded for these, so localStorage is stubbed the way core/storage
// expects.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
  useNetworksStore.setState({ networks: [] });
});

describe('a network s identity', () => {
  it('is written to the network and to the browser s slot', () => {
    const net = useNetworksStore.getState().create('home');
    networkIdentity(net.id).write('tok,dev,priv');

    const saved = useNetworksStore.getState().networks.find((n) => n.id === net.id);
    expect(saved?.warp_refresh_token).toBe('tok,dev,priv');
    expect(readWarpToken()).toBe('tok,dev,priv');
    // Persisted, not just held: reopening the page has to find it.
    expect(store.get(KEYS.networks)).toContain('tok,dev,priv');
  });

  it('is read back rather than the browser s, so two networks keep two tunnels', () => {
    const a = useNetworksStore.getState().create('home');
    const b = useNetworksStore.getState().create('office');
    networkIdentity(a.id).write('a,dev,priv');
    networkIdentity(b.id).write('b,dev,priv');

    expect(networkIdentity(a.id).read()).toBe('a,dev,priv');
    expect(networkIdentity(b.id).read()).toBe('b,dev,priv');
  });

  it('falls back to the browser s, so a first prefill reuses the device already owned', () => {
    const net = useNetworksStore.getState().create('home');
    writeWarpToken('browser,dev,priv');
    expect(networkIdentity(net.id).read()).toBe('browser,dev,priv');
  });

  it('is the same object every time, so a re-render does not churn the button', () => {
    const net = useNetworksStore.getState().create('home');
    expect(networkIdentity(net.id)).toBe(networkIdentity(net.id));
  });
});
