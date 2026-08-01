# Contributing to WrtNova

Thanks for your interest. Most of this codebase is ordinary: pick whatever
component shape, naming or layout serves the change. What is *not* negotiable is
a short list of functional invariants - the ones whose violation breaks the built
firmware or leaks the user's secrets. Please skim this whole file before your
first PR. The authoritative reference is `CLAUDE.md`, restated below.

## Getting set up

Requires Node 22+.

```sh
npm install
npm run dev           # Vite dev server, all three pages
npm run dev:pages     # build, then wrangler pages dev dist (adds the Functions)
```

## Run this before every PR

```sh
npm run check
```

It must pass: the type check plus the Vitest suite, which carries the invariants
below that can be checked automatically. CI runs the same on Node 22.

## The hard requirements (do not violate these)

1. **`wrtnova.sh` is the user's file.** `wrtnova.sh` at the repo root is the
   source of truth for the provisioning script, owned and maintained upstream at
   https://github.com/LongQT-sea/wrtnova.sh. Do not edit, stage or commit it as
   part of frontend work. If a change is needed there, propose the diff.

2. **The section marker is byte-load-bearing.** These exact three lines in
   `wrtnova.sh`:

   ```
   # ===================
   # End config section
   # ===================
   ```

   split the per-build config block from the embedded body, and the browser
   slices the fetched script on those exact bytes. Do not reformat, re-space or
   re-generate them. `tests/core/marker.test.ts` guards it.

3. **The build path stays 100% client-side.** Root password, Wi-Fi passphrases,
   WireGuard keys and API tokens are assembled in the browser and POSTed straight
   to the user-chosen OpenWrt ASU server as the `defaults` field. They must never
   pass through a WrtNova backend. This is a published promise in `README.md` and
   on the landing page.

4. **Checkbox off-state emits `''`, never `'0'`.** `KEY='0'` would *set* the
   variable in `wrtnova.sh` rather than leave it unset. The same applies to
   boolean flags in any node-config merge. `tests/core/no-zero.test.ts` fails on
   any `'0'` off-state emission.

5. **Never emit a value identical to the `wrtnova.sh` default.** The config block
   is an override layer; a redundant default is a bug.
   `tests/core/defaults.test.ts` parses `${KEY:-...}` out of the real script and
   checks both directions.

6. **WARP.** `/api/warp/register` requires a session cookie, so any page that can
   register WARP must hit `/api/session` on init. The endpoint returns UPPERCASE
   keys: `WG_PRIVATE_KEY`, `PEER_PUBLIC_KEY`, `ENDPOINT`, `ENDPOINT_PORT`,
   `WG_IPV4`, `WG_IPV6`, `ALLOWED_IPS`. The localStorage key is
   `wrtnova_warp_refresh`.

7. **Deploy target is Cloudflare Pages + Pages Functions.** Keep `session`,
   `asu-servers` and `warp` working. `nodejs_compat` is required for WARP keygen.
   The build output directory is `dist/`.

8. **Keep all seven locales.** en, de, es, fr, pl, ru, zh. English
   (`src/i18n/en.ts`) is the shape every other catalogue is checked against by
   the compiler, so a missing or misspelled key is a build error rather than a
   blank label. No English-only feature.

## Architecture in one paragraph

`src/core/` is pure and framework-free: the ordered field schema, derivation and
gating, POSIX rendering, the ASU client, storage. Everything above it is a view
of a Zustand store over one `RawConfig`, and every derived surface - the plan
panel, the package list, the generated-config disclosure, per-node merges - is a
selector on that store, never a second source of truth. The eight config sections
are mounted unchanged on both pages: they write through `ConfigScopeContext`, so
the same component edits the builder's config on `/builder` and a network's
shared config on `/networks`.

## Comment style

Comments explain *why*, not *what*. Keep them terse and present-tense, use ASCII
`->` for mappings, and reserve banners for real section breaks. ASCII only in
code and comments; locale string values are the exception.

## Commits and PRs

- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `style:`.
- One logical change per commit; one conventional prefix per commit (no
  `feat(a): X; fix(b): Y` compound messages).
- Describe what you tested. For UI changes, confirm the 375px layout.

## Reporting bugs and requesting features

Use the GitHub issue templates. For security issues, do **not** open a public
issue - see [SECURITY.md](SECURITY.md).
