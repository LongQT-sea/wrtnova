# Phase 0 Research: WrtNova Frontend Rewrite

## R1 — What "the wrtnova.sh default" actually means (Principle V)

**Decision**: A key's default, for the purpose of "never emit a redundant
default", is the runtime fallback in the **script body** (`${KEY:-fallback}`),
**not** the assignment in the config section at the top of `wrtnova.sh`.

**Rationale**: The browser slices `wrtnova.sh` at the section marker and keeps
only the body. The entire config section — including lines like `GUEST_ENABLE=1`
and `DOT11KV=1` — is discarded and replaced by the rendered override block. Those
assignments are the defaults a human sees when editing the raw script; they are
not in force at build time.

The consequence is asymmetric and easy to get wrong in both directions:

| Key | Config-section value | Body fallback | Emitting `'1'` is |
| --- | --- | --- | --- |
| `GUEST_ENABLE` | `1` | *(none — unset means off)* | **required** |
| `DOT11KV` | `1` | *(none)* | **required** |
| `DOT11R` | `1` | *(none)* | **required** |
| `BASE_NET_PREFIX` | `"192.168"` | `${BASE_NET_PREFIX:-192.168}` | redundant |
| `DEFAULT_SUBNET` | `"/24"` | `${DEFAULT_SUBNET:-/24}` | redundant |
| `LAN_VLAN_ID` | *(empty)* | `${LAN_VLAN_ID:-1}` | redundant at `1` |

Reading the config section as the default set would silently disable the guest
network for every user who left it on. Reading only the body fallbacks is
correct.

**Alternatives considered**: parsing the config section as the default table
(rejected — wrong, per above); hardcoding a hand-maintained default table with no
link to the script (rejected — it drifts the first time the user edits the
script). The chosen approach records each key's default in the schema and adds a
test that parses the real `wrtnova.sh` body and fails when a schema default and
the script's `:-` fallback disagree, so a drift is caught rather than shipped.

**Extracted body fallbacks** are captured in `contracts/config-keys.md`.

## R2 — View framework

**Decision**: React 19 with Vite 6, TypeScript, no meta-framework.

**Rationale**: The hard parts of this product are a searchable picker over
several thousand board titles, a timezone type-ahead, and two multi-select chip
pickers — all of which need correct keyboard, focus, and screen-reader behavior
that Radix primitives supply. A multi-page Vite build maps onto the two HTML
entry points without a router that would want opinions about `functions/`.

**Alternatives considered**:
- *Svelte 5 + SvelteKit*: runes model the derived-config problem more elegantly
  and the output is smaller, but the static adapter's relationship with
  repository-root Pages Functions adds friction for no governed benefit, since
  bundle size is explicitly ungoverned.
- *Keep vanilla ES modules*: rejected. The specific failure mode of the previous
  codebase — the DOM as source of truth, and a field list hand-mirrored between
  two pages — is what a typed schema plus a real store exists to prevent.
- *Next.js / Astro*: server-rendering machinery this app has no use for.

## R3 — State management

**Decision**: Zustand with selector subscriptions; the configuration itself is a
flat `Config` record, and everything derived from it is a pure selector.

**Rationale**: One store, one raw record, pure derivation on top is the model the
previous code arrived at (`store.mjs` + `deriveConfig`) and it was the right one.
Zustand keeps it while giving per-field subscriptions, so a keystroke in one of
110 inputs does not re-render the rest. React context with `useReducer` would
re-render every consumer on every change.

**Alternatives considered**: React Hook Form (rejected — it wants to own field
state and validity, which duplicates the derivation core), Jotai (comparable;
Zustand chosen for the smaller surface and simpler devtools story).

## R4 — Type-level enforcement of Principle IV

**Decision**: `type Flag = '' | '1'`, and every boolean key in `Config` is typed
`Flag`.

**Rationale**: The previous codebase enforced "never `'0'`" with a convention, a
helper function, and a CI grep. Making `'0'` unrepresentable in the type moves
the guarantee from a lint pass to the compiler. The renderer still skips `'0'`
defensively, and a test asserts it, for values arriving from restored history
written by an older version.

## R5 — Locale completeness without a CI script

**Decision**: A `MessageId` union type derived from the English catalogue; each
locale is typed `Record<MessageId, string>`.

**Rationale**: A missing or misspelled key in any of the six non-English
catalogues becomes a compile error. This replaces three separate CI scripts
(`check-i18n-html`, `check-i18n-locales`, `check-i18n-diacritics`) with the type
system. Diacritic checking is dropped as a check and handled by the catalogues
being plain TypeScript string literals rather than HTML attributes.

**Alternatives considered**: `i18next` (rejected — the app needs interpolation
and lazy loading and nothing else; the existing hand-rolled `t()` is ~15 lines
and already works). Existing catalogues are ported, not rewritten, so no
translation is lost.

## R6 — bcrypt for the AdGuard Home admin password

**Decision**: Replace the vendored `public/js/bcrypt.js` global-script shim with
the `bcryptjs` npm package, keeping the deterministic-salt derivation exactly as
it is (SHA-256 of the password, first 16 bytes, encoded as the bcrypt salt).

**Rationale**: The determinism is load-bearing for FR-032 — a stable hash is what
makes a rebuild byte-identical and lets the ASU server serve a cached image.
Changing the derivation would break cache hits for every existing user, so it is
preserved exactly; only the module packaging changes.

## R7 — Preserving user data across the rewrite

**Decision**: Keep the existing `localStorage` keys and payload shapes verbatim,
and port the three data migrations already present in the current code.

**Rationale**: A user with four saved networks must not lose them to a redesign.
The migrations to carry forward are: `LAN_WG_*` keys renamed to `LAN_VPN_*` in
history entries; `HOST_NAME` moved from a network's shared config to the main
router node's overrides; and `WAN_MAC_ADDR` removed from router-node overrides
where it was clobbering the shared value. Each is covered by a test with a
fixture captured from the current format.

## R8 — Fonts

**Decision**: Self-host Archivo, Public Sans, and JetBrains Mono as subset
variable fonts; drop IBM Plex Mono; use a system stack for CJK.

**Rationale**: Self-hosting avoids a third-party origin on a page that handles
secrets, which matters for the product's central privacy claim. Public Sans is
chosen over Inter for body text specifically because the Russian locale needs
Cyrillic coverage that is designed rather than fallen back to. A CJK webfont
would cost megabytes to serve one locale and is not worth it.

## R9 — Testing approach

**Decision**: Vitest for `core/` and the stores; Playwright for two end-to-end
smoke flows (single-node build, fleet build-all) against a mocked ASU server.

**Rationale**: Testing strategy is ungoverned, so this is sized to risk rather
than to a policy. The risk is concentrated in the pure derivation functions, and
those are exactly what is cheapest to test without a DOM. The five invariant CI
scripts being retired are re-expressed as tests in that suite, so nothing that
was previously gated becomes ungated:

| Retired script | Replacement |
| --- | --- |
| `check-no-zero` | Flag type + a test emitting every checkbox off |
| `check-marker` | A test reading real `wrtnova.sh` for exactly one marker |
| `check-no-dupes` | Single-module core; no duplication to detect |
| `check-budget` | Dropped — budgets are ungoverned |
| `check-no-undef` | TypeScript with `noUncheckedIndexedAccess` |
| `check-i18n*` | The `MessageId` union (R5) |
