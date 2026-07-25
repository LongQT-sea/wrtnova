// /networks fleet builder: per-network shared-config editor, multi-node build
// orchestration, device picker, WARP prefill. ES module. Imports ui.js (DOM
// helpers) and i18n/core.mjs (ui.S/ui.t) for their side effects so the values captured
// at module-eval time below exist; tzdata.js is pulled for the timezone combo
// used at runtime. Pure logic (mergeNodeConfig, createStore, renderConfigBlock,
// parseList, config-form) is imported directly from the typed .mjs; the UI-method
// wrappers (computeFinalPackages, renderConfigBlockMasked, ...) come off ui.
import { ui } from './ui-ns.mjs';
import './ui.js';
import './i18n/core.mjs';
import './tzdata.js';
import { BASE_SCHEMA, readForm, writeForm } from './config-form.mjs';
import { mergeNodeConfig } from './config-merge.mjs';
import { IFACE_FIELDS, ifaceValid, PREFIX_FIELDS, prefixValid, WIFI_TEXT_FIELDS, wifiTextValid, pskVlanPassIssue } from './config-form.mjs';
import { detectVlanConflict, truncateAdditionalVlans, SWCONFIG_VLAN_MAX } from './visibility.mjs';
import { renderConfigBlock } from './render-config.mjs';
import { parseList, firstInvalidIpv6Octet, hostnameValid, ddnsHostnameValid, macValid, firstInvalidHost, firstInvalidPort, portListValid, joinEndpoint } from './list-grammar.mjs';
import { parseAdditionalPackages } from './packages.mjs';
import { createStore } from './store.mjs';

// Shared-config schema for /networks: BASE_SCHEMA plus the per-network version
// select. HOST_NAME is dropped because hostname is per-node here (as are
// AP_MODE/AP_INDEX/NON_CT_ATH10K).
const NET_SCHEMA = [['shared_version', 'select', 'shared-version'],
  ...BASE_SCHEMA.filter(([k]) => k !== 'HOST_NAME')];

  // -- Constants ----------------------------------------------------
  const STORE_KEY = 'wrtnova_networks';
  const DL = 'https://downloads.openwrt.org';
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const BRANCHES = ['23.05', '24.10', '25.12'];
  const ASU_DEFAULT = 'https://sysupgrade.openwrt.org';
  let activeAsu = ASU_DEFAULT;


  const nodeBuilds = new Map();

  const S = ui.S, t = ui.t;

  // -- Storage ------------------------------------------------------
  function loadNetworks() {
    let nets;
    try { nets = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch (e) { return []; }
    // Migration: WAN_MAC_ADDR was mistakenly placed in router overrides, causing it
    // to clobber the shared_config value. Remove it from any saved router overrides.
    for (const net of nets) {
      for (const node of (net.nodes || [])) {
        if (node.overrides && node.overrides.AP_MODE !== '1' && 'WAN_MAC_ADDR' in node.overrides) {
          delete node.overrides.WAN_MAC_ADDR;
        }
      }
      // Migration: HOST_NAME moved from shared config to per-node overrides. Seed it on
      // the main router only (APs default to WrtNova-<idx>) so a fleet doesn't end up
      // with the same hostname on every node.
      if (net.shared_config && 'HOST_NAME' in net.shared_config) {
        const h = net.shared_config.HOST_NAME;
        delete net.shared_config.HOST_NAME;
        const router = (net.nodes || []).find(n => n.overrides && n.overrides.AP_MODE !== '1');
        if (h && router && !router.overrides.HOST_NAME) router.overrides.HOST_NAME = h;
      }
    }
    return nets;
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

  // -- App state ----------------------------------------------------
  const st = {
    networks: loadNetworks(),
    activeNodeId: null,
    networkId: null,
  };

  // -- Data defaults - field names match the builder's form exactly -
  function defaultConfig() {
    return {
      shared_version: '',
      ROOT_PASSWD: '', SSH_PUBLIC_KEY: '',
      SSH_PASSWD_AUTH: '', ZONE_NAME: '', TIME_ZONE: '',
      BASE_NET_PREFIX: '', DEFAULT_SUBNET: '',
      LAN_BASE_PREFIX: '', LAN_IFACE: '', LAN_VLAN_ID: '', LAN_SUBNET: '',
      GUEST_ENABLE: '1', GUEST_BASE_PREFIX: '', GUEST_IFACE: '', GUEST_VLAN_ID: '', GUEST_SUBNET: '',
      IOT_ENABLE: '', IOT_BASE_PREFIX: '', IOT_IFACE: '', IOT_VLAN_ID: '', IOT_SUBNET: '',
      IOT_INTERNET: '1', IOT_ROUTE_VIA_WG: '',
      WG_ENABLE: '', LAN_WG_BASE_PREFIX: '', LAN_WG_IFACE: '', LAN_WG_VLAN_ID: '', LAN_WG_SUBNET: '',
      ADDITIONAL_VLAN_LIST: '', TAGGED_LAN_VLAN: '',
      P_STEERING: '', ULA_PREFIX: '',
      WG_PRIVATE_KEY: '', PEER_PUBLIC_KEY: '', ENDPOINT: '',
      PRESHARED_KEY: '', WG_IPV4: '', WG_IPV6: '',
      WG_DNS_V4: '', WG_DNS_V6: '', WG_MTU: '', ALLOWED_IPS: '',
      SPLIT_TUNNEL_V4: '', SPLIT_TUNNEL_V6: '',
      wan_type: 'dhcp', PPPOE_USERNAME: '', PPPOE_PASSWD: '',
      WAN_MAC_ADDR: '', WAN_IS_TAGGED: '', WAN_VLAN_ID: '',
      WAN_B_ENABLE: '', WAN_B_VLAN_ID: '', BRIDGE_WAN_PORT: '',
      COUNTRY_CODE: '', DENSE_ENV: '', WIRELESS_MESH: '', WIRELESS_MESH_2G: '', BRIDGE_STP: '', BATMAN_ADV: '', BATMAN_ALL_VLAN: '',
      MESH_ID: '', MESH_PASSWD: '',
      LAN_WIFI_SSID: '', LAN_WIFI_PASSWD: '',
      GUEST_WIFI_SSID: '', GUEST_WIFI_PASSWD: '',
      IOT_WIFI_SSID: '', IOT_WIFI_PASSWD: '', IOT_NO_DOT11R: '',
      LAN_WG_WIFI_SSID: '', LAN_WG_WIFI_PASSWD: '',
      CHANNEL_2G: '', CHANNEL_5G: '', CHANNEL_5G_2: '', CHANNEL_6G: '', WIFI_LOG_LVL: '', DOT11KV: '1', DOT11R: '1', PSK_VLAN: '', BAND_SUFFIX: '', INDEX_SUFFIX: '', GUEST_ISOLATE: '',
      PORT_FORWARD_LIST: '', IPV6_SERVER_LIST: '',
      DDNS_ENABLE: '', LOOKUP_HOSTNAME: '', CLOUDFLARE_API_KEY: '',
      USB_TETHERING: '', CELLULAR_MODEM: '',
      DNS_MODE: 'adguardhome', ADGUARD_MAIN_DNS: '', BLOCK_DOT_DOQ: '',
      BLOCK_DOH: '', FORCE_DNS: '1', BANIP_COUNTRY_LIST: '',
      DOH_UPSTREAMS: '', BOOTSTRAP_DNS: '', DNSMASQ_MULTI_INSTANCE: '',
      DENY_GUEST_NIGHT: '', QUARTERLY_REBOOT: '', LOG: '',
      SOFTWARE_OFFLOAD: '1', HARDWARE_OFFLOAD: '', IRQBALANCE: '',
      LUCI_HTTPS: '',
      NTP_IP: '',
      CUSTOM_SCRIPT: '',
      additional_packages: '',
    };
  }

  function defaultRouterNode(meshDefault = '', mesh2gDefault = '') {
    return {
      id: uid(), name: 'Main Router',
      device_target: emptyTarget(),
      overrides: { AP_MODE: '', WIRELESS_MESH: meshDefault === '1' ? '1' : '', WIRELESS_MESH_2G: mesh2gDefault === '1' ? '1' : '' },
      last_build: null,
    };
  }

  const AP_ROOM_NAMES = ['Living Room', 'Kitchen', 'Bedroom', 'Office', 'Garage', 'Dining Room'];

  function defaultApNode(idx, meshDefault = '', mesh2gDefault = '') {
    return {
      id: uid(), name: AP_ROOM_NAMES[idx - 2] ?? 'AP-' + idx,
      device_target: emptyTarget(),
      overrides: { AP_MODE: '1', AP_INDEX: String(idx), WIRELESS_MESH: meshDefault === '1' ? '1' : '', WIRELESS_MESH_2G: mesh2gDefault === '1' ? '1' : '' },
      last_build: null,
    };
  }

  function emptyTarget() {
    return { title: '', profile: '', target: '', version: '', version_code: '',
             default_packages: [], device_packages: [] };
  }

  // -- Utilities ----------------------------------------------------
  function uid() { return Math.random().toString(36).slice(2, 10); }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function timeAgo(ts) {
    if (!ts) return S.never;
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d === 0) return S.today;
    if (d === 1) return S.yesterday;
    if (d < 7) return t('daysAgo', { n: d });
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

  function netSummary(network) {
    const c = network.shared_config;
    const p = [];
    if (c.shared_version) p.push('OpenWrt ' + c.shared_version);
    const lanPrefix = c.LAN_BASE_PREFIX || c.BASE_NET_PREFIX;   // matches nodeLanIp
    const lanMask = c.LAN_SUBNET || c.DEFAULT_SUBNET || '/24';  // LAN override, else network default
    if (lanPrefix) p.push(lanPrefix + '.' + (c.LAN_VLAN_ID || '1') + '.0' + lanMask);
    if (c.DNS_MODE && c.DNS_MODE !== 'none')
      p.push(c.DNS_MODE === 'adguardhome' ? S.adguardHome
           : c.DNS_MODE === 'https-dns-proxy' ? 'https-dns-proxy'
           : c.DNS_MODE === 'adblock-fast' ? 'adblock-fast'
           : S.dnsproxy);
    if (c.WG_ENABLE === '1') p.push(S.wireGuardVpn);
    return p.join(' · ') || S.notYetConfigured;
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

  // AdGuard Home admin password = deterministic bcrypt of the root password.
  // Shared with /builder via ui.adguardHashFromRoot: a stable salt means the
  // same password always yields the same hash, so rebuilds are byte-identical
  // and the ASU server can reuse a cached image.
  function bcryptHash(pw) {
    return ui.adguardHashFromRoot(pw);
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
      '<div class="status error w-full mt-0">' +
      '<div class="flex items-center gap-2">' +
      '<p class="flex-1">' + esc(msg) + '</p>' +
      '<button type="button" class="btn text-xs flex-shrink-0" id="' + id + '">' + S.retry + '</button>' +
      '</div>' +
      '</div>' +
      (isStorageFull
        ? '<p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">' + S.storageTip + '</p>'
        : '');
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
      ? '<p class="result-note w-full mt-1">' + S.flashNote + '</p>'
      : '';
  }

  function deleteNodeBtnHtml(id) {
    return '<button type="button" class="btn text-xs ml-auto text-red-500 hover:text-red-400 border-red-800/40 hover:border-red-600/60" data-deletenode="' + id + '">' + S.deleteNode + '</button>';
  }

  function wireDeleteNode(net, node, scopeEl) {
    scopeEl.querySelector('[data-deletenode]')?.addEventListener('click', () => {
      document.getElementById('modal-delete-node-name').textContent = node.name;
      document.getElementById('btn-confirm-delete-node').onclick = () => {
        net.nodes = net.nodes.filter(n => n.id !== node.id);
        net.updated_at = Date.now();
        saveNetworks();
        document.getElementById('modal-delete-node').close();
        renderNodeList(net);
      };
      document.getElementById('modal-delete-node').showModal();
    });
  }

  function showPanelDone(net, node, actEl, images, bin_dir, asuBase, onDone) {
    if (!actEl) return;
    const id = 'buildbtn-' + uid();
    const isAp = node.overrides.AP_MODE === '1';
    const vlanTrunc = truncateAdditionalVlans(
      mergeNodeConfig(net.shared_config, node.overrides), node.device_target.target);
    const vlanTruncHtml = vlanTrunc.truncated
      ? '<p class="text-xs text-amber-600 dark:text-amber-400 mt-1.5">' +
        esc(t('vlanTruncNote', { max: String(SWCONFIG_VLAN_MAX), dropped: vlanTrunc.dropped })) +
        '</p>'
      : '';
    actEl.innerHTML =
      '<button type="button" class="btn btn-primary text-xs" id="' + id + '">' + S.buildFirmware + '</button>' +
      (isAp ? deleteNodeBtnHtml(node.id) : '') +
      flashNoteHtml(images) +
      imageFilesHtml(images, bin_dir, asuBase) +
      vlanTruncHtml;
    actEl.querySelector('#' + id)?.addEventListener('click', onDone);
    wireDeleteNode(net, node, actEl);
  }

  // -- View routing -------------------------------------------------
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById('view-' + name);
    if (el) el.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // -- Breadcrumb helpers --------------------------------------------
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

  // -- List view -----------------------------------------------------
  function renderList() {
    setHeaderSub(BC_SEP + S.networks);
    const container = document.getElementById('networks-list');

    if (!st.networks.length) {
      container.innerHTML =
        '<div class="card p-8 text-center">' +
        '<p class="text-zinc-500 dark:text-zinc-400 text-sm mb-4">' + S.noNetworksYet + '</p>' +
        '<button class="btn btn-primary" id="btn-empty-new">' +
        '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
        '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        S.newNetwork + '</button></div>';
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
        '<span class="chip">' + t(net.nodes.length !== 1 ? 'nodesCount' : 'nodeCount', { n: net.nodes.length }) + '</span>' +
        '</div>' +
        '<p class="text-xs text-zinc-500 dark:text-zinc-400 truncate">' + names + '</p>' +
        '<p class="text-xs text-zinc-600 dark:text-zinc-500 mt-1">' + esc(netSummary(net)) + '</p>' +
        '</div>' +
        '<div class="flex flex-col items-end gap-2 flex-shrink-0">' +
        '<svg class="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
        '<div class="flex gap-1">' +
        (built ? '<span class="chip">' + t('builtCount', { n: built }) + '</span>' : '') +
        (pending ? '<span class="chip text-zinc-500">' + t('pendingCount', { n: pending }) + '</span>' : '') +
        '</div></div></div></div>'
      );
    }).join('');

    container.querySelectorAll('[data-netid]').forEach(card => {
      card.addEventListener('click', () => showDetail(card.dataset.netid));
    });
  }

  // -- Detail view --------------------------------------------------
  function showDetail(networkId) {
    st.networkId = networkId;
    st.activeNodeId = null;
    const net = getNet(networkId);
    if (!net) return;

    setHeaderSub(BC_SEP + bcBtn(S.networks, () => { renderList(); showView('list'); }) + BC_SEP + esc(net.name));
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
      const devLabel = node.device_target.title || S.noDeviceSelected;
      const status = nodeLanIp(net, node) + (node.last_build ? ' · ' + t('builtAgo', { ago: timeAgo(node.last_build.timestamp) }) : '');
      const buildBtnCls = node.device_target.profile ? 'btn text-xs py-0.5 px-2' : 'btn btn-primary text-xs py-0.5 px-2';
      return (
        '<div class="node-row" data-nodeid="' + esc(node.id) + '">' +
        '<span class="' + nodeDotClass(node) + ' flex-shrink-0" aria-hidden="true"></span>' +
        '<div class="flex-1 min-w-0">' +
        '<div class="font-medium text-sm">' + esc(node.name) + '</div>' +
        '<div class="text-xs text-zinc-500 dark:text-zinc-400 truncate">' + esc(devLabel) + ' · ' +
        (isAp ? t('apNum', { n: esc(node.overrides.AP_INDEX || '2') }) : S.router) + ' · ' + status + '</div>' +
        '</div>' +
        '<div class="flex items-center gap-2 flex-shrink-0">' +
        '<button class="' + buildBtnCls + '" data-buildbtn="' + esc(node.id) + '">' +
        (node.device_target.profile ? S.build : S.setup) + '</button>' +
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
      : BRANCHES.slice().reverse();
    const effectiveShared = sharedVersion
      || sharedSel?.value
      || '';
    const sharedLabel = t('defaultVersion', { v: effectiveShared || '…' });
    return '<option value="">' + esc(sharedLabel) + '</option>' +
      versions.map(v =>
        '<option value="' + esc(v) + '"' + (currentOverride === v ? ' selected' : '') + '>' + esc(v) + '</option>'
      ).join('');
  }

  // One .opt-card row - title (plus an optional description) on the left, the
  // control on the trailing edge. Same shape the static markup in both pages
  // uses, which is what the CSS in src/style.css targets; the control carries
  // its own `.opt-control .opt-field` / `.opt-stack` classes so a caller can
  // pick how wide it sits. `rowAttrs` is for the odd row that has to override
  // the .form-row margin.
  function optCard(forId, title, control, help) {
    return '<div class="opt-card">' +
      '<div class="opt-text">' +
        '<label class="opt-title" for="' + forId + '">' + title + '</label>' +
        (help ? '<p class="form-help mt-0">' + help + '</p>' : '') +
      '</div>' +
      control +
    '</div>';
  }

  // One bordered box around a run of opt-cards, the shape the DDNS card uses:
  // .opt-group drops each nested card's own shell and separates them with a
  // rule, so a set of related fields reads as one control rather than five.
  function cardGroup(cards) {
    return '<div class="form-row form-row--full" style="margin-top:0">' +
      '<div class="opt-group">' + cards + '</div></div>';
  }

  function versionCard(id, currentOverride, sharedVersion) {
    return optCard('np-ver-' + id, S.openWrtVersion,
      '<select class="opt-control opt-field input-base" id="np-ver-' + id + '">' +
      versionOpts(currentOverride, sharedVersion) +
      '</select>');
  }


  // Per-node final-package list + Copy and a collapsible config/script preview
  // (parity with /builder). Only shown once a device is selected, since the
  // package set depends on the device's base/device package lists.
  function nodeExtrasHTML(id, hasDevice) {
    if (!hasDevice) return '';
    const sid = esc(id);
    const sumCls = 'text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200 select-none flex items-center gap-1';
    // Same disclosure chevron the static <summary> rows use; CSS rotates it shut.
    const chev = '<svg class="w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    return (
      '<div class="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">' +
        '<details>' +
          '<summary class="' + sumCls + '">' + chev + '<span>' + S.advancedOptions + '</span></summary>' +
          '<div class="mt-2 pl-1 space-y-2">' +
            '<details open>' +
              '<summary class="' + sumCls + '">' + chev + '<span>' + S.finalPackages + '</span></summary>' +
              '<div id="np-pkgs-' + sid + '" class="flex flex-wrap gap-1 py-1 mt-2 min-h-[1.75rem]"></div>' +
            '</details>' +
            '<details open>' +
              '<summary class="' + sumCls + '">' + chev + '<span>' + S.configPreview + '</span></summary>' +
              '<div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">' +
                '<label class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">' +
                  '<input type="checkbox" id="np-reveal-' + sid + '" class="align-middle"><span>' + S.revealSecrets + '</span></label>' +
                '<label class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">' +
                  '<input type="checkbox" id="np-full-' + sid + '" class="align-middle"><span>' + S.fullScript + '</span></label>' +
                '<button type="button" id="np-copy-' + sid + '" aria-label="' + esc(S.copy) + '" title="' + esc(S.copy) + '"' +
                  ' class="ml-auto p-1.5 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-accent">' +
                  '<svg class="icon-copy w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                  '<svg class="icon-check w-4 h-4 hidden" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' +
                '</button>' +
              '</div>' +
              '<pre class="config-preview" id="np-preview-' + sid + '"></pre>' +
            '</details>' +
          '</div>' +
        '</details>' +
      '</div>'
    );
  }

  // Recompute and render a node's final-package chips + preview from the current
  // shared_config + overrides (the merged node config is the shared derivation).
  function updateNodeExtras(net, node) {
    const pkgsEl = document.getElementById('np-pkgs-' + node.id);
    if (!pkgsEl) return;   // device not selected / extras not rendered
    const cfg = mergeNodeConfig(net.shared_config, node.overrides);
    const extra = parseAdditionalPackages(net.shared_config.additional_packages);
    const pkgs = ui.computeFinalPackages ? ui.computeFinalPackages(node.device_target, cfg, extra) : [];
    ui.renderPackageChips(pkgsEl, pkgs);
    renderNodePreview(net, node);
  }

  // Per-node config/script preview - mirrors /builder renderPreview: masked
  // config block by default, with reveal + full-script toggles. The derived
  // ADGUARD_PASSWD is injected so the preview matches the built script.
  function renderNodePreview(net, node) {
    const pre = document.getElementById('np-preview-' + node.id);
    if (!pre) return;
    const reveal = !!(document.getElementById('np-reveal-' + node.id) || {}).checked;
    const full   = !!(document.getElementById('np-full-' + node.id) || {}).checked;
    const cfg = ui.injectAdguardPasswd(
      mergeNodeConfig(net.shared_config, node.overrides), () => renderNodePreview(net, node));
    if (!full) {
      pre.textContent = reveal ? renderConfigBlock(cfg) : ui.renderConfigBlockMasked(cfg);
      return;
    }
    ui.fetchWrtnovaBody().then(body => {
      if (!(document.getElementById('np-full-' + node.id) || {}).checked) return;
      pre.textContent = ui.assembleScript(cfg, body, !reveal);
    }).catch(e => { pre.textContent = ui.t ? ui.t('failedLoadTemplate', { msg: e.message }) : ('Error: ' + e.message); });
  }

  // Always-unmasked text for the node's Copy button, regardless of the reveal
  // toggle: copying masked asterisks would paste an unusable config.
  async function nodePreviewUnmasked(net, node) {
    const cfg = mergeNodeConfig(net.shared_config, node.overrides);
    if (cfg.ROOT_PASSWD) {
      const h = await ui.adguardHashFromRoot(cfg.ROOT_PASSWD);
      if (h) cfg.ADGUARD_PASSWD = h;
    }
    const full = !!(document.getElementById('np-full-' + node.id) || {}).checked;
    if (!full) return renderConfigBlock(cfg);
    const body = await ui.fetchWrtnovaBody();
    return ui.assembleScript(cfg, body, false);
  }

  function panelHTML(net, node) {
    const isAp = node.overrides.AP_MODE === '1';
    const cfg = net.shared_config;
    const meshChecked = node.overrides.WIRELESS_MESH === '1';
    const meshChecked2g = node.overrides.WIRELESS_MESH_2G === '1';
    const apDisableChecked = node.overrides.AP_DISABLE === '1';
    // Per-device override on top of the misc-card default (core count varies per
    // node). No stored override means inherit the network-wide IRQBALANCE.
    const irqChecked = 'IRQBALANCE' in node.overrides
      ? node.overrides.IRQBALANCE === '1'
      : cfg.IRQBALANCE === '1';
    const id = esc(node.id);
    const devTitle = esc(node.device_target.title || '');
    const verOverride = node.overrides.version || '';
    const hasDevice = !!node.device_target.profile;
    const allPkgs = [...(node.device_target.default_packages || []), ...(node.device_target.device_packages || [])];
    const hasWifi = /\bwpad-?|\bhostapd|\bmac80211/.test(allPkgs.join(' '));
    const hasCt = allPkgs.some(p => /^ath10k-firmware-|^kmod-ath10k-ct/.test(p));
    const nonCtRow = hasCt
      ? '<div class="form-row form-row--full"><label class="toggle-label"><span class="toggle-wrap">' +
        '<input type="checkbox" class="toggle-input" id="np-nonct-' + id + '"' + (node.overrides.NON_CT_ATH10K === '1' ? ' checked' : '') + '>' +
        '<span class="toggle-track"></span><span class="toggle-thumb"></span></span>' +
        '<div><span class="toggle-text">' + S.nonCtAth10k + '</span>' +
        '<p class="form-help mt-0">' + S.useNonCtAth10k + '</p></div></label></div>'
      : '';
    const wedCapable = allPkgs.some(p => /^kmod-mt7915e$/.test(p));
    const wedRow = wedCapable
      ? '<div class="form-row form-row--full"><label class="toggle-label"><span class="toggle-wrap">' +
        '<input type="checkbox" class="toggle-input" id="np-wed-' + id + '"' + (node.overrides.WED_ENABLE === '1' ? ' checked' : '') + '>' +
        '<span class="toggle-track"></span><span class="toggle-thumb"></span></span>' +
        '<div><span class="toggle-text">' + S.wedAccel + '</span>' +
        '<p class="form-help mt-0">' + S.useWed + '</p></div></label></div>'
      : '';
    const irqRow =
      '<div class="form-row form-row--full"><label class="toggle-label"><span class="toggle-wrap">' +
        '<input type="checkbox" class="toggle-input" id="np-irq-' + id + '"' + (irqChecked ? ' checked' : '') + '>' +
        '<span class="toggle-track"></span><span class="toggle-thumb"></span></span>' +
        '<div><span class="toggle-text">' + S.irqbalance + '</span>' +
        '<p class="form-help mt-0">' + S.useIrqbalance + '</p></div></label></div>';

    // Per-node 2.4 GHz mesh override only where the network opts in (shared WIRELESS_MESH_2G).
    const mesh2gToggle = cfg.WIRELESS_MESH_2G === '1'
      ? '<div class="form-row form-row--full"><label class="toggle-label"><span class="toggle-wrap">' +
        '<input type="checkbox" class="toggle-input" id="np-mesh2g-' + id + '"' + (meshChecked2g ? ' checked' : '') + '>' +
        '<span class="toggle-track"></span><span class="toggle-thumb"></span></span>' +
        '<div><span class="toggle-text">' + S.wirelessMesh2g + '</span>' +
        '<p class="form-help mt-0">' + S.mesh2gNote + '</p></div></label></div>'
      : '';

    const wifiRows =
      (hasWifi ? '<div class="form-row form-row--full"><label class="toggle-label"><span class="toggle-wrap">' +
        '<input type="checkbox" class="toggle-input" id="np-mesh-' + id + '"' + (meshChecked ? ' checked' : '') + '>' +
        '<span class="toggle-track"></span><span class="toggle-thumb"></span></span>' +
        '<div><span class="toggle-text">' + S.wirelessMesh + '</span>' +
        '<p class="form-help mt-0">' + S.wiredBackhaulNote + '</p></div></label></div>' +
      mesh2gToggle : '') +
      (hasWifi ? '<div class="form-row form-row--full"><label class="toggle-label"><span class="toggle-wrap">' +
        '<input type="checkbox" class="toggle-input" id="np-apdisable-' + id + '"' + (apDisableChecked ? ' checked' : '') + '>' +
        '<span class="toggle-track"></span><span class="toggle-thumb"></span></span>' +
        '<div><span class="toggle-text">' + S.backhaulOnly + '</span>' +
        '<p class="form-help mt-0">' + S.disableAllAps + '</p></div></label></div>' : '') +
      nonCtRow + wedRow + irqRow;

    let fields;
    // The device control is a readonly field plus its picker button, so it is a
    // wrapper rather than a bare input - the same thing /builder does for the
    // device combobox.
    const deviceRow = optCard('np-device-' + id, S.device,
      '<div class="opt-control opt-field flex gap-2 items-center">' +
        '<input class="input-base" id="np-device-' + id + '" value="' + devTitle + '" placeholder="' + S.noDeviceSelected + '" readonly style="cursor:pointer">' +
        '<button type="button" class="btn text-xs flex-shrink-0" data-pickdevice="' + id + '">' + S.change + '</button>' +
      '</div>',
      S.deviceRequirement);

    const nameRow =
      optCard('np-name-' + id, S.nodeName,
        '<input class="opt-control opt-field input-base" id="np-name-' + id + '" value="' + esc(node.name) + '">');

    const hostRow = (placeholder) =>
      optCard('np-host-' + id, S.hostname,
        '<input class="opt-control opt-field input-base" id="np-host-' + id + '" value="' +
        esc(node.overrides.HOST_NAME || '') + '" placeholder="' + placeholder + '">');

    if (!isAp) {
      fields = cardGroup(
        deviceRow +
        versionCard(id, verOverride, cfg.shared_version) +
        nameRow +
        hostRow('WrtNova')
      ) + wifiRows;
    } else {
      fields = cardGroup(
        deviceRow +
        versionCard(id, verOverride, cfg.shared_version) +
        nameRow +
        hostRow('WrtNova-' + esc(node.overrides.AP_INDEX || '2')) +
        optCard('np-apidx-' + id, S.apIndex,
          '<input type="number" class="opt-control opt-field--narrow input-base" id="np-apidx-' + id +
          '" min="2" max="254" value="' + esc(node.overrides.AP_INDEX || '2') + '">')
      ) + wifiRows;
    }

    return (
      '<div class="px-4 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800">' +
      '<p class="text-xs text-zinc-500 dark:text-zinc-400 mb-4">' +
      S.deviceSpecificNote +
      '</p>' + fields +
      '<div class="flex gap-2 mt-4 flex-wrap items-center node-actions">' +
      '<button type="button" class="btn btn-primary text-xs" data-savenode="' + id + '"' +
      (hasDevice ? '' : ' disabled style="opacity:0.4;cursor:not-allowed"') + '>' +
      (hasDevice ? S.buildFirmware : S.selectDeviceFirst) + '</button>' +
      (isAp ? deleteNodeBtnHtml(id) : '') +
      (hasDevice && node.last_build?.images?.length
        ? flashNoteHtml(node.last_build.images) +
          imageFilesHtml(node.last_build.images, node.last_build.bin_dir, node.last_build.asu_base)
        : '') +
      '</div>' + nodeExtrasHTML(id, hasDevice) + '</div>'
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

    if (node.overrides.AP_MODE === '1') {
      const idxInp = panel.querySelector('#np-apidx-' + node.id);
      if (idxInp) {
        idxInp.addEventListener('change', () => {
          let val = Math.min(254, Math.max(2, parseInt(idxInp.value) || 2));
          const used = net.nodes
            .filter(n => n.id !== node.id && n.overrides.AP_MODE === '1')
            .map(n => parseInt(n.overrides.AP_INDEX) || 2);
          // Bump off a taken index, but never past the last usable octet.
          while (used.includes(val) && val < 254) val++;
          idxInp.value = String(val);
          panel.querySelector('#np-host-' + node.id)?.setAttribute('placeholder', 'WrtNova-' + val);
        });
      }
    }

    wireDeleteNode(net, node, panel);

    // Config/script preview toggles (parity with /builder).
    panel.querySelector('#np-reveal-' + node.id)?.addEventListener('change', () => renderNodePreview(net, node));
    panel.querySelector('#np-full-' + node.id)?.addEventListener('change', () => renderNodePreview(net, node));

    const npCopy = panel.querySelector('#np-copy-' + node.id);
    if (npCopy) npCopy.addEventListener('click', async () => {
      let ok = false;
      try { ok = await ui.copyToClipboard(await nodePreviewUnmasked(net, node)); } catch (_) { ok = false; }
      ui.flashCopied(npCopy, ok);
    });
    updateNodeExtras(net, node);   // initial render
  }

  function saveNodePanel(net, node) {
    const panel = document.getElementById('panel-' + node.id);
    if (!panel) return;

    const nameInp = panel.querySelector('#np-name-' + node.id);
    if (nameInp?.value.trim()) node.name = nameInp.value.trim();

    const hostInp = panel.querySelector('#np-host-' + node.id);
    if (hostInp) node.overrides.HOST_NAME = hostInp.value.trim();

    const verInp = panel.querySelector('#np-ver-' + node.id);
    if (verInp) node.overrides.version = verInp.value;

    const meshInp = panel.querySelector('#np-mesh-' + node.id);
    if (meshInp) node.overrides.WIRELESS_MESH = meshInp.checked ? '1' : '';

    const mesh2gInp = panel.querySelector('#np-mesh2g-' + node.id);
    if (mesh2gInp) node.overrides.WIRELESS_MESH_2G = mesh2gInp.checked ? '1' : '';

    const apDisableInp = panel.querySelector('#np-apdisable-' + node.id);
    if (apDisableInp) node.overrides.AP_DISABLE = apDisableInp.checked ? '1' : '';

    const nonCtInp = panel.querySelector('#np-nonct-' + node.id);
    if (nonCtInp) node.overrides.NON_CT_ATH10K = nonCtInp.checked ? '1' : '';

    const wedInp = panel.querySelector('#np-wed-' + node.id);
    if (wedInp) node.overrides.WED_ENABLE = wedInp.checked ? '1' : '';

    const irqInp = panel.querySelector('#np-irq-' + node.id);
    if (irqInp) node.overrides.IRQBALANCE = irqInp.checked ? '1' : '';

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
        const devLabel = node.device_target.title || S.noDeviceSelected;
        const isAp = node.overrides.AP_MODE === '1';
        const status = nodeLanIp(net, node) + (node.last_build ? ' · ' + t('builtAgo', { ago: timeAgo(node.last_build.timestamp) }) : '');
        subEl.textContent = devLabel + ' · ' + (isAp ? t('apNum', { n: node.overrides.AP_INDEX || '2' }) : S.router) + ' · ' + status;
      }
    }

    updateNodeExtras(net, node);   // refresh packages/preview after an override change
  }

  // -- Config form view ----------------------------------------------
  function showConfig(networkId, autoRename, isNew) {
    const net = getNet(networkId);
    if (!net) return;
    st.networkId = networkId;

    setHeaderSub(
      BC_SEP + bcBtn(S.networks, () => { renderList(); showView('list'); }) +
      BC_SEP + bcBtn(net.name, () => showDetail(networkId)) +
      BC_SEP + S.config
    );
    document.getElementById('config-title').textContent = net.name;
    const allBuilt = net.nodes.every(n => n.last_build);
    const anyBuilt = net.nodes.some(n => n.last_build);
    document.getElementById('config-status-dot').className =
      'dot' + (allBuilt ? ' valid' : anyBuilt ? ' touched' : '');

    // Ensure display mode on entry
    document.getElementById('config-name-display')?.classList.remove('hidden');
    document.getElementById('config-name-edit')?.classList.add('hidden');

    // Teardown previous config-view listeners/subscriptions before re-entering.
    if (st.configSaveAbort) st.configSaveAbort.abort();
    st.configSaveAbort = new AbortController();
    const { signal } = st.configSaveAbort;

    // Single source of truth for this network's shared config. The DOM is a
    // view; readConfig() is the normalize-at-boundary reader that feeds it, and
    // the conditional-visibility selectors (ui.js) read it via ui.configState.
    st.configStore = createStore(Object.assign(defaultConfig(), net.shared_config));
    ui.configState = () => st.configStore.get();

    loadConfig(net.shared_config);   // render store -> DOM (+ refresh visibility)
    _warpSessionToken = net.warp_refresh_token || '';
    if (isNew) document.getElementById('card-target')?.classList.add('open');

    // Align the store with the normalized DOM (timezone, uppercased COUNTRY_CODE,
    // serialized tables) before wiring save, so auto-save persists canonical values.
    st.configStore.set(readConfig());

    let saveTimer;
    const flushSave = () => {
      net.shared_config = st.configStore.get();
      // New-network setup only: the auto-created router predates the shared
      // config edits, so keep its mesh in sync with the shared toggle live
      // (300ms debounce). Scoped to isNew, so per-node independence resumes
      // once setup is done and never clobbers a manually-edited node.
      if (isNew) {
        const router = net.nodes.find(n => n.overrides.AP_MODE !== '1');
        if (router) {
          router.overrides.WIRELESS_MESH = net.shared_config.WIRELESS_MESH === '1' ? '1' : '';
          router.overrides.WIRELESS_MESH_2G = net.shared_config.WIRELESS_MESH_2G === '1' ? '1' : '';
        }
      }
      net.updated_at = Date.now();
      saveNetworks();
    };
    const unsub = st.configStore.subscribe(() => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 300);   // 300ms debounced auto-save
    });
    signal.addEventListener('abort', () => { unsub(); clearTimeout(saveTimer); }, { once: true });

    // Boundary listener on the form: normalize DOM -> store on every edit. It is
    // form-level, so it runs (and updates the store) before the body-level
    // visibility handler in ui.js reads the store.
    const syncStore = () => {
      const ver = document.getElementById('shared-version')?.value;
      updatePacketSteeringOpts(ver);
      updateTimeFormatRow(ver);
      st.configStore.set(readConfig());
    };
    const form = document.getElementById('config-form');
    form.addEventListener('input', syncStore, { signal });
    form.addEventListener('change', syncStore, { signal });

    // Live feedback: when the user leaves a validated field with a bad value,
    // pop its native validation bubble (mirrors /builder's focusout handler).
    form.addEventListener('focusout', e => {
      const el = e.target;
      if (!el) return;
      if (PREFIX_FIELDS.includes(el.id)) {
        el.setCustomValidity(prefixValid(el.value) ? '' : t('prefixInvalid', { field: el.value }));
      } else if (el.id === 'LOOKUP_HOSTNAME') {
        el.setCustomValidity(ddnsHostnameValid(el.value) ? '' : t('ddnsHostnameInvalid', { field: el.value }));
      } else if (el.id === 'WAN_MAC_ADDR') {
        el.setCustomValidity(macValid(el.value) ? '' : t('macInvalid', { field: el.value }));
      } else if (el.matches && el.matches('[data-col="host"]')) {
        el.setCustomValidity(hostnameValid(el.value) ? '' : t('hostnameInvalid', { field: el.value }));
      } else if (el.matches && el.matches('[data-col="ports"]')) {
        el.setCustomValidity(portListValid(el.value) ? '' : t('portInvalid', { field: el.value }));
      } else {
        return;
      }
      if (!el.validity.valid) el.reportValidity();
    }, { signal });

    document.getElementById('btn-save-config').onclick = () => {
      clearTimeout(saveTimer);
      st.configStore.set(readConfig());
      flushSave();
      showDetail(networkId);
      if (isNew) {
        const router = net.nodes.find(n => n.overrides.AP_MODE !== '1');
        if (router) setTimeout(() => togglePanel(net, router.id, true), 80);
      }
    };

    showView('config');
    dpEnsureVersions();

    if (autoRename) setTimeout(() => enterRenameMode(net), 60);
  }

  // Shared config -> DOM (full render). The per-field write loop is the schema-
  // driven writeForm (config-form.mjs, shared with /builder's renderConfigToDom);
  // the version select, timezone and dynamic tables are page-orchestrated here.
  function loadConfig(cfg) {
    const verSel = document.getElementById('shared-version');
    if (verSel) verSel.dataset.desired = cfg.shared_version || '';

    writeForm(BASE_SCHEMA, cfg);
    updatePacketSteeringOpts(cfg.shared_version);
    updateTimeFormatRow(cfg.shared_version);

    // Timezone - mirrors history.js restore: update state + input via setTimezone
    if (cfg.ZONE_NAME && ui.setTimezone && !ui.setTimezone(cfg.ZONE_NAME)) {
      const tzInp = document.getElementById('timezone');
      if (tzInp) tzInp.value = cfg.ZONE_NAME;
    }

    loadTable('portfwd-table', cfg.PORT_FORWARD_LIST || '');
    loadTable('ipv6-table', cfg.IPV6_SERVER_LIST || '');
    if (ui.refreshBanipChips) ui.refreshBanipChips();

    // Let ui.js refresh conditional visibility
    document.body.dispatchEvent(new Event('change', { bubbles: true }));
    if (ui.$ && ui.$('#LAN_WIFI_SSID')) syncSsidPlaceholders();
  }

  // DOM -> shared config, normalized at the boundary. The field list + ordering
  // live in config-form.mjs (NET_SCHEMA), shared with /builder's readRawForm.
  function readConfig() {
    return readForm(NET_SCHEMA);
  }

  // Version-gated options. Packet steering "Enabled (all CPUs)" (value 2) needs
  // OpenWrt 24+; hide the control and clear a stale value on older releases.
  // Callers re-read the form into the store after this, so the gated config
  // never emits an unsupported setting. Gated by the shared (fleet) version.
  function updatePacketSteeringOpts(ver) {
    const parts = String(ver).split('.');
    const maj = parseInt(parts[0], 10);
    const unknown = isNaN(maj);              // SNAPSHOT/unknown -> newest, show all
    const allow24 = unknown || maj >= 24;

    const sel = document.getElementById('P_STEERING');
    const opt2 = sel && sel.querySelector('option[value="2"]');
    if (opt2) {
      opt2.hidden = !allow24;
      opt2.disabled = !allow24;
      if (!allow24 && sel.value === '2') sel.value = '';
    }
  }

  // Time format (clock_hourcycle) needs OpenWrt 25.12+
  function updateTimeFormatRow(ver) {
    const maj = parseInt(String(ver).split('.')[0], 10);
    const allow = isNaN(maj) || maj >= 25;   // SNAPSHOT/unknown -> newest, show
    const row = document.getElementById('row-time-format');
    if (!row) return;
    row.classList.toggle('hidden', !allow);
    if (!allow) {
      const cur = row.querySelector('input[name="TIME_FORMAT"]:checked');
      if (cur && cur.value !== '') {
        const def = row.querySelector('input[name="TIME_FORMAT"][value=""]');
        if (def) def.checked = true;
      }
    }
  }

  // Static: wrtnova.sh SSID defaults are decoupled from HOST_NAME
  // (lan_ssid="${LAN_WIFI_SSID:-WrtNova}", etc.).
  function syncSsidPlaceholders() {
    [
      ['LAN_WIFI_SSID', 'WrtNova'],
      ['GUEST_WIFI_SSID', 'WrtNova_Guest'],
      ['IOT_WIFI_SSID', 'WrtNova_IoT'],
      ['LAN_WG_WIFI_SSID', 'WrtNova_VPN'],
    ].forEach(([id, ph]) => {
      const el = document.getElementById(id);
      if (el) el.placeholder = ph;
    });
  }

  // -- Dynamic tables (load with initial values; save via ui.serializeRows) -
  function loadTable(tableId, listStr) {
    const tbody = document.querySelector('#' + tableId + ' tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const rows = parseList(listStr);
    if (!rows.length) {
      addTableRow(tableId);
      return;
    }
    rows.forEach(r => addTableRow(tableId, r.host, r.octet, r.ports));
  }

  function addTableRow(tableId, host, octet, ports) {
    const tbody = document.querySelector('#' + tableId + ' tbody');
    if (!tbody) return;
    const isV6 = tableId === 'ipv6-table';
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Hostname"><input type="text" data-col="host" class="input-base" placeholder="hostname" value="' + esc(host || '') + '"></td>' +
      '<td data-label="Last octet"><input ' + ui.octetAttrs(isV6) + ' data-col="octet" class="input-base" placeholder="20" value="' + esc(octet || '') + '"></td>' +
      '<td data-label="Ports"><input type="text" data-col="ports" class="input-base" placeholder="80 443" value="' + esc(ports || '') + '"></td>' +
      '<td><button class="btn btn-icon" type="button" aria-label="Remove row">×</button></td>';
    tr.querySelector('button').addEventListener('click', () => tr.remove());
    ui.bindOctetClamp(tr.querySelector('[data-col="octet"]'), isV6 ? 'v6' : 'v4');
    tbody.appendChild(tr);
  }

  // -- New network ---------------------------------------------------
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
    const shared = defaultConfig();
    const net = {
      id: 'net_' + uid(), name,
      shared_config: shared,
      nodes: [defaultRouterNode(shared.WIRELESS_MESH, shared.WIRELESS_MESH_2G)],
      created_at: Date.now(), updated_at: Date.now(),
    };
    st.networks.push(net);
    saveNetworks();
    showConfig(net.id, autoRename, true);
  }

  // -- Rename (inline in config view) -------------------------------
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
        BC_SEP + bcBtn(S.networks, () => { renderList(); showView('list'); }) +
        BC_SEP + bcBtn(newName, () => showDetail(net.id)) +
        BC_SEP + S.config
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
      setHeaderSub(BC_SEP + bcBtn(S.networks, () => { renderList(); showView('list'); }) + BC_SEP + esc(newName));
    }
    edit.classList.add('hidden');
    display.classList.remove('hidden');
  }

  function showAddAp(networkId) {
    const net = getNet(networkId);
    if (!net) return;
    const idx = nextApIdx(net);
    const node = defaultApNode(idx, net.shared_config.WIRELESS_MESH, net.shared_config.WIRELESS_MESH_2G);
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

  // -- Build ---------------------------------------------------------

  // Auto-downgrade DNS for a router node whose firmware does not fit (ASU
  // "storage exceeded"), mirroring /builder's tryAutoRetry: adguardhome ->
  // dnsproxy -> https-dns-proxy -> dnsmasq (none). DNS_MODE lives in the shared
  // network config, so
  // the change is network-wide - which is fine, because AP nodes install no DNS
  // package and are unaffected (hence the router-only guard). builtDns is the
  // DNS_MODE the failed build actually used; comparing it against the current
  // shared value keeps concurrent build-all retries from double-downgrading (one
  // router's downgrade already covers its siblings). Returns the DNS mode the
  // rebuild should use, or '' when no auto-retry applies.
  function planDnsAutoRetry(net, node, builtDns, errMsg) {
    if (!/exceed.*storage|storage.*exceed/i.test(errMsg)) return '';
    if (node.overrides.AP_MODE === '1') return '';            // router-only
    const cur = net.shared_config.DNS_MODE || 'https-dns-proxy';
    if (cur !== builtDns) return cur;                         // a sibling already downgraded - rebuild at current mode
    const next = cur === 'adguardhome'     ? 'dnsproxy'
               : cur === 'dnsproxy'        ? 'https-dns-proxy'
               : cur === 'https-dns-proxy' ? 'adblock-fast'
               : cur === 'adblock-fast'    ? 'none'
               : '';
    if (!next) return '';                                     // already plain dnsmasq - nothing left to try
    net.shared_config.DNS_MODE = next;
    if (st.configStore && st.networkId === net.id) st.configStore.set({ DNS_MODE: next });
    net.updated_at = Date.now();
    saveNetworks();
    // The build runs in-place on the detail view (showDetail isn't re-run), so
    // refresh the header subtitle to reflect the new DNS mode without a reload.
    const sumEl = document.getElementById('detail-summary');
    if (sumEl && st.networkId === net.id) sumEl.textContent = netSummary(net);
    return next;
  }

  function dnsAutoRetryNote(mode) {
    return mode === 'https-dns-proxy' ? S.autoSwitchedHttpsDnsProxy
         : mode === 'adblock-fast'    ? S.autoSwitchedAdblock
         : mode === 'none'            ? S.autoSwitchedDnsmasq
         : S.autoSwitchedDnsproxy;
  }

  // Shared by buildNode and startBuildAllNode. A per-node version override means a
  // different OpenWrt version than the cached device_target, so its profiles.json
  // must be refetched. Throws on fetch failure - each caller handles it its own way.
  async function resolveVersionedTarget(net, node) {
    const tgt = node.device_target;
    const effectiveVersion = node.overrides.version || tgt.version || net.shared_config.shared_version;
    if (!node.overrides.version || node.overrides.version === tgt.version)
      return { version_code: tgt.version_code, default_packages: tgt.default_packages, device_packages: tgt.device_packages };
    const cacheKey = 'wrtnova_profiles_' + effectiveVersion + '_' + tgt.target;
    let data = dpCacheGet(cacheKey);
    if (!data) {
      const res = await fetch(dpUrl(effectiveVersion) + '/targets/' + tgt.target + '/profiles.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to fetch profiles for ' + effectiveVersion);
      data = await res.json();
      dpCacheSet(cacheKey, data);
    }
    const dev = (data.profiles || {})[tgt.profile] || {};
    return {
      version_code: data.version_code || '',
      default_packages: data.default_packages || tgt.default_packages,
      device_packages: dev.device_packages || tgt.device_packages,
    };
  }

  // Shared so the single-node and build-all paths send an identical payload shape.
  function buildAsuBody({ tgt, version, version_code, packages, defaults }) {
    return {
      profile: tgt.profile, target: tgt.target,
      version, version_code,
      packages,
      defaults,
      diff_packages: true, client: 'wrtnova/1.0',
    };
  }

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

    // Block on a genuine VLAN conflict in the shared config (anchor clash or trunk
    // overlap). Computed fresh here - ui.hasVlanConflict is only refreshed while the
    // config form is open and is stale in this node-list view.
    if (detectVlanConflict(net.shared_config)) {
      showPanelError(actEl, S.fixVlanConflict, () => buildNode(net, node));
      return;
    }

    // Interface names: empty (use default) or a valid UCI section name. mergeNodeConfig
    // already blanks disabled networks' iface fields, so only active ones are checked.
    const mergedForCheck = mergeNodeConfig(net.shared_config, node.overrides);
    const badIface = IFACE_FIELDS.find(k => !ifaceValid(mergedForCheck[k]));
    if (badIface) {
      showPanelError(actEl, t('ifaceInvalid', { field: mergedForCheck[badIface] }), () => buildNode(net, node));
      return;
    }

    // IP prefixes: empty (use default) or two octets 0-255. No RFC1918 gate.
    const badPrefix = PREFIX_FIELDS.find(k => !prefixValid(mergedForCheck[k]));
    if (badPrefix) {
      showPanelError(actEl, t('prefixInvalid', { field: mergedForCheck[badPrefix] }), () => buildNode(net, node));
      return;
    }

    // '|' would corrupt the wifi_networks table (its field delimiter); mergeNodeConfig
    // blanks disabled networks' SSID/password, so only active ones are checked.
    const badWifiText = WIFI_TEXT_FIELDS.find(k => !wifiTextValid(mergedForCheck[k]));
    if (badWifiText) {
      showPanelError(actEl, t('wifiPipeInvalid', { field: badWifiText }), () => buildNode(net, node));
      return;
    }

    // IPv6 host IDs: 1-4 hex digits, not 0 (::0 is the network address).
    const badOctet = firstInvalidIpv6Octet(mergedForCheck.IPV6_SERVER_LIST);
    if (badOctet !== null) {
      showPanelError(actEl, t('octetV6Invalid'), () => buildNode(net, node));
      return;
    }

    // Table host column becomes UCI section names / DHCP hosts. HOST_NAME has no
    // input on /networks (always ''), so only the tables are checked here.
    const badHost = firstInvalidHost(mergedForCheck.PORT_FORWARD_LIST) || firstInvalidHost(mergedForCheck.IPV6_SERVER_LIST);
    if (badHost !== null) {
      showPanelError(actEl, t('hostnameInvalid', { field: badHost }), () => buildNode(net, node));
      return;
    }

    if (!ddnsHostnameValid(mergedForCheck.LOOKUP_HOSTNAME)) {
      showPanelError(actEl, t('ddnsHostnameInvalid', { field: mergedForCheck.LOOKUP_HOSTNAME }), () => buildNode(net, node));
      return;
    }

    if (!macValid(mergedForCheck.WAN_MAC_ADDR)) {
      showPanelError(actEl, t('macInvalid', { field: mergedForCheck.WAN_MAC_ADDR }), () => buildNode(net, node));
      return;
    }

    const badPort = firstInvalidPort(mergedForCheck.PORT_FORWARD_LIST) || firstInvalidPort(mergedForCheck.IPV6_SERVER_LIST);
    if (badPort !== null) {
      showPanelError(actEl, t('portInvalid', { field: badPort }), () => buildNode(net, node));
      return;
    }

    // Per-VLAN PSK: the enabled networks' WiFi passwords must be distinct (a
    // blank one uses the shared default), since the password steers a client
    // onto its VLAN.
    const pskIssue = pskVlanPassIssue(mergedForCheck);
    if (pskIssue) {
      showPanelError(actEl, t('pskVlanPass', { networks: pskIssue.networks.join(', ') }), () => buildNode(net, node));
      return;
    }

    showPanelProgress(actEl, 2, S.preparing);

    const tgt = node.device_target;
    const extraPkgs = parseAdditionalPackages(net.shared_config.additional_packages);
    const rootPasswd = node.overrides.ROOT_PASSWD || net.shared_config.ROOT_PASSWD || '';
    const effectiveVersion = node.overrides.version || tgt.version || net.shared_config.shared_version;
    // DNS mode this build uses - captured up front so an auto-retry compares
    // against it rather than a value a concurrent sibling build may have moved.
    const builtDns = net.shared_config.DNS_MODE || 'https-dns-proxy';

    Promise.all([bcryptHash(rootPasswd), resolveVersionedTarget(net, node)])
      .then(async ([adguardHash, vt]) => {
      showPanelProgress(actEl, 5, S.preparingBuild);

      const fullCfg = mergeNodeConfig(net.shared_config, node.overrides);
      // Fit the trunk list to a swconfig switch's 16 slots (panel notes the drop).
      const vlanTrunc = truncateAdditionalVlans(fullCfg, tgt.target);
      if (vlanTrunc.truncated) fullCfg.ADDITIONAL_VLAN_LIST = vlanTrunc.list;
      const packages = ui.computeFinalPackages(vt, fullCfg, extraPkgs);
      const asuUrl = activeAsu.replace(/\/+$/, '') + '/api/v1/build';

      let wrtnovaBody;
      try {
        wrtnovaBody = await ui.fetchWrtnovaBody();
      } catch (e) {
        showPanelError(panelActEl(node.id) || actEl, t('buildFailed', { msg: e.message }), () => buildNode(net, node));
        return;
      }

      if (adguardHash) fullCfg.ADGUARD_PASSWD = adguardHash;
      let built;
      try {
        built = await ui.assembleScriptForBuild(fullCfg, wrtnovaBody);
      } catch (e) {
        showPanelError(panelActEl(node.id) || actEl, t('buildFailed', { msg: e.message }), () => buildNode(net, node));
        return;
      }
      const asuBody = buildAsuBody({
        tgt, version: effectiveVersion, version_code: vt.version_code,
        packages: ui.withBase64Pkg(packages, built.compressed),
        defaults: built.script,
      });

      showPanelProgress(panelActEl(node.id) || actEl, 8, S.submittingToServer);
      let asuR, asuData;
      try {
        asuR = await fetch(asuUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(asuBody),
        });
        asuData = await asuR.json();
        if (asuR.status !== 200 && asuR.status !== 202) throw new Error(
          asuData.detail || ('ASU HTTP ' + asuR.status)
        );
      } catch (e) {
        const el = panelActEl(node.id) || actEl;
        const mode = planDnsAutoRetry(net, node, builtDns, e.message);
        if (mode) {
          showPanelProgress(el, 2, dnsAutoRetryNote(mode));
          setTimeout(() => buildNode(net, node), 2000);
        } else {
          showPanelError(el, t('buildFailed', { msg: e.message }), () => buildNode(net, node));
        }
        return;
      }

      const asuBase = asuUrl.replace('/api/v1/build', '');

      if (asuR.status === 200) {
        finishNodeBuild(net, node, panelActEl(node.id) || actEl, asuData, asuBase);
        return;
      }

      if (!asuData.request_hash) {
        showPanelError(panelActEl(node.id) || actEl, S.unexpectedBuildServer, () => buildNode(net, node));
        return;
      }
      pollNodeBuild(net, node, panelActEl(node.id) || actEl, asuData.request_hash, asuBase, builtDns);
    })
    .catch(err => showPanelError(panelActEl(node.id) || actEl,
      t('buildFailed', { msg: err.message }), () => buildNode(net, node)));
  }

  function pollNodeBuild(net, node, actEl, hash, asuBase, builtDns) {
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
            showPanelProgress(panelActEl(node.id) || actEl, 8, t('inBuildQueue', { n: data.queue_position }));
          } else {
            pct = Math.min(94, pct + (pct < 85 ? 8 : 2));
            showPanelProgress(panelActEl(node.id) || actEl, pct, S.building);
          }
          return;
        }
        clearInterval(interval);
        nodeBuilds.delete(node.id);
        const el = panelActEl(node.id) || actEl;
        if (r.status === 200) {
          showPanelProgress(el, 100, S.buildCompleteExcl);
          setTimeout(() => finishNodeBuild(net, node, panelActEl(node.id) || el, data, base), 1500);
        } else {
          const errMsg = data.detail || 'HTTP ' + r.status;
          const mode = planDnsAutoRetry(net, node, builtDns, errMsg);
          if (mode) {
            showPanelProgress(el, 2, dnsAutoRetryNote(mode));
            setTimeout(() => buildNode(net, node), 2000);
          } else {
            showPanelError(el, t('buildFailed', { msg: errMsg }), () => buildNode(net, node));
          }
        }
      } catch (e) {
        if (tries > 200) {
          clearInterval(interval);
          nodeBuilds.delete(node.id);
          showPanelError(panelActEl(node.id) || actEl, t('pollingFailed', { msg: e.message }), () => buildNode(net, node));
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
      if (bb) { bb.className = 'btn text-xs py-0.5 px-2'; bb.textContent = S.build; }
      const sub = row.querySelector('.text-xs.text-zinc-500');
      if (sub) {
        const isAp = node.overrides.AP_MODE === '1';
        const ipStr = nodeLanIp(net, node);
        sub.textContent = (node.device_target.title || '') + ' · ' +
          (isAp ? t('apNum', { n: node.overrides.AP_INDEX || '2' }) : S.router) +
          (ipStr ? ' · ' + ipStr : '') +
          ' · ' + t('builtAgo', { ago: timeAgo(node.last_build.timestamp) });
      }
    }
    showPanelDone(net, node, actEl, images, data.bin_dir || '', base, () => buildNode(net, node));
    updateBuildAllRow(node.id, firmwareUrl, null);
  }

  function buildAll(net) {
    // Block the whole fleet build on a genuine VLAN conflict in the shared config.
    if (detectVlanConflict(net.shared_config)) {
      const progressEl = document.getElementById('build-all-progress');
      if (progressEl) {
        progressEl.classList.remove('hidden');
        progressEl.innerHTML =
          '<div class="card p-3 mt-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 border-amber-300/40 dark:border-amber-700/40">' +
          '<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          '<span>' + S.fixVlanConflict + '</span>' +
          '</div>';
        setTimeout(() => { progressEl.classList.add('hidden'); progressEl.innerHTML = ''; }, 3000);
      }
      return;
    }

    const ready = net.nodes.filter(n => n.device_target.profile);
    if (!ready.length) {
      const progressEl = document.getElementById('build-all-progress');
      if (progressEl) {
        progressEl.classList.remove('hidden');
        progressEl.innerHTML =
          '<div class="card p-3 mt-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 border-amber-300/40 dark:border-amber-700/40">' +
          '<svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          '<span>' + S.noDevicesSelected + '</span>' +
          '</div>';
        setTimeout(() => { progressEl.classList.add('hidden'); progressEl.innerHTML = ''; }, 3000);
      }
      return;
    }

    const progressEl = document.getElementById('build-all-progress');
    if (!progressEl) return;

    progressEl.classList.remove('hidden');
    let done = 0;
    progressEl.innerHTML =
      '<div class="card p-4 mt-4">' +
      '<p class="ba-title text-xs font-semibold mb-3 text-zinc-500 dark:text-zinc-400">' +
        t(ready.length > 1 ? 'buildingNodesPlural' : 'buildingNodes', { n: ready.length }) + '</p>' +
      // Name and status share a text line, the bar spans the full width below
      // it. Keeping the bar out of the text row is what makes this line up: a
      // 6px bar can never sit on the same baseline as 12px type, and the old
      // three-column row left it floating above both labels.
      '<div class="space-y-4">' +
      ready.map(n =>
        '<div id="ba-row-' + esc(n.id) + '" class="space-y-1.5">' +
        '<div class="flex items-baseline gap-3">' +
        '<span class="text-xs font-medium truncate flex-1 min-w-0">' + esc(n.name) + '</span>' +
        '<span class="ba-status text-xs text-zinc-500 dark:text-zinc-400 truncate flex-none max-w-[60%] text-right"></span>' +
        '</div>' +
        '<div class="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded overflow-hidden">' +
        '<div class="ba-bar h-full bg-blue-500 transition-all duration-500" style="width:2%"></div></div>' +
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
          if (title) title.textContent = t('allNodesBuilt', { n: ready.length });
        }
      });
    });
  }

  // The status slot carries the running text (queue position, "Building…", the
  // DNS auto-retry note) and is then replaced in place by the download link or
  // the error, so a finished row reads the same as a running one.
  function updateBuildAllRow(nodeId, firmwareUrl, errMsg) {
    const row = document.getElementById('ba-row-' + nodeId);
    if (!row) return;
    const bar = row.querySelector('.ba-bar');
    const status = row.querySelector('.ba-status');
    if (status) status.removeAttribute('title');
    if (errMsg) {
      if (bar) { bar.style.width = '100%'; bar.style.background = '#ef4444'; }
      if (status) status.innerHTML = '<span class="text-red-500 dark:text-red-400" title="' + esc(errMsg) + '">' + S.error + '</span>';
    } else {
      if (bar) { bar.style.width = '100%'; bar.style.background = '#22c55e'; }
      if (status)
        status.innerHTML = firmwareUrl
          ? '<a href="' + esc(firmwareUrl) + '" target="_blank" class="text-blue-500 hover:underline">' + S.download + '</a>'
          : '';
    }
  }

  function updateBuildAllProgress(nodeId, pct, label) {
    const row = document.getElementById('ba-row-' + nodeId);
    if (!row) return;
    const bar = row.querySelector('.ba-bar');
    if (bar) bar.style.width = pct + '%';
    if (label != null) {
      const status = row.querySelector('.ba-status');
      // The DNS auto-retry note is wider than the slot, so it truncates - the
      // title is the only way to read the rest of it.
      if (status) { status.textContent = label; status.title = label; }
    }
  }

  async function startBuildAllNode(net, node, onComplete) {
    const tgt = node.device_target;
    const extraPkgs = parseAdditionalPackages(net.shared_config.additional_packages);
    const rootPasswd = node.overrides.ROOT_PASSWD || net.shared_config.ROOT_PASSWD || '';
    const adguardHash = await bcryptHash(rootPasswd);
    // DNS mode this build uses - captured before any concurrent sibling build
    // can downgrade the shared value (see planDnsAutoRetry).
    const builtDns = net.shared_config.DNS_MODE || 'https-dns-proxy';

    const effectiveVersion = node.overrides.version || tgt.version || net.shared_config.shared_version;
    let vt;
    try {
      vt = await resolveVersionedTarget(net, node);
    } catch (e) {
      updateBuildAllRow(node.id, null, e.message);
      onComplete();
      return;
    }

    const fullCfg = mergeNodeConfig(net.shared_config, node.overrides);
    const packages = ui.computeFinalPackages(vt, fullCfg, extraPkgs);
    const asuUrl = activeAsu.replace(/\/+$/, '') + '/api/v1/build';

    let wrtnovaBody;
    try {
      wrtnovaBody = await ui.fetchWrtnovaBody();
    } catch (e) {
      updateBuildAllRow(node.id, null, t('buildFailed', { msg: e.message }));
      onComplete();
      return;
    }

    if (adguardHash) fullCfg.ADGUARD_PASSWD = adguardHash;
    let built;
    try {
      built = await ui.assembleScriptForBuild(fullCfg, wrtnovaBody);
    } catch (e) {
      updateBuildAllRow(node.id, null, t('buildFailed', { msg: e.message }));
      onComplete();
      return;
    }
    const asuBody = buildAsuBody({
      tgt, version: effectiveVersion, version_code: vt.version_code,
      packages: ui.withBase64Pkg(packages, built.compressed),
      defaults: built.script,
    });

    let asuR, asuData;
    try {
      asuR = await fetch(asuUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asuBody),
      });
      asuData = await asuR.json();
      if (asuR.status !== 200 && asuR.status !== 202) throw new Error(
        asuData.detail || ('ASU HTTP ' + asuR.status)
      );
    } catch (e) {
      const retryMode = planDnsAutoRetry(net, node, builtDns, e.message);
      if (retryMode) {
        updateBuildAllProgress(node.id, 5, dnsAutoRetryNote(retryMode));
        setTimeout(() => startBuildAllNode(net, node, onComplete), 2000);
      } else {
        updateBuildAllRow(node.id, null, t('buildFailed', { msg: e.message }));
        onComplete();
      }
      return;
    }

    const asuBase = asuUrl.replace('/api/v1/build', '');

    if (asuR.status === 200) {
      finishBuildAllNode(net, node, asuData, asuBase);
      onComplete();
      return;
    }

    if (!asuData.request_hash) {
      updateBuildAllRow(node.id, null, S.unexpectedBuildServer);
      onComplete();
      return;
    }
    pollBuildAllNode(net, node, asuData.request_hash, asuBase, onComplete, builtDns);
  }

  function pollBuildAllNode(net, node, hash, asuBase, onComplete, builtDns) {
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
            updateBuildAllProgress(node.id, 8, t('queueNum', { n: data.queue_position }));
          } else {
            pct = Math.min(94, pct + (pct < 85 ? 8 : 2));
            updateBuildAllProgress(node.id, pct, S.building);
          }
          return;
        }
        clearInterval(interval);
        nodeBuilds.delete(node.id);
        if (r.status === 200) {
          updateBuildAllProgress(node.id, 100, S.done);
          finishBuildAllNode(net, node, data, base);
        } else {
          const errMsg = data.detail || 'HTTP ' + r.status;
          const retryMode = planDnsAutoRetry(net, node, builtDns, errMsg);
          if (retryMode) {
            updateBuildAllProgress(node.id, 5, dnsAutoRetryNote(retryMode));
            setTimeout(() => startBuildAllNode(net, node, onComplete), 2000);
            return;   // the rebuild owns onComplete()
          }
          updateBuildAllRow(node.id, null, errMsg);
        }
        onComplete();
      } catch (e) {
        if (tries > 200) {
          clearInterval(interval);
          nodeBuilds.delete(node.id);
          updateBuildAllRow(node.id, null, S.pollingFailedSimple);
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

  // -- Device picker -------------------------------------------------
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
    updatePacketSteeringOpts(best);
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
      empty.textContent = q ? S.noDevicesFound : (DP.devicesByTitle ? S.noDevicesLoaded : S.loading);
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
    status.textContent = S.loading;
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
      status.textContent = t('errorLoadingDevices', { msg: e.message });
    }
  }

  async function dpPickDevice(title) {
    const profile = DP.devicesByTitle?.[title];
    if (!profile) return;
    const status = document.getElementById('dp-status');
    status.textContent = S.loadingDeviceDetails;
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
        if (!newAllPkgs.some(p => /^kmod-mt7915e$/.test(p)))
          node.overrides.WED_ENABLE = '';
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
          const bb = row.querySelector('[data-buildbtn]'); if (bb) { bb.className = 'btn text-xs py-0.5 px-2'; bb.textContent = S.build; }
          const sub = row.querySelector('.text-xs.text-zinc-500');
          if (sub) {
            const isAp = node.overrides.AP_MODE === '1';
            sub.textContent = title + ' · ' + (isAp ? t('apNum', { n: node.overrides.AP_INDEX || '2' }) : S.router) + ' · ' + nodeLanIp(net, node) + (node.last_build ? ' · ' + t('builtAgo', { ago: timeAgo(node.last_build.timestamp) }) : '');
          }
        }
      }
      document.getElementById('modal-device-picker').close();
    } catch(e) {
      status.textContent = t('error') + ': ' + e.message;
    }
  }

  // -- WARP prefill -------------------------------------------------
  // Scoped to page lifetime - cleared on reload so each new page load gets a fresh reg.
  let _warpSessionToken = '';

  async function prefillWarp() {
    const btn = document.getElementById('warp-prefill-btn');
    const msg = document.getElementById('warp-prefill-msg');
    if (!btn) return;
    const lbl = btn.querySelector('span') || btn;
    btn.disabled = true;
    const origText = lbl.textContent;
    lbl.textContent = S.fetchingWarp;
    if (msg) { msg.textContent = ''; msg.classList.add('hidden'); }
    try {
      const r = await fetch('/api/warp/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warp_refresh_token: _warpSessionToken }),
      });
      let data;
      try { data = await r.json(); } catch (_) { data = {}; }
      if (!r.ok) {
        const friendly = r.status === 429 || (data.message || '').includes('429')
          ? S.warpTooMany
          : (data.message || data.error || S.warpFailed);
        throw new Error(friendly);
      }
      const f = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
      f('WG_PRIVATE_KEY',  data.WG_PRIVATE_KEY);
      f('PEER_PUBLIC_KEY', data.PEER_PUBLIC_KEY);
      // WARP hands back host and port apart; the form shows them joined.
      f('ENDPOINT',        joinEndpoint(data.ENDPOINT, data.ENDPOINT_PORT));
      f('WG_IPV4',         data.WG_IPV4);
      f('WG_IPV6',         data.WG_IPV6);
      f('ALLOWED_IPS',     data.ALLOWED_IPS);
      // Prefill implies WG on: enable it and fire a bubbling change so syncStore,
      // visibility refresh and card auto-expand run as for a manual toggle.
      const wgEn = document.getElementById('WG_ENABLE');
      if (wgEn) { wgEn.checked = true; wgEn.dispatchEvent(new Event('change', { bubbles: true })); }
      if (data.warp_refresh_token) {
        _warpSessionToken = data.warp_refresh_token;
        const net = getNet(st.networkId);
        if (net) { net.warp_refresh_token = _warpSessionToken; saveNetworks(); }
      }
      if (ui.setDot) ui.setDot('wg', 'touched');
      if (msg) { msg.textContent = S.warpSuccess; msg.style.color = '#16a34a'; msg.classList.remove('hidden'); }
    } catch(e) {
      if (msg) { msg.textContent = e.message; msg.style.color = '#dc2626'; msg.classList.remove('hidden'); }
    }
    btn.disabled = false;
    lbl.textContent = origText;
  }

  function initCardToggles() {
    ui.initCardToggles('#config-form');
  }

  // -- Init ----------------------------------------------------------
  function init() {
    fetch('/api/session').catch(() => {});
    loadAsuServer();

    initCardToggles();

    // Wire up ui.js helpers for the config form (they attach to document.body
    // so they work regardless of which view is visible)
    if (ui.initConditionalVisibility) ui.initConditionalVisibility();
    if (ui.initTaggedLanGuard) ui.initTaggedLanGuard();
    if (ui.initPasswordToggles) ui.initPasswordToggles();
    if (ui.wireDotTouches) ui.wireDotTouches();
    if (ui.wireSubnetAnchors) ui.wireSubnetAnchors();

    // Timezone combo (tzdata.js exposes ui.initTzCombo + ui.loadTzdata)
    if (ui.loadTzdata) ui.loadTzdata().then(() => { if (ui.initTzCombo) ui.initTzCombo(); }).catch(() => {});

    // banIP pickers for the Firewall card: lazy (kept out of the initial JS budget).
    import('/js/banip.js').then(() => { ui.initBanipChips(); return ui.loadBanipData(); }).catch(() => {});

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

    // Modals - backdrop close
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

    // Delete cancel
    document.getElementById('btn-cancel-delete')?.addEventListener('click', () => document.getElementById('modal-delete').close());
    document.getElementById('btn-cancel-delete-node')?.addEventListener('click', () => document.getElementById('modal-delete-node').close());

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
