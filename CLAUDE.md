# WrtNova Project Context

WrtNova is a browser-based OpenWrt firmware builder. The frontend is being
rewritten from scratch. Everything about the stack, the build tooling, the
visual design, the information architecture and the component structure is open
— pick whatever serves the product best.

The rules below are the only ones that survive the rewrite. They are functional,
not stylistic: the app breaks, or leaks the user's secrets, without them.

## Hard requirements

1. **wrtnova.sh is the user's file.** `wrtnova.sh` at the repo root is the source
   of truth for the provisioning script, owned and maintained by the user. Never
   edit, stage, or commit it. If a change is needed, print the suggested diff and
   let the user apply it. The rewrite is frontend-only.

2. **The section marker is byte-load-bearing.** These exact three lines in
   `wrtnova.sh`:

   ```
   # ===================
   # End config section
   # ===================
   ```

   split the per-build config block from the embedded body. The browser slices
   the fetched script on those exact bytes. Do not reformat, re-space, or
   re-generate them.

3. **The build path stays 100% client-side.** Root password, Wi-Fi passphrases,
   WireGuard keys and API tokens are assembled in the browser and POSTed straight
   to the user-chosen OpenWrt ASU server as the `defaults` field. They must never
   pass through a WrtNova backend. This is a published promise in README.md.

4. **Checkbox off-state emits `''`, never `'0'`.** This is a wrtnova.sh contract:
   `KEY='0'` would *set* the variable rather than leave it unset. The same
   applies to boolean flags in any node-config merge.

5. **Never emit a value identical to the wrtnova.sh default.** The config block
   is an override layer; a redundant default is a bug.

6. **WARP.** `/api/warp/register` requires a session cookie, so any page that can
   register WARP must hit `/api/session` on init. The endpoint returns UPPERCASE
   keys: `WG_PRIVATE_KEY`, `PEER_PUBLIC_KEY`, `ENDPOINT`, `ENDPOINT_PORT`,
   `WG_IPV4`, `WG_IPV6`, `ALLOWED_IPS`. The localStorage key is
   `wrtnova_warp_refresh`.

7. **Deploy target is Cloudflare Pages + Pages Functions.** Keep `session`,
   `asu-servers` and `warp` working. `nodejs_compat` is required for WARP keygen.

8. **Keep all 7 locales.** No English-only rewrite.
