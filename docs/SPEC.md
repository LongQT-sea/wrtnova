# WrtNova Firmware Builder - Specification

This is the canonical design document for WrtNova: the OpenWrt provisioning
script (`wrtnova.sh`) and the browser-based firmware builder that renders its
configuration and submits builds to the OpenWrt ASU service. Plain ASCII
Markdown. Where this document and the code disagree, the code is authoritative
and this document is the bug.

## Contents

- [1. System Overview](#s1)
- [2. Engineering Standards and Non-Functional Requirements](#s2)
- [3. Repository Layout](#s3)
- [4. Configuration Contract (Variable Dictionary)](#s4)
- [5. List Grammars (PORT_FORWARD_LIST / IPV6_SERVER_LIST)](#s5)
- [6. Build and Embed Pipeline](#s6)
- [7. Deployment Model (Cloudflare Pages)](#s7)
- [8. Backend API](#s8)
- [9. Shared Frontend Infrastructure](#s9)
- [10. /builder - Single-Node Builder](#s10)
- [11. /builder/advanced - Raw Script Editor](#s11)
- [12. /networks - Multi-Node Fleet Builder](#s12)
- [13. Internationalization](#s13)
- [14. Testing and CI Gates](#s14)
- [15. Security Boundaries](#s15)

<a id="s1"></a>

# 1. System Overview

WrtNova turns an OpenWrt device into a fully-configured router or access point
from a single flash. The user picks a device and version, fills in a config
form, and receives a ready-to-flash image with `wrtnova.sh` embedded as a
`uci-defaults` script that runs once on first boot.

Two artifacts make up the product:

1. **`wrtnova.sh`** - an opinionated POSIX shell `uci-defaults` script. It is the
   single source of truth for what the firmware does: VLANs, WiFi, guest/IoT
   isolation, WireGuard client, multi-WAN failover, DDNS, AdGuard Home, port
   forwarding, IPv6 exposure, offloading, and more. It is MIT-licensed and the
   only file in the tree carrying an SPDX header. The canonical copy is the
   tracked `wrtnova.sh` at the repo root.

2. **The web builder** - static HTML/CSS/JS served from Cloudflare Pages, plus a
   thin set of Pages Functions. The browser collects config into a typed store,
   renders the per-build assignment block, prepends it to the `wrtnova.sh` body,
   and POSTs the assembled script to an ASU build server.

## Build path (fully client-side)

The build path runs entirely in the browser. There is no build worker.

1. The browser fetches the OpenWrt version list and per-device profile data
   directly from `downloads.openwrt.org`.
2. It resolves the final package list locally with the shared `resolvePackages`
   (via `ui.computeFinalPackages`).
3. It fetches `/wrtnova.sh`, slices off the static body at the section marker,
   prepends its locally rendered config block (including secrets), and POSTs the
   assembled script as the `defaults` field to the ASU server's
   `/api/v1/build`, then polls ASU directly for progress and the image link.

The backend exists only for the three things the browser cannot do itself:
issue a session cookie (`/api/session`), expose the configured ASU endpoint
list (`/api/asu-servers`), and register a Cloudflare WARP device
(`/api/warp/register`, which needs a server-held secret and has no browser CORS
path).

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Landing page; links to the two builders. |
| `/builder` | Single-node guided builder: full config form, live preview, WARP prefill, build history. |
| `/builder/advanced` | Raw Monaco editor over the full script + free-form package list. |
| `/networks` | Fleet builder: one shared config per network, per-node device/overrides, build-all orchestration. |

<a id="s2"></a>

# 2. Engineering Standards and Non-Functional Requirements

These are hard constraints for any code in this tree. They are restated from
CLAUDE.md and enforced by the CI gates in section 14 where possible.

| NFR | Requirement |
| --- | --- |
| No framework | No React/Vue/Svelte/etc. Native DOM + native HTML primitives (`<dialog>`, `<details>`, `<select>`). |
| No bundler | The only build steps are the Tailwind CLI (`build:css`) and `embed-wrtnova.mjs`. Code sharing uses native ES modules loaded with `<script type="module">`, never a bundler. |
| Byte budget | Initial CSS <= 15 KB gzipped (NFR, enforced). Initial JS target 30 KB gzipped; today's pages exceed it and the gate ratchets at a ceiling above the current size (see `check-budget.mjs`). Heavy assets (Monaco) lazy-load only on the page that needs them. |
| Performance | Lighthouse Performance >= 95 on mobile slow 4G; LCP < 2.5s. |
| Mobile-first | Every feature usable at 375px; breakpoint 768px; touch targets >= 44px; input font >= 16px. |
| ASCII source | Comments and non-translation text are ASCII only. Locale string values are the sole exception. |
| Canonical script | `wrtnova.sh` is the source of truth; regenerate `public/wrtnova.sh` via `embed-wrtnova.mjs` after any edit. |

## Core design rules

**Single source of truth per page.** The DOM is a view, never the state. Each
page owns one typed config store (`store.mjs`). Every derived view - config
preview, auto-package chips, derived router IP, SSID placeholders, VLAN-conflict
warning - is a pure selector of the store, not an independent DOM reader. Build
payloads read the store, not the form.

**Normalize once, at the store boundary.** Values are normalized on entry (on the
`input` event for text, `change` for selects/radios) before they reach the
store. Checkboxes normalize to `''` (off) or `'1'` (on) - never `'0'`. Coercions
like uppercasing `COUNTRY_CODE` are applied to the stored value, not written back
into the field on every keystroke.

**Off-state is `''`, never `'0'`.** `renderConfigBlock` skips both `''` and `'0'`,
but the source must never produce `'0'` for a boolean. Use the `flag(v)` helper
(`v === '1' ? '1' : ''`) in merges, `checkboxVal()` when reading checkboxes.

**Shared logic has exactly one definition, consumed by both runtimes.** Logic that
the browser and the (now thin) backend would otherwise hand-mirror lives in one
typed `.mjs` module imported by both. The CI gate `check-no-dupes.mjs` fails if a
second definition reappears.

**Programmatic config changes go through the store first.** WARP prefill and DNS
auto-retry call `applyStorePatch` (write the store, which notifies selectors,
then reflect the changed keys into the DOM controls). There is no separate
"sync the store" call to forget.

**Typed config contract.** `types.mjs` defines the single `Config` typedef (JSDoc)
that the store, shared modules, and build payloads share, plus the metadata sets
(`SENSITIVE_KEYS`, `BUILD_ONLY_KEYS`) that encode strip/skip rules as data.
`tsc --checkJs --noEmit` type-checks it in CI (no transpile, no bundle).

<a id="s3"></a>

# 3. Repository Layout

```
public/                        Cloudflare Pages output dir (pages_build_output_dir)
  index.html                   landing page
  builder/index.html           /builder
  builder/advanced.html        /builder/advanced
  networks/index.html          /networks
  wrtnova.sh                   generated copy of the canonical script (git-ignored)
  style.css                    Tailwind output (generated)
  favicon.svg, robots.txt, fonts/, tzdata.lua
  js/
    -- pure shared ES modules (.mjs), imported by both UI and tests --
    types.mjs                  Config typedef; SENSITIVE_KEYS; re-exports BUILD_ONLY_KEYS
    store.mjs                  createStore (tiny observable state container)
    render-config.mjs          renderConfigBlock, shQuote, BUILD_ONLY_KEYS
    packages.mjs               computeAdds, resolvePackages
    config-merge.mjs           mergeNodeConfig (shared <- node overrides)
    builder-config.mjs         deriveConfig (/builder cross-field gating selector)
    visibility.mjs             deriveVisibility, deriveNetRows, detectVlanConflict
    list-grammar.mjs           parseList, serializeList (host | octet | ports)
    config-form.mjs            BASE_SCHEMA, readForm/writeForm/keySets (touches DOM)
    ui-ns.mjs                  the shared `ui` namespace object
    -- UI method modules --
    ui.js                      DOM helpers, script assembly, package chips, AdGuard hash
    build.js                   /builder build flow, store, live preview, WARP prefill
    networks.js                /networks fleet builder (views, build orchestration)
    advanced.js                /builder/advanced Monaco editor build flow
    devices.js                 device picker + OpenWrt version/profile fetch
    history.js                 /builder build history (lazy-loaded)
    tzdata.js                  timezone combo (loads tzdata.lua)
    i18n.js                    locale tables + t()/S + DOM binding (7 locales)
    theme.js                   dark/light toggle (classic script)
    app.js                     /builder page entry (wires init order)
    bcrypt.js                  vendored bcrypt (lazy-loaded for AdGuard hash)
functions/api/                 Cloudflare Pages Functions
  session.js                   GET /api/session  -> issue wrtnova_sid cookie
  asu-servers.js               GET /api/asu-servers -> configured ASU endpoints
  warp/register.js             POST /api/warp/register -> WARP device -> WG fields
  _guard.js                    shared origin + session guards
  _wireguard.js                X25519 keygen via Web Crypto Secure Curves (for WARP)
scripts/
  embed-wrtnova.mjs            copy wrtnova.sh -> public/wrtnova.sh
  ci/check-no-zero.mjs         gate: no '0' checkbox off-state emitted
  ci/check-marker.mjs          gate: section marker constant unchanged + present
  ci/check-no-dupes.mjs        gate: shared functions defined once
  ci/check-budget.mjs          gate: CSS NFR + JS ceiling (gzipped)
  dev/parity-harness.mjs       /builder differential parity (Playwright)
  dev/parity-harness-networks.mjs  /networks differential parity (Playwright)
  dev/smoke.mjs                cross-page boot + store-first + restore smoke
test/                          node:test unit tests (see section 14)
src/style.css                  Tailwind input
package.json                   scripts: build:css, watch:css, embed, test, ci gates
tailwind.config.js, jsconfig.json, wrangler.toml, .github/workflows/ci.yml
```

<a id="s4"></a>

# 4. Configuration Contract (Variable Dictionary)

The config block is every shell assignment from the top of `public/wrtnova.sh`
down to the section marker (the `# === ... End config section ... ===` line). The
browser replaces this block per build; everything below the marker is the static
body.

Type values:

- `boolean-flag`: the script treats `1` as ON and anything else (empty or the
  string `0`) as OFF (`[ "$VAR" = 1 ]`). The frontend emits `''` for OFF.
- `string` / `int`: consumed literally / numerically (often clamped by the body).
- `list`: space-separated tokens on one line.
- `multiline`: a here-doc fed line-by-line (the two host lists, section 5).
- `enum-string`: a free string with one magic value (e.g. `SSH_PASSWD_AUTH=off`).

"Default (as written)" is the literal initializer in the config block. "Applied
default" is what the body substitutes when the variable is blank.

### System

| Name | Type | Default | Applied default | Notes |
| --- | --- | --- | --- | --- |
| HOST_NAME | string | `""` | `WrtNova` | Router hostname; base for default SSIDs and the `/etc/hosts` entry. In AP mode becomes `HOST_NAME-AP_INDEX`. |
| ROOT_PASSWD | string | `""` | none | If non-empty, piped to `passwd root`. Also drives the client-side AdGuard bcrypt hash (frontend concern). |
| SSH_PUBLIC_KEY | multiline | `""` | none | If non-empty, appended to `/etc/dropbear/authorized_keys`, one key per line. |
| SSH_PASSWD_AUTH | enum-string | `""` | none | `off` disables Dropbear password + root-password auth. Any other value leaves it enabled. Not a 1/0 flag. |
| ZONE_NAME | string | `""` | none | UCI `system.@system[0].zonename`. On OS v25 spaces become `_`. Emitted only if non-empty. |
| TIME_ZONE | string | `""` | none | UCI `system.@system[0].timezone` (POSIX TZ). Emitted only if non-empty. |

### WiFi

| Name | Type | Default | Applied default | Notes |
| --- | --- | --- | --- | --- |
| DEFAULT_WIFI_PASSWD | string | `""` | `12345678` | Fallback passphrase for any SSID lacking its own password. |
| COUNTRY_CODE | string | empty | none | 2-letter regulatory domain; sets `country=` per radio. Uppercased at the store boundary. |
| WIFI_KVR | boolean-flag | `1` | n/a | 802.11k/v/r fast roaming + band steering; gates usteer. Default ON. |
| DENSE_ENV | boolean-flag | `""` | n/a | Tightens usteer roam/steer thresholds for high-interference areas. |
| LAN_WIFI_SSID | string | `""` | `HOST_NAME` | LAN SSID. |
| LAN_WIFI_PASSWD | string | `""` | `DEFAULT_WIFI_PASSWD` | LAN passphrase. |
| GUEST_WIFI_SSID | string | `""` | `HOST_NAME_Guest` | Guest SSID. |
| GUEST_WIFI_PASSWD | string | `""` | `DEFAULT_WIFI_PASSWD` | Guest passphrase. |
| GUEST_ISOLATE | boolean-flag | `""` | n/a | Adds `isolate=1` to the guest AP iface. |
| IOT_WIFI_SSID | string | `""` | `HOST_NAME_IoT` | IoT SSID. |
| IOT_WIFI_PASSWD | string | `""` | `DEFAULT_WIFI_PASSWD` | IoT passphrase. |
| LAN_VPN_WIFI_SSID | string | `""` | `HOST_NAME_VPN` | WireGuard-VLAN SSID. |
| LAN_VPN_WIFI_PASSWD | string | `""` | `DEFAULT_WIFI_PASSWD` | WireGuard-VLAN passphrase. |
| WIRELESS_MESH | boolean-flag | `""` | n/a | 802.11s wireless backhaul. Force-cleared if no wifi or no wpad-mesh package. |
| BATMAN_ADV | boolean-flag | `""` | n/a | batman-adv over 802.11s. Force-cleared if `luci-proto-batman-adv` absent. Not surfaced in the guided form. |
| MESH_ID | string | empty | `mesh0_5ghz` | 802.11s mesh id. |
| MESH_PASSWD | string | `""` | `DEFAULT_WIFI_PASSWD` | Mesh SAE passphrase. |
| CHANNEL_2G / CHANNEL_5G / CHANNEL_6G | int | empty | none | Manual per-band channel; emitted per radio only if set. |
| WIFI_LOG_LVL | int | empty | none | Per-radio `log_level=`. |

### Network

| Name | Type | Default | Applied default | Notes |
| --- | --- | --- | --- | --- |
| BASE_NET_PREFIX | string | `"192.168"` | `192.168` | First two octets of every subnet unless a per-network prefix overrides it. |
| DEFAULT_SUBNET | string | `"/24"` | `/24` | CIDR suffix for every interface unless overridden (/24 to /22). |
| GUEST_ENABLE | boolean-flag | `1` | n/a | Guest network + VLAN + SSID + zone. Default ON. |
| IOT_ENABLE | boolean-flag | `""` | n/a | IoT network + VLAN + SSID + zone. |
| IOT_INTERNET | boolean-flag | `""` | n/a | Adds `iot -> wan` forwarding. |
| IOT_ROUTE_VIA_WG | boolean-flag | `""` | n/a | Routes IoT egress over the WG client. Only meaningful with IoT + WG both on. |
| LAN/GUEST/IOT/LAN_VPN _BASE_PREFIX | string | empty | `BASE_NET_PREFIX` | Per-network prefix override. |
| LAN/GUEST/IOT/LAN_VPN _SUBNET | string | empty | `DEFAULT_SUBNET` | Per-network CIDR override. Forced /24 on swconfig-without-vid hardware. |
| LAN_VLAN_ID | int | empty | `1` (max 255) | Clamped 1..255; conflict-bumped by +4. |
| GUEST_VLAN_ID | int | empty | `5` (max 255) | Clamped 1..255. |
| IOT_VLAN_ID | int | empty | `10` (max 255) | Clamped 1..255. |
| LAN_VPN_VLAN_ID | int | empty | `15` (max 255) | Clamped 1..255. |
| WAN_VLAN_ID | int | empty | `20` (max 4094) | Clamped 1..4094. |
| WAN_B_VLAN_ID | int | empty | `21` (max 4094) | Clamped 1..4094. |
| ADDITIONAL_VLAN_LIST | list | `""` | none | Extra trunked VLANs; tokens are ints or `low-high` ranges, expanded and added as tagged trunk VLANs. |

VLAN resolution: clamping into range and collision handling are performed by the
frontend allocator (`public/js/visibility.mjs` `resolveVlanAssignment`), which
assigns conflict-free ids up front and emits only non-default values; genuinely
unresolvable conflicts block the build via `detectVlanConflict`. The firmware
script substitutes the per-lane default for any empty field (lan 1, guest 5, iot
10, wg 15, wan 20, wanb 21). On swconfig hardware without `vid` support, all VLAN
IDs are overridden with sequential indices 1..6 and subnets forced to /24.

### IPv4 Port Forwarding and IPv6 Server Exposure

| Name | Type | Default | Notes |
| --- | --- | --- | --- |
| PORT_FORWARD_LIST | multiline | `docker-host \| 20 \| 80 443`, `rdp-server \| 21 \| 3389` | IPv4 NAT port-forwards + static leases. Skipped in AP mode. See section 5. |
| IPV6_SERVER_LIST | multiline | `docker-host \| 20 \| 80 443`, `vps-host \| 23 \|` | IPv6 accept rules + Cloudflare DDNS + static leases. Skipped in AP mode. See section 5. |

### DDNS

| Name | Type | Default | Applied default | Notes |
| --- | --- | --- | --- | --- |
| DDNS_ENABLE | boolean-flag | `""` | `0` | Sets `enabled` on each generated DDNS service. |
| LOOKUP_HOSTNAME | string | empty | `ddns.example.com` | Base lookup host; IPv6 hosts get `hostname.LOOKUP_HOST` subdomains. |
| CLOUDFLARE_API_KEY | string | empty | `cf_api_key` | Cloudflare token used as the DDNS Bearer password. |

### WAN / Multi-WAN

| Name | Type | Default | Notes |
| --- | --- | --- | --- |
| PPPOE_USERNAME | string | `""` | Non-empty switches WAN proto to pppoe (ipv6=0). |
| PPPOE_PASSWD | string | `""` | PPPoE password. |
| WAN_IS_TAGGED | boolean-flag | `""` | Tag WAN_VLAN_ID on the WAN port. Forced `1` on single-NIC devices. |
| WAN_MAC_ADDR | string | empty | Overrides WAN MAC. Must match `^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$`; ignored in AP mode or if malformed. |
| BRIDGE_WAN_PORT | boolean-flag | `""` | Adds the WAN port to br-vlan (IPTV/VoIP/multi-PPPoE). DSA + router-mode only; force-cleared if WAN is br-wan. |
| WAN_B_ENABLE | boolean-flag | `""` | Second WAN interface + VLAN + mwan3 member. |

### WireGuard Client

| Name | Type | Default | Applied default | Notes |
| --- | --- | --- | --- | --- |
| WG_ENABLE | boolean-flag | `""` | force-cleared if `/usr/bin/wg` missing in router mode | Master switch for the WG client iface, VLAN, SSID, watchdog, PBR. In AP mode it only creates the WG VLAN/SSID for trunking (no tunnel). |
| WG_IFACE | string | empty | `vpn` | Logical WG interface name. Not surfaced in the guided form. |
| WG_PRIVATE_KEY | string | empty | `wg genkey` on-device | If blank, a fresh key is generated on the device. |
| WG_IPV4 | string | empty | `172.16.0.2/32` | Client tunnel IPv4 address. |
| WG_IPV6 | string | empty | `fd88::/128` | Client tunnel IPv6 address. |
| PEER_PUBLIC_KEY | string | empty | none | Without it the WG iface stays `disabled=1` and no peer is added. |
| PRESHARED_KEY | string | empty | none | Optional PSK. |
| ENDPOINT | string | empty | `1.2.3.4` | Peer endpoint host. |
| ENDPOINT_PORT | int | empty | `51820` | Peer endpoint port. |
| ALLOWED_IPS | string | `""` | `0.0.0.0/0 ::/0` | Peer allowed IPs. |
| CELLULAR_MODEM | boolean-flag | `""` | force-cleared if `modemmanager` absent | MBIM/ModemManager failover WAN. |
| MODEM_PATH | string | MT7621 sysfs path | used literally | sysfs modem path (MT7621-specific prefill). Not surfaced in the guided form. |
| MODEM_APN | string | `internet` | `internet` | Cellular APN. Not surfaced in the guided form. |
| USB_TETHERING | boolean-flag | `""` | n/a | Android/iPhone USB tether failover (usb0). |

### DHCP

| Name | Type | Default | Applied default | Notes |
| --- | --- | --- | --- | --- |
| LAN_DHCP_START | int | empty | `100` | LAN DHCP pool start octet. |
| GUEST_DHCP_START | int | empty | `100` | Guest DHCP pool start octet. |

### Misc

| Name | Type | Default | Notes |
| --- | --- | --- | --- |
| AP_MODE | boolean-flag | `""` | Access-Point mode: disables DHCP/DNS/WAN; device is AP + managed switch. Gates large swaths of the script. |
| AP_INDEX | int | empty (applied `2`) | AP management IP last octet (2-19); also suffixes the hostname. |
| HARDWARE_OFFLOAD | boolean-flag | `""` | Hardware flow offload; implies SOFTWARE_OFFLOAD. Do not combine with QoS/SQM. |
| SOFTWARE_OFFLOAD | boolean-flag | `""` | Software flow offload. Set to `1` automatically when HARDWARE_OFFLOAD=1. |
| BLOCK_DOT_DOQ | boolean-flag | `""` | Firewall REJECT on port 853 (DoT/DoQ). |
| DENY_GUEST_NIGHT | boolean-flag | `""` | Drops guest -> wan 21:00-07:00. |
| ADGUARD_PASSWD | string | `''` | AdGuard Home admin password (bcrypt). Applied default is the bcrypt of `12345678`. Contains `$`; must be single-quoted when rendered. Set by the frontend to the bcrypt of ROOT_PASSWD. |
| ADGUARD_MAIN_DNS | boolean-flag | `""` | Makes AdGuard Home the primary DNS resolver (binds 0.0.0.0:53, moves dnsmasq to :54). Only meaningful in AdGuard Home DNS mode. |
| LOG | boolean-flag | `""` | Enables `set -x` tracing to `/root/99-asu-defaults.log`. |
| QUARTERLY_REBOOT | boolean-flag | `""` | Adds a quarterly 03:30 reboot cron entry. |

### Build-only keys (never in the config block)

These travel in the build path and drive package resolution, but
`renderConfigBlock` strips them via `BUILD_ONLY_KEYS` and `wrtnova.sh` never
reads them:

- `DNS_MODE`: `adguardhome` | `dnsproxy` | `none`. Selects DNS packages.
- `NON_CT_ATH10K`: `1` swaps ath10k-ct firmware for the non-ct equivalents.

`renderConfigBlock` additionally drops any key beginning with `_` (internal
helpers), plus any value equal to `''` or `'0'`. `wan_type` (`dhcp` | `pppoe`)
is a gating-only helper consumed by the derivation selectors and never emitted.

<a id="s5"></a>

# 5. List Grammars (PORT_FORWARD_LIST / IPV6_SERVER_LIST)

Both variables are multiline here-doc bodies. The script reads each non-empty
line with `IFS='|' read -r hostname octet ports duid`:

```
hostname | last_octet | ports [| duid]
```

Field rules:

- `hostname`: trimmed; becomes the DHCP lease `name`. The UCI section id is the
  hostname with `-` replaced by `_`. Empty hostname skips the line.
- `last_octet`: integer (documented range 20-99). Forms the host IPv4
  `BASE_PREFIX.VLAN.octet` and the IPv6 host id `::octet/-64`.
- `ports`: space-separated port numbers; empty is allowed.
- `duid`: optional 4th column; if absent a DUID is generated, with an in-script
  comment telling the operator to fix each DUID post-boot.

A static DHCP host is created once per hostname across both lists (the first
list wins if a host appears in both).

Semantic difference:

- **PORT_FORWARD_LIST** (`process_host_list ipv4`): for each port, an IPv4 NAT
  port-forward from WAN to `BASE_PREFIX.VLAN.octet:port`. Ports must be unique
  across the list. Empty ports means lease only, no forward.
- **IPV6_SERVER_LIST** (`process_host_list ipv6`): an IPv6 firewall accept rule
  to the host's `::octet/-64` plus a Cloudflare DDNS entry per host. With ports
  listed, the accept rule is scoped to `tcp udp` on those ports; with empty
  ports, all protocols/ports are exposed. The first IPv6 host uses
  `LOOKUP_HOST`; later hosts get `hostname.LOOKUP_HOST` subdomains.

## Frontend grammar module (`list-grammar.mjs`)

`parseList(str)` and `serializeList(rows)` are the single definition of this
grammar, shared by every DOM call site (the dynamic-table read/write in
`ui.serializeRows` and `/networks`, and history restore). A row is
`{ host, octet, ports }`. `parseList` skips blank lines and lines without a `|`;
`serializeList` drops rows with neither host nor octet and wraps the result with
leading/trailing newlines (or `''` when empty). The empty-table default-row
behavior stays in the DOM callers (a view concern, not grammar).

<a id="s6"></a>

# 6. Build and Embed Pipeline

Two independent build steps. Neither is a Node bundler.

## CSS build

```
npm run build:css   ->  tailwindcss -i src/style.css -o public/style.css --minify
npm run watch:css   ->  same, --watch
```

`src/style.css` is the input; `public/style.css` the output.

## Embed step

```
npm run embed       ->  node scripts/embed-wrtnova.mjs
```

`embed-wrtnova.mjs` resolves the repo root and copies the tracked `wrtnova.sh` at
the root verbatim to `public/wrtnova.sh` (aborting if the root file is missing).
It writes exactly one file and does not slice on the marker - the browser does
that itself.

Run `npm run embed` after every `wrtnova.sh` edit. `public/wrtnova.sh` is
git-ignored; CI regenerates it before running the gates.

## The section marker contract

The marker is three consecutive lines:

```
# ===================
# End config section
# ===================
```

- Everything above the marker is the config block (per-build, replaced each
  build).
- Everything from the marker down is the embedded body (static shell logic,
  identical every build).
- The browser (`ui.fetchWrtnovaBody`) fetches `/wrtnova.sh` and slices on the
  exact string `'# ===================\n# End config section\n# ===================\n'`
  (`ui.js` `_SCRIPT_MARKER`) to recover the body, then prepends its rendered
  config block.

The marker text is load-bearing: changing its wording or spacing breaks the
slice. `check-marker.mjs` fails if the `ui.js` constant drifts or (when the
script artifact is present) if the marker is missing from it.

## Script assembly (browser)

`ui.assembleScript(cfg, body, masked)` produces:

```
#!/bin/sh
# WrtNova - generated by the WrtNova frontend
<rendered config block>
# ===================
# End config section
# ===================
<wrtnova.sh body>
```

The config block comes from `renderConfigBlock(cfg)` (or the masked variant for
the preview). The assembled script is the `defaults` field POSTed to ASU.

<a id="s7"></a>

# 7. Deployment Model (Cloudflare Pages)

`wrangler.toml`:

- `pages_build_output_dir = "public"` - static assets and Functions ship from
  `public/` and `functions/`.
- `compatibility_flags = ["nodejs_compat"]`.
- `[vars] ALLOWED_ORIGIN` - comma-separated origin allow-list; `*` matches one
  subdomain label. Defaults include `wrtnova.com` and the Pages preview domains.

Environment variables (set in the CF Pages dashboard):

| Var | Used by | Purpose |
| --- | --- | --- |
| ALLOWED_ORIGIN | `_guard.js` | CORS origin allow-list (browser enforcement only). |
| ASU_URL, ASU_URL_2, ASU_URL_3, ... | `asu-servers.js` | Primary + additional ASU endpoints for the dropdown. Defaults to the official ASU if unset. |
| PROXY_SERVER, PROXY_SECRET | `warp/register.js` | Self-hosted WARP proxy base URL + shared secret. |

There is no KV namespace in use. Routing maps the four HTML pages directly;
`/api/*` resolves to the Pages Functions.

## Sessions and client state

`/api/session` issues an `HttpOnly; SameSite=Lax; Max-Age=1y` cookie
`wrtnova_sid` (32 hex chars) if absent. Every page pings `/api/session` on init
so a session exists before WARP registration. `_guard.js` validates the cookie
shape for endpoints that require it.

All persistent client state lives in `localStorage`, scoped to the browser:

| Key | Owner | Contents |
| --- | --- | --- |
| `wrtnova_history` | /builder | last 5 builds (device, config minus sensitive fields, result). |
| `wrtnova_networks` | /networks | saved fleets (shared_config, nodes, per-network WARP refresh token). |
| `wrtnova_versions` | devices | cached OpenWrt version list (6h TTL). |
| `wrtnova_overview_<v>` | devices | cached device overview per version (6h TTL). |
| `wrtnova_profiles_<v>_<target>` | /networks | cached per-target profile data. |

The WARP refresh token (`"token,device_id,wg_private_key"`) is held in memory for
the page lifetime (`_warpSessionToken`). On /builder it is also stored in each
saved history entry; on /networks it is persisted per network in
`wrtnova_networks`.

<a id="s8"></a>

# 8. Backend API

The backend is intentionally thin. Resulting surface: `session.js`,
`asu-servers.js`, `warp/register.js`, plus the `_guard.js` / `_wireguard.js`
helpers.

## Guards (`_guard.js`)

- `originAllowed(request, env)` - matches `Origin` against `ALLOWED_ORIGIN`
  (subdomain `*` supported). Same-origin requests omit `Origin` and pass. This is
  browser-enforced CORS, not a server-side lock - any non-browser client can
  spoof the header.
- `sessionPresent(request)` - true when `wrtnova_sid` matches `^[0-9a-f]{32}$`.
  Since `/api/session` is open, this is friction, not authentication.
- `guardResponse(request, env, { requireSession })` returns a 403 `Response` or
  `null`.

Real abuse protection is Cloudflare rate limiting, configured in the dashboard
(documented at the top of `_guard.js`): `/api/warp/register` and `/api/session`
are the rate-limited endpoints. There is no build endpoint to limit (the browser
POSTs to ASU directly, and ASU throttles its own submissions).

## GET /api/session

Issues the session cookie if absent. Returns `{ sid }`.

## GET /api/asu-servers

Returns `{ servers: [{ label, url }, ...] }` from `ASU_URL`, `ASU_URL_2`, ...
(the primary defaults to the official ASU). The label is the URL hostname. The
builders show the endpoint dropdown only when more than one server is configured;
otherwise the default ASU is used silently.

## POST /api/warp/register

Requires a session (`requireSession: true`). Body: `{ warp_refresh_token? }`.

- With no token: generates a WireGuard keypair (`_wireguard.js`), POSTs a fresh
  registration to `PROXY_SERVER/warp-api/reg`, and shapes the response.
- With a stored token (`"token,device_id,wg_private_key"`): GETs
  `PROXY_SERVER/warp-api/reg/{device_id}` to reuse the existing device (no new
  private key).

Returns flat, uppercase WG fields ready to drop into the form:
`WG_PRIVATE_KEY`, `PEER_PUBLIC_KEY`, `ENDPOINT`, `ENDPOINT_PORT` (2408),
`WG_IPV4` (`/32`), `WG_IPV6` (`/128`), `ALLOWED_IPS` (`0.0.0.0/0 ::/0`), and
`warp_refresh_token` for replay. `shapeReg` prefers the IPv4 endpoint and strips
the port. The WARP proxy must be configured (`PROXY_SERVER` + `PROXY_SECRET`) or
the call returns 502.

`PROXY_SERVER` must have no trailing slash (the code strips it); a trailing
slash would 301-redirect `/reg` POSTs into a GET and break registration.

## `_wireguard.js`

WireGuard (curve25519/X25519) keygen via the runtime's Web Crypto Secure Curves
API: `crypto.subtle.generateKey({ name: 'X25519' }, ...)`. The runtime generates
and clamps the scalar; the module only reformats the bytes to the standard base64
WireGuard key format (the public key is exported `raw`; the 32-byte private
scalar is read from the JWK `d` field, since raw export of the X25519 private key
is disallowed). Verified in workerd to be byte-compatible with `wg`. Exports
`generateKeypair()`. Because it relies on the runtime crypto rather than a
vendored implementation, the same call could run in the browser if keygen is
moved client-side later, leaving the private key off the server entirely.

<a id="s9"></a>

# 9. Shared Frontend Infrastructure

## The `ui` namespace (`ui-ns.mjs`)

`ui` is a single object imported by every UI module and aliased to
`window.WrtNova` (so the dev harnesses can probe page state). It carries the
cross-file UI methods - DOM helpers (`$`, `$$`), i18n (`ui.t`/`ui.S`), the
timezone combo, script assembly, package chips, and page callbacks
(`ui.startBuild`, `ui.computeFinalPackages`, ...). Pure logic is not bridged
through it: modules import the typed `.mjs` directly.

## The store (`store.mjs`)

`createStore(initial)` is a ~15-line observable container: `get()`,
`set(patch)` (shallow-merge, notifies only when a value actually changed), and
`subscribe(fn)`. One input listener writes the store; subscribed selectors derive
from it.

## Config form schema (`config-form.mjs`)

`BASE_SCHEMA` is the one ordered field list driving DOM <-> config translation,
shared by both builders. Each descriptor is `[key, kind, opt?, radioDefault?]`
where kind is `text | checkbox | radio | select | country | tz | table`. This is
the only place the field list and ordering live; the two pages compose it with
their extras:

- /builder: `[...BASE_SCHEMA, AP_MODE (radio), AP_INDEX (text), NON_CT_ATH10K (checkbox)]`.
- /networks: `[shared_version (select), ...BASE_SCHEMA]` (AP_MODE/AP_INDEX/
  NON_CT_ATH10K are per-node overrides, not shared config).

`readForm(schema)` reads + normalizes every field into a raw object (checkboxes
`''`/`'1'`, COUNTRY_CODE uppercased, timezone via `ui.collectTimezone`, tables
via `ui.serializeRows`) with no cross-field gating. `writeForm(schema, cfg)` is
the full config -> DOM render (timezone/table fields are page-orchestrated).
`keySets(schema)` returns the radio/checkbox key sets for patch-style writes.

## Derivation selectors

These pure functions turn a config object into derived views; the DOM writing
stays in the consuming view layer:

- `deriveConfig(raw)` (`builder-config.mjs`) - /builder cross-field gating:
  AP-vs-router blanking, parent-flag gating (guest/iot/wg/mesh), wan_type gating,
  BUILD-ONLY passthrough. The pure selector the store, preview, chips, and build
  payload all consume.
- `mergeNodeConfig(shared, overrides)` (`config-merge.mjs`) - /networks layer
  merge with the same suppression rules; booleans go through `flag()` so `'0'`
  never leaks.
- `deriveVisibility(cfg)` / `deriveNetRows(cfg)` / `detectVlanConflict(cfg)`
  (`visibility.mjs`) - which `.hidden` classes to toggle, the per-network derived
  IP/prefix/subnet rows, and whether two enabled networks collide on a VLAN id.

## Script assembly + secrets (`ui.js`)

`ui.js` publishes the DOM-facing helpers consumed across pages:

- `fetchWrtnovaBody()` - fetch + cache `/wrtnova.sh`, sliced at the marker.
- `assembleScript(cfg, body, masked)` - the full script (section 6).
- `renderConfigBlockMasked(cfg)` - the preview block with `SENSITIVE_KEYS`
  rendered as `KEY='****'`.
- `SENSITIVE_FIELDS` (= `SENSITIVE_KEYS` from `types.mjs`), `stripSensitive(cfg)`
  - mask in previews; strip from saved history so secrets are never persisted.
- `computeFinalPackages(target, cfg, extra)` - the shared `resolvePackages`
  (base + device + WrtNova additions + user extras, removals collapsed, deduped,
  sorted). The exact list POSTed to ASU.
- `renderPackageChips(el, pkgs)` - chip rendering; removal tokens (`-pkg`)
  struck through. `textContent` only (the list can contain user-typed names).
- `adguardHashFromRoot(pw)` / `injectAdguardPasswd(cfg, onReady)` - the AdGuard
  Home admin password is the bcrypt of ROOT_PASSWD with a salt derived
  deterministically from the password (SHA-256 -> first 16 bytes). The same
  password always yields the same hash, so previews can show it and rebuilds stay
  byte-identical (ASU cache hits). bcrypt's cost still protects the hash.
- `applyVisibility(cfg)` / `applyNetworkRows(cfg)` / `initConditionalVisibility()`
  - the DOM-writing view layer over the visibility selectors, driven by the store
  on every input/change. The only event-dependent behavior is the WG-card
  auto-open, which fires only on a direct `WG_ENABLE` toggle-on, and forcing
  `ADGUARD_MAIN_DNS` off when DNS mode leaves AdGuard Home.

## Package resolution (`packages.mjs`)

`computeAdds({ base, device, config })` is the WrtNova-mandated additions rule
table (the "auto packages" chips). Highlights:

- Always: `curl ip-full umdns luci zram-swap luci-app-commands ip-bridge
  luci-app-ddns ddns-scripts-cloudflare`.
- DNS (router only): `adguardhome` for `DNS_MODE=adguardhome`, `dnsproxy` for
  `dnsproxy`, nothing for `none`.
- Multi-WAN (`WAN_B_ENABLE` / `WWAN_ENABLE` / `CELLULAR_MODEM` / `USB_TETHERING`):
  `luci-app-mwan3`.
- WiFi-capable devices: swap `-wpad-basic-mbedtls` for `wpad-mbedtls`; add
  `luci-app-usteer` when `WIFI_KVR=1`.
- `NON_CT_ATH10K=1`: replace each `ath10k-firmware-*` / `kmod-ath10k-ct*` with
  its non-ct equivalent.
- `WG_ENABLE=1` (router only): `luci-proto-wireguard`.
- `CELLULAR_MODEM=1`: `luci-proto-modemmanager kmod-usb-net-cdc-mbim`.
- `USB_TETHERING=1`: `kmod-usb-net-rndis kmod-usb-net-cdc-ncm kmod-usb-net-ipheth`.

`resolvePackages` merges base + device + adds + extra, applies removal tokens
(`-foo` beats `foo`), dedups, and sorts by name (ignoring the leading `-`).

## Device data (`devices.js`)

Fetches `downloads.openwrt.org/.versions.json` and per-version
`.overview.json` / `targets/<t>/profiles.json` directly (6h `localStorage`
cache, background refresh). Surfaces a searchable device combobox that becomes a
full-screen `<dialog>` below 768px. `collectTarget()` returns the
profile/target/version/version_code + default/device packages the build path
needs. Supported branches and snapshot policy live in `SUPPORTED_BRANCHES` /
`SNAPSHOT_BRANCHES`. Used by /builder and /builder/advanced; /networks has its
own picker (`dp*` functions).

<a id="s10"></a>

# 10. /builder - Single-Node Builder

`app.js` is the page entry; it wires the init order (card toggles, dynamic rows,
password toggles, device combo, tz combo, the config store, conditional
visibility, the build button, the session ping, ASU servers, versions/tzdata
load), then lazy-loads `history.js` when the history card first opens.

## Store and selectors (`build.js`)

`readRawForm()` = `readForm(BUILDER_SCHEMA)`. `collectConfig()` =
`deriveConfig(store.get())`. The store is built once from the initialized form
(`initConfigStore`); subscribers re-render the always-live derived views on every
change: auto-package chips, SSID placeholders, AP-index preview, and the config/
script preview.

Programmatic writes use `applyStorePatch(patch)` (store first, then
`renderConfigToDom`). Used by WARP prefill and DNS auto-retry.

## Live preview

Always-on selector of the store. Toggles: reveal (mask vs show secrets) and full
script (config block vs the full assembled script). The Copy button always copies
the unmasked text (and resolves the AdGuard hash first), regardless of the reveal
toggle. Build `stderr` from a failed ASU build is surfaced into the preview pane.

## Build flow (`startBuild`)

1. Validate: a device is selected, no VLAN conflict, every active WiFi passphrase
   is >= 8 chars.
2. `collectConfig()`, then resolve `ADGUARD_PASSWD` from ROOT_PASSWD.
3. Resolve packages client-side (`computeFinalPackages`) and the ASU URL
   (selected or default + `/api/v1/build`).
4. `fetchWrtnovaBody()` + `assembleScript(cfg, body)`.
5. POST `{ profile, target, version, version_code, packages, defaults,
   diff_packages, client }` to ASU. 200 = cached image; 202 = queued (poll
   `/api/v1/build/<hash>` every 5s until 200/error). Render the image links.
6. Save a (sensitive-stripped) history entry; update its firmware URL when the
   build finishes.

## DNS auto-retry

On an ASU "storage exceeded" error, `tryAutoRetry` downgrades DNS one step
(`adguardhome -> dnsproxy -> none`) via `applyStorePatch` (also clearing
`ADGUARD_MAIN_DNS`) and rebuilds after 2s, showing a localized note.

## WARP prefill

POSTs `/api/warp/register` with the in-memory refresh token, then
`applyStorePatch` of the returned WG fields and stores the new refresh token.
Friendly handling of 429 (too many requests).

## Build history (`history.js`)

Lazy-loaded. Renders the last 5 builds with Download / Restore. Restore selects
the closest available version, the device, then writes the config to the DOM
(tables/timezone/wan_type reconstructed), and re-syncs the store
(`refreshConfigStore` + `refreshConditionalVisibility`).

<a id="s11"></a>

# 11. /builder/advanced - Raw Script Editor

A Monaco editor (loaded from a CDN, the only page that does so) over the full
`wrtnova.sh`, plus a free-form package textarea with one-click preset buttons
(WrtNova core, Full WiFi, WireGuard, Multi-WAN, USB modem, USB tether, Low RAM).
It reuses `devices.js` for device selection and the same ASU submit/poll flow,
but bypasses the config form and store entirely - the user owns the script text.
`luci` is always included unless explicitly removed with `-luci`. There is no
config preview, package chips, history, or WARP prefill on this page
(`renderAutoPackages` / `updateAth10kVisibility` are stubbed).

<a id="s12"></a>

# 12. /networks - Multi-Node Fleet Builder

Builds a whole fleet (one router + access points) from a single shared config.
`networks.js` is a self-contained module with three views: list (saved networks),
detail (a network's nodes), and config (the shared-config editor, reusing
`BASE_SCHEMA` via `NET_SCHEMA`).

## Data model

- **Network**: `{ id, name, shared_config, nodes[], warp_refresh_token, ... }`.
  `shared_config` is the full `defaultConfig()` shape (field names match the
  builder form) plus `shared_version` and `additional_packages`.
- **Node**: `{ id, name, device_target, overrides, last_build }`. A node layers
  per-node `overrides` (including `AP_MODE` / `AP_INDEX` / `NON_CT_ATH10K` and an
  optional version) onto the network's shared config.
- New networks seed a Main Router node (`AP_MODE=''`) and let the user add APs
  (`AP_MODE='1'`, auto-assigned `AP_INDEX` and room name).

The shared-config editor uses the same store + `readForm`/`writeForm` path as
/builder, so the shared config stays byte-identical to what the builder would
produce. The effective node config is the pure derivation
`mergeNodeConfig(shared, overrides)`, which feeds the per-node package list,
preview, and assembled script.

A storage migration in `loadNetworks()` drops `WAN_MAC_ADDR` from saved router
overrides (it belongs to shared config).

## Build orchestration

Each node builds independently (per-panel progress) and the network supports a
build-all. The flow mirrors /builder per node: resolve the versioned target,
bcrypt the effective root password, `mergeNodeConfig`, `computeFinalPackages`,
`assembleScript`, POST to ASU, poll.

DNS auto-retry (`planDnsAutoRetry`) downgrades the network-wide `DNS_MODE` once
on a router node's "storage exceeded" error (router-only, because APs install no
DNS package), comparing the build's captured `builtDns` against the current
shared value so concurrent build-all retries do not double-downgrade.

## Device picker and WARP

`/networks` has its own searchable device picker (`dp*` functions, same OpenWrt
data sources and caching). WARP prefill writes the returned WG fields into the
network's shared config and persists the refresh token on the network object.

<a id="s13"></a>

# 13. Internationalization

`i18n.js` holds locale tables for 7 languages (`en`, `zh`, `de`, `ru`, `pl`,
`fr`, `es`), the `t(key, vars)` lookup with `{var}` interpolation, the `ui.S`
string proxy, and the DOM binding that applies `data-i18n` attributes on load.
It is a dual-mode ES module: it publishes `ui.t` / `ui.S` onto the shared
namespace and is imported by the page modules for its side effects. Locale
selection follows the browser/user preference; `en` is the fallback. Locale
string values are the one place non-ASCII characters are allowed.

<a id="s14"></a>

# 14. Testing and CI Gates

`npm run ci` runs everything; CI (`.github/workflows/ci.yml`, Node 22) first
builds CSS and runs `npm run embed`, then runs the gates.

## Type check

`npm run typecheck` -> `tsc -p jsconfig.json` (`--checkJs --noEmit` over the
JSDoc types). No transpile, no bundle.

## Unit tests (`node --test`, `test/*.mjs`)

| File | Covers |
| --- | --- |
| `shared.test.mjs` | `mergeNodeConfig` (AP/router suppression, parent gating, no `'0'`), `computeAdds`/`resolvePackages` (each rule, removal precedence, dedup/sort, ath10k-ct swap), `renderConfigBlock`/`shQuote` (skip rules, quoting incl. `$` in bcrypt). |
| `list-grammar.test.mjs` | `parseList`/`serializeList` round-trip. |
| `visibility.test.mjs` | `deriveVisibility`/`deriveNetRows`/`detectVlanConflict`. |
| `state-store.test.mjs` | `createStore` (notify-on-change only) + `deriveConfig`. |
| `config-form.test.mjs` | `BASE_SCHEMA` structural invariants. |
| `warp.test.mjs` | `shapeReg` response shaping. |

## Invariant gates (`scripts/ci/*.mjs`)

| Gate | Enforces |
| --- | --- |
| `check-no-zero.mjs` | No `'0'` checkbox off-state emission (ternaries, `\|\| '0'`, `KEY: '0'`) in JS sources. |
| `check-marker.mjs` | The `ui.js` `_SCRIPT_MARKER` constant matches the canonical marker, and (when present) the script artifact contains it. |
| `check-no-dupes.mjs` | Each shared function (`mergeNodeConfig`, `resolvePackages`, `renderConfigBlock`, ...) is defined only in its canonical module. |
| `check-budget.mjs` | CSS <= 15 KB gzipped (NFR); per-page initial JS under the ratchet ceiling. |

## Dev harnesses (`scripts/dev/`, on-demand, Playwright)

Not part of `npm test`. `parity-harness.mjs` and `parity-harness-networks.mjs`
drive each page to hundreds of seeded random states and dump the store-derived
outputs to JSON for byte-identical before/after diffing across a refactor.
`smoke.mjs` covers cross-page module boot, the store-first `applyStorePatch`
mechanism, and history restore.

<a id="s15"></a>

# 15. Security Boundaries

- **The browser holds and sends secrets.** The assembled `defaults` script
  (including root password, WiFi passphrases, WireGuard keys, Cloudflare token,
  AdGuard hash) is built in the browser and POSTed directly to the chosen ASU
  server. WrtNova's own backend never sees it. Users choosing a non-default ASU
  trust that server with their config.
- **Previews and history never expose secrets at rest.** `SENSITIVE_KEYS` are
  masked in previews and stripped from saved history. The Copy button is the one
  intentional unmask.
- **Origin and session guards are friction, not authentication.**
  `ALLOWED_ORIGIN` is browser-enforced CORS; the session cookie is a speed bump
  (`/api/session` is open). The real protection is Cloudflare rate limiting on
  `/api/warp/register` and `/api/session`.
- **WARP registration is server-side by necessity.** It needs `PROXY_SECRET` and
  the WARP API has no browser CORS path; keeping it server-side also hides the
  gateway and credentials. The registration response still reaches the browser
  (that is the point). Generating the WG keypair in the browser later would keep
  the private key off the server.
- **No build-server allow-list enforcement.** Because the browser POSTs to ASU
  directly, there is no server-side ASU allow-list; the endpoint set is whatever
  `asu-servers.js` exposes and the user selects.
