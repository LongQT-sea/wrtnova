# Security Policy

## Reporting a vulnerability

Please report security issues privately. Do **not** open a public GitHub issue
for a vulnerability.

Use GitHub's private vulnerability reporting for this repository
(Security tab -> "Report a vulnerability"). Include reproduction steps and the
affected page or endpoint. You can expect an initial response within a
reasonable time; please allow time for a fix before any public disclosure.

## Threat model (what to keep in mind)

WrtNova's design intentionally puts secrets in the browser. Understanding this
boundary helps when assessing a report.

- **The browser holds and sends secrets.** The assembled provisioning script
  (root password, WiFi passphrases, WireGuard keys, Cloudflare token, AdGuard
  hash) is built in the browser and POSTed directly to the ASU build server the
  user selects. WrtNova's own backend never sees it. A user who selects a
  non-default ASU is trusting that server with their config.

- **Previews and history never expose secrets at rest.** Sensitive fields are
  masked in previews and stripped from saved build history. The one intentional
  unmask is the explicit "copy" action.

- **Origin and session guards are friction, not authentication.** The
  `ALLOWED_ORIGIN` check is browser-enforced CORS and the session cookie is a
  speed bump (`/api/session` is open). Real abuse protection is rate limiting at
  the edge. Treat these as friction, not access control.

- **WARP registration is server-side by necessity.** It needs a server-held
  secret and has no browser CORS path, so it runs in a Pages Function. The
  registration response does reach the browser - that is the point.

## Scope

In scope: the builder web app and the Pages Functions in this repository.

Out of scope: the OpenWrt ASU build servers (report to OpenWrt), the behavior of
the `wrtnova.sh` provisioning script itself (as opposed to how the builder
assembles or serves it), and any self-hosted WARP proxy backend operated by a
deployer.
