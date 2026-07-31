<!--
Sync Impact Report
==================
Version change: (uninitialized template) -> 1.0.0
Bump rationale: MAJOR (initial ratification). First concrete constitution for the
  WrtNova frontend rewrite. Replaces the unfilled template.

Modified principles: none (no prior version)

Added sections:
  - Core Principles I-VIII (the eight functional hard requirements)
  - Explicitly Ungoverned (negative scope statement)
  - Governance

Removed sections: none

Deliberately EXCLUDED from this document (they governed the pre-rewrite codebase
and are NOT constitutional constraints any more): no-framework / no-bundler rule,
the 30KB JS / 15KB CSS budget, Lighthouse >=95 target, "native HTML primitives
over custom widgets", mobile-first / 375px / 768px as a release gate, ASCII-only
source rule, "/builder is the reference implementation", the `npm run ci` gate
chain (check-no-zero, check-marker, check-no-dupes, check-budget, check-no-undef),
and the "one definition, two runtimes" shared-module discipline.

Follow-up TODOs: none. No placeholder tokens remain.
-->

# WrtNova Constitution

WrtNova is a browser-based OpenWrt firmware builder. This constitution governs
**only** the small set of functional invariants whose violation breaks the built
firmware or leaks the user's secrets. Everything else is deliberately ungoverned
(see "Explicitly Ungoverned" below).

## Core Principles

### I. wrtnova.sh Is Read-Only

`wrtnova.sh` at the repository root is the user's file and the source of truth for
the provisioning script. Contributors and agents MUST NOT edit, stage, or commit
it. A needed change MUST be delivered as a printed suggested diff for the user to
apply manually. This rewrite is frontend-only.

**Rationale**: The script is maintained independently of the web frontend. An
unrequested edit silently changes what every user's router does on first boot.

### II. The Section Marker Is Byte-Load-Bearing

These exact three lines in `wrtnova.sh`:

```
# ===================
# End config section
# ===================
```

split the per-build config block from the embedded body. The browser fetches the
script and slices it on those exact bytes. They MUST NOT be reformatted,
re-spaced, re-cased, or regenerated, and any code that locates them MUST match
them literally.

**Rationale**: A one-byte drift makes the slice fail and every build produce a
script with no configuration or no body.

### III. The Build Path Is 100% Client-Side

The root password, Wi-Fi passphrases, WireGuard keys, and API tokens MUST be
assembled in the browser and POSTed directly to the user-chosen OpenWrt ASU
server as the `defaults` field. They MUST NOT pass through, be logged by, or be
proxied by any WrtNova backend. No server-side build endpoint may be introduced.

**Rationale**: This is a promise published in `README.md`. Routing secrets
through a WrtNova-controlled host would make that promise false.

### IV. Checkbox Off-State Emits `''`, Never `'0'`

A control that is off MUST contribute an empty string to the emitted config, not
the string `'0'`. The same applies to every boolean flag in any node-config merge
or override layer.

**Rationale**: This is a `wrtnova.sh` contract, not a style preference. `KEY='0'`
*sets* the shell variable; the script tests for a set variable, so `'0'` enables
the feature the user just turned off. Only an absent assignment leaves it unset.

### V. The Config Block Is An Override Layer

A config key MUST NOT be emitted when its value is identical to the corresponding
`wrtnova.sh` default. Emitting a redundant default is a defect.

**Rationale**: The block layers on top of the script's own defaults. A written-out
default pins a value that would otherwise track the script, and makes the emitted
config unreadable as "what the user actually changed".

### VI. WARP Registration Contract

Any page able to register a Cloudflare WARP device MUST call `/api/session` during
initialization, because `/api/warp/register` requires the session cookie.
`/api/warp/register` returns UPPERCASE keys and consumers MUST read them as such:
`WG_PRIVATE_KEY`, `PEER_PUBLIC_KEY`, `ENDPOINT`, `ENDPOINT_PORT`, `WG_IPV4`,
`WG_IPV6`, `ALLOWED_IPS`. The refresh token MUST be persisted under the
localStorage key `wrtnova_warp_refresh`.

**Rationale**: Skipping the session ping makes registration fail with a 403 that
looks like an outage. The key casing and storage key are a wire contract shared
across pages.

### VII. Cloudflare Pages Is The Deploy Target

The application MUST deploy as a Cloudflare Pages site with Pages Functions. The
`session`, `asu-servers`, and `warp` functions MUST keep working, and the
`nodejs_compat` compatibility flag MUST remain enabled because the WARP keygen
depends on it.

**Rationale**: This is the production hosting arrangement, and `nodejs_compat`
is a hard runtime dependency of WireGuard key generation.

### VIII. Seven Locales, No English-Only Regression

All seven currently supported locales MUST remain supported. Shipping a version
that is English-only, or that silently drops a locale, is a regression.

**Rationale**: Existing users depend on them.

## Explicitly Ungoverned

The following are **not** constitutional constraints and MUST NOT be treated as
violations by `/speckit-analyze`, `/speckit-converge`, or any review process:

- **Stack and framework.** Any choice is permitted (React, Svelte, Vue, Vite,
  TypeScript, plain ES modules, anything else). Node build steps and bundlers are
  permitted.
- **Build tooling and CI.** No particular script chain, gate, or check is
  mandated. The implementer defines whatever the chosen stack wants.
- **Testing strategy.** No test framework, coverage level, or test-first
  discipline is required.
- **Performance budgets.** No JS/CSS byte budget and no Lighthouse score
  threshold applies.
- **Visual design, typography, color, motion, information architecture, layout,
  and component structure.** Entirely at the implementer's discretion. Fonts may
  be self-hosted, bundled, or dropped.
- **Responsive behavior.** The app should remain usable on a phone, but no
  specific breakpoint or viewport width is a release gate.
- **Source-file conventions.** Character set, comment style, license headers, and
  module organization are unconstrained.
- **Which page is canonical.** No page is the reference implementation for
  another.

## Governance

This constitution supersedes other process documents for the topics it covers,
and only for those topics. Silence here means "unconstrained", never "forbidden".

**Amendment procedure**: Amendments are proposed as a change to this file with a
Sync Impact Report comment at the top, and take effect when merged.

**Versioning policy**: Semantic versioning.
- MAJOR: a principle is removed or redefined in a backward-incompatible way.
- MINOR: a principle or section is added, or its guidance materially expanded.
- PATCH: clarifications, wording, and typo fixes with no semantic change.

**Compliance review**: A change is compliant if it violates none of Principles
I-VIII. Reviewers and automated analysis MUST NOT raise findings sourced from the
"Explicitly Ungoverned" list. Runtime development guidance lives in `CLAUDE.md`,
which restates these same eight requirements and adds nothing binding beyond them.

**Version**: 1.0.0 | **Ratified**: 2026-07-31 | **Last Amended**: 2026-07-31
