# WrtNova

[![CI](https://github.com/LongQT-sea/wrtnova/actions/workflows/ci.yml/badge.svg)](https://github.com/LongQT-sea/wrtnova/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Browser-based OpenWrt firmware builder: pick a device, fill in a config form,
and get a ready-to-flash image with an opinionated first-boot provisioning
script (`wrtnova.sh`) baked in. VLANs, guest/IoT isolation, WireGuard client,
multi-WAN failover, DDNS, AdGuard Home, port forwarding, IPv6 exposure, and
more - configured from one flash.

## What it does

WrtNova is a static web app (plus three thin Cloudflare Pages Functions) that
turns the OpenWrt firmware selector into a guided experience. Three pages:

- **`/builder`** - single-node guided builder: full config form, live config
  preview, WARP prefill, build history.
- **`/builder/advanced`** - a Monaco editor over the raw `wrtnova.sh` plus a
  free-form package list, for people who want to own the script text.
- **`/networks`** - fleet builder: one shared config, per-node device and
  overrides, build-all orchestration for a router + access points.

## How it works

The build path runs **entirely in the browser** - there is no build server.

1. The browser fetches the OpenWrt version list and per-device profile data
   directly from `downloads.openwrt.org`.
2. It resolves the final package list locally.
3. It fetches `/wrtnova.sh`, slices off the static body at a section marker,
   prepends its locally rendered config block (including secrets), and POSTs
   the assembled script as the `defaults` field to the OpenWrt ASU build
   server, then polls ASU for the image link.

Because everything is assembled client-side, **your secrets (root password,
WiFi passphrases, WireGuard keys, API tokens) never touch WrtNova's own
backend.** They go straight from your browser to the ASU server you select.

The backend exists only for the few things the browser cannot do itself: issue
a session cookie (`/api/session`), expose the configured ASU endpoint list
(`/api/asu-servers`), and register a Cloudflare WARP device
(`/api/warp/register`).

For the full architecture, see [SPEC.md](docs/SPEC.md).

## Relationship to `wrtnova.sh`

`wrtnova.sh` is the source of truth for what the firmware actually does. It lives
at the repo root as a tracked, MIT-licensed file. The build step
(`scripts/embed-wrtnova.mjs`) copies it verbatim into `public/wrtnova.sh` (which
is git-ignored) so the browser can fetch it. The whole project is MIT-licensed,
so it is permissively licensed end to end.

## Quick start (local dev)

Requires Node 22+.

```sh
npm install
npm run build:css     # Tailwind -> public/style.css
npm run embed         # copy wrtnova.sh -> public/wrtnova.sh
npx wrangler pages dev public
```

`wrangler.toml` already sets `compatibility_flags = ["nodejs_compat"]`, which
the WARP keygen needs. Open the printed localhost URL and you have the full app.

## Deploy your own (Cloudflare Pages)

Point Cloudflare Pages at a fork of this repo. Build settings:

- Build command: `npm run build:css && npm run embed`
- Build output directory: `public`
- `compatibility_flags`: `nodejs_compat` (already in `wrangler.toml`)

Environment variables (Pages dashboard -> Settings -> Variables):

| Var | Required | Purpose |
| --- | --- | --- |
| `ALLOWED_ORIGIN` | no | Comma-separated CORS origin allow-list; `*` matches one subdomain label. Defaults cover the project's own domains. |
| `ASU_URL` | no | Primary ASU build endpoint. Defaults to the official OpenWrt ASU if unset. |
| `ASU_URL_2`, `ASU_URL_3`, ... | no | Additional ASU endpoints shown in the builder dropdown. |

WARP prefill (`/api/warp/register`) is optional and requires a self-hosted
proxy backend that you provide; without it the feature is simply unused and the
rest of the app works normally. Its configuration is intentionally not
documented here.

## Project layout

```
public/            Cloudflare Pages output (HTML, CSS, JS modules, fonts)
  builder/         /builder and /builder/advanced
  networks/        /networks
  js/              shared ES modules (.mjs) + UI modules
functions/api/     Cloudflare Pages Functions (session, asu-servers, warp)
scripts/           embed step + CI gate scripts
test/              node:test unit tests
src/style.css      Tailwind input
```

See [SPEC.md](docs/SPEC.md) for the full repository map and design.

## Testing and CI

```sh
npm run ci
```

Runs the type check (`tsc --checkJs`), the unit tests (`node --test`), and the
four invariant gates (no `'0'` off-state emission, section-marker integrity,
single-definition shared functions, CSS/JS byte budgets). CI runs the same on
Node 22.

## Contributing

Contributions welcome. This codebase has a few strong, non-obvious invariants -
please read [CONTRIBUTING.md](.github/CONTRIBUTING.md) before opening a PR.

## License

MIT - see [LICENSE](LICENSE). Bundled third-party assets and their licenses are
listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
