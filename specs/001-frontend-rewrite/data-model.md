# Phase 1 Data Model: WrtNova Frontend Rewrite

All persistent state is browser-local. There is no server-side model.

## Core types

```ts
/** Off-state is '' and never '0' (Constitution IV). '0' is unrepresentable. */
export type Flag = '' | '1';

/** Every value is a string; absent or '' means "keep the script's default". */
export interface Config {
  // ~110 keys. See contracts/config-keys.md for the authoritative table.
  // Boolean keys are typed Flag; the rest are string.
  GUEST_ENABLE: Flag;
  LAN_VLAN_ID: string;
  // ...
}

/** Entry conveniences that never reach the emitted block unchanged. */
export interface UiOnly {
  wan_type: 'dhcp' | 'pppoe';        // gates PPPOE_*; never emitted
  ENDPOINT: string;                   // "host:port"; split on emit
  IOT_NO_DOT11R_UI: Flag;             // shown positive; inverted on emit
  DNSMASQ_MULTI_INSTANCE: Flag;       // inverted into DNSMASQ_SINGLE_INSTANCE
  additional_packages: string;        // build-only, never emitted
}
```

`RawConfig = Config & UiOnly` is what the store holds and what the form writes.
`EmittedConfig` is what `derive()` produces and the renderer consumes.

## Entities

### DeviceTarget

Resolved from the OpenWrt downloads server. Not user-authored.

| Field | Type | Notes |
| --- | --- | --- |
| `title` | `string` | Display name, e.g. "TP-Link Archer C7 v5". Suffixed with the target when two boards share a title. |
| `profile` | `string` | ASU profile id |
| `target` | `string` | e.g. `ath79/generic` |
| `version` | `string` | Release or `SNAPSHOT` |
| `version_code` | `string` | |
| `default_packages` | `string[]` | Stock set for the target |
| `device_packages` | `string[]` | Board-specific set |
| `images` | `Image[]` | `{ name, type, sha256 }` |

Derived capability flags, computed from the package sets rather than stored:
`hasAth10kCt` (enables the non-CT firmware option), `wedCapable` (presence of
`kmod-mt7915e`), `isSwconfig` (target is `ath79/*`, `ramips/mt7620`, or
`ramips/mt76x8` — caps the VLAN table at 16 slots).

### HistoryEntry — `localStorage["wrtnova_history"]`, newest first, max 5

| Field | Type | Notes |
| --- | --- | --- |
| `ts` | `number` | epoch ms |
| `device` | `{ title, profile, target, version }` | |
| `config` | `Partial<Config>` | **secrets stripped** (FR-034) |
| `additional_packages` | `string[]` | |
| `warp_refresh_token` | `string` | per-entry copy, so restoring reuses that identity |
| `result` | `{ status: 'queued' \| 'success' \| 'error', firmware_url: string \| null }` | |

Consecutive builds with identical device, version, and config replace the top
entry rather than appending.

### Network — `localStorage["wrtnova_networks"]`

| Field | Type |
| --- | --- |
| `id` | `string` |
| `name` | `string` |
| `shared_config` | `Partial<RawConfig>` plus `shared_version` |
| `nodes` | `Node[]` |
| `warp_refresh_token` | `string` |

`HOST_NAME` is deliberately absent from `shared_config`: hostname is per-node.

### Node

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | |
| `name` | `string` | "Main Router", "Living Room", … |
| `device_target` | `DeviceTarget` | may be empty until chosen |
| `overrides` | `Partial<RawConfig>` | layered over `shared_config` |
| `last_build` | `{ ts, firmware_url } \| null` | |

Role is `overrides.AP_MODE`: `'1'` is an access point, `''` is the router. AP
nodes carry `AP_INDEX` (2–254), allocated to the lowest unused value.

### Caches

- `wrtnova_versions` — the release list, 6-hour TTL, refreshed in background.
- `wrtnova_overview_<version>` — the device index for that release, same TTL.
- `wrtnova_warp_refresh` — the current tunnel refresh token (Constitution VI).
- `lang`, `theme` — user preferences.

All cache entries are `{ data, ts }` and are treated as absent when stale or
unparseable. Every write is wrapped so a full or disabled `localStorage` degrades
the feature without breaking the build path.

## Derivation pipeline

```
RawConfig  --derive()-->  EmittedConfig  --renderConfigBlock()-->  block text
   |                          |                                       |
   |                          +-- resolveVlans() / resolveIfaces()    |
   |                          +-- assembleBanipFeeds()                |
   |                          +-- deriveBootstrapDns()                |
   |                                                                  v
   +-- deriveVisibility()  (what the form shows)      header + block + marker + body
   +-- derivePlan()        (the Network plan panel)              |
   +-- resolvePackages()   (the package list)                    v
                                                          POST to ASU
```

`derive()` is a pure function of `RawConfig`. It applies, in order: role gating
(access points drop WAN identity, tunnel termination, port forwarding, DDNS),
parent gating (guest/IoT/tunnel/mesh sub-fields blank when the parent is off),
UI-only transforms (`wan_type` to `PPPOE_*`, endpoint split, inverted flags), and
default suppression (drop any value equal to the script's body fallback).

For the fleet, `merge(shared, overrides)` produces a `RawConfig` and the same
`derive()` runs on the result — one derivation path, not two.

## Allocation rules

**VLAN ids.** Six participating slots (lan, guest, iot, vpn, wan, wan-b). A value
the user typed is an anchor and is fixed. An untouched value is auto-assigned to
the lowest free id at or above its natural default (1, 5, 10, 15, 20, 21),
skipping anchors, already-assigned ids, and ids listed in the trunk. Only three
things block a build: two anchors colliding, an anchor landing on a trunk id, or
exhaustion. Auto-reassignment is never an error and is surfaced in the plan panel.

**Interface names.** Same anchor/auto rule over `lan`, `guest`, `iot`, `lan_vpn`.
An auto that finds its default taken falls back to `vlan<id>` then
`<default>_<id>`. Names owned by the script or OpenWrt (`wan`, `wan_6`, `wanb`,
`wanb_6`, `cellular`, `usb0`, `vpn`, `vpn_6`, `loopback`, `globals`) are reserved
and an anchor hitting one blocks the build.

**Switch-target VLAN cap.** On swconfig targets the hardware table holds 16
entries. Base networks consume one slot each; the remainder is the trunk budget.
Trunk ids beyond the budget are dropped, range-compressed, and reported.
