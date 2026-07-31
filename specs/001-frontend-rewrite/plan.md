# Implementation Plan: WrtNova Frontend Rewrite

**Branch**: `rewrite/frontend-speckit` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-frontend-rewrite/spec.md`

## Summary

Rebuild the WrtNova frontend as two pages (`/builder`, `/networks`) on a modern
typed stack, keeping every configuration key and every behavior in the spec while
replacing the interface wholesale. The work splits cleanly in two: a
framework-free, fully typed **core** that owns the configuration contract (field
schema, cross-field gating, VLAN and interface allocation, package resolution,
list grammars, validators, script assembly) and a **view** that renders it. The
core is where correctness lives and where the constitution's invariants are
enforced once; the view is deliberately dumb, so redesigning it later costs
nothing.

## Stack decision

**Vite + React 19 + TypeScript + Tailwind CSS v4 + Zustand + Vitest**, built as a
static multi-page site to `dist/`, deployed on Cloudflare Pages with the existing
`functions/` directory untouched.

The deciding factor is not the view layer, it is the configuration core. The
single largest risk in this rewrite is getting roughly 110 fields and their
cross-field suppression rules exactly right, so that core is written as plain
TypeScript with no framework imports and covered by unit tests — the same pure
functions the previous codebase had, but with a real type system behind the
`Config` contract instead of JSDoc, so a key added to the schema and forgotten in
the derivation is a compile error rather than a silent omission. Around that,
React earns its place on the three genuinely hard widgets this product needs
(a searchable device picker over thousands of boards, a timezone type-ahead, and
two multi-select chip pickers for country and threat-feed lists) where Radix
primitives give keyboard and screen-reader behavior I would otherwise hand-roll
badly; Zustand gives selector-level subscriptions so typing in one of 110 inputs
does not re-render the other 109; Tailwind v4 keeps the design tokens in one CSS
file with no config indirection; and Vite's multi-page build maps directly onto
two HTML entry points without a meta-framework whose router would have to be
talked out of owning `functions/`. Svelte 5 was the close runner-up and would
produce a smaller bundle, but bundle size is explicitly ungoverned now, and
React's accessible-primitive ecosystem is worth more here than the kilobytes.

## Visual direction

### The thesis

A home network is not an abstract config file, it is **four lanes cut out of one
pipe**: LAN, Guest, IoT, VPN. That segmentation is the entire value of the
product, and it is what a nervous first-timer most needs to see. So the design
makes the segments the design system, and makes the thing you watch while you
work a **live plan of the network you are about to build** — not a dump of shell
variables.

### Palette — the cable-pair colors

The four segment colors are the four twisted-pair colors of the T568 wiring
standard: **blue, orange, green, brown**. Every ethernet cable in every house on
earth has exactly these four pairs, in that order, and the product creates
exactly four LAN-side networks. Mapping them in order is honest rather than
decorative, it is instantly legible to anyone who has crimped a cable, and to
everyone else it is simply four distinguishable lanes.

Choosing brown as a first-class interface color is the deliberate risk. Nobody
picks brown. It is justified because the mapping only works if all four pairs are
present, and dropping brown for a safer violet would turn a real reference into a
generic four-color palette.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--seg-lan` | `#2F6BD8` | `#5B8FEA` | LAN lane, primary actions, focus ring |
| `--seg-guest` | `#C26A18` | `#E08A3C` | Guest lane and its fields |
| `--seg-iot` | `#2F7D52` | `#4FA372` | IoT lane and its fields |
| `--seg-vpn` | `#8A5A44` | `#B08067` | VPN lane and its fields |
| `--ground` | `#F5F4F2` | `#16181C` | Page ground |
| `--surface` | `#FFFFFF` | `#1D2025` | Raised surfaces |
| `--ink` | `#1B1A18` | `#E9E8E5` | Primary text |
| `--ink-soft` | `#5E5C58` | `#9B9994` | Secondary text |
| `--rule` | `#E2E0DC` | `#2B2F36` | Hairlines and field borders |
| `--danger` | `#B3261E` | `#F2857D` | Destructive and invalid |

The ground is a warm-neutral grey, close to the colour of a router enclosure,
deliberately not the cream that AI-generated design defaults to, and the dark
mode is a blue-black rather than true black so the neon-on-black sysadmin look is
off the table.

The segment colors are used at three intensities: a solid lane marker, a 12%
tint for field-group backgrounds, and a hairline left edge on the field group
belonging to that segment. Colour is never the only signal — every lane also
carries its name.

### Typography

| Role | Face | Why |
| --- | --- | --- |
| Display | **Archivo** 600/700, tight tracking | A slightly condensed industrial grotesque. Used only for page titles, lane names, and the few large numbers. Confident and engineered without being a "tech startup" face. |
| Body / UI | **Public Sans** 400/500/600 | Carries the 110-field form. Chosen over Inter (the default everyone reaches for) with equally good small-size legibility, and over Instrument Sans. |
| Data | **JetBrains Mono** 400/500 | Only for values that are machine values: IP addresses, VLAN ids, keys, package names, the generated config. Better zero/one/l disambiguation than IBM Plex Mono, which matters when someone is reading back a WireGuard key. |
| CJK | System stack (`PingFang SC`, `Noto Sans SC`, `Microsoft YaHei`) | Shipping a CJK webfont would cost megabytes for one locale. |

Self-hosted, variable, subset to the ranges each locale needs. IBM Plex Mono is
removed.

**Correction from implementation (T005)**: Public Sans and Archivo ship Latin and
Latin Extended only — neither has Cyrillic, so the claim above that Public Sans
was chosen for its Cyrillic coverage was wrong. The Russian locale is served by
registering **Noto Sans**' Cyrillic subset under the same two family names with a
`unicode-range` that covers only U+0400-04FF. Per-glyph selection means a Latin
page never fetches the Cyrillic file and a Russian page gets a designed face
rather than an arbitrary system fallback. Do not "fix" this by dropping the extra
`@font-face` blocks; that regresses the Russian locale to a system font. The key move is demotion: the old app set its entire interface in mono,
which is what made it read as a developer tool. Here mono means "this is a
literal value", and that meaning is the point.

### Layout

Three regions on desktop, collapsing predictably on a phone.

```
+--------------+-------------------------------+------------------+
| SECTIONS     | SECTION CONTENT               | NETWORK PLAN     |
|              |                               |  (sticky)        |
| Device       |  Wi-Fi                        | +--------------+ |
| Access       |  ---------------------------- | | ROUTER       | |
| Networks     |                               | |  Archer C7   | |
| Wi-Fi     *  |  Country       [VN]           | +--------------+ |
| Internet     |  Main network                 |  | LAN          | |
| Filtering    |   SSID         [__________]   |  | 192.168.1.1  | |
| Security     |   Password     [__________]   |  | vlan 1  /24  | |
| Advanced     |                               |  | Guest        | |
|              | |Guest network       (orange) |  | 192.168.5.1  | |
|              | | SSID          [_________]   |  | vlan 5  /24  | |
|              | | Isolate clients   [x]       |  | IoT      off | |
|              |                               |  | VPN      off | |
|              | |IoT network          (green) | +--------------+ |
|              | | ...                         | | Build image  | |
+--------------+-------------------------------+------------------+
```

- **Left rail**: eight sections, always visible, direct access. Not a wizard —
  a returning user changing one setting should not walk a sequence — but the
  order is the order a first-timer would want to answer them in.
- **Centre**: one section at a time. Field groups belonging to a segment carry
  that segment's hairline edge and tint, so the Guest fields are visibly the
  same thing as the Guest lane on the right.
- **Right**: the signature element (below).

On a phone the rail becomes a horizontally scrolling tab strip pinned under the
header, and the plan panel becomes a bottom sheet with a persistent summary bar
showing the router IP and the build action.

`/networks` reuses the same three-region chassis: the rail and centre edit the
shared configuration, and the right region shows the fleet — one plan card per
node with its own device, address, and build state — with a single build action
for all of them.

### Signature element: the Network plan

A live panel that shows the network the current settings will produce: the router
with its selected hardware at the top, then one lane per enabled segment in
cable-pair colour, each carrying its name, router address, VLAN badge, subnet
mask, and what it is allowed to reach (internet, other lanes, the tunnel).
Disabled segments stay visible but greyed, so the user can see what they are not
getting. Auto-assigned VLAN ids appear here the moment they are resolved, which
is how FR-011's "the assignment must be visible before building" is satisfied
without a warning banner.

This replaces the always-on raw config pane as the primary feedback surface. The
generated config text is still available — masked by default, revealable,
copyable, with a full-script mode — but it moves behind a **"Show generated
config"** disclosure at the bottom of the plan panel. That is the answer to the
open question in the brief: the live pane stays, but it shows the network rather
than the shell variables, because `GUEST_VLAN_ID='5'` tells a first-time user
nothing and `Guest · 192.168.5.1 · vlan 5` tells them everything.

### Motion

One orchestrated moment: selecting a device assembles the plan panel, lanes
staggering in over 240 ms. Everything else is 120 ms state transitions on
colour and opacity only. `prefers-reduced-motion` disables both.

### What was cut

An earlier pass had the lane colours also driving the left rail, the build
button, and the progress bar. That is the accessory to remove: with the whole
chrome coloured, the lanes stop being the loud thing and the page just looks
busy. The rail, buttons, and progress are neutral, and the LAN blue doubles as
the single action colour.

## Technical Context

**Language/Version**: TypeScript 5.7, ES2022 target, Node 22 for tooling

**Primary Dependencies**: Vite 6, React 19, Tailwind CSS v4, Zustand 5,
Radix UI primitives (Dialog, Popover, Select, Checkbox, RadioGroup, Tabs),
`bcryptjs` (replacing the vendored bcrypt script)

**Storage**: browser `localStorage` only. Existing keys and payload shapes are
preserved: `wrtnova_history`, `wrtnova_networks`, `wrtnova_versions`,
`wrtnova_overview_<version>`, `lang`, `theme`, plus `wrtnova_warp_refresh` per
the constitution.

**Testing**: Vitest for the core (pure functions, no DOM) and for store
reducers; Playwright for the two page-level smoke flows already available in the
repo's dev dependencies.

**Target Platform**: evergreen browsers with `CompressionStream` and
`crypto.subtle`; Cloudflare Pages + Pages Functions (`nodejs_compat`) for the
three API routes.

**Project Type**: static multi-page web application with edge functions.

**Performance Goals**: no numeric budget is governed. The working target is that
typing in any field re-renders only that field's subtree and the plan panel.

**Constraints**: the build path must stay entirely in the browser; the
provisioning script must be served at `/wrtnova.sh`; the section marker must be
matched byte-for-byte.

**Scale/Scope**: 2 pages, 8 sections, ~110 configuration keys, 7 locales,
3 edge functions.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle | Status | How this plan satisfies it |
| --- | --- | --- |
| I. `wrtnova.sh` is read-only | PASS | No task touches it. The embed step copies it into `dist/`; `.gitignore` keeps the copy out of version control. Any needed change is emitted as a printed diff. |
| II. Section marker is byte-load-bearing | PASS | The marker is a single frozen constant in `core/script.ts`, written as an explicit string with no template interpolation, and asserted by a unit test that reads the real `wrtnova.sh` and confirms exactly one occurrence. |
| III. Build path 100% client-side | PASS | `core/build.ts` assembles and POSTs to the ASU URL directly. There is no WrtNova build endpoint, and a test asserts the only WrtNova-origin fetches in the app are `/api/session`, `/api/asu-servers`, `/api/warp/register`, `/wrtnova.sh`, and the static data files. |
| IV. Off-state emits `''` never `'0'` | PASS | The `Flag` type is `'' \| '1'`, so `'0'` is not representable in the config type. The renderer additionally skips `''` and `'0'`. A test enumerates every checkbox key with the control off and asserts no `'0'` is emitted. |
| V. No redundant defaults | PASS | Every key carries its script default in the schema; the emitter drops any value equal to it. A test walks the schema against a parsed `wrtnova.sh` and fails on any key whose default is unknown to the schema. |
| VI. WARP contract | PASS | Both pages call `/api/session` on mount. The response type declares the seven uppercase keys. The refresh token persists under `wrtnova_warp_refresh`. |
| VII. Cloudflare Pages | PASS | `functions/` is unchanged and stays at the repository root. `wrangler.toml` keeps `nodejs_compat`. Only the Pages build command and output directory change. |
| VIII. Seven locales | PASS | Locale modules are ported as typed records keyed by a union of message ids, so a missing key in any locale is a compile error. |

No violations. The Complexity Tracking table is therefore omitted.

## Project Structure

### Documentation (this feature)

```text
specs/001-frontend-rewrite/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── config-keys.md
│   ├── asu-build.md
│   └── pages-functions.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── core/                      # framework-free, fully typed, unit-tested
│   ├── types.ts               # Config, Flag, Node, Network, DeviceTarget
│   ├── schema.ts              # the one field schema: key, kind, section, default
│   ├── derive.ts              # single-node gating (replaces builder-config.mjs)
│   ├── merge.ts               # shared + node overrides (replaces config-merge.mjs)
│   ├── vlan.ts                # VLAN + interface allocator, conflict detection
│   ├── packages.ts            # package resolution and collapsing
│   ├── list-grammar.ts        # host|octet|ports rows, endpoint split/join
│   ├── validate.ts            # field predicates and message ids
│   ├── dns.ts                 # DoH providers, bootstrap derivation, engine rules
│   ├── render-config.ts       # config block rendering + POSIX quoting
│   ├── script.ts              # marker constant, assembly, compression
│   ├── asu.ts                 # submit + poll the build server
│   ├── openwrt.ts             # releases, device index, caching
│   └── storage.ts             # localStorage schemas and migrations
├── state/
│   ├── configStore.ts         # Zustand store + derived selectors
│   ├── networksStore.ts       # fleet store
│   └── historyStore.ts
├── ui/                        # design system primitives
│   ├── tokens.css             # the palette and type scale above
│   ├── Field.tsx  Segment.tsx  Combobox.tsx  ChipPicker.tsx
│   ├── PlanPanel.tsx          # the signature element
│   └── ...
├── sections/                  # the eight config sections, shared by both pages
├── pages/
│   ├── builder/
│   ├── networks/
│   └── landing/
├── i18n/
│   ├── ids.ts                 # the message-id union
│   └── en.ts de.ts es.ts fr.ts pl.ts ru.ts zh.ts
└── entries/                   # Vite multi-page HTML entry points

functions/                     # UNCHANGED Cloudflare Pages Functions
public/                        # static assets copied verbatim: tzdata.lua,
                               # countries.txt, banip-feeds.txt, favicon, robots
scripts/embed-wrtnova.mjs      # copies wrtnova.sh -> dist/wrtnova.sh
tests/
├── core/                      # Vitest
└── e2e/                       # Playwright smoke flows
wrtnova.sh                     # UNTOUCHED
```

**Structure Decision**: a `core/` + `state/` + `ui/` split rather than
feature-folders. The configuration contract is the asset with the longest life
and the highest cost of error; isolating it behind a framework-free boundary is
what makes the constitution's invariants enforceable in one place and testable
without a DOM. `functions/` and `wrtnova.sh` keep their current locations because
principles VII and I depend on it.

### Removed by this work

- `public/builder/advanced.html`, `public/js/advanced.js`, and the Monaco
  dependency that only that page used.
- Every link and route to `/builder/advanced`, including in `README.md`.
- `public/fonts/ibm-plex-mono-*.woff2`.
- The old CI gate scripts (`check-no-zero`, `check-marker`, `check-no-dupes`,
  `check-budget`, `check-no-undef`), replaced by typed equivalents in the Vitest
  suite. `check-i18n*` is replaced by the compile-time message-id union.

## Deployment change

Cloudflare Pages settings change from build output `public/` to `dist/`, and the
build command becomes `npm run build` (Vite build, then the embed step that
places `wrtnova.sh` at the output root). `wrangler.toml` keeps
`compatibility_flags = ["nodejs_compat"]`. `functions/` continues to be picked up
from the repository root, so the three API routes are unaffected.
