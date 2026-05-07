#!/bin/sh
# shellcheck disable=SC3043,SC3060,SC3057,SC1091
# SPDX-License-Identifier: MIT OR Apache-2.0
# Copyright (C) 2024 - 2026 Tieu Long <https://github.com/LongQT-sea>

# WrtNova — Zero-touch provisioning and orchestration framework for OpenWrt

# Router LAN IP is derived from NET_PREFIX.VLAN.1, e.g. 192.168.1.1 or 192.168.1.2 if AP mode

# REQUIRES THESE ADDITIONAL PACKAGES:
# Essential:	 luci-app-ddns ddns-scripts-cloudflare luci-app-mwan3 curl ip-full adguardhome -dnsproxy 
# Full WiFi:	 -wpad-basic-mbedtls wpad-mbedtls luci-app-usteer 
# WireGuard:	 luci-proto-wireguard 
# MBIM modem:	 luci-proto-modemmanager kmod-usb-net-cdc-mbim 
# Tethering:	 kmod-usb-net-rndis kmod-usb-net-cdc-ncm kmod-usb-net-ipheth 
# Optional:	 zram-swap luci-ssl luci-app-commands ip-bridge

# === System ===
HOST_NAME=""
ROOT_PASSWD=""
SSH_PUBLIC_KEY=""
SSH_PASSWD_AUTH=""	# off = disable password login (SSH keys auth only)

# See https://github.com/openwrt/luci/blob/master/modules/luci-lua-runtime/luasrc/sys/zoneinfo/tzdata.lua
ZONE_NAME=""
TIME_ZONE=""

# === WiFi ===
DEFAULT_WIFI_PASSWD=""	# Default to 12345678
WIFI_COUNTRY_CODE=
WIFI_DENSE=		# Set 1 to optimize roaming and steering for high-interference areas

LAN_WIFI_SSID=""	# Default to OpenWrt
LAN_WIFI_PASSWD=""

GUEST_WIFI_SSID=""	# Default to Free_12345678
GUEST_WIFI_PASSWD=""

IOT_WIFI_SSID=""	# Default to OpenWrt_IoT
IOT_WIFI_PASSWD=""

LAN_WG_WIFI_SSID=""	# Default to WireGuard_VPN
LAN_WG_WIFI_PASSWD=""

# Only if you know what you’re doing
WIFI_2G_CHANNEL=
WIFI_5G_CHANNEL=
WIFI_6G_CHANNEL=
WIFI_LOG_LEVEL=

# === Network ===
DEFAULT_NET_PREFIX="192.168"
DEFAULT_SUBNET="/24"	# /24 to /22

# Set to 1 to enable
GUEST_ENABLE=1

# Set to 1 to enable
IOT_ENABLE=
IOT_INTERNET=

# Default to DEFAULT_NET_PREFIX
LAN_NET_PREFIX=
GUEST_NET_PREFIX=
IOT_NET_PREFIX=
LAN_WG_NET_PREFIX=

# Default to DEFAULT_SUBNET
LAN_SUBNET=
GUEST_SUBNET=
IOT_SUBNET=
LAN_WG_SUBNET=

LAN_VLAN_ID=		# Default 1
GUEST_VLAN_ID=		# Default 5
IOT_VLAN_ID=		# Default 10
LAN_WG_VLAN_ID=		# Default 15
WAN_VLAN_ID=		# Default 20
WAN_B_VLAN_ID=		# Default 21

# Additional VLANs to trunk through this device (e.g. "25 30 40" or "30-50"), ranges must be low-high
ADDITIONAL_VLAN_LIST=""

# === IPv4 Port Forwarding and IPv6 Server Exposure ===
# Format: hostname | last_octet | ports (empty = expose all for IPv6)
# PORT_FORWARD_LIST: creates a static DHCPv4 lease and NAT port forward from WAN. Ports must be unique.
# IPV6_SERVER_LIST:  creates a static DHCP lease, IPv6 firewall forward rule, and Cloudflare DDNS entry.
# After boot, go to Network -> DHCP Leases and update the DUID for each host to match the actual client DUID.
PORT_FORWARD_LIST="
	docker-host | 20 | 80 443
	rdp-server  | 21 | 3389
"

IPV6_SERVER_LIST="
	docker-host | 20 | 80 443
	vps-host    | 23 |
"

# === DDNS ===
DDNS_ENABLE=		# Set 1 to enable Cloudflare DDNS
LOOKUP_HOSTNAME=	# e.g. ddns.example.com
CLOUDFLARE_API_KEY=

# === WAN / Multi-WAN ===
PPPOE_USERNAME=""	# Set this to use PPPoE instead of DHCP on the wan interface
PPPOE_PASSWD=""

WAN_IS_TAGGED=		# Set 1 to tag VLAN on wan interface
WAN_MAC_ADDR=
BRIDGE_WAN_PORT=	# Set 1 to force non-DSA wan port into br-vlan bridge

WAN_B_ENABLE=
WAN_B_MAC_ADDR=

# WireGuard Client
WG_ENABLE=		# Set 1 to enable WireGuard Client
WG_IFACE=		# e.g. vpn, wg0, ...
WG_PRIVATE_KEY=
WG_IPV4=
WG_IPV6=
PEER_PUBLIC_KEY=
PRESHARED_KEY=
ENDPOINT=
ENDPOINT_PORT=		# Default 51820
ALLOWED_IPS=""		# Default "0.0.0.0/0 ::/0"

# Uncomment to enable MBIM modem failover (prefill path is MT7621-specific), this can change later in LuCI)
#WWAN_PATH="/sys/devices/platform/1e1c0000.xhci/usb2/2-1"
WWAN_APN="internet"

# Uncomment to enable USB tethering failover (Android/iPhone)
#USB_TETHER_DEV="usb0"

# === DHCP ===
# Default range: START=100, LIMIT=auto (192.168.1.100 - 192.168.1.199)
LAN_DHCP_START=
GUEST_DHCP_START=

# === Misc ===
AP_MODE=		# Set 1 to enable AP mode (disable DHCP, device acts as access point + managed switch)
AP_INDEX=2		# AP management IP last octet (2-99)

# Set 1 to enable Routing/NAT Offloading
HARDWARE_OFFLOAD=	# Do not set if using QoS/SQM
SOFTWARE_OFFLOAD=

# AdGuardHome admin passwd in bcrypt hash (default 12345678)
ADGUARD_PASSWD=''

# Set 1 to log to /root/99-asu-defaults.log
LOG=

# Set 1 to enable quarterly auto-reboot at 3:30 AM
QUARTERLY_REBOOT=

# ===================
# End config section
# ===================
[ -x /bin/run-cmd ] && exit 0

mkdir /usr/share/wrtnova
cat > /usr/share/wrtnova/functions.sh << 'EOF'
# WrtNova shared functions

# _uci <config> <type> <name> [key=val ...]
# key=val  -> uci set
# -key     -> uci del
# +key=val -> uci add_list
# ^key=val -> uci del_list
# ~old=new -> uci rename
# @integer -> uci reorder

_uci() {
	local config="$1" type="${2:-$1}" name="$3"; shift 3
	if [ -n "$name" ]; then
		uci set "${config}.${name}=${type}"
	else
		uci add "$config" "$type"
	fi

	local ref="${name:-@${type}[-1]}"
	for arg; do
		[ -z "$arg" ] && continue
		case "$arg" in
			+*) uci add_list "${config}.${ref}.${arg#+}" ;;
			-*) uci -q del "${config}.${ref}.${arg#-}" ;;
			^*) uci -q del_list "${config}.${ref}.${arg#^}" ;;
			~*) uci rename "${config}.${arg#\~}" ;;
			@*) uci reorder "${config}.${ref}=${arg#@}" ;;
			*) uci set "${config}.${ref}.${arg}" ;;
		esac
	done
}

# has_pkg <name> - check if package is installed
has_pkg() {
	ls /*/apk/*/*"${1}"*.list 2>/dev/null ||
	ls /*/*/opkg/*/*"${1}"*.list 2>/dev/null
}

# duid_gen - generate a DUID-UUID
duid_gen() {
	printf '0004'
	tr -d '-' < /proc/sys/kernel/random/uuid
}

# add_luci_command <cmd> [param] - add a command to luci-app-commands
add_luci_command() {
	_uci luci command "" command="$1" param="${2:-1}"
}
EOF
. /usr/share/wrtnova/functions.sh

# === System ===
cat > /sbin/wg-check <<'EOF'
#!/bin/sh
IFACE="$1"
PING_IP="${2:-9.9.9.9}"
PING_IP6="${3:-2620:fe::9}"
[ -z "$IFACE" ] && exit 0
[ -d /sys/class/net/"$IFACE" ] || exit 0

L=/tmp/${IFACE}_lock
mkdir "$L" || exit 0
trap 'rmdir "$L"' EXIT

ping -c2 -W2 -I "$IFACE" "$PING_IP" || \
ping6 -c2 -W2 -I "$IFACE" "$PING_IP6" || {
	ifdown "$IFACE"
	sleep 2
	ifup "$IFACE"
}
EOF
chmod +x /sbin/wg-check

cat > /bin/run-cmd <<'EOF'
#!/bin/sh
ALLOW="
	ip iw nft bridge ip6host
	ping arp traceroute nslookup
	cat ls df du ps grep
	logread dmesg
	ifup ifdown
	wifi iwinfo
	service
	uci
"

[ -z "$1" ] && {
	echo -n "Allowed:$ALLOW"
	exit 0
}

for cmd in $ALLOW; do
	[ "$1" = "$cmd" ] && {
		cd /
		exec "$@"
	}
done

echo -n "Not allowed: $1" >&2
exit 1
EOF
chmod +x /bin/run-cmd

[ -n "$ROOT_PASSWD" ] && passwd root <<-EOF
$ROOT_PASSWD
$ROOT_PASSWD
EOF

[ "$LOG" = 1 ] && {
	set -x
	exec > /root/99-asu-defaults.log 2>&1
}

has_pkg luci-app-commands && {
	add_luci_command /bin/run-cmd
	add_luci_command mwan3-iface-add
	add_luci_command dhcp-instance-add
}

mkdir -p /etc/profile.d
cat > /etc/profile.d/custom_alias.sh <<-EOF
alias cl=clear
alias df='df -h'
alias top='top -d 1'
alias ip='ip -c'
alias bridge='bridge -c'
alias du1='du -hd1 2>/dev/null'
alias la='ls -lhA'
EOF

[ -n "$SSH_PUBLIC_KEY" ] && {
	printf "%s\n" "$SSH_PUBLIC_KEY" >> /etc/dropbear/authorized_keys

	[ "$SSH_PASSWD_AUTH" = off ] && {
		_uci dropbear "" @dropbear[0] PasswordAuth=off RootPasswordAuth=off
	}
}

OS_VERSION=$(. /etc/os-release; echo "${VERSION%%.*}")
[ "$OS_VERSION" = 25 ] && ZONE_NAME="${ZONE_NAME// /_}"

HOST_NAME="${HOST_NAME:-$(uci get system.@system[0].hostname)}${AP_MODE:+-${AP_INDEX:-2}}"

_uci system "" "@system[0]" hostname="$HOST_NAME" \
	"${ZONE_NAME:+zonename=$ZONE_NAME}" "${TIME_ZONE:+timezone=$TIME_ZONE}"

uci set uhttpd.main.redirect_https=1

[ "$QUARTERLY_REBOOT" = 1 ] && \
	echo "30 3 1 1,4,7,10 * sleep 70 && { touch /etc/banner; reboot; }" >> /etc/crontabs/root

[ -x /etc/init.d/zram ] && echo vm.swappiness=70 > /etc/sysctl.d/13-zram.conf

cat > /etc/hotplug.d/iface/96-custom-ifup-wan <<-'EOF'
[ ifup = "$ACTION" ] || exit 0
. /lib/functions/network.sh
sleep 5
network_find_wan WAN_IF
network_find_wan6 WAN6_IF

[ "$WAN_IF" = "$INTERFACE" ] || \
[ "$WAN6_IF" = "$INTERFACE" ] || exit 0

ntpd -q -p pool.ntp.org &
EOF

[ "$WG_ENABLE" = 1 ] && [ "$AP_MODE" != 1 ] && {
	if [ ! -x /usr/bin/wg ] || [ ! -x /usr/sbin/mwan3 ]; then
		WG_ENABLE=
	fi
}

WG_IFACE=${WG_IFACE:-vpn}
[ "$WG_ENABLE" = 1 ] && [ "$AP_MODE" != 1 ] && {
	echo "*/2 * * * * wireguard_watchdog" >> /etc/crontabs/root
	echo "*/10 * * * * wg-check $WG_IFACE" >> /etc/crontabs/root
	uci set system.@system[0].cronloglevel=9

	cat > /etc/hotplug.d/iface/98-custom-"${WG_IFACE}" <<-EOF
	[ ifup = "\$ACTION" ] || exit 0
	[ $WG_IFACE = "\$INTERFACE" ] || exit 0
	sleep 3
	wg-check $WG_IFACE
	EOF
}

# === WiFi ===
setup_radio() {
	local radio="$1" channel="$2"
	uci -q del wireless."${radio}".disabled
	[ -n "$channel" ] && uci set wireless."${radio}".channel="$channel"
	[ -n "$WIFI_LOG_LEVEL" ] && uci set wireless."${radio}".log_level="$WIFI_LOG_LEVEL"
	[ -n "$WIFI_COUNTRY_CODE" ] && uci set wireless."${radio}".country="$WIFI_COUNTRY_CODE"
}

add_wifi_iface() {
	local name="$1" device="$2" mode="$3" ssid="$4" key="$5" network="$6" enc="${7:-psk2}"

	_uci wireless wifi-iface "$name" \
		device="$device" mode="$mode" ssid="$ssid" \
		encryption="$enc" key="$key" network="$network"

	if has_pkg wpad-mbedtls || has_pkg wpad-openssl || has_pkg wpad-wolfssl; then
		_uci wireless wifi-iface "$name" \
			ieee80211r=1 ft_over_ds=0 \
			ieee80211k=1 bss_transition=1
		[ "$enc" = psk2 ] && uci set wireless."${name}".ft_psk_generate_local=1
	fi
}

# Fields: name|mode|ssid|key|network|bands|enabled|enc_override
# - bands	: space-separated subset of "2g 5g 6g"
# - enabled	: 1 = create, 0 = skip
# - enc_override : empty = use band default

wifi_networks() {
	cat <<-EOF
	lan||$LAN_WIFI_SSID|$LAN_WIFI_PASSWD|lan|2g 5g 6g|1|
	guest||$GUEST_WIFI_SSID|$GUEST_WIFI_PASSWD|guest|2g 5g 6g|${GUEST_ENABLE:-0}|
	iot||$IOT_WIFI_SSID|$IOT_WIFI_PASSWD|iot|2g|${IOT_ENABLE:-0}|
	lan_wg||$LAN_WG_WIFI_SSID|$LAN_WG_WIFI_PASSWD|lan_${WG_IFACE}|2g 5g 6g|${WG_ENABLE:-0}|
	EOF
}

DEFAULT_WIFI_PASSWD="${DEFAULT_WIFI_PASSWD:-12345678}"
LAN_WIFI_SSID="${LAN_WIFI_SSID:-OpenWrt}"
LAN_WIFI_PASSWD="${LAN_WIFI_PASSWD:-$DEFAULT_WIFI_PASSWD}"
GUEST_WIFI_SSID="${GUEST_WIFI_SSID:-Free_12345678}"
GUEST_WIFI_PASSWD="${GUEST_WIFI_PASSWD:-$DEFAULT_WIFI_PASSWD}"
IOT_WIFI_SSID="${IOT_WIFI_SSID:-OpenWrt_IoT}"
IOT_WIFI_PASSWD="${IOT_WIFI_PASSWD:-$DEFAULT_WIFI_PASSWD}"
LAN_WG_WIFI_SSID="${LAN_WG_WIFI_SSID:-WireGuard_VPN}"
LAN_WG_WIFI_PASSWD="${LAN_WG_WIFI_PASSWD:-$DEFAULT_WIFI_PASSWD}"

while uci -q del wireless.@wifi-iface[0]; do :; done

for radio in radio0 radio1 radio2 radio3; do
	band=$(uci -q get wireless."${radio}".band)
	[ -z "$band" ] && continue

	case "$band" in
		2g) default_enc=psk2; channel="$WIFI_2G_CHANNEL" ;;
		5g) default_enc=sae-mixed; channel="$WIFI_5G_CHANNEL" ;;
		6g) default_enc=sae; channel="$WIFI_6G_CHANNEL" ;;
	esac

	setup_radio "$radio" "$channel"

	wifi_networks | while IFS='|' read -r name mode ssid key network bands enabled enc_over; do
		[ -n "$name" ] && [ "$enabled" = 1 ] && {
			case " $bands " in *" $band "*) ;; *) continue ;; esac
			add_wifi_iface "${name}_${radio}" "$radio" "${mode:-ap}" \
				"$ssid" "$key" "$network" "${enc_over:-$default_enc}"
		}
	done
done

# https://openwrt.org/docs/guide-user/network/wifi/usteer
# Dense mode tightens all thresholds for high-interference environments
[ -x /sbin/usteerd ] && {
	_uci usteer "" "@usteer[0]" \
		roam_scan_snr='-68' \
		signal_diff_threshold='8' \
		roam_trigger_snr='-72'

	[ "$WIFI_DENSE" = 1 ] && {
		_uci usteer "" "@usteer[0]" \
			roam_scan_snr='-60' \
			signal_diff_threshold='6' \
			band_steering_interval='30000' \
			band_steering_min_snr='-50' \
			roam_trigger_snr='-65' \
			roam_kick_delay='3000' \
			min_snr='-80'
	}
}

# === Network ===
detect_hw() {
	grep -sq DEVTYPE=dsa /sys/class/net/*/uevent && { echo dsa; return; }
	swconfig list 2>/dev/null | grep -q '^Found:' && { echo swconfig; return; }
	echo generic
}

add_bridge_vlan() {
	local vlan_id="$1" ports="$2" iface="$3"
	
	_uci network bridge-vlan "" \
		device=br-vlan vlan="$vlan_id" ports="$ports" local=0

	[ -n "$iface" ] && {
		uci set "network.${iface}.device=br-vlan.${vlan_id}"
		uci set network.@bridge-vlan[-1].local=1
	}
}

add_bridges() {
	for iface; do
		_uci network device "br_${iface}" type=bridge name="br-${iface}"
		uci set "network.${iface}.device=br-${iface}"
	done
}

add_sw_vlan() {
	local vlan_id="$1" ports="$2" iface="$3"

	vlan_idx=$((vlan_idx + 1))

	_uci network switch_vlan "" \
		device="$switch_dev" vlan="$vlan_idx" ports="$ports" \
		"${sw_has_vid:+vid=$vlan_id}"

	[ -n "$iface" ] && uci set "network.br_${iface}.ports=${lan_eth}.${vlan_id}"
}

expand_vlan_list() {
	for entry in $1; do
		case "$entry" in
			*-*) seq "${entry%-*}" "${entry#*-}" ;;
			*) printf '%s\n' "$entry" ;;
		esac
	done
}

# resolve_vlans "VAR:default:max VAR:default:max ..."
# First var wins; later vars increment by 4 to find a free slot in 1..max,
# wrapping to default on overflow. Invalid/empty values fall back to default.
resolve_vlans() {
	local spec name rest def max val i conflict prior pname pval

	set +x
	for spec in $1; do
		name=${spec%%:*}; rest=${spec#*:}; def=${rest%%:*}; max=${rest#*:}
		val=$(eval echo \$"$name")
		case "$val" in ''|*[!0-9]*) val=$def ;; esac
		{ [ "$val" -lt 1 ] || [ "$val" -gt "$max" ]; } && val=$def
		eval "$name=$val"
	done

	for spec in $1; do
		name=${spec%%:*}; rest=${spec#*:}; def=${rest%%:*}; max=${rest#*:}
		val=$(eval echo \$"$name"); i=0
		conflict=1
		while [ "$conflict" -eq 1 ] && [ "$i" -lt $((max+1)) ]; do
			i=$((i+1)); conflict=0
			for prior in $1; do
				pname=${prior%%:*}; [ "$pname" = "$name" ] && break
				pval=$(eval echo \$"$pname")
				[ "$val" -eq "$pval" ] && {
					val=$((val+4))
					[ "$val" -gt "$max" ] && val=$def
					conflict=1; break
				}
			done
		done
		eval "$name=$val"
	done
	[ "$LOG" = 1 ] && set -x
}

resolve_vlans "LAN_VLAN_ID:1:255 \
		GUEST_VLAN_ID:5:255 \
		IOT_VLAN_ID:10:255 \
		LAN_WG_VLAN_ID:15:255 \
		WAN_VLAN_ID:20:4094 \
		WAN_B_VLAN_ID:21:4094"

hw_type=$(detect_hw)
[ "$hw_type" = swconfig ] && {
	sw_has_vid=1
	switch_dev="$(uci -q get network.@switch_vlan[0].device)"

	# swconfig uses vlan= as a vlan table index. On chips with vid attribute
	# support (mt7620, mt7628, etc.), vid= is used to sets the 802.1Q tag.
	# Without vid support, netifd falls back to vlan= as the tag, so VLAN IDs
	# must be sequential to match the vlan table index (see add_sw_vlan func).
	swconfig dev "$switch_dev" help | grep -q 'Attribute .*: vid' || {
		sw_has_vid=

		LAN_VLAN_ID=1
		GUEST_VLAN_ID=2
		IOT_VLAN_ID=3
		LAN_WG_VLAN_ID=4
		WAN_VLAN_ID=5
		WAN_B_VLAN_ID=6

		LAN_SUBNET=/24
		GUEST_SUBNET=/24
		IOT_SUBNET=/24
		LAN_WG_SUBNET=/24
	}
}

DEFAULT_NET_PREFIX=${DEFAULT_NET_PREFIX:-192.168}
DEFAULT_SUBNET=${DEFAULT_SUBNET:-/24}
LAN_IP_PREFIX=${LAN_NET_PREFIX:-$DEFAULT_NET_PREFIX}.${LAN_VLAN_ID}
GUEST_IP_PREFIX=${GUEST_NET_PREFIX:-$DEFAULT_NET_PREFIX}.${GUEST_VLAN_ID}
IOT_IP_PREFIX=${IOT_NET_PREFIX:-$DEFAULT_NET_PREFIX}.${IOT_VLAN_ID}
LAN_WG_IP_PREFIX=${LAN_WG_NET_PREFIX:-$DEFAULT_NET_PREFIX}.${LAN_WG_VLAN_ID}
LAN_SUBNET=${LAN_SUBNET:-$DEFAULT_SUBNET}
GUEST_SUBNET=${GUEST_SUBNET:-$DEFAULT_SUBNET}
IOT_SUBNET=${IOT_SUBNET:-$DEFAULT_SUBNET}
LAN_WG_SUBNET=${LAN_WG_SUBNET:-$DEFAULT_SUBNET}

[ "$GUEST_ENABLE" = 1 ] && \
	_uci network interface guest proto=static +ipaddr="${GUEST_IP_PREFIX}.1${GUEST_SUBNET}"

[ "$IOT_ENABLE" = 1 ] && \
	_uci network interface iot proto=static +ipaddr="${IOT_IP_PREFIX}.1${IOT_SUBNET}"

_uci network interface lan -netmask ipaddr="${LAN_IP_PREFIX}.1${LAN_SUBNET}" \
	ip6assign=60 +ip6class=wan_6 "${WWAN_PATH:++ip6class=wwan0_6}"

uci -q get network.wan || {
	_uci network interface wan proto=dhcp
	_uci network interface wan6 proto=dhcpv6
}

_uci network interface wan6 device=@wan "~wan6=wan_6"

[ -n "$PPPOE_USERNAME" ] && {
	_uci network interface wan proto=pppoe ipv6=0 \
		username="$PPPOE_USERNAME" password="$PPPOE_PASSWD"
}

[ "$WAN_B_ENABLE" = 1 ] && {
	_uci network interface wanb proto=dhcp
	_uci network interface wanb_6 proto=dhcpv6 device=@wanb
}

[ -n "$WWAN_PATH" ] && {
	_uci network interface wwan0 proto=modemmanager \
		device="$WWAN_PATH" iptype=ipv4v6 apn="${WWAN_APN:-internet}"
}

[ -n "$USB_TETHER_DEV" ] && \
	_uci network interface "$USB_TETHER_DEV" proto=dhcp device="$USB_TETHER_DEV"

[ "$WG_ENABLE" = 1 ] && {
	wg_vlan_hex=$(printf '%x' "$LAN_WG_VLAN_ID")

	_uci network interface "lan_${WG_IFACE}" proto=static \
		+ipaddr="${LAN_WG_IP_PREFIX}.1${LAN_WG_SUBNET}" \
		ip6assign=64 +ip6class=local ip6hint="$wg_vlan_hex"

	_uci firewall zone @zone[0] +network="lan_${WG_IFACE}" ~@zone[0]=lan

	[ "$AP_MODE" != 1 ] && {
		_uci network interface "${WG_IFACE}" proto=wireguard disabled=1 \
			private_key="${WG_PRIVATE_KEY:-$(wg genkey)}" \
			+addresses="${WG_IPV4:-172.16.0.2/32}" \
			+addresses="${WG_IPV6:-fd88::/128}"

		[ -n "$PEER_PUBLIC_KEY" ] && {
			uci delete network."${WG_IFACE}".disabled
			_uci network "wireguard_${WG_IFACE}" "" \
				public_key="$PEER_PUBLIC_KEY" \
				preshared_key="$PRESHARED_KEY" \
				endpoint_host="${ENDPOINT:-1.2.3.4}" \
				endpoint_port="${ENDPOINT_PORT:-51820}" \
				allowed_ips="${ALLOWED_IPS:-0.0.0.0/0 ::/0}" \
				persistent_keepalive=25 \
				route_allowed_ips=1
		}

		# WG IPv6 anchor for mwan3
		_uci network interface "${WG_IFACE}_6" proto=none device="@${WG_IFACE}"

		# Fix router IPv6 internet access
		_uci network rule6 "" in=loopback lookup=main priority=999
	}
}

lan_ports="$(uci -q get network.@device[0].ports)"
wan_port="$(uci -q get network.wan.device)"
all_ports="$lan_ports${wan_port:+ $wan_port}"

# DSA/x86/SBC: always use bridge VLAN filtering
use_bridge_vlan=1
bridge_wan_port=1

# Single NIC: reuse lan port as tagged WAN
[ -z "$wan_port" ] && WAN_IS_TAGGED=1

# br-wan cannot be enslaved to br-vlan
[ "$wan_port" = br-wan ] && BRIDGE_WAN_PORT=

if [ "$hw_type" = "dsa" ] && [ "$AP_MODE" != 1 ] && [ "$BRIDGE_WAN_PORT" != 1 ]; then
	# Ideally, both WAN and LAN ports should attach to the same bridge with bridge VLAN filtering enabled,
	# but adding a non-DSA WAN port to the bridge causes performance penalty, so it is skipped.
	grep -sq DEVTYPE=dsa /sys/class/net/"${wan_port}"/uevent || {
		all_ports="$lan_ports"
		bridge_wan_port=
	}

elif [ "$hw_type" = "swconfig" ]; then
	use_bridge_vlan=
	lan_eth="${lan_ports%%.*}"
	wan_eth="$wan_port"
fi

# LAN ports untagged on LAN VLAN, WAN ports untagged on WAN VLAN (unless WAN_IS_TAGGED),
# all ports tagged (trunk) on guest/iot/wanb/wireguard VLANs.
# AP mode: all ports untagged on LAN VLAN, tagged on all other VLANs.
if [ "$use_bridge_vlan" = 1 ]; then
	[ "$AP_MODE" = 1 ] && [ "$wan_port" = br-wan ] && {
		all_ports="$lan_ports $(uci -q get network.@device[1].ports)"
		uci del network.@device[1]
	}

	src_ports="$lan_ports"
	[ "$AP_MODE" = 1 ] && src_ports="$all_ports"

	for port in $src_ports; do
		lan_vlan_ports="${lan_vlan_ports:+$lan_vlan_ports }$port:u*"
		trunk_ports="${trunk_ports:+$trunk_ports }$port:t"
		wan_vlan_ports="${wan_vlan_ports:+$wan_vlan_ports }$port:t"
	done

	[ "$AP_MODE" != 1 ] && [ "$bridge_wan_port" = 1 ] && [ -n "$wan_port" ] && {
		lan_vlan_ports="$lan_vlan_ports $wan_port:t"
		trunk_ports="$trunk_ports $wan_port:t"

		if [ "$WAN_IS_TAGGED" = 1 ]; then
			wan_vlan_ports="$wan_vlan_ports $wan_port:t"
		else
			wan_vlan_ports="$wan_vlan_ports $wan_port:u*"
		fi
	}

	_uci network device @device[0] name=br-vlan ports="$all_ports"

	vlan_add() { add_bridge_vlan "$@"; }

	vlan_add "$LAN_VLAN_ID" "$lan_vlan_ports" lan

	[ "$WAN_IS_TAGGED" = 1 ] && [ "$bridge_wan_port" != 1 ] && \
		uci set network.wan.device="${wan_port}.${WAN_VLAN_ID}"

else
	add_bridges lan ${GUEST_ENABLE:+guest} ${IOT_ENABLE:+iot} ${WG_ENABLE:+lan_${WG_IFACE}}

	# switch_vlan[0] is LAN, and switch_vlan[1] is WAN (see config_generate and uci-defaults.sh)
	for port in $(uci -q get network.@switch_vlan[0].ports); do
		case "$port" in
			*t) lan_cpu_port="$port" ;;
			*) sw_lan_ports="${sw_lan_ports:+$sw_lan_ports }$port" ;;
		esac
	done

	for port in $sw_lan_ports; do
		tagged_lan_ports="${tagged_lan_ports:+$tagged_lan_ports }${port}t"
	done

	uci -q get network.@switch_vlan[1] && {
		for port in $(uci -q get network.@switch_vlan[1].ports); do
			case "$port" in
				*t) [ "$port" != "$lan_cpu_port" ] && wan_cpu_port="$port" ;;
				*) sw_wan_port="${sw_wan_port:+$sw_wan_port }$port" ;;
			esac
		done

		tagged_wan_port="${sw_wan_port}t"
		wan_eth="${wan_port%%.*}"
	}

	cpu_ports="${lan_cpu_port}${wan_cpu_port:+ $wan_cpu_port}"
	trunk_ports="${tagged_lan_ports}${tagged_wan_port:+ $tagged_wan_port} $cpu_ports"

	uci del network.@device[0]
	while uci -q del network.@switch_vlan[0]; do :; done

	vlan_add() { add_sw_vlan "$@"; }

	if [ "$AP_MODE" = 1 ]; then
		vlan_add "$LAN_VLAN_ID" "${sw_lan_ports}${sw_wan_port:+ $sw_wan_port} $cpu_ports" lan
		vlan_add "$WAN_VLAN_ID" "$trunk_ports"
	else
		vlan_add "$LAN_VLAN_ID" "${sw_lan_ports}${tagged_wan_port:+ $tagged_wan_port} $cpu_ports" lan
		[ -n "$sw_wan_port" ] && {
			if [ "$WAN_IS_TAGGED" = 1 ]; then
				vlan_add "$WAN_VLAN_ID" "$trunk_ports"
			else
				vlan_add "$WAN_VLAN_ID" "$tagged_lan_ports $sw_wan_port $cpu_ports"
			fi
		}
	fi

	if [ "$WAN_IS_TAGGED" = 1 ] || [ -n "$sw_wan_port" ]; then
		uci set network.wan.device="${wan_eth}.${WAN_VLAN_ID}"
	fi
fi

[ "$GUEST_ENABLE" = 1 ] && vlan_add "$GUEST_VLAN_ID" "$trunk_ports" guest
[ "$IOT_ENABLE" = 1 ] && vlan_add "$IOT_VLAN_ID" "$trunk_ports" iot
[ "$WG_ENABLE" = 1 ] && vlan_add "$LAN_WG_VLAN_ID" "$trunk_ports" lan_"${WG_IFACE}"
[ "$bridge_wan_port" = 1 ] && [ -n "$src_ports" ] && vlan_add "$WAN_VLAN_ID" "$wan_vlan_ports" wan

[ "$WAN_B_ENABLE" = 1 ] && {
	vlan_add "$WAN_B_VLAN_ID" "$trunk_ports"
	uci set network.wanb.device="${lan_eth}.${WAN_B_VLAN_ID}"
}

[ -n "$WAN_MAC_ADDR" ] && {
	wan_dev="$(uci -q get network.wan.device)"
	_uci network device "" name="$wan_dev" macaddr="$WAN_MAC_ADDR"
}

[ -n "$WAN_B_MAC_ADDR" ] && [ "$WAN_B_ENABLE" = 1 ] && {
	wanb_dev="$(uci -q get network.wanb.device)"
	_uci network device "" name="$wanb_dev" macaddr="$WAN_B_MAC_ADDR"
}

set +x
for vid in $(expand_vlan_list "$ADDITIONAL_VLAN_LIST"); do
	vlan_add "$vid" "$trunk_ports"
done >/dev/null
[ "$LOG" = 1 ] && set -x

[ "$AP_MODE" = 1 ] && {
	/etc/init.d/dnsmasq disable
	/etc/init.d/odhcpd disable

	uci set network.wan.disabled=1
	[ "$WAN_B_ENABLE" = 1 ] && uci set network.wanb.disabled=1

	_uci network interface lan \
		ipaddr="${LAN_IP_PREFIX}.${AP_INDEX:-2}${LAN_SUBNET}" \
		gateway="${LAN_IP_PREFIX}.1" \
		dns="${LAN_IP_PREFIX}.1" \
		metric=5

	[ "$GUEST_ENABLE" = 1 ] && \
		uci set network.guest.ipaddr="${GUEST_IP_PREFIX}.${AP_INDEX:-2}${GUEST_SUBNET}"

	[ "$IOT_ENABLE" = 1 ] && \
		uci set network.iot.ipaddr="${IOT_IP_PREFIX}.${AP_INDEX:-2}${IOT_SUBNET}"

	[ "$WG_ENABLE" = 1 ] && \
		uci set "network.lan_${WG_IFACE}.ipaddr=${LAN_WG_IP_PREFIX}.${AP_INDEX:-2}${LAN_WG_SUBNET}"
}

# === mwan3 ===
cat > /sbin/mwan3-iface-add << 'EOF'
#!/bin/sh
. /usr/share/wrtnova/functions.sh

IFACE="${1//-/_}"
BASE_IFACE="${IFACE%%_6}"
FAMILY=${2:-ipv4}
METRIC=${3:-1}
WEIGHT=${4:-1}
LOAD_BALANCED=${5:-1}
TRACK_IP=${6:-1.1.1.1}
NAME="${IFACE}_m${METRIC}_w${WEIGHT}"
[ "$FAMILY" = ipv6 ] && TRACK_IP=${6:-2620:fe::fe}

[ -z "$IFACE" ] && {
	cat <<-USAGE

Usage: mwan3-iface-add <interface> [family] [metric] [weight] [balanced] [track_ip]

  interface	Logical interface name (required)
  family	ipv4 or ipv6, default ipv4
  metric	Lower metric used first, same metric load-balanced, default 1
  weight	Load-balanced interfaces: higher weights distribute more traffic, default 1
  balanced	1 = add to the default balanced policy, '0' = only_policy only, default 1
  track_ip	IP to track, default 1.1.1.1 (ipv4) or 2620:fe::fe (ipv6)
	USAGE
	exit 1
}

uci -q get "network.${IFACE}" > /dev/null || {
	echo "'$IFACE' interface not found in network config" >&2
	exit 1
}

calc_metric() {
	local ifaces v m=0
	ifaces=$(uci show network | awk -F'[.=]' '/=interface$/{print $2}')

	for i in $ifaces; do
		v=$(uci -q get network."$i".metric 2>/dev/null)
		[ "${v:-0}" -gt "$m" ] && m=${v:-0}
	done
	echo $((m ? m+5 : 5))
}

uci set "network.${IFACE}.metric=$(calc_metric)"

_uci mwan3 interface "$IFACE" \
	enabled=1 family="$FAMILY" \
	-track_ip +track_ip="$TRACK_IP"

_uci mwan3 member "$NAME" \
	interface="$IFACE" metric="$METRIC" weight="$WEIGHT"

_uci mwan3 policy "${BASE_IFACE:0:10}_only" \
	^use_member="$NAME" +use_member="$NAME"

[ "$LOAD_BALANCED" = 1 ] && _uci mwan3 policy balanced \
	^use_member="$NAME" +use_member="$NAME"
EOF
chmod +x /sbin/mwan3-iface-add

[ -x /usr/sbin/mwan3 ] && {
cat > /etc/config/mwan3 <<-EOF

config globals 'globals'
	option mmx_mask '0x3F00'
	option logging '1'
	option loglevel 'error'

config policy 'balanced'

config rule 'https'
	option sticky '1'
	option dest_port '443'
	option proto 'tcp'
	option use_policy 'balanced'

config rule 'default_rule_v4'
	option dest_ip '0.0.0.0/0'
	option use_policy 'balanced'
	option family 'ipv4'

config rule 'default_rule_v6'
	option dest_ip '::/0'
	option use_policy 'balanced'
	option family 'ipv6'
EOF

	mwan3-iface-add wan
	mwan3-iface-add wan_6 ipv6

	[ "$WAN_B_ENABLE" = 1 ] && {
		mwan3-iface-add wanb
		mwan3-iface-add wanb_6 ipv6
	}

	[ -n "$WWAN_PATH" ] && mwan3-iface-add wwan0 "" 2 2
	[ -n "$USB_TETHER_DEV" ] && mwan3-iface-add "$USB_TETHER_DEV" "" 2 2

	[ "$WG_ENABLE" = 1 ] && [ "$AP_MODE" != 1 ] && {
		mwan3-iface-add "${WG_IFACE}" "" 1 1 0
		mwan3-iface-add "${WG_IFACE}_6" ipv6 1 1 0

		ula_prefix="$(uci -q get network.globals.ula_prefix)"

		_uci mwan3 rule "lan_${WG_IFACE:0:5}_ipv4" \
			src_ip="${LAN_WG_IP_PREFIX}.0${LAN_WG_SUBNET}" \
			use_policy="${WG_IFACE}_only" \
			@2

		_uci mwan3 rule "lan_${WG_IFACE:0:5}_ipv6" \
			src_ip="${ula_prefix%::*}:${wg_vlan_hex}::/64" \
			use_policy="${WG_IFACE}_only" \
			@3
	}

        # Disable mwan3 if single WAN
	[ "$WAN_B_ENABLE" != 1 ] && [ -z "$WWAN_PATH" ] && \
	[ -z "$USB_TETHER_DEV" ] && [ "$WG_ENABLE" != 1 ] && \
		/etc/init.d/mwan3 disable
}

# === DHCP/DNS ===
cat > /sbin/dhcp-instance-add << 'EOF'
#!/bin/sh
. /usr/share/wrtnova/functions.sh
IFACE=$1
TIME=${2:-12h}
DOMAIN=${3:-${1}.lan}
LOCAL=${4:-$DOMAIN}
IPV6=${5:-1}
START=${6:-100}

[ -z "$IFACE" ] && {
	cat <<-USAGE

Usage: dhcp-instance-add <iface> [time] [domain] [local] [ipv6] [start] [limit]

  iface		Interface name (required)
  time		Lease time, default 12h
  domain	DNS domain, default <iface>.lan
  local		Domain to resolve locally, default /<iface>.lan/
  ipv6		Enable IPv6 RA/DHCPv6, default 1
  start		DHCP pool start, default 100
  limit		DHCP pool limit, default auto from subnet size
	USAGE
	exit 1
}

uci -q get "network.${IFACE}" > /dev/null || {
	echo "'$IFACE' interface not found in network config" >&2
	exit 1
}

BITS=$(uci -q get "network.${IFACE}.ipaddr" | grep -o '/[0-9]*$' | tr -d '/')
LIMIT=${7:-$(( (1 << (32 - ${BITS:-24})) - 156 ))}
DEV=$(ifstatus "$IFACE" | jsonfilter -e '@.device' 2>/dev/null || echo eth0)

_uci dhcp dnsmasq "${IFACE}_dns" \
	domainneeded=1 localise_queries=1 \
	rebind_protection=1 rebind_localhost=1 \
	local="/${LOCAL}/" domain="$DOMAIN" \
	expandhosts=1 authoritative=1 readethers=1 \
	leasefile="/tmp/dhcp.leases.${IFACE}" \
	localservice=1 dnsforwardmax=500 \
	dhcpleasemax=$(( LIMIT + 50 )) \
	-interface +interface="$IFACE" \
	-notinterface +notinterface=loopback

_uci dhcp "" "$IFACE" \
	instance="${IFACE}_dns" interface="$IFACE" \
	start="$START" limit="$LIMIT" leasetime="$TIME"

[ "$IPV6" = 1 ] && _uci dhcp "" "$IFACE" \
	ra=server dhcpv6=server ra_default=1 \
	ra_flags="managed-config other-config" \
	-dns +dns="$(ip -6 a s dev "$DEV" | grep -o 'fe80[^/]*')"
EOF
chmod +x /sbin/dhcp-instance-add

setup_dnsmasq_upstream() {
	local ifaces="${WG_ENABLE:+lan_${WG_IFACE}} ${GUEST_ENABLE:+guest} ${IOT_ENABLE:+iot}"
	for iface in lan $ifaces; do
		[ -n "$iface" ] && {
			_uci dhcp dnsmasq "${iface}_dns" noresolv=1 cachesize=0 \
				-server "+server=127.0.0.1#5354" "+server=::1#5354"
		}
	done
}

while uci -q del dhcp.@dnsmasq[0]; do :; done
while uci -q del dhcp.@dhcp[0]; do :; done
IPV6_LINK_LOCAL=$(ip l s eth0 up && ip -6 a s dev eth0 | grep -o 'fe80[^/]*')

dhcp-instance-add lan 24h lan lan 1 "$LAN_DHCP_START"
uci del dhcp.lan_dns.notinterface

[ "$GUEST_ENABLE" = 1 ] && dhcp-instance-add guest 1h "" "" 0 "$GUEST_DHCP_START"

[ "$IOT_ENABLE" = 1 ] && dhcp-instance-add iot "" "" "" 0

[ "$WG_ENABLE" = 1 ] && {
	_uci dhcp dnsmasq lan_dns \
		+rebind_domain=lan \
		+server="/${WG_IFACE}.lan/${LAN_WG_IP_PREFIX}.1"

	dhcp-instance-add "lan_${WG_IFACE}" 24h "${WG_IFACE}.lan"

	_uci dhcp dnsmasq "lan_${WG_IFACE}_dns" \
		+rebind_domain=lan \
		+server=/lan/127.0.0.1
}

_uci system timeserver ntp \
	enable_server=1 -server \
	"+server=time1.google.com" \
	"+server=time2.google.com" \
	"+server=time.cloudflare.com"

cat >> /etc/hosts <<-EOF

$IPV6_LINK_LOCAL	$HOST_NAME

216.239.35.0		time1.google.com
216.239.35.4		time2.google.com
162.159.200.1		time.cloudflare.com

2001:4860:4806::	time1.google.com
2001:4860:4806:4::	time2.google.com
2606:4700:f1::1		time.cloudflare.com
EOF

# Skip setup Adguard Home if less than 230MB RAM
[ -x "/usr/bin/AdGuardHome" ] && {
	read -r _ TOTAL_RAM_KB _ < /proc/meminfo
	if [ "$TOTAL_RAM_KB" -ge 235520 ]; then
		setup_dnsmasq_upstream
		echo "0 3 */3 * * /etc/init.d/adguardhome restart" >> /etc/crontabs/root
		echo "sleep 30; /etc/init.d/adguardhome restart &" >> /etc/hotplug.d/iface/96-custom-ifup-wan

		[ -x "/usr/bin/dnsproxy" ] && /etc/init.d/dnsproxy disable
	else
		/etc/init.d/adguardhome disable
	fi
}

ADGUARD_PASSWD=${ADGUARD_PASSWD:-\$2y\$10\$aRfh9IbImR8PIf/FWlLvkeW6wiyp47BjY0KqW/FD/F14QloYuV00a}
[ "$OS_VERSION" = "25" ] && { mkdir -p /etc/adguardhome; adguard_dir=/etc/adguardhome; } || adguard_dir=/etc
cat > "$adguard_dir"/adguardhome.yaml <<-EOF
http:
  address: 0.0.0.0:3000
users:
  - name: admin
    password: $ADGUARD_PASSWD
dns:
  bind_hosts:
    - 127.0.0.1
    - ::1
  port: 5354
  ratelimit: 500
  upstream_dns:
    - https://dns10.quad9.net/dns-query
    - https://dns.cloudflare.com/dns-query
    - https://dns.google/dns-query
  bootstrap_dns:
    - 1.0.0.1
    - 2620:fe::fe
  fallback_dns:
    - 1.1.1.1
    - 2620:fe::9
  cache_size: 4194304
  cache_optimistic: true
  use_private_ptr_resolvers: false
  use_http3_upstreams: true
querylog:
  interval: 24h
  size_memory: 500
clients:
  runtime_sources:
    rdns: false
log:
  enabled: false
schema_version: 28
EOF

# Mini AdguardHome
[ -x "/usr/bin/dnsproxy" ] && {
	setup_dnsmasq_upstream
	_uci dnsproxy global global \
		enabled=1 log_file=/dev/null rate_limit=500 \
		-listen_port +listen_port=5354

	_uci dnsproxy cache cache \
		enabled=1 cache_optimistic=1 size=4194304

	_uci dnsproxy edns edns enabled=1

	_uci dnsproxy servers servers \
		-upstream -bootstrap -fallback \
		+upstream=https://dns.adguard-dns.com/dns-query \
		+upstream=quic://dns.adguard-dns.com \
		+bootstrap=9.9.9.9 +bootstrap=2606:4700:4700::1111 \
		+fallback=1.1.1.1 +fallback=2620:fe::9
}

# === Firewall ===
fw_add_zone() {
	_uci firewall zone "$1" \
		name="$1" network="$2" \
		"${3:+masq=$3}" "${4:+masq6=$4}" "${5:+mtu_fix=$5}" \
		input="${6:-REJECT}" output="${7:-ACCEPT}" forward="${8:-REJECT}"
}

fw_add_forwarding() {
	_uci firewall forwarding "${1}_${2}" src="$1" dest="$2"
}

fw_allow_base_services() {
	_uci firewall rule "" \
		name="${1}-Allow-DNS-DHCP-NTP" src="$1" \
		target=ACCEPT proto="tcp udp" dest_port="53 67 123"

	_uci firewall rule "" \
		name="${1}-Allow-Ping" src="$1" \
		target=ACCEPT proto=icmp family=ipv4 +icmp_type=echo-request

	_uci firewall rule "" \
		name="${1}-Allow-DHCPv6" src="$1" \
		target=ACCEPT proto=udp family=ipv6 dest_port=546

	_uci firewall rule "" \
		name="${1}-Allow-MLD" src="$1" \
		target=ACCEPT proto=icmp family=ipv6 src_ip=fe80::/10 \
		+icmp_type=130/0 +icmp_type=131/0 \
		+icmp_type=132/0 +icmp_type=143/0

	_uci firewall rule "" \
		name="${1}-Allow-ICMPv6-Input" src="$1" \
		target=ACCEPT proto=icmp family=ipv6 limit=1000/sec \
		+icmp_type=echo-request +icmp_type=echo-reply \
		+icmp_type=destination-unreachable +icmp_type=packet-too-big \
		+icmp_type=time-exceeded +icmp_type=bad-header \
		+icmp_type=unknown-header-type +icmp_type=router-solicitation \
		+icmp_type=neighbour-solicitation +icmp_type=router-advertisement \
		+icmp_type=neighbour-advertisement
}

fw_add_forward_rule() {
	_uci firewall rule "" \
		name="$1" dest_ip="$2" \
		proto="${3:-all}" "${4:+dest_port=$4}" \
		src="${5:-wan}" dest="${6:-lan}" \
		family=ipv6 target=ACCEPT
}

fw_prevent_dns_leaks() {
	_uci firewall redirect "" \
		name="${1}-Prevent-DNS-leaks" src="$1" src_dport=53 \
		target=DNAT family=any proto="tcp udp"
}

fw_redirect_ntp() {
	_uci firewall redirect "" \
		name="${1}-Redirect-NTP" src="$1" src_dport=123 \
		target=DNAT family=any proto=udp
}

[ "$HARDWARE_OFFLOAD" = 1 ] && SOFTWARE_OFFLOAD=1
_uci firewall defaults @defaults[0] \
	"${SOFTWARE_OFFLOAD:+flow_offloading=1}" "${HARDWARE_OFFLOAD:+flow_offloading_hw=1}"

WAN_ZONE="wan wan_6${WAN_B_ENABLE:+ wanb wanb_6}${WWAN_PATH:+ wwan0}${USB_TETHER_DEV:+ $USB_TETHER_DEV}"
_uci firewall zone "@zone[1]" "network=$WAN_ZONE" "~@zone[1]=wan"

_uci firewall rule "" name=Block-DoT-DoQ src="*" dest="*" dest_port=853 target=REJECT

fw_prevent_dns_leaks lan

[ "$GUEST_ENABLE" = 1 ] && {
	fw_add_zone guest guest
	fw_allow_base_services guest 
	fw_prevent_dns_leaks guest
	fw_add_forwarding guest wan
}

[ "$IOT_ENABLE" = 1 ] && {
	fw_add_zone iot iot
	fw_allow_base_services iot
	fw_prevent_dns_leaks iot
	fw_redirect_ntp iot
	fw_add_forwarding lan iot

	[ "$IOT_INTERNET" = 1 ] && fw_add_forwarding iot wan
}

[ "$AP_MODE" != 1 ] && [ "$WG_ENABLE" = 1 ] && {
	fw_add_zone wan_nat6 "$WG_IFACE" 1 1 1
	fw_add_forwarding lan wan_nat6
}

# === Cloudflare DDNS ===
add_cf_ddns() {
	local interface="$1" use_ipv6="$2" ip_source="$3"
	local network_or_hostname="$4" lookup_host="$5"
	local domain="${lookup_host%%.*}@${lookup_host#*.}"
	local name="${interface}_ipv4" ip_key=ip_network

	[ "$ip_source" = script ] && {
		ip_key=ip_script 
		name="${network_or_hostname//-/_}_ipv6"
		network_or_hostname="ip6host $network_or_hostname"
	}

	_uci ddns service "$name" \
		service_name=cloudflare.com-v4 \
		lookup_host="$lookup_host" domain="$domain" \
		username=Bearer password="${CLOUDFLARE_API_KEY:-cloudflare_api_key}" \
		use_ipv6="$use_ipv6" interface="$interface" \
		ip_source="$ip_source" "${ip_key}=$network_or_hostname" \
		cacert=/etc/ssl/certs use_https=1 enabled="${DDNS_ENABLE:-0}"
}

[ -x /usr/bin/ddns ] && [ "$AP_MODE" != 1 ] && {
	LOOKUP_HOST=${LOOKUP_HOSTNAME:-ddns.example.com}
	while uci -q del ddns.@service[0]; do :; done
	add_cf_ddns wan 0 network wan "$LOOKUP_HOST"
}

# IPv6 DDNS helper script
cat > /sbin/ip6host << 'EOF'
#!/bin/sh
HOST=$1
LAN_IF="${2:-lan}"

[ -z "$HOST" ] && {
	echo "Usage: ip6host <hostname> [lan|lab|...]"
	exit 0
}

# Get LAN_IF netdev and extract IPv6 prefix
eval "$(ubus call network.interface dump | jsonfilter \
	-e "LAN_DEV=@.interface[@.interface='$LAN_IF'].device" \
	-e "PREFIX=@.interface[@.proto='dhcpv6']['ipv6-prefix'][@.assigned['$LAN_IF']].address")"

# Get HOST IPv6 lease, match against the PREFIX, %???? is enough for /56 PD
ubus call dhcp ipv6leases \
	| jsonfilter -e "@.device['${LAN_DEV}'].leases[@.hostname='${HOST}']['ipv6-addr'][*].address" \
	| grep "${PREFIX%????}" \
	| head -1
EOF
chmod +x /sbin/ip6host

# === Static Leases & Port Forwarding ===
process_host_list() {
	local hostname octet ports name idx

	while IFS='|' read -r hostname octet ports; do
		hostname=$(echo "$hostname" | tr -d ' \t')
		octet=$(echo "$octet" | tr -d ' \t')
		ports="${ports# }"
		[ -z "$hostname" ] && continue

		name="${hostname//-/_}"
		uci -q get "dhcp.${name}" > /dev/null || \
			_uci dhcp host "$name" \
				name="$hostname" dns=1 \
				ip="${LAN_IP_PREFIX}.${octet}" \
				hostid="$octet" duid="$(duid_gen)"

		[ "$1" = ipv4 ] && {
			for port in $ports; do
				_uci firewall redirect "" \
					name="$hostname $port"\
					src=wan src_dport="$port" target=DNAT \
					proto="tcp udp" dest=lan dest_port="$port" \
					dest_ip="${LAN_IP_PREFIX}.${octet}"
			done
		}

		[ "$1" = ipv6 ] && {
			[ -x /usr/bin/ddns ] && {
				add_cf_ddns wan_6 1 script "$hostname" \
					"${idx:+${hostname}.}${LOOKUP_HOST}"
				idx=1
			}

			if [ -z "$ports" ]; then
				fw_add_forward_rule \
					"Forward everything $hostname" \
					"::${octet}/-64" all
			else
				fw_add_forward_rule \
					"Forward $ports $hostname" \
					"::${octet}/-64" "tcp udp" "$ports"
			fi
		}
	done
}

[ "$AP_MODE" != 1 ] && {
	process_host_list ipv4 <<-EOF
	$PORT_FORWARD_LIST
	EOF

	process_host_list ipv6 <<-EOF
	$IPV6_SERVER_LIST
	EOF
}
:
