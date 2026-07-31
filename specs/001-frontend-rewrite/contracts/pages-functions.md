# Contract: Cloudflare Pages Functions

These three routes are **unchanged** by this rewrite. `functions/` stays at the
repository root and is not rewritten, restructured, or ported. This document is
the client-side contract the new frontend must honor.

## `GET /api/session`

Issues an `HttpOnly` session cookie `wrtnova_sid` (32 lowercase hex characters)
when one is not present.

```json
{ "sid": "…" }
```

**Both pages must call this on mount** (Constitution VI), because
`/api/warp/register` rejects requests without it. Failure is non-fatal: everything
except tunnel prefill continues to work.

## `GET /api/asu-servers`

```json
{ "servers": [ { "label": "sysupgrade.openwrt.org", "url": "https://…" } ] }
```

Derived from the operator's `ASU_URL`, `ASU_URL_2`, `ASU_URL_3`, … environment
variables, defaulting to the official server. The client shows a picker only when
two or more are returned, and defaults to the first. The client additionally
offers a free-form URL field (folded in from the dropped advanced page).

## `POST /api/warp/register`

Requires the session cookie. Body:

```json
{ "warp_refresh_token": "token,device_id,wg_private_key" }
```

Empty registers a fresh device; a populated value reuses the existing one without
generating a new private key.

Response — **uppercase keys, read exactly as written** (Constitution VI):

```json
{
  "WG_PRIVATE_KEY":  "…",
  "PEER_PUBLIC_KEY": "…",
  "ENDPOINT":        "…",
  "ENDPOINT_PORT":   "2408",
  "WG_IPV4":         "…/32",
  "WG_IPV6":         "…/128",
  "ALLOWED_IPS":     "0.0.0.0/0 ::/0",
  "warp_refresh_token": "…"
}
```

Client rules:

1. Persist `warp_refresh_token` under `localStorage["wrtnova_warp_refresh"]`, and
   additionally on the history entry or saved network so restoring one reuses
   that identity.
2. Join `ENDPOINT` and `ENDPOINT_PORT` into the single `host:port` field the form
   shows. A bare IPv6 host must be bracketed, or the next split will lose the
   port.
3. Set `WG_ENABLE='1'`. Without it every field just written is dropped at emit.
4. Report `429` as "too many requests, wait a moment", and a missing
   `PROXY_SERVER`/`PROXY_SECRET` configuration as the feature being unavailable —
   never as a raw error string.

## Guards

`ALLOWED_ORIGIN` is a comma-separated allow-list where `*` matches one subdomain
label. It is CORS enforcement, not a security boundary. Real protection is
Cloudflare rate limiting, configured in the dashboard:

- `/api/warp/register` — 3 requests / 10 s / IP
- `/api/session` — 2 requests / 10 s / IP

There is deliberately **no** `/api/build`. The build path is client-side
(Constitution III), and ASU throttles submissions itself.

## Deployment

`wrangler.toml` keeps `compatibility_flags = ["nodejs_compat"]`, required by the
WireGuard keygen in `functions/api/_wireguard.js`. Pages build settings change
only in output directory (`public/` to `dist/`) and build command.
