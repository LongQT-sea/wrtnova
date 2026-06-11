# Dev verification harnesses

Browser-driven checks used to gate the UI ESM migration (SPEC Section 0 Test
Strategy). Not part of `npm test` / `npm run ci` - they launch Chromium via the
`playwright` devDependency and serve `public/` statically, so they run on demand.

## parity-harness.mjs

Differential parity for `/builder`. Drives the form to 250 seeded random states
and dumps the store-derived outputs (raw store, derived config, masked + plain
config render, final package list, live-preview DOM, chip DOM) to JSON. Capture
before a refactor, capture after, diff the two - they must be byte-identical.

    node scripts/dev/parity-harness.mjs /tmp/before.json   # on the base commit
    node scripts/dev/parity-harness.mjs /tmp/after.json    # on the change
    # then diff the .result arrays field-by-field

## parity-harness-networks.mjs

Differential parity for `/networks`. Seeds one network (router + AP, each with a
real device target), navigates list -> detail -> config editor, drives
`#config-form` to 200 seeded random states, and dumps the shared-config store
(`ui.configState`, fed by `readConfig`) plus each node's derived
`mergeNodeConfig` / `computeFinalPackages` / `renderConfigBlock(Masked)`. Capture
before a refactor, capture after, the two JSON dumps must be byte-identical.

    node scripts/dev/parity-harness-networks.mjs /tmp/net-before.json   # on the base commit
    node scripts/dev/parity-harness-networks.mjs /tmp/net-after.json    # on the change
    cmp /tmp/net-before.json /tmp/net-after.json                        # must match

## smoke.mjs

Covers what parity can't: cross-page module boot (`/networks`,
`/builder/advanced`), the store-first `applyStorePatch` mechanism (WARP prefill +
DNS auto-retry), and history restore. Exits non-zero on any failure.

    node scripts/dev/smoke.mjs
