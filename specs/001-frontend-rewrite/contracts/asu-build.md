# Contract: script assembly and the ASU build server

This is the constitutionally load-bearing path (Principles II, III, V). It runs
entirely in the browser.

## 1. Fetch and slice the provisioning script

```ts
const MARKER = '# ===================\n# End config section\n# ===================\n';
```

`MARKER` is a frozen literal. It is never built by interpolation, never
normalized, never regenerated. Fetch `/wrtnova.sh`, find `MARKER`, and keep
everything **after** it as `body`. A missing marker is a hard error, not a
fallback. The result is cached for the page lifetime, with concurrent first
fetches deduplicated.

A test reads the real `wrtnova.sh` and asserts the marker occurs exactly once.

## 2. Render the config block

For each key in the emitted config, in schema order, skip when:

- the key starts with `_`, or
- the key is build-only (`DNS_MODE`, `NON_CT_ATH10K`, `IRQBALANCE`,
  `additional_packages`), or
- the key is `CUSTOM_SCRIPT` (emitted as its own block, below), or
- the value is `''` or `'0'`, or
- the value equals the script's body default for that key.

Otherwise emit `KEY=<quoted>`, one per line.

**Quoting.** Single quotes unless the value contains one, because single quotes
suppress all expansion — required for bcrypt hashes, which contain `$`. When the
value contains a single quote, fall back to double quotes with `\`, `$`, `` ` ``,
and `"` escaped.

Schema order makes the output byte-stable, which is what FR-032 needs.

## 3. Assemble

```
#!/bin/sh
<SPDX header>

<config block>
<custom-script block, if any>
<MARKER>
<body>
```

The custom script is always gzip+base64 into `/tmp/_user_script.sh`. Displayed
previews use a readable heredoc instead; only the submitted script uses the
compressed form.

## 4. Size limit

ASU caps `uci-defaults` at **40960 bytes**.

If the assembled script is over: keep the header, config block, custom block, and
marker as plaintext (so the config stays readable on the router) and replace the
body with a gzip+base64 blob decoded to `/tmp/wrtnova.sh` and sourced — so it
still sees the plaintext config variables. Compression implies
`coreutils-base64` must be added to the package list.

If it is still over, raise an actionable error naming the likely culprits (port
forwards, IPv6 servers, DoH upstream URLs).

## 5. Submit

```
POST <asu_url>/api/v1/build
Content-Type: application/json

{
  "profile":       string,
  "target":        string,
  "version":       string,
  "version_code":  string,
  "packages":      string[],   // fully resolved; removals as "-name"
  "defaults":      string,     // the assembled script, including secrets
  "diff_packages": true,
  "client":        "wrtnova/2.0"
}
```

`asu_url` is the user's selection. **It is never a WrtNova origin.** No WrtNova
endpoint receives this body, or any part of it.

Responses:

- **200** — cached build, images are in the response. Done.
- **202** — queued; the response carries `request_hash`.
- anything else — error; `detail` carries the reason.

## 6. Poll

`GET <asu_url>/api/v1/build/<request_hash>` every 5 s.

- **202** — still building. Show `queue_position` when > 0, otherwise advance a
  progress estimate.
- **200** — done. Build image URLs as
  `<asu_base>/store/<bin_dir>/<image.name>`, preferring `sysupgrade`, then
  `factory`. Show every image with its `sha256`.
- other — failure. Surface `detail`, and `stderr` when present.

Give up after 200 consecutive network failures.

## 7. Storage auto-retry

When the error matches `/exceed.*storage|storage.*exceed/i`, downgrade `DNS_MODE`
one step and rebuild once, telling the user what changed:

```
adguardhome -> dnsproxy -> https-dns-proxy -> adblock-fast -> none
```

Leaving AdGuard Home also clears `ADGUARD_MAIN_DNS`.

## 8. Package resolution

Final list = stock packages + device packages + config-implied additions + user
extras. A token `-name` removes `name`; removals beat positives everywhere.
Deduplicate, then sort by the name with any leading `-` stripped. `diff_packages:
true` means ASU treats this as the complete desired set, so the ordering must be
deterministic.

## 9. Determinism

Two builds of the same configuration must produce a byte-identical `defaults`
string, so ASU serves the second from cache. This requires: schema-ordered key
emission, sorted packages, and the deterministic bcrypt salt for
`ADGUARD_PASSWD` (SHA-256 of the root password, first 16 bytes).
