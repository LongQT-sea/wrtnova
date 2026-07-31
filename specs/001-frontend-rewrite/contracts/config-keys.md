# Contract: Configuration keys

The authoritative field table. Every key here must exist in `core/schema.ts` with
matching `kind`, `default`, and `gate`, and must have a home in the interface
(FR-006, SC-002).

## How to read this

- **Kind** — `flag` is `Flag` (`''` | `'1'`); `text`, `select`, `radio`,
  `subnet`, `table`, `tz`, `country` behave as named.
- **Default** — the runtime fallback in the **script body**
  (`${KEY:-fallback}`). A value equal to this MUST NOT be emitted
  (Constitution V). `unset` means there is no fallback: the feature is off unless
  the key is emitted, so emitting `'1'` is required, not redundant.
- **Gate** — the condition under which the key is emitted at all. `router` means
  omitted when `AP_MODE='1'`.

> **Do not read the defaults from the top of `wrtnova.sh`.** That section is
> discarded and replaced by the rendered block; only body fallbacks apply at
> build time. See `research.md` R1.

## Identity and access — section "Access"

| Key | Kind | Default | Gate |
| --- | --- | --- | --- |
| `HOST_NAME` | text | `WrtNova`, or `WrtNova-<AP_INDEX>` in AP mode | — |
| `ROOT_PASSWD` | text (secret) | unset | — |
| `SSH_PUBLIC_KEY` | text | unset | — |
| `SSH_PASSWD_AUTH` | radio | unset | — |
| `ZONE_NAME` | tz | unset | — |
| `TIME_ZONE` | tz | unset | set with `ZONE_NAME` |
| `TIME_FORMAT` | radio | unset | OpenWrt ≥ 25 only |

## Role — section "Device"

| Key | Kind | Default | Gate |
| --- | --- | --- | --- |
| `AP_MODE` | radio | unset | — |
| `AP_INDEX` | text | `2` | AP only |
| `AP_DISABLE` | flag | unset | — |
| `INDEX_SUFFIX` | flag | unset | — |

## Upstream — section "Internet"

| Key | Kind | Default | Gate |
| --- | --- | --- | --- |
| `wan_type` | radio | `dhcp` | **never emitted** (UI-only) |
| `PPPOE_USERNAME` | text | unset | `wan_type='pppoe'`, router |
| `PPPOE_PASSWD` | text (secret) | unset | `wan_type='pppoe'`, router |
| `WAN_MAC_ADDR` | text | unset | router |
| `WAN_IS_TAGGED` | flag | unset | router |
| `WAN_VLAN_ID` | text | `20` | allocator |
| `WAN_B_ENABLE` | flag | unset | router |
| `WAN_B_VLAN_ID` | text | `21` | allocator |
| `BRIDGE_WAN_PORT` | flag | unset | router |
| `CELLULAR_MODEM` | flag | unset | router |
| `USB_TETHERING` | flag | unset | router |

## Networks and VLANs — section "Networks"

| Key | Kind | Default | Gate |
| --- | --- | --- | --- |
| `BASE_NET_PREFIX` | text | `192.168` | — |
| `DEFAULT_SUBNET` | select | `/24` | — |
| `GUEST_ENABLE` | flag | **unset** — emit `'1'` to enable | — |
| `IOT_ENABLE` | flag | **unset** | — |
| `IOT_INTERNET` | flag | unset | IoT on, router |
| `IOT_ROUTE_VIA_WG` | flag | unset | IoT on, tunnel on, router |
| `LAN_BASE_PREFIX` | text | `BASE_NET_PREFIX` | — |
| `LAN_IFACE` | text | `lan` | allocator |
| `LAN_VLAN_ID` | text | `1` | allocator |
| `LAN_SUBNET` | subnet | `DEFAULT_SUBNET` | — |
| `GUEST_BASE_PREFIX` | text | `BASE_NET_PREFIX` | guest on |
| `GUEST_IFACE` | text | `guest` | allocator |
| `GUEST_VLAN_ID` | text | `5` | allocator |
| `GUEST_SUBNET` | subnet | `DEFAULT_SUBNET` | guest on |
| `IOT_BASE_PREFIX` | text | `BASE_NET_PREFIX` | IoT on |
| `IOT_IFACE` | text | `iot` | allocator |
| `IOT_VLAN_ID` | text | `10` | allocator |
| `IOT_SUBNET` | subnet | `DEFAULT_SUBNET` | IoT on |
| `LAN_VPN_BASE_PREFIX` | text | `BASE_NET_PREFIX` | tunnel on |
| `LAN_VPN_IFACE` | text | `lan_vpn` | allocator |
| `LAN_VPN_VLAN_ID` | text | `15` | allocator |
| `LAN_VPN_SUBNET` | subnet | `DEFAULT_SUBNET` | tunnel on |
| `ADDITIONAL_VLAN_LIST` | text | unset | truncated on swconfig targets |
| `TAGGED_LAN_VLAN` | flag | unset | confirm dialog before enabling |
| `BRIDGE_STP` | flag | unset | mesh on; forced on with both mesh bands |
| `P_STEERING` | select | unset | value `2` needs OpenWrt ≥ 24 |
| `ULA_PREFIX` | text | the router's existing ULA | — |

## Wireless — section "Wi-Fi"

| Key | Kind | Default | Gate |
| --- | --- | --- | --- |
| `COUNTRY_CODE` | country | unset | — |
| `DOT11KV` | flag | **unset** | — |
| `DOT11R` | flag | **unset** | — |
| `DENSE_ENV` | flag | unset | `DOT11KV` on |
| `PSK_VLAN` | flag | unset | — |
| `BAND_SUFFIX` | flag | unset | — |
| `LAN_WIFI_SSID` | text | `WrtNova` | — |
| `LAN_WIFI_PASSWD` | text (secret) | `12345678` | — |
| `GUEST_WIFI_SSID` | text | `WrtNova_Guest` | guest on |
| `GUEST_WIFI_PASSWD` | text (secret) | `12345678` | guest on |
| `GUEST_ISOLATE` | flag | unset | guest on, `PSK_VLAN` off |
| `IOT_WIFI_SSID` | text | `WrtNova_IoT` | IoT on |
| `IOT_WIFI_PASSWD` | text (secret) | `12345678` | IoT on |
| `IOT_NO_DOT11R` | flag | unset | IoT on; **entered as the positive, inverted on emit** |
| `LAN_VPN_WIFI_SSID` | text | `WrtNova_VPN` | tunnel on |
| `LAN_VPN_WIFI_PASSWD` | text (secret) | `12345678` | tunnel on |
| `CHANNEL_2G` | select | unset | — |
| `CHANNEL_5G` | select | unset | — |
| `CHANNEL_5G_2` | select | unset | high-band 5 GHz only |
| `CHANNEL_6G` | select | unset | — |
| `WIFI_LOG_LVL` | select | `4` | — |
| `WED_ENABLE` | flag | unset | `kmod-mt7915e` present |

## Mesh backhaul — section "Wi-Fi"

| Key | Kind | Default | Gate |
| --- | --- | --- | --- |
| `WIRELESS_MESH` | flag | unset | — |
| `WIRELESS_MESH_2G` | flag | unset | — |
| `BATMAN_ADV` | flag | unset | mesh on |
| `BATMAN_ALL_VLAN` | flag | unset | mesh on, batman on |
| `MESH_ID` | text | `mesh_trunk_backhaul` | mesh on |
| `MESH_PASSWD` | text (secret) | `12345678` | mesh on |

## WireGuard client — section "Security"

All gated on tunnel on **and** router.

| Key | Kind | Default |
| --- | --- | --- |
| `WG_ENABLE` | flag | unset |
| `WG_PRIVATE_KEY` | text (secret) | a freshly generated key |
| `PEER_PUBLIC_KEY` | text (secret) | unset |
| `ENDPOINT` | text (secret) | `1.2.3.4` — **entered as `host:port`, split on emit** |
| `ENDPOINT_PORT` | derived (secret) | `51820` |
| `PRESHARED_KEY` | text (secret) | unset |
| `WG_IPV4` | text (secret) | `172.16.0.2/32` |
| `WG_IPV6` | text (secret) | `fd88::/128` |
| `WG_DNS_V4` | text | unset |
| `WG_DNS_V6` | text | unset |
| `WG_MTU` | text | unset |
| `ALLOWED_IPS` | text (secret) | `0.0.0.0/0 ::/0` |
| `SPLIT_TUNNEL_V4` | text | unset |
| `SPLIT_TUNNEL_V6` | text | unset |

## Exposure and dynamic DNS — section "Security"

| Key | Kind | Default | Gate |
| --- | --- | --- | --- |
| `PORT_FORWARD_LIST` | table | unset | router |
| `IPV6_SERVER_LIST` | table | unset | router |
| `DDNS_ENABLE` | flag | `0` | router |
| `LOOKUP_HOSTNAME` | text | `ddns.example.com` | router |
| `CLOUDFLARE_API_KEY` | text (secret) | `cf_api_key` | router |

## DNS and filtering — section "Filtering"

| Key | Kind | Default | Gate |
| --- | --- | --- | --- |
| `DNS_MODE` | radio | `https-dns-proxy` | **build-only, never emitted** |
| `ADGUARD_MAIN_DNS` | flag | unset | AdGuard Home mode only |
| `ADGUARD_PASSWD` | derived (secret) | a fixed bcrypt hash | derived from `ROOT_PASSWD` |
| `DOH_UPSTREAMS` | text | `https://dns.adguard-dns.com/dns-query` | DoH engines only |
| `BOOTSTRAP_DNS` | derived | unset | derived from selected providers plus user entries |
| `DNSMASQ_MULTI_INSTANCE` | flag | — | **UI-only**, inverted into the next row |
| `DNSMASQ_SINGLE_INSTANCE` | derived flag | unset | emitted `'1'` unless multi is on |
| `FORCE_DNS` | flag | unset | — |
| `BLOCK_DOT_DOQ` | flag | unset | — |
| `BLOCK_DOH` | flag | unset | — |
| `BANIP_COUNTRY_LIST` | chips | unset | — |
| `BANIP_FEEDS` | chips | unset | `country` appended when any country is selected |

## Performance and maintenance — section "Advanced"

| Key | Kind | Default | Gate |
| --- | --- | --- | --- |
| `SOFTWARE_OFFLOAD` | flag | unset | — |
| `HARDWARE_OFFLOAD` | flag | unset | mutually exclusive with QoS |
| `IRQBALANCE` | flag | unset | **build-only** |
| `NON_CT_ATH10K` | flag | unset | **build-only**, ath10k-CT firmware present |
| `LUCI_HTTPS` | flag | unset | — |
| `NTP_IP` | text | `162.159.200.1` | — |
| `QUARTERLY_REBOOT` | flag | unset | — |
| `DENY_GUEST_NIGHT` | flag | unset | — |
| `LOG` | flag | unset | — |

## Escape hatches — section "Advanced", behind a disclosure

| Key | Kind | Notes |
| --- | --- | --- |
| `CUSTOM_SCRIPT` | textarea | Emitted as a gzip+base64 block writing `/tmp/_user_script.sh`, never as `KEY=value`. Requires `coreutils-base64`. |
| `additional_packages` | text | **Build-only**, never emitted. Free-form list folded in from the dropped advanced page. |
| ASU server | select + text | Operator-configured list plus a free-form URL, also folded in from the dropped page. |

## Not exposed

Present in the script, never offered by the frontend, reachable via
`CUSTOM_SCRIPT`: `DEFAULT_WIFI_PASSWD`, `LAN_DHCP_START`, `GUEST_DHCP_START`,
`WG_IFACE`, `MODEM_PATH`, `MODEM_APN`.

## Secrets

Masked in any displayed config, and stripped from stored history:

`ROOT_PASSWD`, `PPPOE_PASSWD`, `LAN_WIFI_PASSWD`, `GUEST_WIFI_PASSWD`,
`IOT_WIFI_PASSWD`, `LAN_VPN_WIFI_PASSWD`, `MESH_PASSWD`, `WG_PRIVATE_KEY`,
`PEER_PUBLIC_KEY`, `PRESHARED_KEY`, `ENDPOINT`, `ENDPOINT_PORT`, `WG_IPV4`,
`WG_IPV6`, `ALLOWED_IPS`, `CLOUDFLARE_API_KEY`, `ADGUARD_PASSWD`.

Masking is display-only: the copy action always yields real values.
