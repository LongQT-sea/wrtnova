# WrtNova Project Context

This repo implements the WrtNova firmware builder per docs/SPEC.md.

## Invariants — never violate
- wrtnova.sh is the canonical source of truth. Never modify it from frontend work.
  When fields/behavior change, update wrtnova.sh first, then regenerate via
  scripts/embed-wrtnova.mjs.
- The marker "# ===================\n# End config section\n# ==================="
  in wrtnova.sh splits config block (rendered per build) from body (embedded).
- No SPDX license headers in any source file except wrtnova.sh (MIT) and LICENSE.
- Tailwind CSS via standalone CLI is the only build step. No Node bundler.
- Mobile-first responsive. Breakpoint 768px. All features usable at 375px width.
- Lighthouse Performance ≥95 on mobile slow 4G. Budget: 30KB JS / 15KB CSS initial.
- Native HTML primitives (`<dialog>, <details>, <select>`) over custom widgets.

## Workflow
- Reference docs/SPEC.md sections by number when implementing features.
- After any wrtnova.sh edit, run `node scripts/embed-wrtnova.mjs`.
- Verify the build still produces a working image via test deploy to CF Pages.

## Frontend conventions — follow exactly, no exceptions
- `/builder` is the reference implementation. Before adding any feature to `/networks`,
  read how `/builder` does the equivalent thing first.
- Checkbox off-state: always emit `''` (empty), never `'0'`. Use `checkboxVal()` in
  build.js / `gv()` in networks.js (which returns `''` for unchecked). `renderConfigBlock`
  skips both `''` and `'0'`, but the source should never produce `'0'`.
- Boolean flags in `mergeNodeConfig`: use `flag(v)` helper (`v === '1' ? '1' : ''`).
  Never use `v || ''` for booleans — `'0'` is truthy and leaks through.
- `defaultConfig()` in networks.js: no `'0'` or pre-filled string defaults that match
  wrtnova.sh defaults. Use `''` so nothing redundant is emitted.
- The build path is fully client-side: pages resolve packages via `ui.computeFinalPackages`
  (shared `resolvePackages`) and POST the assembled defaults script straight to the ASU
  server's `/api/v1/build`. There is no `/api/build` worker.
- `/api/warp/register` requires a session cookie. Every page that can register WARP must
  ping `/api/session` on init.
- WARP API (`/api/warp/register`) returns uppercase keys: `WG_PRIVATE_KEY`,
  `PEER_PUBLIC_KEY`, `ENDPOINT`, `ENDPOINT_PORT`, `WG_IPV4`, `WG_IPV6`, `ALLOWED_IPS`.
  Use `wrtnova_warp_refresh` as the localStorage key (shared between pages).
- IPv6 expose table empty state: pre-fill with `docker-host / 20 / 80 443` (matches
  `ui.initDynamicRows` in ui.js).
- WireGuard card (`#card-wg`): only auto-expand when the user directly toggles
  `WG_ENABLE` on. Check `e?.target?.id === 'WG_ENABLE'` in the visibility handler —
  never force `open = true` on form load.

## What to check before declaring a task done
- The Tailwind output (public/style.css) is regenerated
- public/wrtnova.sh is regenerated if wrtnova.sh changed (via scripts/embed-wrtnova.mjs)
- No new console errors in browser
- Mobile layout works at 375px (DevTools responsive mode)
