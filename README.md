# WrtNova

WrtNova is an OpenWrt provisioning script (`wrtnova.sh`) that runs as a UCI-defaults script on first boot. It configures your router completely — VLANs, WiFi, WireGuard VPN, ad-blocking, DDNS, port forwarding, and more — from a single generated config block.

## The easiest way: [wrtnova.com](https://wrtnova.com)

**[wrtnova.com](https://wrtnova.com)** is a browser-based builder that generates a custom-built OpenWrt firmware image with WrtNova pre-installed. Pick your device, fill in your config, download the image, flash it.

- **Single-node builder** — one device, one image.
- **Fleet builder** — router + AP nodes sharing one config, built in parallel.

The builder runs entirely in your browser and submits to the official [OpenWrt ASU](https://sysupgrade.openwrt.org) service. No account required.

## What the script configures

| Area | Details |
|---|---|
| **System** | Hostname, root password (bcrypt-hashed for AdGuard Home), SSH public keys, SSH password auth, timezone |
| **VLANs** | LAN / Guest / IoT / WireGuard VPN networks — IDs, IP prefixes, subnets. Supports both DSA and legacy swconfig hardware. |
| **WiFi** | SSIDs and passwords per network, country code, roaming thresholds, 802.11s mesh backhaul, channel overrides |
| **WireGuard VPN** | Full client config — private key, peer public key, endpoint, allowed IPs, preshared key, client IPv4/IPv6. VPN gets its own network and SSID automatically. |
| **DNS & ad-blocking** | AdGuard Home (≥32 MB flash / ≥230 MB RAM), dnsproxy (smaller devices), or plain dnsmasq. Optional DoT/DoQ blocking. |
| **WAN** | DHCP, PPPoE, static. Tagged WAN VLAN (802.1Q), secondary WAN (WAN-B), MAC address spoofing. |
| **Failover** | USB tethering (Android/iPhone, usb0), MBIM cellular modem |
| **Port forwarding** | Static DHCPv4 leases + NAT port forwards |
| **IPv6 exposure** | Static host IDs (IPv6 tokens), firewall forward rules, Cloudflare DDNS entries |
| **DDNS** | Cloudflare API — entries for IPv6-exposed hosts derived from the exposure table |
| **Packages** | Resolved and merged at build time; additional packages appended or removed with `-` prefix |
| **AP mode** | Disables DHCP; device acts as managed switch + wireless AP forwarding all traffic to the main router |

## How it works

`wrtnova.sh` is structured in two parts:

1. **Config block** — a shell variable block generated per build (hostname, passwords, VLAN IDs, WiFi credentials, WireGuard keys, etc.).
2. **Script body** — the provisioning logic that reads the config block and applies it via UCI commands, package installation, and file writes.

When embedded into a firmware image as a UCI-defaults script, OpenWrt executes it on the very first boot and configures the entire system.

## Using wrtnova.sh directly

If you want to generate the config block yourself instead of using wrtnova.com, the config section is clearly delimited at the top of `wrtnova.sh`:

```sh
# ===================
# End config section
# ===================
```

Everything above that marker is the config block — edit those variables for your deployment. Everything below is the script body and should not be modified unless you are extending WrtNova itself.

To embed the script into a firmware image manually, use the ASU API's `defaults` field or place the script in `/etc/uci-defaults/` of a custom image.

## Flash instructions

1. Build your firmware image (via [wrtnova.com](https://wrtnova.com) or manually with firmware-selector).
2. Download the **sysupgrade** image.
3. In OpenWrt: **System → Backup / Flash firmware → Flash image**.
4. **Uncheck "Keep settings and retain the current configuration".**
5. Flash and wait. The router configures itself on first boot.

## License

[MIT](LICENSE) © 2024–2026 Tieu Long

