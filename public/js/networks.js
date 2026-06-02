(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────
  const STORE_KEY = 'wrtnova_networks';
  const DL = 'https://downloads.openwrt.org';
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const BRANCHES = ['23.05', '24.10', '25.12'];
  const ASU_DEFAULT = 'https://sysupgrade.openwrt.org';
  let activeAsu = ASU_DEFAULT;


  const nodeBuilds = new Map();

  // ui.js helpers (loaded before us)
  const ui = window.WrtNova = window.WrtNova || {};

  // ── Node config merge (mirrors Worker's mergeNodeConfig in functions/api/build.js) ──
  function mergeNodeConfig(sharedConfig, nodeOverrides) {
    const c = Object.assign({}, sharedConfig, nodeOverrides);
    const isAp    = c.AP_MODE       === '1';
    const wgOn    = c.WG_ENABLE     === '1';
    const meshOn  = c.WIRELESS_MESH === '1';
    const guestOn = c.GUEST_ENABLE  === '1';
    const iotOn   = c.IOT_ENABLE    === '1';
    const flag = v => v === '1' ? '1' : '';
    return {
      AP_MODE: isAp ? '1' : '', AP_INDEX: isAp ? (c.AP_INDEX || '2') : '',
      HOST_NAME: c.HOST_NAME || '', ROOT_PASSWD: c.ROOT_PASSWD || '',
      SSH_PUBLIC_KEY: c.SSH_PUBLIC_KEY || '', SSH_PASSWD_AUTH: c.SSH_PASSWD_AUTH || '',
      ZONE_NAME: c.ZONE_NAME || '', TIME_ZONE: c.TIME_ZONE || '',
      PPPOE_USERNAME: !isAp && c.wan_type === 'pppoe' ? (c.PPPOE_USERNAME || '') : '',
      PPPOE_PASSWD:   !isAp && c.wan_type === 'pppoe' ? (c.PPPOE_PASSWD   || '') : '',
      WAN_MAC_ADDR:   !isAp ? (c.WAN_MAC_ADDR  || '') : '',
      WAN_IS_TAGGED:  !isAp ? flag(c.WAN_IS_TAGGED) : '',
      WAN_VLAN_ID:    !isAp && c.WAN_IS_TAGGED === '1' ? (c.WAN_VLAN_ID  || '') : '',
      WAN_B_ENABLE:   !isAp ? flag(c.WAN_B_ENABLE) : '',
      WAN_B_VLAN_ID:  !isAp && c.WAN_B_ENABLE  === '1' ? (c.WAN_B_VLAN_ID || '') : '',
      BASE_NET_PREFIX: c.BASE_NET_PREFIX || '', DEFAULT_SUBNET: c.DEFAULT_SUBNET || '',
      GUEST_ENABLE: guestOn ? '1' : '', IOT_ENABLE: iotOn ? '1' : '',
      IOT_INTERNET: iotOn ? flag(c.IOT_INTERNET) : '', WG_ENABLE: wgOn ? '1' : '',
      LAN_BASE_PREFIX: c.LAN_BASE_PREFIX || '', LAN_VLAN_ID: c.LAN_VLAN_ID || '', LAN_SUBNET: c.LAN_SUBNET || '',
      GUEST_BASE_PREFIX: guestOn ? (c.GUEST_BASE_PREFIX || '') : '', GUEST_VLAN_ID: guestOn ? (c.GUEST_VLAN_ID || '') : '', GUEST_SUBNET: guestOn ? (c.GUEST_SUBNET || '') : '',
      IOT_BASE_PREFIX:   iotOn   ? (c.IOT_BASE_PREFIX   || '') : '', IOT_VLAN_ID:   iotOn   ? (c.IOT_VLAN_ID   || '') : '', IOT_SUBNET:   iotOn   ? (c.IOT_SUBNET   || '') : '',
      LAN_WG_BASE_PREFIX: wgOn  ? (c.LAN_WG_BASE_PREFIX || '') : '', LAN_WG_VLAN_ID: wgOn  ? (c.LAN_WG_VLAN_ID || '') : '', LAN_WG_SUBNET: wgOn  ? (c.LAN_WG_SUBNET || '') : '',
      ADDITIONAL_VLAN_LIST: c.ADDITIONAL_VLAN_LIST || '',
      COUNTRY_CODE: c.COUNTRY_CODE || '', DENSE_ENV: flag(c.DENSE_ENV), WIRELESS_MESH: flag(c.WIRELESS_MESH),
      MESH_ID: meshOn ? (c.MESH_ID || '') : '', MESH_PASSWD: meshOn ? (c.MESH_PASSWD || '') : '',
      LAN_WIFI_SSID: c.LAN_WIFI_SSID || '', LAN_WIFI_PASSWD: c.LAN_WIFI_PASSWD || '',
      GUEST_WIFI_SSID:  guestOn ? (c.GUEST_WIFI_SSID   || '') : '', GUEST_WIFI_PASSWD:  guestOn ? (c.GUEST_WIFI_PASSWD   || '') : '',
      IOT_WIFI_SSID:    iotOn   ? (c.IOT_WIFI_SSID     || '') : '', IOT_WIFI_PASSWD:    iotOn   ? (c.IOT_WIFI_PASSWD     || '') : '',
      LAN_WG_WIFI_SSID: wgOn   ? (c.LAN_WG_WIFI_SSID  || '') : '', LAN_WG_WIFI_PASSWD: wgOn   ? (c.LAN_WG_WIFI_PASSWD  || '') : '',
      CHANNEL_2G: c.CHANNEL_2G || '', CHANNEL_5G: c.CHANNEL_5G || '', CHANNEL_6G: c.CHANNEL_6G || '',
      WIFI_LOG_LVL: c.WIFI_LOG_LVL || '',
      WG_PRIVATE_KEY:  wgOn && !isAp ? (c.WG_PRIVATE_KEY  || '') : '',
      PEER_PUBLIC_KEY: wgOn && !isAp ? (c.PEER_PUBLIC_KEY  || '') : '',
      ENDPOINT:        wgOn && !isAp ? (c.ENDPOINT         || '') : '',
      ENDPOINT_PORT:   wgOn && !isAp ? (c.ENDPOINT_PORT    || '') : '',
      PRESHARED_KEY:   wgOn && !isAp ? (c.PRESHARED_KEY    || '') : '',
      WG_IPV4:         wgOn && !isAp ? (c.WG_IPV4          || '') : '',
      WG_IPV6:         wgOn && !isAp ? (c.WG_IPV6          || '') : '',
      ALLOWED_IPS:     wgOn && !isAp ? (c.ALLOWED_IPS      || '') : '',
      PORT_FORWARD_LIST: !isAp ? (c.PORT_FORWARD_LIST || '') : '',
      IPV6_SERVER_LIST:  !isAp ? (c.IPV6_SERVER_LIST  || '') : '',
      DDNS_ENABLE:        !isAp ? flag(c.DDNS_ENABLE)        : '',
      LOOKUP_HOSTNAME:    !isAp ? (c.LOOKUP_HOSTNAME    || '') : '',
      CLOUDFLARE_API_KEY: !isAp ? (c.CLOUDFLARE_API_KEY || '') : '',
      CELLULAR_MODEM: !isAp ? flag(c.CELLULAR_MODEM) : '',
      USB_TETHERING:  !isAp ? flag(c.USB_TETHERING)  : '',
      DNS_MODE:         c.DNS_MODE || 'adguardhome',
      SOFTWARE_OFFLOAD: flag(c.SOFTWARE_OFFLOAD), HARDWARE_OFFLOAD: flag(c.HARDWARE_OFFLOAD),
      BLOCK_DOT_DOQ:    flag(c.BLOCK_DOT_DOQ),
      NON_CT_ATH10K:    flag(c.NON_CT_ATH10K),
    };
  }

  // ── Storage ──────────────────────────────────────────────────────
  function loadNetworks() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveNetworks() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(st.networks)); }
    catch (e) {}
  }

  async function loadAsuServer() {
    try {
      const r = await fetch('/api/asu-servers');
      if (!r.ok) return;
      const data = await r.json();
      const servers = data.servers || [];
      if (servers.length) activeAsu = servers[0].url;
    } catch (_) {}
  }

  // ── App state ────────────────────────────────────────────────────
  const st = {
    networks: loadNetworks(),
    activeNodeId: null,
    networkId: null,
  };

  // ── Data defaults — field names match the builder's form exactly ─
  function defaultConfig() {
    return {
      shared_version: '',
      HOST_NAME: '', ROOT_PASSWD: '', SSH_PUBLIC_KEY: '',
      SSH_PASSWD_AUTH: '', ZONE_NAME: '', TIME_ZONE: '',
      BASE_NET_PREFIX: '', DEFAULT_SUBNET: '',
      LAN_BASE_PREFIX: '', LAN_VLAN_ID: '', LAN_SUBNET: '',
      GUEST_ENABLE: '1', GUEST_BASE_PREFIX: '', GUEST_VLAN_ID: '', GUEST_SUBNET: '',
      IOT_ENABLE: '', IOT_BASE_PREFIX: '', IOT_VLAN_ID: '', IOT_SUBNET: '',
      IOT_INTERNET: '',
      WG_ENABLE: '', LAN_WG_BASE_PREFIX: '', LAN_WG_VLAN_ID: '', LAN_WG_SUBNET: '',
      ADDITIONAL_VLAN_LIST: '',
      WG_PRIVATE_KEY: '', PEER_PUBLIC_KEY: '', ENDPOINT: '',
      ENDPOINT_PORT: '', PRESHARED_KEY: '', WG_IPV4: '', WG_IPV6: '',
      ALLOWED_IPS: '',
      wan_type: 'dhcp', PPPOE_USERNAME: '', PPPOE_PASSWD: '',
      WAN_MAC_ADDR: '', WAN_IS_TAGGED: '', WAN_VLAN_ID: '',
      WAN_B_ENABLE: '', WAN_B_VLAN_ID: '',
      COUNTRY_CODE: '', DENSE_ENV: '', WIRELESS_MESH: '',
      MESH_ID: '', MESH_PASSWD: '',
      LAN_WIFI_SSID: '', LAN_WIFI_PASSWD: '',
      GUEST_WIFI_SSID: '', GUEST_WIFI_PASSWD: '',
      IOT_WIFI_SSID: '', IOT_WIFI_PASSWD: '',
      LAN_WG_WIFI_SSID: '', LAN_WG_WIFI_PASSWD: '',
      CHANNEL_2G: '', CHANNEL_5G: '', CHANNEL_6G: '', WIFI_LOG_LVL: '',
      PORT_FORWARD_LIST: '', IPV6_SERVER_LIST: '',
      DDNS_ENABLE: '', LOOKUP_HOSTNAME: '', CLOUDFLARE_API_KEY: '',
      USB_TETHERING: '', CELLULAR_MODEM: '',
      DNS_MODE: 'adguardhome', BLOCK_DOT_DOQ: '',
      SOFTWARE_OFFLOAD: '', HARDWARE_OFFLOAD: '',
      additional_packages: '',
    };
  }

  function defaultRouterNode() {
    return {
      id: uid(), name: 'Main Router',
      device_target: emptyTarget(),
      overrides: { AP_MODE: '0', WAN_MAC_ADDR: '', WIRELESS_MESH: '' },
      last_build: null,
    };
  }

  const AP_ROOM_NAMES = ['Living Room', 'Kitchen', 'Bedroom', 'Office', 'Garage', 'Dining Room'];

  function defaultApNode(idx) {
    return {
      id: uid(), name: AP_ROOM_NAMES[idx - 2] ?? 'AP-' + idx,
      device_target: emptyTarget(),
      overrides: { AP_MODE: '1', AP_INDEX: String(idx), WIRELESS_MESH: '' },
      last_build: null,
    };
  }

  function emptyTarget() {
    return { title: '', profile: '', target: '', version: '', version_code: '',
             default_packages: [], device_packages: [] };
  }

  // ── Utilities ────────────────────────────────────────────────────
  function uid() { return Math.random().toString(36).slice(2, 10); }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function timeAgo(ts) {
    if (!ts) return 'never';
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d === 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 7) return d + ' days ago';
    return new Date(ts).toLocaleDateString();
  }

  function getNet(id) { return st.networks.find(n => n.id === id); }

  function nextApIdx(network) {
    const used = network.nodes
      .filter(n => n.overrides.AP_MODE === '1')
      .map(n => parseInt(n.overrides.AP_INDEX) || 2);
    let i = 2;
    while (used.includes(i)) i++;
    return i;
  }

  function inheritedChips(network, node) {
    const c = network.shared_config;
    const chips = [];
    const isAp = node.overrides.AP_MODE === '1';
    if (isAp) {
      chips.push('AP_MODE=1');
      if (c.LAN_WIFI_SSID || c.HOST_NAME)
        chips.push('SSID: ' + (c.LAN_WIFI_SSID || c.HOST_NAME || 'WrtNova'));
      if (c.GUEST_ENABLE === '1') chips.push('Guest network');
      if (c.IOT_ENABLE === '1') chips.push('IoT network');
      if (c.WG_ENABLE === '1') chips.push('VPN SSID');
      if (c.ROOT_PASSWD) chips.push('Root password');
      if (c.SSH_PUBLIC_KEY) chips.push('SSH key');
      if (c.COUNTRY_CODE) chips.push('Country: ' + c.COUNTRY_CODE);
      chips.push('VLANs trunked');
      if (c.WAN_B_ENABLE === '1') chips.push('WAN-B VLAN');
    } else {
      if (c.LAN_WIFI_SSID || c.HOST_NAME)
        chips.push('SSID: ' + (c.LAN_WIFI_SSID || c.HOST_NAME || 'WrtNova'));
      if (c.WG_ENABLE === '1') chips.push('WireGuard VPN');
      if (c.GUEST_ENABLE === '1') chips.push('Guest network');
      if (c.IOT_ENABLE === '1') chips.push('IoT network');
      if (c.DNS_MODE && c.DNS_MODE !== 'none')
        chips.push(c.DNS_MODE === 'adguardhome' ? 'AdGuard Home' : 'dnsproxy');
      if (c.DDNS_ENABLE === '1' && c.LOOKUP_HOSTNAME)
        chips.push('DDNS: ' + c.LOOKUP_HOSTNAME);
      if (c.COUNTRY_CODE) chips.push('Country: ' + c.COUNTRY_CODE);
      if (c.BASE_NET_PREFIX) chips.push(c.BASE_NET_PREFIX + '.x.0/24');
    }
    return chips;
  }

  function netSummary(network) {
    const c = network.shared_config;
    const p = [];
    if (c.shared_version) p.push('OpenWrt ' + c.shared_version);
    if (c.BASE_NET_PREFIX) p.push(c.BASE_NET_PREFIX + '.x.0/24');
    if (c.DNS_MODE && c.DNS_MODE !== 'none')
      p.push(c.DNS_MODE === 'adguardhome' ? 'AdGuard Home' : 'dnsproxy');
    if (c.WG_ENABLE === '1') p.push('WireGuard VPN');
    return p.join(' · ') || 'Not yet configured';
  }

  function nodeLanIp(net, node) {
    const cfg    = net.shared_config;
    const prefix = cfg.LAN_BASE_PREFIX || cfg.BASE_NET_PREFIX || '192.168';
    const vlan   = cfg.LAN_VLAN_ID || '1';
    const last   = node.overrides.AP_MODE === '1' ? (node.overrides.AP_INDEX || '2') : '1';
    return prefix + '.' + vlan + '.' + last;
  }

  function nodeDotClass(node) {
    if (node.last_build) return 'dot valid';
    if (node.device_target.profile) return 'dot touched';
    return 'dot';
  }

  function computeNodePackages(cfg, target) {
    const base = [...(target.default_packages || []), ...(target.device_packages || [])];
    const pkgs = [];
    const isAp = cfg.AP_MODE === '1';
    pkgs.push('curl', 'ip-full', 'umdns', 'luci');
    if (!isAp) {
      const dns = cfg.DNS_MODE || 'adguardhome';
      if (dns === 'adguardhome') pkgs.push('adguardhome');
      else if (dns === 'dnsproxy') pkgs.push('dnsproxy');
    }
    pkgs.push('zram-swap', 'luci-app-commands', 'ip-bridge');
    if (cfg.WAN_B_ENABLE === '1' || cfg.CELLULAR_MODEM === '1' || cfg.USB_TETHERING === '1')
      pkgs.push('luci-app-mwan3');
    const hasWifi = /\bwpad-?|\bhostapd|\bmac80211/.test(base.join(' ')) ||
      Object.entries(cfg).some(([k, v]) => /WIFI/.test(k) && v);
    if (hasWifi) pkgs.push('-wpad-basic-mbedtls', 'wpad-mbedtls', 'luci-app-usteer');
    const isAth10kCt = p => /^ath10k-firmware-|^kmod-ath10k-ct/.test(p);
    const ctPkgs = base.filter(isAth10kCt);
    if (cfg.NON_CT_ATH10K === '1' && ctPkgs.length)
      ctPkgs.forEach(p => { pkgs.push('-' + p); pkgs.push(p.replace(/-ct.*$/, '')); });
    pkgs.push('luci-app-ddns', 'ddns-scripts-cloudflare');
    if (cfg.WG_ENABLE === '1' && !isAp) pkgs.push('luci-proto-wireguard');
    if (cfg.CELLULAR_MODEM === '1') pkgs.push('luci-proto-modemmanager', 'kmod-usb-net-cdc-mbim');
    if (cfg.USB_TETHERING === '1') pkgs.push('kmod-usb-net-rndis', 'kmod-usb-net-cdc-ncm', 'kmod-usb-net-ipheth');
    return pkgs;
  }

  function bcryptHash(pw) {
    if (!pw) return Promise.resolve('');
    try {
      const cached = JSON.parse(localStorage.getItem('wrtnova_adguard') || 'null');
      if (cached && cached.pw === pw) return Promise.resolve(cached.hash);
    } catch (_) {}
    return ui.loadScript('/js/bcrypt.js').then(() => {
      const bcrypt = window.dcodeIO && window.dcodeIO.bcrypt;
      if (!bcrypt) return '';
      try {
        const hash = bcrypt.hashSync(pw, 10);
        try { localStorage.setItem('wrtnova_adguard', JSON.stringify({ pw, hash })); } catch (_) {}
        return hash;
      } catch (_) { return ''; }
    }).catch(() => '');
  }

  function panelActEl(nodeId) {
    return document.querySelector('#panel-' + nodeId + ' .node-actions');
  }

  function showPanelProgress(actEl, pct, label) {
    if (!actEl) return;
    const done = pct >= 100;
    actEl.innerHTML =
      '<div class="w-full">' +
      '<div class="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded overflow-hidden mb-1.5">' +
      '<div class="h-full transition-all duration-500 ' + (done ? 'bg-green-500' : 'bg-blue-500') + '" style="width:' + pct + '%"></div></div>' +
      '<p class="text-xs ' + (done ? 'text-green-600 dark:text-green-400' : 'text-zinc-500 dark:text-zinc-400') + '">' + esc(label || '…') + '</p>' +
      '</div>';
  }

  function showPanelError(actEl, msg, onRetry) {
    if (!actEl) return;
    const id = 'retry-' + uid();
    const isStorageFull = /exceed.*storage|storage.*exceed/i.test(msg);
    actEl.innerHTML =
      '<div class="w-full">' +
      '<div class="flex items-start gap-2">' +
      '<p class="text-xs text-red-500 dark:text-red-400 flex-1">' + esc(msg) + '</p>' +
      '<button type="button" class="btn text-xs flex-shrink-0" id="' + id + '">Retry</button>' +
      '</div>' +
      (isStorageFull
        ? '<p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">Try switching <strong>DNS &amp; adblock</strong> from AdGuard Home to dnsproxy in network config.</p>'
        : '') +
      '</div>';
    actEl.querySelector('#' + id)?.addEventListener('click', onRetry);
  }

  function imageFilesHtml(images, bin_dir, asuBase) {
    if (!images || !images.length) return '';
    const base = (asuBase || activeAsu).replace(/\/+$/, '');
    const sorted = images.slice().sort((a, b) => (b.type === 'sysupgrade') - (a.type === 'sysupgrade'));
    let list = '<ul class="result-images mt-0.5">';
    sorted.forEach(im => {
      const url = bin_dir ? base + '/store/' + bin_dir + '/' + im.name : null;
      list += '<li>' + (url ? '<a href="' + esc(url) + '" target="_blank">' + esc(im.name) + '</a>' : esc(im.name))
            + (im.sha256 ? '<br><span class="result-hash">sha256: ' + esc(im.sha256) + '</span>' : '')
            + '</li>';
    });
    list += '</ul>';
    return '<div class="w-full mt-1">' + list + '</div>';
  }

  function flashNoteHtml(images) {
    return (images || []).some(i => i.type === 'sysupgrade')
      ? '<p class="result-note w-full mt-1">Flash the "<strong>sysupgrade</strong>" image via "System → Backup / Flash firmware → Flash image". Make sure to <strong>disable "Keep settings and retain the current configuration"</strong>.</p>'
      : '';
  }

  function showPanelDone(actEl, firmwareUrl, images, bin_dir, asuBase, onDone) {
    if (!actEl) return;
    const id = 'buildbtn-' + uid();
    actEl.innerHTML =
      '<button type="button" class="btn btn-primary text-xs" id="' + id + '">Build firmware</button>' +
      flashNoteHtml(images) +
      imageFilesHtml(images, bin_dir, asuBase);
    actEl.querySelector('#' + id)?.addEventListener('click', onDone);
  }

  // ── View routing ─────────────────────────────────────────────────
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById('view-' + name);
    if (el) el.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Breadcrumb helpers ────────────────────────────────────────────
  const BC_SEP = '<span class="mx-1 opacity-50">/</span>';
  function bcBtn(label, onClick) {
    const id = 'bc-' + uid();
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', onClick);
    }, 0);
    return '<button id="' + id + '" class="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">' + esc(label) + '</button>';
  }
  function setHeaderSub(html) {
    const el = document.getElementById('header-sub');
    if (el) el.innerHTML = ' ' + html;
  }

  // ── List view ─────────────────────────────────────────────────────
  function renderList() {
    setHeaderSub(BC_SEP + 'Networks');
    const container = document.getElementById('networks-list');

    if (!st.networks.length) {
      container.innerHTML =
        '<div class="card p-8 text-center">' +
        '<p class="text-zinc-500 dark:text-zinc-400 text-sm mb-4">No networks yet. Create one to get started.</p>' +
        '<button class="btn btn-primary" id="btn-empty-new">' +
        '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
        '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        'New network</button></div>';
      document.getElementById('btn-empty-new')?.addEventListener('click', showNewNetwork);
      return;
    }

    container.innerHTML = st.networks.map(net => {
      const names = net.nodes.map(n => esc(n.name)).join(' · ');
      const built = net.nodes.filter(n => n.last_build).length;
      const pending = net.nodes.length - built;
      const dotCls = built === net.nodes.length ? 'dot valid' : built > 0 ? 'dot touched' : 'dot';
      return (
        '<div class="card net-card-link" data-netid="' + esc(net.id) + '">' +
        '<div class="p-4 flex items-start justify-between gap-4">' +
        '<div class="flex-1 min-w-0">' +
        '<div class="flex items-center gap-2 mb-1">' +
        '<span class="' + dotCls + '" aria-hidden="true"></span>' +
        '<span class="font-semibold">' + esc(net.name) + '</span>' +
        '<span class="chip">' + net.nodes.length + ' node' + (net.nodes.length !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        '<p class="text-xs text-zinc-500 dark:text-zinc-400 truncate">' + names + '</p>' +
        '<p class="text-xs text-zinc-600 dark:text-zinc-500 mt-1">' + esc(netSummary(net)) + '</p>' +
        '</div>' +
        '<div class="flex flex-col items-end gap-2 flex-shrink-0">' +
        '<svg class="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
        '<div class="flex gap-1">' +
        (built ? '<span class="chip">' + built + ' built</span>' : '') +
        (pending ? '<span class="chip text-zinc-500">' + pending + ' pending</span>' : '') +
        '</div></div></div></div>'
      );
    }).join('');

    container.querySelectorAll('[data-netid]').forEach(card => {
      card.addEventListener('click', () => showDetail(card.dataset.netid));
    });
  }

  // ── Detail view ──────────────────────────────────────────────────
  function showDetail(networkId) {
    st.networkId = networkId;
    st.activeNodeId = null;
    const net = getNet(networkId);
    if (!net) return;

    setHeaderSub(BC_SEP + bcBtn('Networks', () => { renderList(); showView('list'); }) + BC_SEP + esc(net.name));
    document.getElementById('detail-title-text').textContent = net.name;
    document.getElementById('detail-summary').textContent = netSummary(net);
    document.getElementById('detail-name-display')?.classList.remove('hidden');
    document.getElementById('detail-name-edit')?.classList.add('hidden');

    const allBuilt = net.nodes.every(n => n.last_build);
    const anyBuilt = net.nodes.some(n => n.last_build);
    document.getElementById('detail-status-dot').className =
      'dot' + (allBuilt ? ' valid' : anyBuilt ? ' touched' : '');

    document.getElementById('btn-edit-config').onclick = () => showConfig(networkId);
    document.getElementById('btn-delete-network').onclick = () => confirmDelete(networkId);
    document.getElementById('btn-add-ap').onclick = () => showAddAp(networkId);
    document.getElementById('btn-build-all').onclick = () => buildAll(net);

    renderNodeList(net);
    showView('detail');
    dpEnsureVersions();
  }

  function renderNodeList(net) {
    const card = document.getElementById('node-list-card');
    card.innerHTML = net.nodes.map(node => {
      const isAp = node.overrides.AP_MODE === '1';
      const devLabel = node.device_target.title || 'No device selected';
      const status = nodeLanIp(net, node) + (node.last_build ? ' · built ' + timeAgo(node.last_build.timestamp) : '');
      const buildBtnCls = node.device_target.profile ? 'btn text-xs py-0.5 px-2' : 'btn btn-primary text-xs py-0.5 px-2';
      return (
        '<div class="node-row" data-nodeid="' + esc(node.id) + '">' +
        '<span class="' + nodeDotClass(node) + ' flex-shrink-0" aria-hidden="true"></span>' +
        '<div class="flex-1 min-w-0">' +
        '<div class="font-medium text-sm">' + esc(node.name) + '</div>' +
        '<div class="text-xs text-zinc-500 dark:text-zinc-400 truncate">' + esc(devLabel) + ' · ' +
        (isAp ? 'AP #' + esc(node.overrides.AP_INDEX || '2') : 'Router') + ' · ' + status + '</div>' +
        '</div>' +
        '<div class="flex items-center gap-2 flex-shrink-0">' +
        '<button class="' + buildBtnCls + '" data-buildbtn="' + esc(node.id) + '">' +
        (node.device_target.profile ? 'Build' : 'Setup') + '</button>' +
        '<svg class="node-chev w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</div></div>' +
        '<div class="node-panel" id="panel-' + esc(node.id) + '"></div>'
      );
    }).join('');

    card.querySelectorAll('.node-row').forEach(row => {
      row.addEventListener('click', () => togglePanel(net, row.dataset.nodeid));
    });
    card.querySelectorAll('[data-buildbtn]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const node = net.nodes.find(n => n.id === btn.dataset.buildbtn);
        if (!node) return;
        if (!node.device_target.profile) togglePanel(net, node.id, true);
        else buildNode(net, node);
      });
    });
  }

  function togglePanel(net, nodeId, forceOpen) {
    const prev = st.activeNodeId;
    if (prev && prev !== nodeId) closePanel(prev);

    const panel = document.getElementById('panel-' + nodeId);
    const row = document.querySelector('[data-nodeid="' + nodeId + '"]');
    if (!panel || !row) return;

    const isOpen = panel.classList.contains('open') && prev === nodeId;
    if (isOpen && !forceOpen) {
      closePanel(nodeId);
      st.activeNodeId = null;
    } else {
      const node = net.nodes.find(n => n.id === nodeId);
      if (!node) return;
      panel.innerHTML = panelHTML(net, node);
      wirePanelEvents(net, node);
      panel.classList.add('open');
      row.classList.add('active');
      row.querySelector('.node-chev').style.transform = 'rotate(180deg)';
      st.activeNodeId = nodeId;
    }
  }

  function closePanel(nodeId) {
    const panel = document.getElementById('panel-' + nodeId);
    const row = document.querySelector('[data-nodeid="' + nodeId + '"]');
    if (panel) panel.classList.remove('open');
    if (row) {
      row.classList.remove('active');
      const chev = row.querySelector('.node-chev');
      if (chev) chev.style.transform = '';
    }
  }

  function versionOpts(currentOverride, sharedVersion) {
    const sharedSel = document.getElementById('shared-version');
    const versions = sharedSel && sharedSel.options.length > 1
      ? Array.from(sharedSel.options).map(o => o.value)
      : BRANCHES.slice().reverse().concat(['SNAPSHOT']);
    const effectiveShared = sharedVersion
      || sharedSel?.value
      || '';
    const sharedLabel = 'Default (' + (effectiveShared || '…') + ')';
    return '<option value="">' + esc(sharedLabel) + '</option>' +
      versions.map(v =>
        '<option value="' + esc(v) + '"' + (currentOverride === v ? ' selected' : '') + '>' + esc(v) + '</option>'
      ).join('');
  }

  function versionRow(id, currentOverride, sharedVersion) {
    return '<div class="form-row"><label class="form-label" for="np-ver-' + id + '">OpenWrt version</label>' +
      '<select class="input-base" id="np-ver-' + id + '" style="max-width:200px">' +
      versionOpts(currentOverride, sharedVersion) +
      '</select></div>';
  }


  function panelHTML(net, node) {
    const isAp = node.overrides.AP_MODE === '1';
    const cfg = net.shared_config;
    const meshChecked = node.overrides.WIRELESS_MESH !== ''
      ? node.overrides.WIRELESS_MESH === '1'
      : cfg.WIRELESS_MESH === '1';
    const id = esc(node.id);
    const devTitle = esc(node.device_target.title || '');
    const verOverride = node.overrides.version || '';
    const effectiveVer = verOverride || node.device_target.version || cfg.shared_version || '';
    const devVer = esc(effectiveVer);
    const hasDevice = !!node.device_target.profile;
    const allPkgs = [...(node.device_target.default_packages || []), ...(node.device_target.device_packages || [])];
    const hasWifi = /\bwpad-?|\bhostapd|\bmac80211/.test(allPkgs.join(' '));
    const hasCt = allPkgs.some(p => /^ath10k-firmware-|^kmod-ath10k-ct/.test(p));
    const nonCtRow = hasCt
      ? '<div class="form-row"><span class="form-label">Non-CT ath10k</span>' +
        '<label class="toggle-label"><span class="toggle-wrap">' +
        '<input type="checkbox" class="toggle-input" id="np-nonct-' + id + '"' + (node.overrides.NON_CT_ATH10K === '1' ? ' checked' : '') + '>' +
        '<span class="toggle-track"></span><span class="toggle-thumb"></span></span>' +
        '<span class="toggle-text text-xs">Use non-CT ath10k firmware & driver</span></label></div>'
      : '';

    let fields;
    const deviceRow =
      '<div class="form-row" style="margin-top:0">' +
      '<label class="form-label">Device</label>' +
      '<div><div class="flex gap-2 items-center">' +
      '<input class="input-base" id="np-device-' + id + '" value="' + devTitle + '" placeholder="No device selected" readonly style="cursor:pointer;max-width:280px">' +
      '<button type="button" class="btn text-xs flex-shrink-0" data-pickdevice="' + id + '">Change</button>' +
      '</div>' +
      '<p class="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Required: ≥16MB flash, ≥128MB RAM</p>' +
      '</div></div>';

    if (!isAp) {
      fields = deviceRow +
        versionRow(id, verOverride, cfg.shared_version) +

        '<div class="form-row"><label class="form-label" for="np-name-' + id + '">Node name</label>' +
        '<input class="input-base" id="np-name-' + id + '" value="' + esc(node.name) + '" style="max-width:220px"></div>' +

        (hasWifi ? '<div class="form-row"><span class="form-label">Wireless mesh</span>' +
        '<label class="toggle-label"><span class="toggle-wrap">' +
        '<input type="checkbox" class="toggle-input" id="np-mesh-' + id + '"' + (meshChecked ? ' checked' : '') + '>' +
        '<span class="toggle-track"></span><span class="toggle-thumb"></span></span>' +
        '<span class="toggle-text text-xs">Enable 802.11s mesh backhaul</span></label></div>' : '') +
        nonCtRow;
    } else {
      fields = deviceRow +
        versionRow(id, verOverride, cfg.shared_version) +

        '<div class="form-row"><label class="form-label" for="np-name-' + id + '">Node name</label>' +
        '<input class="input-base" id="np-name-' + id + '" value="' + esc(node.name) + '" style="max-width:220px"></div>' +

        '<div class="form-row"><label class="form-label" for="np-apidx-' + id + '">AP index</label>' +
        '<div><input type="number" class="input-base" id="np-apidx-' + id + '" min="2" max="19" value="' + esc(node.overrides.AP_INDEX || '2') + '" style="max-width:90px">' +
        '</div></div>' +

        (hasWifi ? '<div class="form-row"><span class="form-label">Wireless mesh</span>' +
        '<label class="toggle-label"><span class="toggle-wrap">' +
        '<input type="checkbox" class="toggle-input" id="np-mesh-' + id + '"' + (meshChecked ? ' checked' : '') + '>' +
        '<span class="toggle-track"></span><span class="toggle-thumb"></span></span>' +
        '<span class="toggle-text text-xs">Enable 802.11s mesh backhaul</span></label></div>' : '') +
        nonCtRow;
    }

    return (
      '<div class="px-4 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800">' +
      '<p class="text-xs text-zinc-500 dark:text-zinc-400 mb-4">' +
      'These are device-specific settings. All other settings come from network config.' +
      '</p>' + fields +
      '<div class="flex gap-2 mt-4 flex-wrap items-center node-actions">' +
      '<button type="button" class="btn btn-primary text-xs" data-savenode="' + id + '"' +
      (hasDevice ? '' : ' disabled style="opacity:0.4;cursor:not-allowed"') + '>' +
      (hasDevice ? 'Build firmware' : 'Select a device first') + '</button>' +
      (hasDevice && node.last_build?.images?.length
        ? flashNoteHtml(node.last_build.images) +
          imageFilesHtml(node.last_build.images, node.last_build.bin_dir, node.last_build.asu_base)
        : '') +
      (isAp ? '<button type="button" class="btn text-xs ml-auto text-red-500 hover:text-red-400 border-red-800/40 hover:border-red-600/60" data-deletenode="' + id + '">Delete node</button>' : '') +
      '</div></div>'
    );
  }

  function wirePanelEvents(net, node) {
    const panel = document.getElementById('panel-' + node.id);
    if (!panel) return;

    const pickBtn = panel.querySelector('[data-pickdevice]');
    if (pickBtn) {
      pickBtn.addEventListener('click', () => openDevicePicker(net.id, node.id));
      panel.querySelector('#np-device-' + node.id)
        ?.addEventListener('click', () => openDevicePicker(net.id, node.id));
    }

    // Auto-save on any change or blur inside the panel
    panel.addEventListener('change', () => saveNodePanel(net, node));
    panel.addEventListener('blur', () => saveNodePanel(net, node), true);

    panel.querySelector('[data-savenode]')?.addEventListener('click', () => {
      saveNodePanel(net, node);
      buildNode(net, node);
    });

    panel.querySelector('[data-deletenode]')?.addEventListener('click', () => {
      if (!confirm('Delete "' + node.name + '"? This cannot be undone.')) return;
      net.nodes = net.nodes.filter(n => n.id !== node.id);
      net.updated_at = Date.now();
      saveNetworks();
      renderNodeList(net);
    });

  }

  function saveNodePanel(net, node) {
    const panel = document.getElementById('panel-' + node.id);
    if (!panel) return;

    const nameInp = panel.querySelector('#np-name-' + node.id);
    if (nameInp?.value.trim()) node.name = nameInp.value.trim();

    const verInp = panel.querySelector('#np-ver-' + node.id);
    if (verInp) node.overrides.version = verInp.value;

    const meshInp = panel.querySelector('#np-mesh-' + node.id);
    if (meshInp) node.overrides.WIRELESS_MESH = meshInp.checked ? '1' : '';

    const nonCtInp = panel.querySelector('#np-nonct-' + node.id);
    if (nonCtInp) node.overrides.NON_CT_ATH10K = nonCtInp.checked ? '1' : '';

    if (node.overrides.AP_MODE === '1') {
      const idxInp = panel.querySelector('#np-apidx-' + node.id);
      if (idxInp) node.overrides.AP_INDEX = idxInp.value || '2';
    }

    net.updated_at = Date.now();
    saveNetworks();

    const row = document.querySelector('[data-nodeid="' + node.id + '"]');
    if (row) {
      const nameEl = row.querySelector('.font-medium.text-sm');
      if (nameEl) nameEl.textContent = node.name;
      const subEl = row.querySelector('.text-xs.text-zinc-500');
      if (subEl) {
        const devLabel = node.device_target.title || 'No device selected';
        const isAp = node.overrides.AP_MODE === '1';
        const status = nodeLanIp(net, node) + (node.last_build ? ' · built ' + timeAgo(node.last_build.timestamp) : '');
        subEl.textContent = devLabel + ' · ' + (isAp ? 'AP #' + (node.overrides.AP_INDEX || '2') : 'Router') + ' · ' + status;
      }
    }
  }

  // ── Config form view ──────────────────────────────────────────────
  function showConfig(networkId, autoRename, isNew) {
    const net = getNet(networkId);
    if (!net) return;
    st.networkId = networkId;

    setHeaderSub(
      BC_SEP + bcBtn('Networks', () => { renderList(); showView('list'); }) +
      BC_SEP + bcBtn(net.name, () => showDetail(networkId)) +
      BC_SEP + 'Config'
    );
    document.getElementById('config-title').textContent = net.name;
    const allBuilt = net.nodes.every(n => n.last_build);
    const anyBuilt = net.nodes.some(n => n.last_build);
    document.getElementById('config-status-dot').className =
      'dot' + (allBuilt ? ' valid' : anyBuilt ? ' touched' : '');

    // Ensure display mode on entry
    document.getElementById('config-name-display')?.classList.remove('hidden');
    document.getElementById('config-name-edit')?.classList.add('hidden');

    loadConfig(net.shared_config);
    if (isNew) document.getElementById('card-target')?.classList.add('open');

    // Auto-save: teardown previous listeners, then attach fresh ones
    if (st.configSaveAbort) st.configSaveAbort.abort();
    st.configSaveAbort = new AbortController();
    const { signal } = st.configSaveAbort;
    let saveTimer;
    const autoSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        net.shared_config = readConfig();
        net.updated_at = Date.now();
        saveNetworks();
      }, 300);
    };
    const form = document.getElementById('config-form');
    form.addEventListener('change', autoSave, { signal });
    form.addEventListener('blur', autoSave, { capture: true, signal });

    document.getElementById('btn-save-config').onclick = () => {
      clearTimeout(saveTimer);
      net.shared_config = readConfig();
      net.updated_at = Date.now();
      saveNetworks();
      showDetail(networkId);
      const router = net.nodes.find(n => n.overrides.AP_MODE !== '1');
      if (router) setTimeout(() => togglePanel(net, router.id, true), 80);
    };

    showView('config');
    dpEnsureVersions();

    if (autoRename) setTimeout(() => enterRenameMode(net), 60);
  }

  function loadConfig(cfg) {
    function sv(id, v) {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = (v === '1' || v === true);
      else el.value = v || '';
    }
    function sr(name, v) {
      document.querySelectorAll('input[name="' + name + '"]').forEach(r => { r.checked = r.value === v; });
    }

    const verSel = document.getElementById('shared-version');
    if (verSel) verSel.dataset.desired = cfg.shared_version || '';

    sv('HOST_NAME', cfg.HOST_NAME);
    sv('ROOT_PASSWD', cfg.ROOT_PASSWD);
    sv('SSH_PUBLIC_KEY', cfg.SSH_PUBLIC_KEY);
    sr('SSH_PASSWD_AUTH', cfg.SSH_PASSWD_AUTH || '');
    // Timezone — mirrors history.js restore: update state + input via setTimezone
    if (cfg.ZONE_NAME && ui.setTimezone && !ui.setTimezone(cfg.ZONE_NAME)) {
      const tzInp = document.getElementById('timezone');
      if (tzInp) tzInp.value = cfg.ZONE_NAME;
    }
    sv('BASE_NET_PREFIX', cfg.BASE_NET_PREFIX);
    sv('DEFAULT_SUBNET', cfg.DEFAULT_SUBNET);
    sv('LAN_BASE_PREFIX', cfg.LAN_BASE_PREFIX); sv('LAN_VLAN_ID', cfg.LAN_VLAN_ID); sv('LAN_SUBNET', cfg.LAN_SUBNET);
    sv('GUEST_ENABLE', cfg.GUEST_ENABLE);
    sv('GUEST_BASE_PREFIX', cfg.GUEST_BASE_PREFIX); sv('GUEST_VLAN_ID', cfg.GUEST_VLAN_ID); sv('GUEST_SUBNET', cfg.GUEST_SUBNET);
    sv('IOT_ENABLE', cfg.IOT_ENABLE);
    sv('IOT_BASE_PREFIX', cfg.IOT_BASE_PREFIX); sv('IOT_VLAN_ID', cfg.IOT_VLAN_ID); sv('IOT_SUBNET', cfg.IOT_SUBNET);
    sv('IOT_INTERNET', cfg.IOT_INTERNET);
    sv('WG_ENABLE', cfg.WG_ENABLE);
    sv('LAN_WG_BASE_PREFIX', cfg.LAN_WG_BASE_PREFIX); sv('LAN_WG_VLAN_ID', cfg.LAN_WG_VLAN_ID); sv('LAN_WG_SUBNET', cfg.LAN_WG_SUBNET);
    sv('ADDITIONAL_VLAN_LIST', cfg.ADDITIONAL_VLAN_LIST);
    sv('WG_PRIVATE_KEY', cfg.WG_PRIVATE_KEY); sv('PEER_PUBLIC_KEY', cfg.PEER_PUBLIC_KEY);
    sv('ENDPOINT', cfg.ENDPOINT); sv('ENDPOINT_PORT', cfg.ENDPOINT_PORT);
    sv('PRESHARED_KEY', cfg.PRESHARED_KEY); sv('WG_IPV4', cfg.WG_IPV4);
    sv('WG_IPV6', cfg.WG_IPV6); sv('ALLOWED_IPS', cfg.ALLOWED_IPS);
    sr('wan_type', cfg.wan_type || 'dhcp');
    sv('PPPOE_USERNAME', cfg.PPPOE_USERNAME); sv('PPPOE_PASSWD', cfg.PPPOE_PASSWD);
    sv('WAN_MAC_ADDR', cfg.WAN_MAC_ADDR);
    sv('WAN_IS_TAGGED', cfg.WAN_IS_TAGGED); sv('WAN_VLAN_ID', cfg.WAN_VLAN_ID);
    sv('WAN_B_ENABLE', cfg.WAN_B_ENABLE); sv('WAN_B_VLAN_ID', cfg.WAN_B_VLAN_ID);
    sv('COUNTRY_CODE', cfg.COUNTRY_CODE);
    sv('DENSE_ENV', cfg.DENSE_ENV); sv('WIRELESS_MESH', cfg.WIRELESS_MESH);
    sv('MESH_ID', cfg.MESH_ID); sv('MESH_PASSWD', cfg.MESH_PASSWD);
    sv('LAN_WIFI_SSID', cfg.LAN_WIFI_SSID); sv('LAN_WIFI_PASSWD', cfg.LAN_WIFI_PASSWD);
    sv('GUEST_WIFI_SSID', cfg.GUEST_WIFI_SSID); sv('GUEST_WIFI_PASSWD', cfg.GUEST_WIFI_PASSWD);
    sv('IOT_WIFI_SSID', cfg.IOT_WIFI_SSID); sv('IOT_WIFI_PASSWD', cfg.IOT_WIFI_PASSWD);
    sv('LAN_WG_WIFI_SSID', cfg.LAN_WG_WIFI_SSID); sv('LAN_WG_WIFI_PASSWD', cfg.LAN_WG_WIFI_PASSWD);
    sv('CHANNEL_2G', cfg.CHANNEL_2G); sv('CHANNEL_5G', cfg.CHANNEL_5G); sv('CHANNEL_6G', cfg.CHANNEL_6G);
    sv('WIFI_LOG_LVL', cfg.WIFI_LOG_LVL);
    sv('DDNS_ENABLE', cfg.DDNS_ENABLE); sv('LOOKUP_HOSTNAME', cfg.LOOKUP_HOSTNAME);
    sv('CLOUDFLARE_API_KEY', cfg.CLOUDFLARE_API_KEY);
    sv('USB_TETHERING', cfg.USB_TETHERING); sv('CELLULAR_MODEM', cfg.CELLULAR_MODEM);
    sr('DNS_MODE', cfg.DNS_MODE || 'adguardhome');
    sv('BLOCK_DOT_DOQ', cfg.BLOCK_DOT_DOQ);
    sv('SOFTWARE_OFFLOAD', cfg.SOFTWARE_OFFLOAD);
    sv('HARDWARE_OFFLOAD', cfg.HARDWARE_OFFLOAD);
    sv('additional_packages', cfg.additional_packages);

    loadTable('portfwd-table', cfg.PORT_FORWARD_LIST || '');
    loadTable('ipv6-table', cfg.IPV6_SERVER_LIST || '');

    // Let ui.js refresh conditional visibility
    document.body.dispatchEvent(new Event('change', { bubbles: true }));
    // Sync hostname → SSID placeholders
    if (ui.$ && ui.$('#HOST_NAME')) syncSsidPlaceholders();
  }

  function readConfig() {
    function gv(id) {
      const el = document.getElementById(id);
      if (!el) return '';
      return el.type === 'checkbox' ? (el.checked ? '1' : '') : (el.value || '');
    }
    function gr(name) {
      const el = document.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : '';
    }
    const tzInp = document.getElementById('timezone');
    return {
      shared_version: gv('shared-version'),
      HOST_NAME: gv('HOST_NAME'), ROOT_PASSWD: gv('ROOT_PASSWD'),
      SSH_PUBLIC_KEY: gv('SSH_PUBLIC_KEY'), SSH_PASSWD_AUTH: gr('SSH_PASSWD_AUTH'),
      ...(ui.collectTimezone ? ui.collectTimezone() : { ZONE_NAME: tzInp ? tzInp.value : '', TIME_ZONE: '' }),
      BASE_NET_PREFIX: gv('BASE_NET_PREFIX'), DEFAULT_SUBNET: gv('DEFAULT_SUBNET'),
      LAN_BASE_PREFIX: gv('LAN_BASE_PREFIX'), LAN_VLAN_ID: gv('LAN_VLAN_ID'), LAN_SUBNET: gv('LAN_SUBNET'),
      GUEST_ENABLE: gv('GUEST_ENABLE'),
      GUEST_BASE_PREFIX: gv('GUEST_BASE_PREFIX'), GUEST_VLAN_ID: gv('GUEST_VLAN_ID'), GUEST_SUBNET: gv('GUEST_SUBNET'),
      IOT_ENABLE: gv('IOT_ENABLE'),
      IOT_BASE_PREFIX: gv('IOT_BASE_PREFIX'), IOT_VLAN_ID: gv('IOT_VLAN_ID'), IOT_SUBNET: gv('IOT_SUBNET'),
      IOT_INTERNET: gv('IOT_INTERNET'),
      WG_ENABLE: gv('WG_ENABLE'),
      LAN_WG_BASE_PREFIX: gv('LAN_WG_BASE_PREFIX'), LAN_WG_VLAN_ID: gv('LAN_WG_VLAN_ID'), LAN_WG_SUBNET: gv('LAN_WG_SUBNET'),
      ADDITIONAL_VLAN_LIST: gv('ADDITIONAL_VLAN_LIST'),
      WG_PRIVATE_KEY: gv('WG_PRIVATE_KEY'), PEER_PUBLIC_KEY: gv('PEER_PUBLIC_KEY'),
      ENDPOINT: gv('ENDPOINT'), ENDPOINT_PORT: gv('ENDPOINT_PORT'),
      PRESHARED_KEY: gv('PRESHARED_KEY'), WG_IPV4: gv('WG_IPV4'),
      WG_IPV6: gv('WG_IPV6'), ALLOWED_IPS: gv('ALLOWED_IPS'),
      wan_type: gr('wan_type'), PPPOE_USERNAME: gv('PPPOE_USERNAME'), PPPOE_PASSWD: gv('PPPOE_PASSWD'),
      WAN_MAC_ADDR: gv('WAN_MAC_ADDR'),
      WAN_IS_TAGGED: gv('WAN_IS_TAGGED'), WAN_VLAN_ID: gv('WAN_VLAN_ID'),
      WAN_B_ENABLE: gv('WAN_B_ENABLE'), WAN_B_VLAN_ID: gv('WAN_B_VLAN_ID'),
      COUNTRY_CODE: gv('COUNTRY_CODE').toUpperCase(),
      DENSE_ENV: gv('DENSE_ENV'), WIRELESS_MESH: gv('WIRELESS_MESH'),
      MESH_ID: gv('MESH_ID'), MESH_PASSWD: gv('MESH_PASSWD'),
      LAN_WIFI_SSID: gv('LAN_WIFI_SSID'), LAN_WIFI_PASSWD: gv('LAN_WIFI_PASSWD'),
      GUEST_WIFI_SSID: gv('GUEST_WIFI_SSID'), GUEST_WIFI_PASSWD: gv('GUEST_WIFI_PASSWD'),
      IOT_WIFI_SSID: gv('IOT_WIFI_SSID'), IOT_WIFI_PASSWD: gv('IOT_WIFI_PASSWD'),
      LAN_WG_WIFI_SSID: gv('LAN_WG_WIFI_SSID'), LAN_WG_WIFI_PASSWD: gv('LAN_WG_WIFI_PASSWD'),
      CHANNEL_2G: gv('CHANNEL_2G'), CHANNEL_5G: gv('CHANNEL_5G'), CHANNEL_6G: gv('CHANNEL_6G'),
      WIFI_LOG_LVL: gv('WIFI_LOG_LVL'),
      PORT_FORWARD_LIST: ui.serializeRows ? ui.serializeRows('portfwd') : readTable('portfwd-table'),
      IPV6_SERVER_LIST:  ui.serializeRows ? ui.serializeRows('ipv6')    : readTable('ipv6-table'),
      DDNS_ENABLE: gv('DDNS_ENABLE'), LOOKUP_HOSTNAME: gv('LOOKUP_HOSTNAME'),
      CLOUDFLARE_API_KEY: gv('CLOUDFLARE_API_KEY'),
      USB_TETHERING: gv('USB_TETHERING'), CELLULAR_MODEM: gv('CELLULAR_MODEM'),
      DNS_MODE: gr('DNS_MODE'), BLOCK_DOT_DOQ: gv('BLOCK_DOT_DOQ'),
      SOFTWARE_OFFLOAD: gv('SOFTWARE_OFFLOAD'), HARDWARE_OFFLOAD: gv('HARDWARE_OFFLOAD'),
      additional_packages: gv('additional_packages'),
    };
  }

  function syncSsidPlaceholders() {
    const name = (document.getElementById('HOST_NAME')?.value || '').trim() || 'WrtNova';
    [
      ['LAN_WIFI_SSID', name],
      ['GUEST_WIFI_SSID', name + '_Guest'],
      ['IOT_WIFI_SSID', name + '_IoT'],
      ['LAN_WG_WIFI_SSID', name + '_VPN'],
    ].forEach(([id, ph]) => {
      const el = document.getElementById(id);
      if (el) el.placeholder = ph;
    });
  }

  // ── Dynamic tables (load with initial values; save via ui.serializeRows) ─
  function loadTable(tableId, listStr) {
    const tbody = document.querySelector('#' + tableId + ' tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const lines = listStr.trim().split('\n').filter(l => l.trim() && l.includes('|'));
    if (!lines.length) {
      if (tableId === 'ipv6-table') addTableRow(tableId, 'docker-host', '20', '80 443');
      else addTableRow(tableId);
      return;
    }
    lines.forEach(line => {
      const p = line.split('|').map(s => s.trim());
      addTableRow(tableId, p[0], p[1], p[2]);
    });
  }

  function addTableRow(tableId, host, octet, ports) {
    const tbody = document.querySelector('#' + tableId + ' tbody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Hostname"><input type="text" data-col="host" class="input-base" placeholder="hostname" value="' + esc(host || '') + '"></td>' +
      '<td data-label="Last octet"><input type="number" data-col="octet" class="input-base" min="2" max="254" placeholder="20" value="' + esc(octet || '') + '"></td>' +
      '<td data-label="Ports"><input type="text" data-col="ports" class="input-base" placeholder="80 443" value="' + esc(ports || '') + '"></td>' +
      '<td><button class="btn btn-icon" type="button" aria-label="Remove row">×</button></td>';
    tr.querySelector('button').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
  }

  function readTable(tableId) {
    const lines = [];
    document.querySelectorAll('#' + tableId + ' tbody tr').forEach(tr => {
      const h = tr.querySelector('[data-col="host"]').value.trim();
      const o = tr.querySelector('[data-col="octet"]').value.trim();
      const p = tr.querySelector('[data-col="ports"]').value.trim();
      if (h || o) lines.push('\t' + h + ' | ' + o + ' | ' + p);
    });
    return lines.length ? '\n' + lines.join('\n') + '\n' : '';
  }

  // ── New network ───────────────────────────────────────────────────
  const NAME_SUGGESTIONS = ["Office Network", "Friend's House", "Lab Network", "Cabin", "Parent's Home", "Vacation House"];

  function showNewNetwork() {
    if (st.networks.length === 0) {
      createAndOpenNetwork('My Home', false);
      return;
    }
    const usedNames = new Set(st.networks.map(n => n.name));
    const autoName = NAME_SUGGESTIONS.find(s => !usedNames.has(s)) || 'Network ' + (st.networks.length + 1);
    createAndOpenNetwork(autoName, true);
  }

  function createAndOpenNetwork(name, autoRename) {
    const net = {
      id: 'net_' + uid(), name,
      shared_config: defaultConfig(),
      nodes: [defaultRouterNode()],
      created_at: Date.now(), updated_at: Date.now(),
    };
    st.networks.push(net);
    saveNetworks();
    showConfig(net.id, autoRename, true);
  }

  // ── Rename (inline in config view) ───────────────────────────────
  function enterRenameMode(net) {
    const display = document.getElementById('config-name-display');
    const edit = document.getElementById('config-name-edit');
    const input = document.getElementById('config-name-input');
    const chips = document.getElementById('config-name-chips');
    if (!display || !edit || !input) return;

    display.classList.add('hidden');
    edit.classList.remove('hidden');
    input.value = net.name;
    setTimeout(() => { input.select(); input.focus(); }, 30);

    const usedNames = new Set(st.networks.filter(n => n.id !== net.id).map(n => n.name));
    const available = NAME_SUGGESTIONS.filter(s => !usedNames.has(s));
    chips.innerHTML = available.map(s =>
      '<button type="button" class="chip cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors" data-suggest="' + esc(s) + '">' + esc(s) + '</button>'
    ).join('');
    chips.querySelectorAll('[data-suggest]').forEach(btn => {
      btn.addEventListener('click', () => { input.value = btn.dataset.suggest; input.focus(); });
    });
  }

  function exitRenameMode(net, save) {
    const display = document.getElementById('config-name-display');
    const edit = document.getElementById('config-name-edit');
    const input = document.getElementById('config-name-input');
    if (!display || !edit) return;

    if (save && input) {
      const newName = input.value.trim() || net.name;
      net.name = newName;
      net.updated_at = Date.now();
      saveNetworks();
      document.getElementById('config-title').textContent = newName;
      setHeaderSub(
        BC_SEP + bcBtn('Networks', () => { renderList(); showView('list'); }) +
        BC_SEP + bcBtn(newName, () => showDetail(net.id)) +
        BC_SEP + 'Config'
      );
    }
    edit.classList.add('hidden');
    display.classList.remove('hidden');
  }

  function enterDetailRenameMode(net) {
    const display = document.getElementById('detail-name-display');
    const edit = document.getElementById('detail-name-edit');
    const input = document.getElementById('detail-name-input');
    if (!display || !edit || !input) return;
    display.classList.add('hidden');
    edit.classList.remove('hidden');
    input.value = net.name;
    setTimeout(() => { input.select(); input.focus(); }, 30);
  }

  function exitDetailRenameMode(net, save) {
    const display = document.getElementById('detail-name-display');
    const edit = document.getElementById('detail-name-edit');
    const input = document.getElementById('detail-name-input');
    if (!display || !edit) return;
    if (save && input) {
      const newName = input.value.trim() || net.name;
      net.name = newName;
      net.updated_at = Date.now();
      saveNetworks();
      document.getElementById('detail-title-text').textContent = newName;
      setHeaderSub(BC_SEP + bcBtn('Networks', () => { renderList(); showView('list'); }) + BC_SEP + esc(newName));
    }
    edit.classList.add('hidden');
    display.classList.remove('hidden');
  }

  function showAddAp(networkId) {
    const net = getNet(networkId);
    if (!net) return;
    const idx = nextApIdx(net);
    const node = defaultApNode(idx);
    net.nodes.push(node);
    net.updated_at = Date.now();
    saveNetworks();
    renderNodeList(net);
    setTimeout(() => togglePanel(net, node.id, true), 80);
  }

  function confirmDelete(networkId) {
    const net = getNet(networkId);
    if (!net) return;
    document.getElementById('modal-delete-name').textContent = net.name;
    document.getElementById('btn-confirm-delete').onclick = () => {
      st.networks = st.networks.filter(n => n.id !== networkId);
      saveNetworks();
      document.getElementById('modal-delete').close();
      renderList();
      showView('list');
    };
    document.getElementById('modal-delete').showModal();
  }

  // ── Build ─────────────────────────────────────────────────────────
  function buildNode(net, node) {
    if (!node.device_target.profile) return;
    if (nodeBuilds.has(node.id)) return;

    const panel = document.getElementById('panel-' + node.id);
    if (!panel?.classList.contains('open')) {
      togglePanel(net, node.id, true);
      setTimeout(() => buildNode(net, node), 80);
      return;
    }

    const actEl = panel.querySelector('.node-actions');
    if (!actEl) return;
    showPanelProgress(actEl, 2, 'Preparing…');

    const t = node.device_target;
    const extraPkgs = (net.shared_config.additional_packages || '').split(/[\s,]+/).filter(Boolean);
    const rootPasswd = node.overrides.ROOT_PASSWD || net.shared_config.ROOT_PASSWD || '';
    const effectiveVersion = node.overrides.version || t.version || net.shared_config.shared_version;

    const getVersionedTarget = async () => {
      if (!node.overrides.version || node.overrides.version === t.version)
        return { version_code: t.version_code, default_packages: t.default_packages, device_packages: t.device_packages };
      const cacheKey = 'wrtnova_profiles_' + effectiveVersion + '_' + t.target;
      let data = dpCacheGet(cacheKey);
      if (!data) {
        const res = await fetch(dpUrl(effectiveVersion) + '/targets/' + t.target + '/profiles.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error('Failed to fetch profiles for ' + effectiveVersion);
        data = await res.json();
        dpCacheSet(cacheKey, data);
      }
      const dev = (data.profiles || {})[t.profile] || {};
      return {
        version_code: data.version_code || '',
        default_packages: data.default_packages || t.default_packages,
        device_packages: dev.device_packages || t.device_packages,
      };
    };

    Promise.all([bcryptHash(rootPasswd), getVersionedTarget()])
      .then(async ([adguardHash, vt]) => {
      const payload = {
        profile: t.profile, target: t.target,
        version: effectiveVersion,
        version_code: vt.version_code,
        default_packages: vt.default_packages,
        device_packages: vt.device_packages,
        device_title: t.title,
        shared_config: ui.stripSensitive(net.shared_config),
        node_overrides: ui.stripSensitive(node.overrides),
        additional_packages: extraPkgs,
      };
      showPanelProgress(actEl, 2, 'Submitting build…');
      let resp;
      try {
        const r = await fetch('/api/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        resp = await r.json();
        if (!r.ok) throw new Error(
          [resp.error, resp.detail, resp.message].filter(Boolean).join(' — ') || 'HTTP ' + r.status
        );
      } catch (e) {
        showPanelError(panelActEl(node.id) || actEl, 'Build failed: ' + e.message, () => buildNode(net, node));
        return;
      }

      if (!resp.packages || !resp.asu_url) {
        showPanelError(panelActEl(node.id) || actEl, 'Unexpected response from /api/build', () => buildNode(net, node));
        return;
      }

      let wrtnovaBody;
      try {
        wrtnovaBody = await ui.fetchWrtnovaBody();
      } catch (e) {
        showPanelError(panelActEl(node.id) || actEl, 'Build failed: ' + e.message, () => buildNode(net, node));
        return;
      }

      const fullCfg = mergeNodeConfig(net.shared_config, node.overrides);
      if (adguardHash) fullCfg.ADGUARD_PASSWD = adguardHash;
      const asuBody = {
        profile: t.profile, target: t.target,
        version: effectiveVersion, version_code: vt.version_code,
        packages: resp.packages,
        defaults: ui.assembleScript(fullCfg, wrtnovaBody),
        diff_packages: true, client: 'wrtnova/1.0',
      };

      showPanelProgress(panelActEl(node.id) || actEl, 8, 'Submitting to build server…');
      let asuR, asuData;
      try {
        asuR = await fetch(resp.asu_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(asuBody),
        });
        asuData = await asuR.json();
        if (asuR.status !== 200 && asuR.status !== 202) throw new Error(
          asuData.detail || ('ASU HTTP ' + asuR.status)
        );
      } catch (e) {
        showPanelError(panelActEl(node.id) || actEl, 'Build failed: ' + e.message, () => buildNode(net, node));
        return;
      }

      const asuBase = resp.asu_url.replace('/api/v1/build', '');

      if (asuR.status === 200) {
        finishNodeBuild(net, node, panelActEl(node.id) || actEl, asuData, asuBase);
        return;
      }

      if (!asuData.request_hash) {
        showPanelError(panelActEl(node.id) || actEl, 'Unexpected response from build server', () => buildNode(net, node));
        return;
      }
      pollNodeBuild(net, node, panelActEl(node.id) || actEl, asuData.request_hash, asuBase);
    })
    .catch(err => showPanelError(panelActEl(node.id) || actEl,
      'Build failed: ' + err.message, () => buildNode(net, node)));
  }

  function pollNodeBuild(net, node, actEl, hash, asuBase) {
    const base = (asuBase || activeAsu).replace(/\/+$/, '');
    let tries = 0;
    let pct = 15;
    const interval = setInterval(async () => {
      tries++;
      try {
        const r = await fetch(base + '/api/v1/build/' + hash, { cache: 'no-cache' });
        const data = await r.json();
        if (r.status === 202) {
          if (data.queue_position != null && data.queue_position > 0) {
            showPanelProgress(panelActEl(node.id) || actEl, 8, 'In build queue (#' + data.queue_position + ')');
          } else {
            pct = Math.min(94, pct + (pct < 85 ? 8 : 2));
            showPanelProgress(panelActEl(node.id) || actEl, pct, 'Building…');
          }
          return;
        }
        clearInterval(interval);
        nodeBuilds.delete(node.id);
        const el = panelActEl(node.id) || actEl;
        if (r.status === 200) {
          showPanelProgress(el, 100, 'Build complete!');
          setTimeout(() => finishNodeBuild(net, node, panelActEl(node.id) || el, data, base), 1500);
        } else {
          showPanelError(el, 'Build failed: ' + (data.detail || 'HTTP ' + r.status), () => buildNode(net, node));
        }
      } catch (e) {
        if (tries > 200) {
          clearInterval(interval);
          nodeBuilds.delete(node.id);
          showPanelError(panelActEl(node.id) || actEl, 'Polling failed: ' + e.message, () => buildNode(net, node));
        }
      }
    }, 5000);
    nodeBuilds.set(node.id, { interval });
  }

  function finishNodeBuild(net, node, actEl, data, asuBase) {
    const base = (asuBase || activeAsu).replace(/\/+$/, '');
    const images = data.images || [];
    const sys = images.find(i => i.type === 'sysupgrade') || images.find(i => i.type === 'factory') || images[0];
    const firmwareUrl = data.firmware_url || (sys && data.bin_dir
      ? base + '/store/' + data.bin_dir + '/' + sys.name : null);

    node.last_build = { firmware_url: firmwareUrl, images, bin_dir: data.bin_dir || '', asu_base: base, timestamp: Date.now() };
    net.updated_at = Date.now();
    saveNetworks();

    const row = document.querySelector('[data-nodeid="' + node.id + '"]');
    if (row) {
      const dot = row.querySelector('.dot');
      if (dot) dot.className = nodeDotClass(node) + ' flex-shrink-0';
      const bb = row.querySelector('[data-buildbtn]');
      if (bb) { bb.className = 'btn text-xs py-0.5 px-2'; bb.textContent = 'Build'; }
      const sub = row.querySelector('.text-xs.text-zinc-500');
      if (sub) {
        const isAp = node.overrides.AP_MODE === '1';
        sub.textContent = (node.device_target.title || '') + ' · ' +
          (isAp ? 'AP #' + (node.overrides.AP_INDEX || '2') : 'Router') +
          ' · built ' + timeAgo(node.last_build.timestamp);
      }
    }
    showPanelDone(actEl, firmwareUrl, images, data.bin_dir || '', base, () => buildNode(net, node));
    updateBuildAllRow(node.id, firmwareUrl, null);
  }

  function buildAll(net) {
    const ready = net.nodes.filter(n => n.device_target.profile);
    if (!ready.length) { alert('No nodes have a device selected yet.'); return; }

    const progressEl = document.getElementById('build-all-progress');
    if (!progressEl) return;

    progressEl.classList.remove('hidden');
    let done = 0;
    progressEl.innerHTML =
      '<div class="card p-4 mt-4">' +
      '<p class="ba-title text-xs font-semibold mb-3 text-zinc-500 dark:text-zinc-400">Building ' +
        ready.length + ' node' + (ready.length > 1 ? 's' : '') + '…</p>' +
      '<div class="space-y-3">' +
      ready.map(n =>
        '<div id="ba-row-' + esc(n.id) + '" class="flex items-center gap-3">' +
        '<span class="text-xs font-medium w-28 truncate flex-shrink-0">' + esc(n.name) + '</span>' +
        '<div class="flex-1 min-w-0">' +
        '<div class="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded overflow-hidden">' +
        '<div class="ba-bar h-full bg-blue-500 transition-all duration-500" style="width:2%"></div></div>' +
        '</div>' +
        '<div class="ba-link flex-shrink-0 w-20 text-right"></div>' +
        '</div>'
      ).join('') +
      '</div></div>';

    // Pre-warm the wrtnova.sh cache so all nodes share one fetch instead of N.
    ui.fetchWrtnovaBody().catch(() => {});

    ready.forEach(node => {
      if (nodeBuilds.has(node.id)) return;
      startBuildAllNode(net, node, () => {
        done++;
        if (done === ready.length) {
          const title = progressEl.querySelector('.ba-title');
          if (title) title.textContent = 'All ' + ready.length + ' nodes built';
        }
      });
    });
  }

  function updateBuildAllRow(nodeId, firmwareUrl, errMsg) {
    const row = document.getElementById('ba-row-' + nodeId);
    if (!row) return;
    const bar = row.querySelector('.ba-bar');
    const label = row.querySelector('.ba-label');
    const link = row.querySelector('.ba-link');
    if (errMsg) {
      if (bar) { bar.style.width = '100%'; bar.style.background = '#ef4444'; }
      if (link) link.innerHTML = '<span class="text-xs text-red-500 dark:text-red-400" title="' + esc(errMsg) + '">Error</span>';
    } else {
      if (bar) { bar.style.width = '100%'; bar.style.background = '#22c55e'; }
      if (link && firmwareUrl)
        link.innerHTML = '<a href="' + esc(firmwareUrl) + '" target="_blank" class="text-xs text-blue-500 hover:underline">Download</a>';
    }
  }

  function updateBuildAllProgress(nodeId, pct) {
    const row = document.getElementById('ba-row-' + nodeId);
    if (!row) return;
    const bar = row.querySelector('.ba-bar');
    if (bar) bar.style.width = pct + '%';
  }

  async function startBuildAllNode(net, node, onComplete) {
    const t = node.device_target;
    const extraPkgs = (net.shared_config.additional_packages || '').split(/[\s,]+/).filter(Boolean);
    const rootPasswd = node.overrides.ROOT_PASSWD || net.shared_config.ROOT_PASSWD || '';
    const adguardHash = await bcryptHash(rootPasswd);

    const effectiveVersion = node.overrides.version || t.version || net.shared_config.shared_version;
    let version_code = t.version_code;
    let default_packages = t.default_packages;
    let device_packages = t.device_packages;
    if (node.overrides.version && node.overrides.version !== t.version) {
      try {
        const cacheKey = 'wrtnova_profiles_' + effectiveVersion + '_' + t.target;
        let data = dpCacheGet(cacheKey);
        if (!data) {
          const res = await fetch(dpUrl(effectiveVersion) + '/targets/' + t.target + '/profiles.json', { cache: 'no-cache' });
          if (!res.ok) throw new Error('Failed to fetch profiles for ' + effectiveVersion);
          data = await res.json();
          dpCacheSet(cacheKey, data);
        }
        version_code = data.version_code || '';
        default_packages = data.default_packages || t.default_packages;
        device_packages = (data.profiles?.[t.profile]?.device_packages) || t.device_packages;
      } catch (e) {
        updateBuildAllRow(node.id, null, e.message);
        onComplete();
        return;
      }
    }

    const payload = {
      profile: t.profile, target: t.target,
      version: effectiveVersion,
      version_code,
      default_packages,
      device_packages,
      device_title: t.title,
      shared_config: ui.stripSensitive(net.shared_config),
      node_overrides: ui.stripSensitive(node.overrides),
      additional_packages: extraPkgs,
    };

    let resp;
    try {
      const r = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      resp = await r.json();
      if (!r.ok) throw new Error(
        [resp.error, resp.detail, resp.message].filter(Boolean).join(' — ') || 'HTTP ' + r.status
      );
    } catch (e) {
      updateBuildAllRow(node.id, null, e.message);
      onComplete();
      return;
    }

    if (!resp.packages || !resp.asu_url) {
      updateBuildAllRow(node.id, null, 'Unexpected response from /api/build');
      onComplete();
      return;
    }

    let wrtnovaBody;
    try {
      wrtnovaBody = await ui.fetchWrtnovaBody();
    } catch (e) {
      updateBuildAllRow(node.id, null, 'Build failed: ' + e.message);
      onComplete();
      return;
    }

    const fullCfg = mergeNodeConfig(net.shared_config, node.overrides);
    if (adguardHash) fullCfg.ADGUARD_PASSWD = adguardHash;
    const asuBody = {
      profile: t.profile, target: t.target,
      version: effectiveVersion, version_code,
      packages: resp.packages,
      defaults: ui.assembleScript(fullCfg, wrtnovaBody),
      diff_packages: true, client: 'wrtnova/1.0',
    };

    let asuR, asuData;
    try {
      asuR = await fetch(resp.asu_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asuBody),
      });
      asuData = await asuR.json();
      if (asuR.status !== 200 && asuR.status !== 202) throw new Error(
        asuData.detail || ('ASU HTTP ' + asuR.status)
      );
    } catch (e) {
      updateBuildAllRow(node.id, null, 'Build failed: ' + e.message);
      onComplete();
      return;
    }

    const asuBase = resp.asu_url.replace('/api/v1/build', '');

    if (asuR.status === 200) {
      finishBuildAllNode(net, node, asuData, asuBase);
      onComplete();
      return;
    }

    if (!asuData.request_hash) {
      updateBuildAllRow(node.id, null, 'Unexpected response from build server');
      onComplete();
      return;
    }
    pollBuildAllNode(net, node, asuData.request_hash, asuBase, onComplete);
  }

  function pollBuildAllNode(net, node, hash, asuBase, onComplete) {
    const base = (asuBase || activeAsu).replace(/\/+$/, '');
    let tries = 0;
    let pct = 15;
    const interval = setInterval(async () => {
      tries++;
      try {
        const r = await fetch(base + '/api/v1/build/' + hash, { cache: 'no-cache' });
        const data = await r.json();
        if (r.status === 202) {
          if (data.queue_position != null && data.queue_position > 0) {
            updateBuildAllProgress(node.id, 8, 'Queue #' + data.queue_position);
          } else {
            pct = Math.min(94, pct + (pct < 85 ? 8 : 2));
            updateBuildAllProgress(node.id, pct, 'Building…');
          }
          return;
        }
        clearInterval(interval);
        nodeBuilds.delete(node.id);
        if (r.status === 200) {
          updateBuildAllProgress(node.id, 100, 'Done');
          finishBuildAllNode(net, node, data, base);
        } else {
          updateBuildAllRow(node.id, null, data.detail || 'HTTP ' + r.status);
        }
        onComplete();
      } catch (e) {
        if (tries > 200) {
          clearInterval(interval);
          nodeBuilds.delete(node.id);
          updateBuildAllRow(node.id, null, 'Polling failed');
          onComplete();
        }
      }
    }, 5000);
    nodeBuilds.set(node.id, { interval });
  }

  function finishBuildAllNode(net, node, data, asuBase) {
    const base = (asuBase || activeAsu).replace(/\/+$/, '');
    const images = data.images || [];
    const sys = images.find(i => i.type === 'sysupgrade') || images.find(i => i.type === 'factory') || images[0];
    const firmwareUrl = data.firmware_url || (sys && data.bin_dir
      ? base + '/store/' + data.bin_dir + '/' + sys.name : null);
    node.last_build = { firmware_url: firmwareUrl, images, bin_dir: data.bin_dir || '', asu_base: base, timestamp: Date.now() };
    net.updated_at = Date.now();
    saveNetworks();
    updateBuildAllRow(node.id, firmwareUrl, null);
    const row = document.querySelector('[data-nodeid="' + node.id + '"]');
    if (row) {
      const dot = row.querySelector('.dot');
      if (dot) dot.className = nodeDotClass(node) + ' flex-shrink-0';
    }
  }

  // ── Device picker ─────────────────────────────────────────────────
  const DP = {
    devicesByTitle: null,
    currentVersion: '',
    targetNetworkId: null,
    targetNodeId: null,
  };

  function dpCacheGet(k) {
    try { const x = JSON.parse(localStorage.getItem(k)||'null'); return x&&(Date.now()-x.ts<CACHE_TTL)?x.data:null; } catch(e){return null;}
  }
  function dpCacheSet(k, d) {
    try { localStorage.setItem(k, JSON.stringify({data:d, ts:Date.now()})); } catch(e){}
  }
  function dpUrl(v) { return v==='SNAPSHOT' ? DL+'/snapshots' : DL+'/releases/'+v; }
  function pickLatestN(list, branch, n) {
    return list.filter(v => v.startsWith(branch + '.')).sort((a, b) => {
      const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pb[i]||0)-(pa[i]||0); if (d) return d; }
      return 0;
    }).slice(0, n).reverse();
  }
  function titleFor(p) {
    const t=(p.titles&&p.titles[0])||{};
    if(t.title) return t.title.trim();
    return [t.vendor,t.model,t.variant].filter(Boolean).join(' ').trim();
  }

  async function dpEnsureVersions() {
    const sharedSel = document.getElementById('shared-version');
    if (sharedSel && sharedSel.options.length > 1) return; // already populated

    let data = dpCacheGet('wrtnova_versions');
    if (!data) {
      try {
        const res = await fetch(DL + '/.versions.json', { cache: 'no-cache' });
        if (res.ok) { data = await res.json(); dpCacheSet('wrtnova_versions', data); }
      } catch(e) {}
    }
    if (!data) return;

    const picks = [];
    BRANCHES.forEach(b => picks.push(...pickLatestN(data.versions_list || [], b, 2)));
    picks.push('SNAPSHOT');

    if (sharedSel) {
      sharedSel.innerHTML = '';
      picks.forEach(v => {
        const o = document.createElement('option');
        o.value = v; o.textContent = v;
        sharedSel.appendChild(o);
      });
    }

    const desired = sharedSel?.dataset.desired;
    const best = (desired && picks.includes(desired)) ? desired
                 : (data.stable_version && picks.includes(data.stable_version)) ? data.stable_version
                 : picks.filter(v => v !== 'SNAPSHOT').pop() || picks[0] || '';
    if (sharedSel) sharedSel.value = best;
    DP.currentVersion = best;
  }

  async function dpLoadOverview(version) {
    const key = 'wrtnova_overview_' + version;
    let data = dpCacheGet(key);
    if (!data) {
      const res = await fetch(dpUrl(version) + '/.overview.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('Overview fetch failed (' + res.status + ')');
      data = await res.json();
      dpCacheSet(key, data);
    }
    const titles = {}, dups = new Set();
    (data.profiles || []).forEach(p => { const t = titleFor(p); if (titles[t]) dups.add(t); titles[t] = p; });
    DP.devicesByTitle = {};
    (data.profiles || []).forEach(p => {
      const t = titleFor(p);
      const k = dups.has(t) ? t + ' (' + p.target + ')' : t;
      DP.devicesByTitle[k] = p;
    });
  }

  function dpSearch(q) {
    if (!DP.devicesByTitle) return [];
    const qs = q.toLowerCase().split(/\s+/).filter(Boolean);
    return Object.keys(DP.devicesByTitle).filter(t => {
      const lc = t.toLowerCase();
      return qs.every(w => lc.includes(w));
    }).sort();
  }

  function dpRenderList(q) {
    const list = document.getElementById('dp-list');
    if (!list) return;
    const items = q ? dpSearch(q) : Object.keys(DP.devicesByTitle || {}).sort();
    list.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'px-4 py-8 text-center text-zinc-400 text-sm';
      empty.textContent = q ? 'No devices found.' : (DP.devicesByTitle ? 'No devices loaded.' : 'Loading…');
      list.appendChild(empty);
      return;
    }
    items.slice(0, 80).forEach(title => {
      const d = document.createElement('div');
      d.className = 'px-4 py-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800 text-sm';
      d.textContent = title;
      d.addEventListener('click', () => dpPickDevice(title));
      list.appendChild(d);
    });
  }

  async function openDevicePicker(networkId, nodeId) {
    DP.targetNetworkId = networkId;
    DP.targetNodeId = nodeId;

    const modal = document.getElementById('modal-device-picker');
    const status = document.getElementById('dp-status');
    const search = document.getElementById('dp-search');

    search.value = '';
    document.getElementById('dp-list').innerHTML = '';
    status.textContent = 'Loading…';
    status.classList.remove('hidden');
    modal.showModal();
    setTimeout(() => search?.focus(), 60);

    // Prefer per-node version override, then device's selected version, then shared
    const net = getNet(networkId);
    const node = net?.nodes.find(n => n.id === nodeId);
    const preferVer = node?.overrides?.version
      || node?.device_target.version
      || document.getElementById('shared-version')?.value
      || '';
    if (preferVer) DP.currentVersion = preferVer;

    try {
      await dpEnsureVersions();
      if (!DP.currentVersion) DP.currentVersion = document.getElementById('shared-version')?.value || '';
      await dpLoadOverview(DP.currentVersion);
      status.classList.add('hidden');
      dpRenderList('');
    } catch(e) {
      status.textContent = 'Error loading devices: ' + e.message;
    }
  }

  async function dpPickDevice(title) {
    const profile = DP.devicesByTitle?.[title];
    if (!profile) return;
    const status = document.getElementById('dp-status');
    status.textContent = 'Loading device details…';
    status.classList.remove('hidden');
    try {
      const cacheKey = 'wrtnova_profiles_' + DP.currentVersion + '_' + profile.target;
      let data = dpCacheGet(cacheKey);
      if (!data) {
        const res = await fetch(dpUrl(DP.currentVersion) + '/targets/' + profile.target + '/profiles.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error('Profiles fetch failed (' + res.status + ')');
        data = await res.json();
        dpCacheSet(cacheKey, data);
      }
      const dev = (data.profiles || {})[profile.id] || {};
      const target = {
        title, profile: profile.id, target: profile.target,
        version: DP.currentVersion, version_code: data.version_code || '',
        default_packages: data.default_packages || [],
        device_packages: dev.device_packages || [],
      };
      const net = getNet(DP.targetNetworkId);
      const node = net?.nodes.find(n => n.id === DP.targetNodeId);
      if (node) {
        node.device_target = target;
        const newAllPkgs = [...(target.default_packages || []), ...(target.device_packages || [])];
        if (!newAllPkgs.some(p => /^ath10k-firmware-|^kmod-ath10k-ct/.test(p)))
          node.overrides.NON_CT_ATH10K = '';
        // Sync to shared version if not set
        if (!net.shared_config.shared_version) net.shared_config.shared_version = DP.currentVersion;
        net.updated_at = Date.now();
        saveNetworks();

        // Update panel
        document.getElementById('np-device-' + node.id)?.let?.(el => el.value = title)
          || (document.getElementById('np-device-' + node.id) && (document.getElementById('np-device-' + node.id).value = title));

        const panel = document.getElementById('panel-' + node.id);
        if (panel?.classList.contains('open')) { panel.innerHTML = panelHTML(net, node); wirePanelEvents(net, node); }

        const row = document.querySelector('[data-nodeid="' + node.id + '"]');
        if (row) {
          const dot = row.querySelector('.dot'); if (dot) dot.className = 'dot touched flex-shrink-0';
          const bb = row.querySelector('[data-buildbtn]'); if (bb) { bb.className = 'btn text-xs py-0.5 px-2'; bb.textContent = 'Build'; }
          const sub = row.querySelector('.text-xs.text-zinc-500');
          if (sub) {
            const isAp = node.overrides.AP_MODE === '1';
            sub.textContent = title + ' · ' + (isAp ? 'AP #' + (node.overrides.AP_INDEX || '2') : 'Router') + ' · ' + nodeLanIp(net, node) + (node.last_build ? ' · built ' + timeAgo(node.last_build.timestamp) : '');
          }
        }
      }
      document.getElementById('modal-device-picker').close();
    } catch(e) {
      status.textContent = 'Error: ' + e.message;
    }
  }

  // ── WARP prefill ─────────────────────────────────────────────────
  async function prefillWarp() {
    const btn = document.getElementById('warp-prefill-btn');
    const msg = document.getElementById('warp-prefill-msg');
    if (!btn) return;
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Fetching WARP…';
    if (msg) { msg.textContent = ''; msg.classList.add('hidden'); }
    try {
      const r = await fetch('/api/warp/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warp_refresh_token: localStorage.getItem('wrtnova_warp_refresh') || '' }),
      });
      let data;
      try { data = await r.json(); } catch (_) { data = {}; }
      if (!r.ok) {
        const friendly = r.status === 429 || (data.message || '').includes('429')
          ? 'Too many requests — wait a moment and try again'
          : (data.message || data.error || 'WARP registration failed — try again shortly');
        throw new Error(friendly);
      }
      const f = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
      f('WG_PRIVATE_KEY',  data.WG_PRIVATE_KEY);
      f('PEER_PUBLIC_KEY', data.PEER_PUBLIC_KEY);
      f('ENDPOINT',        data.ENDPOINT);
      f('ENDPOINT_PORT',   data.ENDPOINT_PORT);
      f('WG_IPV4',         data.WG_IPV4);
      f('WG_IPV6',         data.WG_IPV6);
      f('ALLOWED_IPS',     data.ALLOWED_IPS);
      if (data.warp_refresh_token) localStorage.setItem('wrtnova_warp_refresh', data.warp_refresh_token);
      document.getElementById('config-form')?.dispatchEvent(new Event('change', { bubbles: true }));
      if (msg) { msg.textContent = '✓ Filled from Cloudflare WARP'; msg.style.color = '#16a34a'; msg.classList.remove('hidden'); }
    } catch(e) {
      if (msg) { msg.textContent = e.message; msg.style.color = '#dc2626'; msg.classList.remove('hidden'); }
    }
    btn.disabled = false;
    btn.textContent = origText;
  }

  function initCardToggles() {
    ui.initCardToggles('#config-form');
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    fetch('/api/session').catch(() => {});
    loadAsuServer();

    initCardToggles();

    // Wire up ui.js helpers for the config form (they attach to document.body
    // so they work regardless of which view is visible)
    if (ui.initConditionalVisibility) ui.initConditionalVisibility();
    if (ui.initPasswordToggles) ui.initPasswordToggles();
    if (ui.wireDotTouches) ui.wireDotTouches();

    // Hostname → SSID placeholder sync
    document.getElementById('HOST_NAME')?.addEventListener('input', syncSsidPlaceholders);

    // Timezone combo (tzdata.js exposes ui.initTzCombo + ui.loadTzdata)
    if (ui.loadTzdata) ui.loadTzdata().then(() => { if (ui.initTzCombo) ui.initTzCombo(); }).catch(() => {});

    // Wire up [data-add] buttons for port-fwd / ipv6 tables
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('[data-add]');
      if (btn) addTableRow(btn.dataset.add + '-table');
    });

    // AP index preview in add-AP modal
    document.getElementById('modal-ap-index')?.addEventListener('input', e => {
      document.getElementById('modal-ap-index-preview').textContent = e.target.value || '2';
    });

    // WARP prefill
    document.getElementById('warp-prefill-btn')?.addEventListener('click', prefillWarp);

    // Modals — backdrop close
    document.querySelectorAll('dialog').forEach(dlg => {
      dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    });

    // New network
    document.getElementById('btn-new-network')?.addEventListener('click', showNewNetwork);

    // Detail rename
    document.getElementById('btn-rename-detail')?.addEventListener('click', () => {
      const net = getNet(st.networkId);
      if (net) enterDetailRenameMode(net);
    });
    document.getElementById('btn-save-detail-name')?.addEventListener('click', () => {
      const net = getNet(st.networkId);
      if (net) exitDetailRenameMode(net, true);
    });
    document.getElementById('btn-cancel-detail-name')?.addEventListener('click', () => {
      exitDetailRenameMode(getNet(st.networkId), false);
    });
    document.getElementById('detail-name-input')?.addEventListener('keydown', e => {
      const net = getNet(st.networkId);
      if (e.key === 'Enter') { e.preventDefault(); if (net) exitDetailRenameMode(net, true); }
      if (e.key === 'Escape') exitDetailRenameMode(net, false);
    });

    // Config rename
    document.getElementById('btn-rename-network')?.addEventListener('click', () => {
      const net = getNet(st.networkId);
      if (net) enterRenameMode(net);
    });
    document.getElementById('btn-save-name')?.addEventListener('click', () => {
      const net = getNet(st.networkId);
      if (net) exitRenameMode(net, true);
    });
    document.getElementById('btn-cancel-name')?.addEventListener('click', () => {
      exitRenameMode(getNet(st.networkId), false);
    });
    document.getElementById('config-name-input')?.addEventListener('keydown', e => {
      const net = getNet(st.networkId);
      if (e.key === 'Enter') { e.preventDefault(); if (net) exitRenameMode(net, true); }
      if (e.key === 'Escape') exitRenameMode(net, false);
    });


    // Add AP cancel

    // Delete cancel
    document.getElementById('btn-cancel-delete')?.addEventListener('click', () => document.getElementById('modal-delete').close());

    // Device picker search + cancel
    document.getElementById('dp-search')?.addEventListener('input', e => dpRenderList(e.target.value));
    document.getElementById('dp-cancel')?.addEventListener('click', () => document.getElementById('modal-device-picker').close());

    renderList();
    showView('list');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
