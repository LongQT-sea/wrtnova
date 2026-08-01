# Third-Party Licenses

WrtNova (this repository) is MIT-licensed (see `LICENSE`). It bundles a small
number of third-party assets, each under its own license, listed here.

## Bundled in this repository

| Asset | Path | License | Upstream |
| --- | --- | --- | --- |
| tzdata.lua | `public/tzdata.lua` | Apache-2.0 | LuCI / OpenWrt, `luci.sys.zoneinfo.tzdata` |
| Archivo | `public/fonts/archivo-*.woff2` | SIL OFL-1.1 | Omnibus-Type, https://github.com/Omnibus-Type/Archivo |
| Public Sans | `public/fonts/public-sans-*.woff2` | SIL OFL-1.1 | USWDS, https://github.com/uswds/public-sans |
| JetBrains Mono | `public/fonts/jetbrains-mono-*.woff2` | SIL OFL-1.1 | JetBrains, https://github.com/JetBrains/JetBrainsMono |
| Noto Sans | `public/fonts/noto-sans-cyrillic.woff2` | SIL OFL-1.1 | Google, https://github.com/notofonts/latin-greek-cyrillic |

The fonts are subset to the unicode ranges the seven locales need; the subsets
carry the same license as the originals.

The original license header is preserved in `tzdata.lua`. The full Apache-2.0 and
SIL OFL-1.1 license texts are available from the upstream projects linked above.

## Runtime dependencies

Everything else comes from npm and is declared in `package.json` - React,
Zustand and Radix UI (MIT), plus `bcryptjs` (BSD-3-Clause), which derives the
AdGuard Home password hash in the browser. None of them are vendored into this
repository; their license texts ship in `node_modules/`.
