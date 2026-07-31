// Package resolution.
//
// The final list is stock + device + the additions the configuration implies +
// the user's extras, with removal tokens collapsed, deduplicated, and sorted.
// The browser sends `diff_packages: true`, which makes ASU treat this as the
// complete desired set, so the ordering has to be deterministic (FR-032).
//
// A token "-foo" means "remove foo". If both "foo" and "-foo" appear anywhere,
// the removal wins.

import type { Config } from './types';
import { DNS_DEFAULT } from './dns';

type Cfg = Partial<Config>;

/** Parse the free-form extras field the same way everywhere. */
export function parseAdditionalPackages(str: string | undefined): string[] {
  return (str ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The emitted banIP feed list: the user's selection plus the auto-managed
 * `country` feed when any country is selected. `doh` is added by the script
 * itself from BLOCK_DOH, so it is not injected here.
 */
export function assembleBanipFeeds(
  feedsStr: string | undefined,
  countryListStr: string | undefined,
): string {
  const feeds = String(feedsStr ?? '').trim().split(/\s+/).filter(Boolean);
  if (String(countryListStr ?? '').trim() !== '') feeds.push('country');
  return [...new Set(feeds)].join(' ');
}

export function computeAdds({
  base = [],
  device = [],
  config = {},
}: {
  base?: string[];
  device?: string[];
  config?: Cfg;
}): string[] {
  const adds: string[] = [];

  adds.push('curl', 'ip-full', 'umdns', 'luci');

  if (config.AP_MODE !== '1') {
    const mode = config.DNS_MODE || DNS_DEFAULT;
    if (mode === 'adguardhome') adds.push('adguardhome');
    else if (mode === 'dnsproxy') adds.push('dnsproxy');
    else if (mode === 'https-dns-proxy') adds.push('https-dns-proxy', 'luci-app-https-dns-proxy');
    if (mode !== 'none' && mode !== 'adguardhome') {
      adds.push('adblock-fast', 'grep', 'sed', 'coreutils-sort');
    }
    if (mode === 'adblock-fast' || mode === 'dnsproxy' || mode === 'https-dns-proxy') {
      adds.push('luci-app-adblock-fast');
    }
  }

  adds.push('zram-swap', 'luci-app-commands', 'ip-bridge');

  // Only a secondary ethernet WAN pulls in mwan3. Cellular and USB tethering
  // are metric-based failover and take the script's no_mwan3 path.
  if (config.WAN_B_ENABLE === '1') adds.push('luci-app-mwan3');

  const banip =
    config.BLOCK_DOH === '1' ||
    String(config.BANIP_COUNTRY_LIST ?? '').trim() !== '' ||
    String(config.BANIP_FEEDS ?? '').trim() !== '';
  if (banip && config.AP_MODE !== '1') adds.push('luci-app-banip');

  // Wi-Fi capability heuristic: any wireless package in the resolved sets, or
  // any Wi-Fi-related value in the config.
  const names = [...base, ...device].join(' ');
  const hasWifi =
    /\bwpad-?|\bhostapd|\bmac80211/.test(names) ||
    Object.entries(config).some(([k, v]) => /WIFI/.test(k) && v);
  // Full wpad plus usteer only for 802.11k/v roaming or an 802.11s mesh.
  if (
    hasWifi &&
    (config.DOT11KV === '1' || config.WIRELESS_MESH === '1' || config.WIRELESS_MESH_2G === '1')
  ) {
    adds.push('-wpad-basic-mbedtls', 'wpad-mbedtls', 'luci-app-usteer');
  }

  const isAth10kCt = (p: string) => /^ath10k-firmware-|^kmod-ath10k-ct/.test(p);
  const ctPkgs = [...base, ...device].filter(isAth10kCt);
  if (config.NON_CT_ATH10K === '1' && ctPkgs.length) {
    ctPkgs.forEach((p) => {
      adds.push('-' + p);
      adds.push(p.replace(/-ct.*$/, ''));
    });
  }

  // WED in dumb-AP mode needs bridger to track bridged flows for the PPE;
  // router mode is native.
  if (config.WED_ENABLE === '1' && config.AP_MODE === '1') adds.push('bridger');

  if (config.IRQBALANCE === '1') adds.push('luci-app-irqbalance');
  if (config.BATMAN_ADV === '1') adds.push('luci-proto-batman-adv');
  if (config.LUCI_HTTPS === '1') adds.push('luci-ssl');

  const ddns =
    config.DDNS_ENABLE === '1' ||
    String(config.LOOKUP_HOSTNAME ?? '').trim() !== '' ||
    String(config.CLOUDFLARE_API_KEY ?? '').trim() !== '';
  if (ddns) adds.push('luci-app-ddns', 'ddns-scripts-cloudflare');

  // In AP mode WG_ENABLE only means "create the VPN VLAN and SSID for
  // trunking" — the access point terminates no tunnel, so the protocol package
  // is not needed.
  if (config.WG_ENABLE === '1' && config.AP_MODE !== '1') adds.push('luci-proto-wireguard');

  if (config.CELLULAR_MODEM === '1') adds.push('luci-proto-modemmanager', 'kmod-usb-net-cdc-mbim');
  if (config.USB_TETHERING === '1') {
    adds.push('kmod-usb-net-rndis', 'kmod-usb-net-cdc-ncm', 'kmod-usb-net-ipheth');
  }

  return adds;
}

/** Drop empties, dedupe, let removals cancel positives, sort. */
export function collapsePackages(merged: string[]): string[] {
  const removals = new Set<string>();
  const positives = new Set<string>();
  for (const tok of merged) {
    const t = String(tok ?? '').trim();
    if (!t) continue;
    if (t.startsWith('-')) removals.add(t.slice(1));
    else positives.add(t);
  }
  for (const r of removals) positives.delete(r);

  const out = [...positives, ...[...removals].map((r) => '-' + r)];
  out.sort((a, b) => a.replace(/^-/, '').localeCompare(b.replace(/^-/, '')));
  return out;
}

export function resolvePackages({
  base = [],
  device = [],
  extra = [],
  config = {},
}: {
  base?: string[];
  device?: string[];
  extra?: string[];
  config?: Cfg;
}): string[] {
  const adds = computeAdds({ base, device, config });
  return collapsePackages([...base, ...device, ...adds, ...extra]);
}

/** Compression needs coreutils-base64 on the device to decode the payload. */
export function withBase64Pkg(packages: string[], compressed: boolean): string[] {
  if (!compressed || packages.includes('coreutils-base64')) return packages;
  return collapsePackages([...packages, 'coreutils-base64']);
}
