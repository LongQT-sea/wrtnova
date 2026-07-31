// Build history and the round trip back into the form (US3, FR-033 to FR-036).

import { beforeEach, describe, expect, it } from 'vitest';
import { derive } from '@core/derive';
import { SECRET_KEYS } from '@core/schema';
import { KEYS } from '@core/storage';
import type { DeviceTarget, HistoryEntry, RawConfig } from '@core/types';
import { INITIAL_RAW } from '@state/configStore';
import { rawFromEntry, useHistoryStore } from '@state/historyStore';

const raw = (over: Partial<RawConfig>): RawConfig => ({ ...INITIAL_RAW, ...over });

const target: DeviceTarget = {
  title: 'GL.iNet GL-MT6000',
  profile: 'glinet_gl-mt6000',
  target: 'mediatek/filogic',
  version: '25.12.5',
  version_code: 'r1',
  default_packages: [],
  device_packages: [],
  images: [],
};

const record = (cfg: RawConfig, over: Partial<DeviceTarget> = {}): HistoryEntry =>
  useHistoryStore.getState().record({
    raw: cfg,
    target: { ...target, ...over },
    result: { status: 'queued', firmware_url: null },
  });

// jsdom is not loaded for these, so localStorage is stubbed the way core/storage
// expects: a failure to persist must never break the build path.
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
  useHistoryStore.setState({ entries: [] });
});

describe('what gets stored', () => {
  it('never writes a secret (FR-034)', () => {
    const entry = record(
      raw({
        ROOT_PASSWD: 'hunter2hunter2',
        LAN_WIFI_PASSWD: 'wifipassword',
        WG_ENABLE: '1',
        WG_PRIVATE_KEY: 'privatekeyprivatekey',
        PEER_PUBLIC_KEY: 'peerkey',
        CLOUDFLARE_API_KEY: 'cf-token',
      }),
    );
    for (const key of SECRET_KEYS) expect(entry.config[key], key).toBeUndefined();

    // Nor anywhere in the serialized payload, which is what actually leaves memory.
    const written = store.get(KEYS.history) ?? '';
    for (const secret of ['hunter2hunter2', 'wifipassword', 'privatekeyprivatekey', 'cf-token']) {
      expect(written).not.toContain(secret);
    }
  });

  it('stores what was built, not what the form held', () => {
    // IoT is off, so its passphrase and prefix are never emitted -- and so are not
    // in history either, because history records the emission.
    const entry = record(raw({ IOT_ENABLE: '', IOT_BASE_PREFIX: '10.9' }));
    expect(entry.config.IOT_BASE_PREFIX).toBe('');
  });

  it('records the board and release the image was built for', () => {
    const entry = record(INITIAL_RAW);
    expect(entry.device).toEqual({
      title: 'GL.iNet GL-MT6000',
      profile: 'glinet_gl-mt6000',
      target: 'mediatek/filogic',
      version: '25.12.5',
    });
  });

  it('keeps the extra packages as a list', () => {
    const entry = record(raw({ additional_packages: 'htop  tcpdump\nnano' }));
    expect(entry.additional_packages).toEqual(['htop', 'tcpdump', 'nano']);
  });
});

describe('the five-entry bound (FR-033)', () => {
  it('keeps only the newest five', () => {
    for (let i = 0; i < 8; i++) record(raw({ HOST_NAME: 'router-' + i }));
    const { entries } = useHistoryStore.getState();
    expect(entries).toHaveLength(5);
    expect(entries[0]?.config.HOST_NAME).toBe('router-7');
    expect(entries[4]?.config.HOST_NAME).toBe('router-3');
  });

  it('replaces the top entry when the same build is repeated', () => {
    record(raw({ HOST_NAME: 'unchanged' }));
    record(raw({ HOST_NAME: 'unchanged' }));
    expect(useHistoryStore.getState().entries).toHaveLength(1);
  });

  it('pushes a new entry when anything differs', () => {
    record(raw({ HOST_NAME: 'first' }));
    record(raw({ HOST_NAME: 'second' }));
    expect(useHistoryStore.getState().entries).toHaveLength(2);
  });

  it('attaches the download link to the newest entry once the build finishes', () => {
    record(raw({ HOST_NAME: 'router' }));
    useHistoryStore
      .getState()
      .completeTop({ status: 'success', firmware_url: 'https://example.test/x.bin' });
    expect(useHistoryStore.getState().entries[0]?.result).toEqual({
      status: 'success',
      firmware_url: 'https://example.test/x.bin',
    });
  });

  it('survives a reload', () => {
    record(raw({ HOST_NAME: 'persisted' }));
    useHistoryStore.setState({ entries: [] });
    useHistoryStore.getState().load();
    expect(useHistoryStore.getState().entries[0]?.config.HOST_NAME).toBe('persisted');
  });
});

describe('restoring reconstructs the UI-only shapes (FR-035)', () => {
  const roundTrip = (cfg: RawConfig): RawConfig => rawFromEntry(record(cfg));

  it('infers PPPoE from the credentials being present', () => {
    expect(roundTrip(raw({ wan_type: 'pppoe', PPPOE_USERNAME: 'user@isp' })).wan_type).toBe(
      'pppoe',
    );
    expect(roundTrip(raw({ wan_type: 'dhcp' })).wan_type).toBe('dhcp');
  });

  it('flips the dnsmasq question back to the positive the form asks', () => {
    expect(roundTrip(raw({ DNSMASQ_MULTI_INSTANCE: '1' })).DNSMASQ_MULTI_INSTANCE).toBe('1');
    expect(roundTrip(raw({ DNSMASQ_MULTI_INSTANCE: '' })).DNSMASQ_MULTI_INSTANCE).toBe('');
  });

  it('flips the IoT fast-transition question back', () => {
    const on = raw({ IOT_ENABLE: '1', DOT11R: '1', IOT_DOT11R_UI: '1' });
    const off = raw({ IOT_ENABLE: '1', DOT11R: '1', IOT_DOT11R_UI: '' });
    expect(roundTrip(on).IOT_DOT11R_UI).toBe('1');
    expect(roundTrip(off).IOT_DOT11R_UI).toBe('');
  });

  it('does not bring the tunnel endpoint back, because it is a secret', () => {
    // The endpoint names the user's VPN server, so the schema marks it secret and
    // history never stores it -- matching what the previous version of the app did.
    const restored = roundTrip(raw({ WG_ENABLE: '1', ENDPOINT: 'vpn.example.com:51820' }));
    expect(restored.ENDPOINT).toBe('');
    expect(restored.ENDPOINT_PORT).toBe('');
  });

  it('rejoins a split endpoint when one is present', () => {
    // Not reachable through history, which strips it, but this is the path the
    // fleet page takes: a saved network keeps its node configs whole.
    const restored = rawFromEntry({
      ...record(raw({ WG_ENABLE: '1' })),
      config: { WG_ENABLE: '1', ENDPOINT: 'vpn.example.com', ENDPOINT_PORT: '51820' },
    });
    expect(restored.ENDPOINT).toBe('vpn.example.com:51820');
    expect(restored.ENDPOINT_PORT).toBe('');
    // And it survives another trip through the derivation unchanged.
    expect(derive(restored).ENDPOINT).toBe('vpn.example.com');
    expect(derive(restored).ENDPOINT_PORT).toBe('51820');
  });

  it('brackets a bare IPv6 endpoint, or the next split would lose the port', () => {
    const restored = rawFromEntry({
      ...record(raw({ WG_ENABLE: '1' })),
      config: { WG_ENABLE: '1', ENDPOINT: '2606:4700::1111', ENDPOINT_PORT: '51820' },
    });
    expect(restored.ENDPOINT).toBe('[2606:4700::1111]:51820');
    expect(derive(restored).ENDPOINT).toBe('2606:4700::1111');
    expect(derive(restored).ENDPOINT_PORT).toBe('51820');
  });

  it('turns the package list back into the text the field holds', () => {
    expect(roundTrip(raw({ additional_packages: 'htop tcpdump' })).additional_packages).toBe(
      'htop tcpdump',
    );
  });

  it('leaves secrets empty, because they were never stored', () => {
    const restored = roundTrip(raw({ ROOT_PASSWD: 'hunter2hunter2', LAN_WIFI_PASSWD: 'wifipass' }));
    expect(restored.ROOT_PASSWD).toBe('');
    expect(restored.LAN_WIFI_PASSWD).toBe('');
  });

  it('falls back to this version defaults for a key the entry never had', () => {
    // An entry written before a key existed must not come back as "off".
    const entry = record(INITIAL_RAW);
    delete entry.config.FORCE_DNS;
    expect(rawFromEntry(entry).FORCE_DNS).toBe(INITIAL_RAW.FORCE_DNS);
  });

  it('rebuilds byte-identically, which is what makes the ASU cache hit', () => {
    const original = raw({
      HOST_NAME: 'living-room',
      GUEST_ENABLE: '1',
      IOT_ENABLE: '1',
      GUEST_VLAN_ID: '7',
      BASE_NET_PREFIX: '10.20',
      additional_packages: 'htop',
    });
    const restored = rawFromEntry(record(original));
    // Secrets aside, the emitted config must be the same on both sides.
    expect(derive(restored)).toEqual(derive(original));
  });
});
