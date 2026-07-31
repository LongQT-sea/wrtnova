# Tasks: WrtNova Frontend Rewrite

**Input**: Design documents from `specs/001-frontend-rewrite/`

**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/

**Tests**: Included. The spec's success criteria (SC-002, SC-003, SC-004, SC-005,
SC-008) are zero-defect counts that are only verifiable by an automated check,
and the five retired CI gate scripts are re-expressed here (research.md R9).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency
- **[Story]**: the user story from spec.md this serves

---

## Phase 1: Setup

- [x] T001 Add Vite 6 + React 19 + TypeScript + Tailwind v4 + Zustand + Radix + Vitest to `package.json`; drop `tailwindcss@3`; keep `playwright`
- [x] T002 [P] `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; delete `jsconfig.json`
- [x] T003 [P] `vite.config.ts` with two HTML entries (`builder`, `networks`) plus the landing page, output `dist/`
- [x] T004 [P] Rewrite `scripts/embed-wrtnova.mjs` to copy `wrtnova.sh` into `dist/`; add `dist/` and `dist/wrtnova.sh` to `.gitignore`
- [x] T005 [P] Self-host Archivo, Public Sans, JetBrains Mono as subset variable fonts in `public/fonts/`; delete the three IBM Plex Mono files *(fonts self-hosted; Cyrillic served by Noto Sans under the same family names, see plan.md. The IBM Plex files stay until Phase 11: the superseded `public/` pages still reference them.)*
- [x] T006 Replace `npm run ci` with `npm run check` (typecheck + test); delete `scripts/ci/check-{no-zero,marker,no-dupes,budget,no-undef,i18n-html,i18n-locales,i18n-diacritics}.mjs`
- [x] T007 Update `.github/workflows/ci.yml` to run `npm run check`

---

## Phase 2: Foundational — the typed core

**These block everything. Nothing in the UI can be correct before the core is.**

- [x] T008 `src/core/types.ts` — `Flag = '' | '1'`, `Config`, `RawConfig`, `UiOnly`, `DeviceTarget`, `Node`, `Network`, `HistoryEntry` per data-model.md
- [x] T009 `src/core/schema.ts` — the single ordered field table: key, kind, section, script default, gate. Every key in `contracts/config-keys.md`
- [x] T010 [P] `src/core/list-grammar.ts` — `parseList`, `serializeList`, `clampOctet4`, `ipv6OctetValid`, `normalizeEndpoint`, `joinEndpoint`, hostname/MAC/port/DDNS predicates
- [x] T011 [P] `src/core/vlan.ts` — VLAN allocator, interface allocator, reserved names, conflict detection, swconfig truncation
- [x] T012 [P] `src/core/dns.ts` — DoH provider table, `deriveBootstrapDns`, engine predicates, storage-downgrade ladder
- [x] T013 [P] `src/core/packages.ts` — `computeAdds`, `resolvePackages`, `collapsePackages`, `assembleBanipFeeds`
- [x] T014 `src/core/derive.ts` — single-node gating over `RawConfig`; role gating, parent gating, UI-only transforms, default suppression
- [x] T015 `src/core/merge.ts` — `merge(shared, overrides)` producing a `RawConfig` that feeds the same `derive()`
- [x] T016 [P] `src/core/render-config.ts` — POSIX quoting, key skipping, default suppression, secret masking
- [x] T017 `src/core/script.ts` — the frozen `MARKER` constant, fetch+slice, assembly, gzip+base64 compression, custom-script block
- [x] T018 [P] `src/core/asu.ts` — submit, poll, image URL construction, storage auto-retry
- [x] T019 [P] `src/core/openwrt.ts` — release list, device index, title indexing, word-wise search, TTL cache, stable-release fallback
- [x] T020 [P] `src/core/storage.ts` — localStorage schemas, the three data migrations, safe read/write
- [x] T021 [P] `src/core/validate.ts` — field predicates mapped to message ids
- [x] T022 [P] `src/core/adguard.ts` — deterministic bcrypt derivation via `bcryptjs`; delete `public/js/bcrypt.js`

### Core tests (the retired gates)

- [x] T023 [P] `tests/core/marker.test.ts` — the real `wrtnova.sh` contains the marker exactly once, byte-for-byte *(Constitution II)*
- [x] T024 [P] `tests/core/no-zero.test.ts` — every checkbox key off emits no `'0'` and no key at all *(Constitution IV, SC-003)*
- [x] T025 [P] `tests/core/defaults.test.ts` — parse `${KEY:-…}` out of the real script body and assert every schema default agrees; no emitted value equals its default *(Constitution V, SC-003)*
- [x] T026 [P] `tests/core/coverage-audit.test.ts` — every key in `contracts/config-keys.md` exists in the schema with a section *(FR-006, SC-002)*
- [x] T027 [P] `tests/core/determinism.test.ts` — the same config assembles byte-identically twice *(FR-032, SC-005)*
- [x] T028 [P] `tests/core/vlan.test.ts` — anchors, auto-assignment, trunk collision, exhaustion, swconfig truncation
- [x] T029 [P] `tests/core/derive.test.ts` — role gating, parent gating, inverted flags, endpoint split
- [x] T030 [P] `tests/core/migrations.test.ts` — fixtures in the current storage format restore correctly

**Checkpoint**: the core is correct and provable. UI work can start.

---

## Phase 3: Design system and shell

- [x] T031 `src/ui/tokens.css` — the cable-pair palette, type scale, spacing, light and dark, `prefers-reduced-motion`
- [x] T032 [P] `src/ui/Field.tsx`, `Toggle.tsx`, `TextField.tsx`, `SelectField.tsx`, `RadioRow.tsx` — labelled, described, error-bearing primitives
- [x] T033 [P] `src/ui/Combobox.tsx` on Radix — the device picker, timezone picker
- [x] T034 [P] `src/ui/ChipPicker.tsx` — multi-select with removable chips, for countries and threat feeds
- [x] T035 [P] `src/ui/SegmentGroup.tsx` — the tinted, hairline-edged field group carrying a segment's identity colour
- [x] T036 `src/ui/AppShell.tsx` — three-region chassis; left rail, centre, right panel; phone tab strip and bottom sheet
- [x] T037 [P] `src/ui/ThemeToggle.tsx` and `LangSwitcher.tsx`, persisting to `theme` and `lang`

---

## Phase 4: i18n

- [x] T038 `src/i18n/ids.ts` — the `MessageId` union derived from the English catalogue
- [x] T039 Port `public/js/i18n/en.mjs` to `src/i18n/en.ts` as `Record<MessageId, string>`
- [x] T040 [P] Port de, es, fr, pl, ru, zh the same way; a missing key is a compile error *(Constitution VIII, SC-008)*
- [x] T041 [P] `src/i18n/index.ts` — `t()` with interpolation, browser detection, lazy non-English import, English fallback

---

## Phase 5: User Story 1 — first router, no OpenWrt knowledge (P1) 🎯 MVP

**Goal**: land on `/builder`, find your hardware, accept defaults, get an image.

**Independent Test**: pick a device, press build, receive a download link.

- [x] T042 [US1] `src/state/configStore.ts` — Zustand store over `RawConfig`, selector subscriptions, derived selectors wired to `core/derive.ts`
- [x] T043 [US1] `src/pages/builder/DeviceStep.tsx` — the opening question; nothing else renders until hardware is chosen
- [x] T044 [US1] Release picker with snapshot branches and the one-step stable fallback *(FR-004, FR-005)*
- [x] T045 [P] [US1] `src/sections/Access.tsx` — hostname, root password, SSH key and password auth, timezone, time format
- [x] T046 [P] [US1] `src/sections/Networks.tsx` — base prefix, subnet, the four segments with prefix/interface/VLAN/subnet, trunk list, tagged-LAN guard dialog, packet steering, ULA
- [x] T047 [P] [US1] `src/sections/Wifi.tsx` — country, roaming flags, the four SSIDs and passwords, isolation, channels, log level, WED, mesh backhaul group
- [x] T048 [P] [US1] `src/sections/Internet.tsx` — DHCP vs PPPoE, MAC, WAN tagging, second WAN, bridged WAN port, modem and tethering failover
- [x] T049 [P] [US1] `src/sections/Filtering.tsx` — DNS engine, AdGuard options, DoH presets and upstreams, bootstrap, dnsmasq mode, forced DNS, DoT/DoQ and DoH blocking, banIP countries and feeds
- [x] T050 [P] [US1] `src/sections/Security.tsx` — WireGuard client, split tunnel, port forwards, IPv6 servers, dynamic DNS
- [x] T051 [P] [US1] `src/sections/Advanced.tsx` — offloading, irqbalance, LUCI HTTPS, NTP, reboot, guest curfew, logging, and the disclosure holding extra packages, custom script, and ASU server
- [x] T052 [US1] Version- and hardware-gated options: packet steering `2` on OpenWrt ≥ 24, time format on ≥ 25, ath10k-CT, WED *(FR-023)*
- [x] T053 [US1] Hardware-aware DNS engine default that never overrides an explicit choice *(FR-022)*
- [x] T054 [US1] `src/pages/builder/BuildAction.tsx` — pre-flight validation sweep, progress, queue position, results with checksums, storage auto-retry *(FR-029, FR-030)*
- [x] T055 [US1] Package chip list showing the resolved set before building *(FR-025)*

**Checkpoint**: a first-time user can build an image. This is the MVP.

---

## Phase 6: User Story 2 — reviewing what will be applied (P1)

- [x] T056 [US2] `src/ui/PlanPanel.tsx` — **the signature element**: router card, one lane per segment in cable-pair colour with address, VLAN badge, subnet and reachability; disabled segments greyed; staggered assembly on device selection
- [x] T057 [US2] Auto-assigned VLAN ids and interface names surfaced in the plan before build *(FR-011, FR-012)*
- [x] T058 [US2] "Show generated config" disclosure — masked by default, reveal toggle, full-script toggle, copy that always yields real values *(US2 scenarios 2–4)*
- [x] T059 [P] [US2] Segment colour applied to the matching field groups so form and plan read as one system

---

## Phase 7: User Story 6 — stopped before a mistake reaches hardware (P2)

- [x] T060 [US6] Inline validity: message on blur, released on input, conflict messages that depend on sibling fields re-evaluated across the group
- [x] T061 [US6] Build-time sweep refusing on the first *visible* offender and explaining it *(FR-015)* — a VLAN collision was NOT blocking a build until Phase 7; the allocator now reports per row and the sweep reads it
- [x] T062 [US6] VLAN and interface conflict surfacing in the plan panel *(FR-013)*
- [x] T063 [US6] Shared-password VLAN scheme requiring distinct passwords *(FR-016)*
- [x] T064 [US6] Swconfig trunk truncation notice naming the dropped ids *(FR-014)*
- [x] T065 [US6] Mutually-inert controls forced to what will actually be built, never left lying *(spec edge case)*

---

## Phase 8: User Story 3 — rebuilding and reusing (P2)

- [ ] T066 [US3] `src/state/historyStore.ts` — bounded to 5, secrets stripped, top-entry replacement on identical rebuild *(FR-033, FR-034)*
- [ ] T067 [US3] History surface with device, release, age, download link, restore
- [ ] T068 [US3] Restore reconstructing UI-only shapes (`wan_type`, dnsmasq mode, joined endpoint) and falling back to the nearest release *(FR-035, FR-036)*

---

## Phase 9: User Story 4 — building a whole home network (P2)

- [ ] T069 [US4] `src/state/networksStore.ts` — create, rename, delete, persist; the three migrations from `core/storage.ts`
- [ ] T070 [US4] `src/pages/networks/NetworkList.tsx` — networks with summaries, empty state that invites the first one
- [ ] T071 [US4] Shared-configuration editor reusing every section from Phase 5 unchanged
- [ ] T072 [US4] Node list with per-node device, role, name, address, build state; AP index auto-allocation *(FR-038, FR-039)*
- [ ] T073 [US4] Per-node override panel with its own release and package extras
- [ ] T074 [US4] Per-node plan and generated-config inspection with the same masking *(FR-040)*
- [ ] T075 [US4] Build one node, and build all with independent per-node progress and isolated failures *(FR-041, SC-006)*

---

## Phase 10: User Story 5 — tunnel prefill (P3)

- [ ] T076 [US5] `/api/session` on mount of both pages *(Constitution VI, FR-042)*
- [ ] T077 [US5] Prefill action populating the tunnel fields, enabling the tunnel, persisting the refresh token to `wrtnova_warp_refresh` and to the entry or network *(FR-043, FR-044)*
- [ ] T078 [US5] Plain-language rate-limit and not-configured states *(FR-045)*

---

## Phase 11: Removal and cleanup

- [ ] T079 Delete `public/builder/advanced.html`, `public/js/advanced.js`, and the Monaco dependency
- [ ] T080 Remove every link and route to `/builder/advanced`, including in `README.md`
- [ ] T081 Delete the superseded `public/js/*.js` and `public/js/*.mjs` modules and `public/{builder,networks}/index.html`
- [ ] T082 Delete `test/*.test.mjs` superseded by `tests/core/`
- [ ] T083 Restyle `public/index.html` (the landing page) to the new visual language; drop the advanced-page mention *(clarification)*
- [ ] T084 Update `README.md`: three pages become two, the CI section becomes `npm run check`, the layout section matches the new tree
- [ ] T085 Update `.github/CONTRIBUTING.md` to the eight hard requirements
- [ ] T086 [P] Move `tzdata.lua`, `countries.txt`, `banip-feeds.txt`, `favicon.svg`, `robots.txt`, `_headers` into the new `public/` so they land at the same URLs

---

## Phase 12: Verification

- [ ] T087 [P] `tests/e2e/builder.spec.ts` — device, defaults, build, download against a mocked ASU
- [ ] T088 [P] `tests/e2e/networks.spec.ts` — a router plus three APs, build all, one node failing without stopping the others *(SC-006)*
- [ ] T089 `tests/e2e/no-secret-egress.spec.ts` — assert no WrtNova-origin request carries a secret during a full build *(Constitution III, SC-004)*
- [ ] T090 Manual pass at 375 px on both pages *(SC-009)*
- [ ] T091 Manual pass in all seven locales *(SC-008)*
- [ ] T092 Deploy preview to Cloudflare Pages and build one real image end to end

---

## Dependencies

- Phase 2 blocks everything. Phases 3 and 4 block all UI phases.
- Phase 5 (US1) is the MVP and blocks Phases 6–10 in practice, because they all
  render sections it defines.
- Phase 11 must not run before Phase 5 is working, or the app has no pages.
- Within a phase, `[P]` tasks touch different files and can proceed together.

## Independent delivery

Each user-story phase leaves the app shippable:

- After Phase 5 — a working single-node builder.
- After Phase 6 — plus the plan panel and config inspection.
- After Phase 8 — plus history.
- After Phase 9 — plus the fleet builder.
- After Phase 10 — plus tunnel prefill.
