# WrtNova

Zero-touch provisioning and orchestration framework for OpenWrt.

`wrtnova.sh` is a single POSIX shell script that runs once on a router's first
boot and configures the whole device — VLAN segmentation, WiFi, WireGuard VPN,
multi-WAN failover, network-wide ad blocking and encrypted DNS, Cloudflare DDNS,
mesh, IPv6, and more — based on a small block of settings at the top of the file.

It detects your hardware (DSA vs swconfig switches, radios) and
picks the right configuration automatically, so you don't have to know the
internals to get a sensibly-configured router.

## Just want a configured router?

**Use the builder → [wrtnova.com/builder](https://wrtnova.com/builder)**

The web builder fills in the settings for you, adds the required packages, and
produces a ready-to-flash firmware image — no shell editing, no mistakes. This
is the recommended path for almost everyone.

## What this repo is for

This repository publishes the configuration script itself, so you can:

- **Read exactly what will run on your device** before you flash it.
- **Report bugs** via [Issues](https://github.com/LongQT-sea/wrtnova/issues).
- Build on it directly if you're an advanced user (see below).

## Advanced / manual use

If you know your way around OpenWrt, you can use the script without the [builder](https://wrtnova.com/builder):

1. Edit the configuration variables at the top of `wrtnova.sh` (hostname,
   passwords, VLANs, WiFi, etc.).
2. Paste it into the **firmware selector** as a custom uci-defaults / first-boot
   script, add the [required packages](#required-packages), build, and flash.
3. On first boot the script applies everything and removes itself.

The router LAN IP is derived as `NET_PREFIX.VLAN.1` (e.g. `192.168.1.1`, or
`.2` in AP mode).

> [!WARNING]
> The defaults ship with a default WiFi password (`12345678`) and a default
> AdGuard Home admin password. **Change these — along with the root password —
> on first login.** Do not run a router on the shipped defaults.

## Required packages

The script expects these to be present in the image:

| Purpose      | Packages |
|--------------|----------|
| Essential    | `luci-app-ddns ddns-scripts-cloudflare curl ip-full adguardhome -dnsproxy` |
| Multi-WAN    | `luci-app-mwan3` |
| Full WiFi    | `-wpad-basic-mbedtls wpad-mbedtls luci-app-usteer luci-proto-batman-adv` |
| WireGuard    | `luci-proto-wireguard` |
| MBIM modem   | `luci-proto-modemmanager kmod-usb-net-cdc-mbim` |
| Tethering    | `kmod-usb-net-rndis kmod-usb-net-cdc-ncm kmod-usb-net-ipheth` |
| Optional     | `zram-swap luci-ssl luci-app-commands ip-bridge umdns` |

The [builder](https://wrtnova.com/builder) selects these automatically.

## Contributing

Bug reports and feature suggestions are welcome — please open an
[Issue](https://github.com/LongQT-sea/wrtnova/issues). When reporting a bug,
include your router model, OpenWrt version, and the relevant part of your
configuration.

## License

[MIT](LICENSE) © 2024–2026 Tieu Long

