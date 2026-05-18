# OpenWrt API Reference

Reference for all external OpenWrt API calls made by the WrtNova frontend and
CF Pages Functions. Based on firmware-selector v5.0.4 source.

---

## Base URLs

| Service | Base URL |
|---|---|
| Downloads / overview data | `https://downloads.openwrt.org` |
| ASU (Attended Sysupgrade) | `https://sysupgrade.openwrt.org` |

---

## 1. Version List

Fetch once on page load.

```
GET https://downloads.openwrt.org/.versions.json
Cache: no-cache
```

### Response
```json
{
  "versions_list": ["24.10.1", "24.10.0", "23.05.5", "..."],
  "stable_version": "24.10.1",
  "upcoming_version": "...",
  "image_url_override": null
}
```

### Client-side processing
- Filter out unsupported: `/^(19\.07\.\d|18\.06\.\d|17\.01\.\d)$/`
- Append `"SNAPSHOT"` at the bottom of the list
- Pre-select `stable_version` by default
- URL pattern per version:
  - Release: `https://downloads.openwrt.org/releases/{version}`
  - Snapshot: `https://downloads.openwrt.org/snapshots`

---

## 2. Device List (Overview)

Fetch when version changes.

```
GET https://downloads.openwrt.org/releases/{version}/.overview.json
GET https://downloads.openwrt.org/snapshots/.overview.json  (for SNAPSHOT)
Cache: no-cache
```

### Response
```json
{
  "profiles": [
    {
      "id": "tplink_archer-c7-v2",
      "target": "ath79/generic",
      "titles": [
        { "vendor": "TP-Link", "model": "Archer C7", "variant": "v2" }
      ]
    }
  ]
}
```

### Client-side processing
- Build display title from `titles[0]`: `(vendor + " " + model + " " + variant).trim()`
  or use `title` directly if present
- Detect duplicates (same model in multiple targets), append `(target)` to disambiguate
- Build searchable map: `{ "TP-Link Archer C7 v2": { id, target, ... } }`
- Autocomplete: multi-word substring match, highlight matching chars, max 15 results shown

---

## 3. Device Details & Packages

Fetch when a specific device is selected from the autocomplete.

```
GET https://downloads.openwrt.org/releases/{version}/targets/{target}/profiles.json
Cache: no-cache
```

### Response
```json
{
  "version_code": "r12345-abcdefgh",
  "version_number": "24.10.1",
  "build_at": "2024-10-15T10:30:00Z",
  "default_packages": [
    "base-files", "libc", "libgcc", "busybox", "dropbear",
    "mtd", "uci", "opkg", "netifd", "fstools",
    "luci", "luci-app-firewall", "..."
  ],
  "profiles": {
    "tplink_archer-c7-v2": {
      "images": [
        { "name": "openwrt-...-sysupgrade.bin", "type": "sysupgrade", "sha256": "..." },
        { "name": "openwrt-...-factory.bin",    "type": "factory",    "sha256": "..." }
      ],
      "titles": [
        { "vendor": "TP-Link", "model": "Archer C7", "variant": "v2" }
      ],
      "device_packages": ["kmod-ath10k-ct", "ath10k-firmware-qca988x-ct"]
    }
  }
}
```

### Fields used
| Field | Used by | Purpose |
|---|---|---|
| `version_code` | CF Function → ASU | Required in ASU POST body |
| `default_packages` | CF Function | Base package set for the target |
| `profiles[id].device_packages` | CF Function | Device-specific packages |
| `profiles[id].images` | Browser | Determine available image types |

### Package list sent to CF Function
```json
{
  "default_packages": [...],   // target-wide base packages
  "device_packages": [...],    // device-specific additions
  "version_code": "r12345-..."
}
```

---

## 4. ASU Build Request

Called directly from the browser (the build path is fully client-side).

```
POST https://sysupgrade.openwrt.org/api/v1/build
Content-Type: application/json
```

### Request body
```json
{
  "profile":      "tplink_archer-c7-v2",
  "target":       "ath79/generic",
  "version":      "24.10.1",
  "version_code": "r12345-abcdefgh",
  "packages":     ["pkg1", "pkg2", "-removed_pkg"],
  "defaults":     "#!/bin/sh\n# WrtNova\n...<full script>...",
  "diff_packages": true,
  "client":       "wrtnova/1.0"
}
```

### Field notes
- `packages` — full merged list after WrtNova package resolution. Include removal
  tokens (e.g. `-wpad-basic-mbedtls`) as plain strings in the array.
- `defaults` — content written verbatim to `/etc/uci-defaults/99-asu-defaults`
  in the built firmware. This is the full WrtNova script.
- `diff_packages: true` — tells ASU to diff against the base image packages,
  so only additions/removals are tracked. Always set this.
- `version_code` — must match the code from `profiles.json`. ASU rejects mismatches.
- `client` — arbitrary identifier string, shown in ASU logs.

---

## 5. ASU Build Response & Polling

### Initial response: 202 Queued
```json
{
  "request_hash": "abc123def456...",
  "detail": "queued",
  "queue_position": 3
}
```

CF Function returns `request_hash` to browser immediately. Browser polls directly.

### Polling
```
GET https://sysupgrade.openwrt.org/api/v1/build/{request_hash}
Cache: no-cache
```

Poll every 5 seconds while response is 202.

### 202 In-progress
```json
{
  "request_hash": "abc123def456...",
  "detail": "building-image",
  "imagebuilder_status": "building-image"
}
```

### Progress states (map `detail` to display)
| `detail` value | Approx. progress | Display label |
|---|---|---|
| `init` | 5% | Initializing |
| `queued` | 10% | Queued |
| `started` | 12% | Starting build |
| `container-setup` | 15% | Setting up container |
| `download-imagebuilder` | 20% | Downloading imagebuilder |
| `validate-manifest` | 30% | Validating manifest |
| `unpack-imagebuilder` | 40% | Unpacking imagebuilder |
| `calculate-packages-hash` | 60% | Resolving packages |
| `building-image` | 80% | Building image |
| `build-successful` | 100% | Done |

### 200 Build complete
```json
{
  "bin_dir":        "targets/ath79/generic/tplink_archer-c7-v2",
  "images": [
    { "name": "openwrt-...-sysupgrade.bin", "type": "sysupgrade", "sha256": "..." },
    { "name": "openwrt-...-factory.bin",    "type": "factory",    "sha256": "..." }
  ],
  "version_number": "24.10.1",
  "version_code":   "r12345-abcdefgh",
  "build_at":       "2024-10-15T10:35:00Z",
  "stdout":         "...",
  "stderr":         "...",
  "manifest":       { "pkg": "version", "..." : "..." }
}
```

ASU may return 200 immediately (cached build). CF Function checks for this and
includes `firmware_url` in the response if so, allowing browser to skip polling.

### Download URL construction
```
https://sysupgrade.openwrt.org/store/{bin_dir}/{image.name}
```

Prefer `sysupgrade` image type. Fall back to `factory` if no sysupgrade exists.
Show all image types with their sha256 for verification.

### Error responses
```json
{
  "detail": "Package xyz not found",
  "stderr": "...",
  "stdout": "..."
}
```

Common error cases:
- Package not found in this version → show `detail` to user
- `"images are too big"` in `stderr` → firmware exceeds flash size, user must reduce packages
- Build failure → show `detail` + offer to display `stderr` for debugging

---

## 6. Cached Build Detection

ASU caches builds by hash of `(profile, target, version, packages, defaults)`.
If an identical build was requested before, ASU returns 200 immediately without
going through the queue. The CF Function should handle both 200 and 202 from
the initial POST:

```
Initial POST response:
  200 → build was cached, return firmware_url directly to browser
  202 → build queued, return request_hash, browser polls
```