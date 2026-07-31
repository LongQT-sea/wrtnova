# Quickstart: WrtNova Frontend Rewrite

## Local development

Requires Node 22+.

```sh
npm install
npm run dev            # Vite dev server with both page entries
npm run dev:pages      # wrangler pages dev over the built output, for /api/*
```

`npm run dev` serves the UI with hot reload but no Pages Functions, so tunnel
prefill and the ASU server list are unavailable. Use `npm run dev:pages` when
working on anything that touches `/api/*`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, Vite build to `dist/`, then embed `wrtnova.sh` |
| `npm run embed` | Copy `wrtnova.sh` to `dist/wrtnova.sh` |
| `npm test` | Vitest, the core and store suites |
| `npm run test:e2e` | Playwright smoke flows |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | typecheck + test — the gate before a commit |

## Deploy (Cloudflare Pages)

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Compatibility flags | `nodejs_compat` (already in `wrangler.toml`) |

`functions/` is picked up from the repository root and is unaffected by the
frontend build.

Environment variables (all optional): `ALLOWED_ORIGIN`, `ASU_URL`, `ASU_URL_2`…,
and `PROXY_SERVER` + `PROXY_SECRET` for tunnel prefill.

## Working on the configuration

`src/core/schema.ts` is the single field table. Adding a configuration key means
one edit there — kind, section, script default, gate — and the type system then
requires the derivation and the locale catalogues to keep up. There is no second
place to mirror it.

To confirm coverage after any schema change:

```sh
npm test -- coverage-audit
```

That suite asserts every key in `contracts/config-keys.md` is present in the
schema, has a section, and has a default that agrees with the `${KEY:-…}`
fallback parsed out of the real `wrtnova.sh`.

## Rules that will bite you

- **Never edit `wrtnova.sh`.** It is the user's file. If it needs a change, print
  the diff and stop. `dist/wrtnova.sh` is generated and git-ignored.
- **Never touch the section marker.** Three exact lines, matched byte-for-byte.
- **Off is `''`, never `'0'`.** The `Flag` type makes `'0'` unrepresentable;
  don't widen it.
- **Never POST a config to a WrtNova origin.** The build goes straight to the
  user's chosen ASU server.
- **Don't emit a value equal to the script's body default** — and note the
  default is the `${KEY:-…}` fallback in the body, not the assignment at the top
  of the file. See `research.md` R1; getting this backwards silently disables the
  guest network.
