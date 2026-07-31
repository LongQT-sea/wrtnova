// DNS engine rules, encrypted-DNS presets, and bootstrap derivation.

import type { DnsMode } from './types';

export const DNS_DEFAULT: DnsMode = 'https-dns-proxy';

export const dnsMode = (m: string | undefined): DnsMode => (m as DnsMode) || DNS_DEFAULT;

export const isAdguard = (m: string | undefined): boolean => dnsMode(m) === 'adguardhome';

/** 'none' and 'adblock-fast' are the plain dnsmasq modes; the rest are DoH engines. */
export const isDohEngine = (m: string | undefined): boolean =>
  !['none', 'adblock-fast'].includes(dnsMode(m));

/**
 * The order the storage auto-retry walks when a build is rejected for
 * exceeding device flash (FR-030). Each step is lighter than the last.
 */
const DOWNGRADE: Record<string, DnsMode | null> = {
  adguardhome: 'dnsproxy',
  dnsproxy: 'https-dns-proxy',
  'https-dns-proxy': 'adblock-fast',
  'adblock-fast': 'none',
  none: null,
};

export function nextLighterDnsMode(current: string | undefined): DnsMode | null {
  return DOWNGRADE[dnsMode(current)] ?? null;
}

export function isStorageError(message: string): boolean {
  return /exceed.*storage|storage.*exceed/i.test(message);
}

export interface DohProvider {
  name: string;
  url: string;
  /** Plain IPs needed to resolve the provider's own hostname. */
  bootstrap: string;
}

export const DOH_PROVIDERS: readonly DohProvider[] = [
  { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query', bootstrap: '1.0.0.1 2606:4700:4700::1001' },
  { name: 'Cloudflare Security', url: 'https://security.cloudflare-dns.com/dns-query', bootstrap: '1.0.0.2 2606:4700:4700::1002' },
  { name: 'Google', url: 'https://dns.google/dns-query', bootstrap: '8.8.8.8 2001:4860:4860::8888' },
  { name: 'Quad9', url: 'https://dns.quad9.net/dns-query', bootstrap: '9.9.9.9 2620:fe::fe' },
  { name: 'AdGuard', url: 'https://dns.adguard-dns.com/dns-query', bootstrap: '94.140.14.14 2a10:50c0::ad1:ff' },
  { name: 'AdGuard Family', url: 'https://family.adguard-dns.com/dns-query', bootstrap: '94.140.14.15 2a10:50c0::bad1:ff' },
  { name: 'Mullvad', url: 'https://dns.mullvad.net/dns-query', bootstrap: '194.242.2.2 2a07:e340::2' },
  { name: 'Mullvad Adblock', url: 'https://adblock.dns.mullvad.net/dns-query', bootstrap: '194.242.2.3 2a07:e340::3' },
  { name: 'DNS4EU', url: 'https://protective.joindns4.eu/dns-query', bootstrap: '86.54.11.1 2a13:1001::86:54:11:1' },
  { name: 'OpenDNS', url: 'https://doh.opendns.com/dns-query', bootstrap: '208.67.222.222 2620:119:35::35' },
  { name: 'Wikimedia', url: 'https://wikimedia-dns.org/dns-query', bootstrap: '185.71.138.138 2001:67c:930::1' },
  { name: 'AliDNS', url: 'https://dns.alidns.com/dns-query', bootstrap: '223.5.5.5 2400:3200::1' },
  { name: 'Tencent DNSPod', url: 'https://doh.pub/dns-query', bootstrap: '119.29.29.29 2402:4e00::' },
];

const words = (s: string | undefined): string[] => String(s ?? '').split(/\s+/).filter(Boolean);

/**
 * Bootstrap IPs to emit: those of every recognised provider currently in
 * DOH_UPSTREAMS, plus whatever the user typed. Derived rather than appended, so
 * removing a provider's URL removes its addresses with it — the script feeds
 * BOOTSTRAP_DNS to fallback_dns too, so a stale entry would leave a resolver
 * the user thought they had removed reachable in plaintext.
 */
export function deriveBootstrapDns(cfg: {
  DOH_UPSTREAMS?: string;
  BOOTSTRAP_DNS?: string;
}): string {
  const out: string[] = [];
  for (const url of words(cfg.DOH_UPSTREAMS)) {
    const p = DOH_PROVIDERS.find((x) => x.url === url);
    if (p) out.push(...words(p.bootstrap));
  }
  out.push(...words(cfg.BOOTSTRAP_DNS));
  return [...new Set(out)].join('\n');
}
