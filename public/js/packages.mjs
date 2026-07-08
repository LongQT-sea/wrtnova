// @ts-check
// Shared package resolution - one definition, two runtimes.
//
// computeAdds: the WrtNova-mandated additions, driven by config flags. This is
// the rule table the browser shows as "auto packages" chips (it can include
// removal tokens like -wpad-basic-mbedtls).
//
// resolvePackages: the full final list = base + device + adds + extra, with
// removal tokens collapsed, deduped, and sorted. The Worker returns this; the
// browser-side preview uses the same function so the copied list matches.
//
// A token of the form "-foo" means "remove foo from the final list". If both
// "foo" and "-foo" appear anywhere, the removal wins.

/**
 * Shared so the builder and every /networks build path parse the extras field
 * the same way (and a stray space in a comma-list never leaks a malformed token).
 * @param {string} [str]
 * @returns {string[]}
 */
export function parseAdditionalPackages(str) {
  return (str || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

/**
 * Assemble the emitted banIP feed list: user-selected feeds plus the
 * auto-managed `country` feed (when any country is selected). Deduped,
 * space-joined. `doh` is added by wrtnova.sh itself from BLOCK_DOH, so it is not
 * injected here. Both /builder and /networks use this.
 * @param {string} [feedsStr] space-separated selected feed names
 * @param {string} [countryListStr] space-separated country codes
 * @returns {string}
 */
export function assembleBanipFeeds(feedsStr, countryListStr) {
  const feeds = String(feedsStr || '').trim().split(/\s+/).filter(Boolean);
  if (String(countryListStr || '').trim() !== '') feeds.push('country');
  return [...new Set(feeds)].join(' ');
}

/**
 * @param {{ base?: string[], device?: string[], config?: import('./types.mjs').Config }} args
 * @returns {string[]}
 */
export function computeAdds({ base = [], device = [], config = {} }) {
  const adds = [];

  adds.push('curl', 'ip-full', 'umdns', 'luci');
  if (config.AP_MODE !== '1') {
    const dnsMode = config.DNS_MODE || 'https-dns-proxy';
    if (dnsMode === 'adguardhome') adds.push('adguardhome');
    else if (dnsMode === 'dnsproxy') adds.push('dnsproxy');
    else if (dnsMode === 'https-dns-proxy') adds.push('https-dns-proxy', 'luci-app-https-dns-proxy');
    if (dnsMode !== 'none' && dnsMode !== 'adguardhome') adds.push('adblock-fast', 'grep', 'sed', 'coreutils-sort');
    if (dnsMode === 'adblock-fast' || dnsMode === 'dnsproxy' || dnsMode === 'https-dns-proxy') {
      adds.push('luci-app-adblock-fast');
    }
  }
  adds.push('zram-swap', 'luci-app-commands', 'ip-bridge');

  // Only a secondary ethernet WAN pulls in mwan3. Cellular modem / USB tether are
  // metric-based failover (wrtnova.sh no_mwan3 path).
  if (config.WAN_B_ENABLE === '1') adds.push('luci-app-mwan3');

  const banip = config.BLOCK_DOH === '1' ||
                String(config.BANIP_COUNTRY_LIST || '').trim() !== '' ||
                String(config.BANIP_FEEDS || '').trim() !== '';
  if (banip && config.AP_MODE !== '1') adds.push('luci-app-banip');

  // Heuristic: WiFi-capable if any wifi-related toggle is set or any wifi pkg
  // shows up in base/device pkgs. Cheap and good enough.
  const names = [...base, ...device].join(' ');
  const hasWifi = /\bwpad-?|\bhostapd|\bmac80211/.test(names) ||
                  Object.entries(config).some(([k, v]) => /WIFI/.test(k) && v);
  if (hasWifi) adds.push('-wpad-basic-mbedtls', 'wpad-mbedtls');
  if (hasWifi && config.DOT11KV === '1') adds.push('luci-app-usteer');

  const isAth10kCt = p => /^ath10k-firmware-|^kmod-ath10k-ct/.test(p);
  const ctPkgs = [...base, ...device].filter(isAth10kCt);
  if (config.NON_CT_ATH10K === '1' && ctPkgs.length) {
    ctPkgs.forEach(p => { adds.push('-' + p); adds.push(p.replace(/-ct.*$/, '')); });
  }

  // WED (MediaTek Filogic wireless hardware offload) in dumb-AP mode needs the
  // bridger package to track bridged flows for the PPE (router mode is native).
  if (config.WED_ENABLE === '1' && config.AP_MODE === '1') adds.push('bridger');

  const ddns = config.DDNS_ENABLE === '1' ||
               String(config.LOOKUP_HOSTNAME || '').trim() !== '' ||
               String(config.CLOUDFLARE_API_KEY || '').trim() !== '';
  if (ddns) adds.push('luci-app-ddns', 'ddns-scripts-cloudflare');
  // AP mode: WG_ENABLE signals "create the WG VLAN/SSID for trunking" - the AP
  // does not terminate a WireGuard tunnel, so the protocol package is not needed.
  if (config.WG_ENABLE === '1' && config.AP_MODE !== '1') adds.push('luci-proto-wireguard');
  if (config.CELLULAR_MODEM  === '1') adds.push('luci-proto-modemmanager', 'kmod-usb-net-cdc-mbim');
  if (config.USB_TETHERING === '1') {
    adds.push('kmod-usb-net-rndis', 'kmod-usb-net-cdc-ncm', 'kmod-usb-net-ipheth');
  }

  return adds;
}

/**
 * @param {{ base?: string[], device?: string[], extra?: string[], config?: import('./types.mjs').Config }} args
 * @returns {string[]}
 */
export function resolvePackages({ base = [], device = [], extra = [], config = {} }) {
  const adds = computeAdds({ base, device, config });
  return collapsePackages([...base, ...device, ...adds, ...extra]);
}

/**
 * Collapse a flat package list: drop empties, dedupe, let removal tokens
 * ("-foo") cancel the matching positive, and sort. Shared so any page that
 * sends `diff_packages: true` (which makes ASU treat the list as the complete
 * desired set) emits the same unambiguous shape resolvePackages produces.
 * @param {string[]} merged
 * @returns {string[]}
 */
export function collapsePackages(merged) {
  // Collect removals (tokens starting with '-') and positives separately.
  const removals = new Set();
  const positives = new Set();
  for (const tok of merged) {
    if (!tok) continue;
    const t = String(tok).trim();
    if (!t) continue;
    if (t.startsWith('-')) removals.add(t.slice(1));
    else positives.add(t);
  }
  // Removals beat positives.
  for (const r of removals) positives.delete(r);

  const out = [...positives, ...[...removals].map(r => '-' + r)];
  out.sort((a, b) => a.replace(/^-/, '').localeCompare(b.replace(/^-/, '')));
  return out;
}
