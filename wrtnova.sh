#!/bin/sh
# shellcheck disable=SC3043,SC3060,SC3057,SC1091
# SPDX-License-Identifier: MIT
# Copyright (C) 2024 - 2026 Tieu Long <https://github.com/LongQT-sea>

# WrtNova - Opinionated uci-defaults script for OpenWrt

# Router LAN IP is derived from NET_PREFIX.VLAN.1, e.g. 192.168.1.1 or 192.168.1.2 if AP mode

# === System ===
HOST_NAME=""		# Default: WrtNova
ROOT_PASSWD=""
SSH_PUBLIC_KEY=""
SSH_PASSWD_AUTH=""	# off = disable password login (SSH keys auth only)

# See https://github.com/openwrt/luci/blob/master/modules/luci-lua-runtime/luasrc/sys/zoneinfo/tzdata.lua
ZONE_NAME=""
TIME_ZONE=""
TIME_FORMAT=		# h12 = 12-hour clock; h23 = 24-hour clock

# === WiFi ===
DEFAULT_WIFI_PASSWD=""	# Default: 12345678
COUNTRY_CODE=
DOT11KV=1		# 1 = enable neighbor reports and assisted roaming (802.11k/v)
DOT11R=1		# 1 = enable fast transition support (802.11r)
DENSE_ENV=		# 1 = optimize roaming and steering for high-interference areas
PSK_VLAN=		# 1 = one SSID; wifi password determines which VLAN the client joins
BAND_SUFFIX=		# 1 = append band (2G/5G/6G) to the end of the SSID

LAN_WIFI_SSID=""	# Default: WrtNova
LAN_WIFI_PASSWD=""

GUEST_WIFI_SSID=""	# Default: WrtNova_Guest
GUEST_WIFI_PASSWD=""
GUEST_ISOLATE=		# 1 = isolates guest wifi clients from each other

IOT_WIFI_SSID=""	# Default: WrtNova_IoT
IOT_WIFI_PASSWD=""
IOT_NO_DOT11R=		# 1 = disable fast transition support (802.11r) for IoT

LAN_WG_WIFI_SSID=""	# Default: WrtNova_VPN
LAN_WG_WIFI_PASSWD=""

# NOTE: Wired backhaul is always better when feasible
WIRELESS_MESH=		# 1 = use wireless mesh backhaul (802.11s)
BATMAN_ADV=		# 1 = use batman-adv on top of 802.11s meshpoint
MESH_ID=
MESH_PASSWD=""

# NOTE: Only if you know what you’re doing
CHANNEL_2G=
CHANNEL_5G=
CHANNEL_6G=
WIFI_LOG_LVL=
WED_ENABLE=		# https://openwrt.org/docs/guide-user/network/wifi/wed

# === Network ===
BASE_NET_PREFIX="192.168"
DEFAULT_SUBNET="/24"	# /24 to /22

# 1 = enable guest network
GUEST_ENABLE=1

# 1 = enable IoT network
IOT_ENABLE=
IOT_INTERNET=		# 1 = lets IoT subnet access the internet
IOT_ROUTE_VIA_WG=	# 1 = lets IoT subnet access the internet over WireGuard Client

# Default: BASE_NET_PREFIX
LAN_BASE_PREFIX=
GUEST_BASE_PREFIX=
IOT_BASE_PREFIX=
LAN_WG_BASE_PREFIX=

# Default: DEFAULT_SUBNET
LAN_SUBNET=
GUEST_SUBNET=
IOT_SUBNET=
LAN_WG_SUBNET=

LAN_IFACE=		# e.g. lan, vlan1, ...; Default: lan
GUEST_IFACE=		# e.g. guest, vlan5, ...; Default: guest
IOT_IFACE=		# e.g. iot, vlan10, ...; Default: iot
LAN_WG_IFACE=		# e.g. lan_vpn, vlan15, ...; Default: lan_vpn

LAN_VLAN_ID=		# Default: 1
GUEST_VLAN_ID=		# Default: 5
IOT_VLAN_ID=		# Default: 10
LAN_WG_VLAN_ID=		# Default: 15
WAN_VLAN_ID=		# Default: 20
WAN_B_VLAN_ID=		# Default: 21

# Additional VLANs to trunk through this device (e.g. "25 30 40" or "30-50"), ranges must be low-high
ADDITIONAL_VLAN_LIST=""

TAGGED_LAN_VLAN=	# Make LAN_VLAN tagged instead of untagged & pvid

BRIDGE_STP=		# 1 = enable Spanning Tree Protocol on br-vlan

# === IPv4 Port Forwarding and IPv6 Server Exposure ===
# Format: hostname | last_octet (20-99) | ports (empty = expose all for IPv6)
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
DDNS_ENABLE=		# 1 = enable Cloudflare DDNS
LOOKUP_HOSTNAME=	# e.g. ddns.example.com
CLOUDFLARE_API_KEY=

# === WAN / Multi-WAN ===
PPPOE_USERNAME=""	# Set this to use PPPoE instead of DHCP on the wan interface
PPPOE_PASSWD=""

WAN_IS_TAGGED=		# 1 = tag WAN_VLAN_ID on wan interface
WAN_MAC_ADDR=
BRIDGE_WAN_PORT=	# 1 = add wan port to br-vlan bridge (for IPTV, VoIP, and multi-PPPoE)

WAN_B_ENABLE=

# WireGuard Client
WG_ENABLE=		# 1 = enable WireGuard Client
WG_IFACE=		# e.g. vpn, wg0, ...
WG_PRIVATE_KEY=
WG_IPV4=
WG_IPV6=
WG_DNS_V4=
WG_DNS_V6=
PEER_PUBLIC_KEY=
PRESHARED_KEY=
ENDPOINT=
ENDPOINT_PORT=		# Default: 51820
ALLOWED_IPS=""		# Default: "0.0.0.0/0 ::/0"

# 1 = enable MBIM modem failover (prefill path is MT7621-specific, this can change later in LuCI)
CELLULAR_MODEM=
MODEM_PATH="/sys/devices/platform/1e1c0000.xhci/usb2/2-1"
MODEM_APN="internet"

# 1 = enable USB tethering failover (Android/iPhone)
USB_TETHERING=

# === DHCP/DNS ===
# Default range: START=100, LIMIT=auto (192.168.1.100 - 192.168.1.199)
LAN_DHCP_START=
GUEST_DHCP_START=
DNSMASQ_SINGLE_INSTANCE=	# 1 = use a single dnsmasq instance instead of multiple
FORCE_DNS=		# 1 = force DNS (redirect port 53 TCP/UDP) from LAN, GUEST, and IOT to the router

# AdGuardHome admin passwd in bcrypt hash (default 12345678)
ADGUARD_PASSWD=''
ADGUARD_MAIN_DNS=	# 1 = set AdGuardHome as primary DNS resolver

# Separate multiple entries with spaces or newlines
DOH_UPSTREAMS=
BOOTSTRAP_DNS=

# === Misc ===
# NOTE: AP nodes flash the same config as the main router, only changing:
AP_MODE=		# 1 = enable AP mode (disable DHCP, device acts as access point + managed switch)
AP_INDEX=		# AP management IP last octet (2-19)

# 1 = enable Routing/NAT Offloading
HARDWARE_OFFLOAD=	# NOTE: Do not set if using QoS/SQM
SOFTWARE_OFFLOAD=

IRQBALANCE=		# 1 = enable irqbalance

# 1 = block DNS over TLS/QUIC
BLOCK_DOT_DOQ=

# 1 = block public DoH servers with banip
BLOCK_DOH=

# List of country codes (lower case) to block with banip
BANIP_COUNTRY_LIST=''	# e.g. Sri Lanka, India: 'lk in'

# 1 = Block guest internet access at night
DENY_GUEST_NIGHT=

ULA_PREFIX=
P_STEERING=

LUCI_HTTPS=		# 1 = force LuCI HTTPS redirect

# 1 = log to /root/99-asu-defaults.log
LOG=

# 1 = enable quarterly auto-reboot at 3:30 AM
QUARTERLY_REBOOT=

# ===================
# End config section
# ===================
[ -x /bin/run-cmd ] && exit 0

mkdir /usr/share/wrtnova
cat > /usr/share/wrtnova/functions.sh <<'EOF'
# WrtNova shared functions

# _uci <config> <type> <name> [key=val ...]
# key=val  -> uci set
# -key     -> uci del
# +key=val -> uci add_list
# ^key=val -> uci del_list
# ~newname -> uci rename
# @n       -> uci reorder

_uci() {
	local config="$1"
	local type="${2:-$1}"
	local name arg
	case "$3" in
		@*) name="$3" ;;
		*)  name="${3//-/_}" ;;
	esac
	shift 3

	if [ -z "$name" ]; then
		uci add "$config" "$type"
		name="@${type}[-1]"
	else
		uci set "${config}.${name}=${type}"
	fi

	for arg; do
		[ -z "$arg" ] && continue
		case "$arg" in
			+*) uci add_list "${config}.${name}.${arg#+}" ;;
			-*) uci -q del "${config}.${name}.${arg#-}" ;;
			^*) uci -q del_list "${config}.${name}.${arg#^}" ;;
			~*) uci rename "${config}.${name}=${arg#\~}" ;;
			@*) uci reorder "${config}.${name}=${arg#@}" ;;
			*) uci set "${config}.${name}.${arg}" ;;
		esac
	done
}

has_pkg() {
	local pkg
	for pkg; do
		ls /*/apk/*/*"${pkg}"*.list >/dev/null 2>&1 && return 0
		ls /*/*/opkg/*/*"${pkg}"*.list >/dev/null 2>&1 && return 0
	done
	return 1
}

duid_gen() {
	printf '0004'
	tr -d '-' < /proc/sys/kernel/random/uuid
}

add_luci_command() {
	_uci luci command "" command="$1" param="${2:-1}"
}

get_os_version() {
	ubus call system board | jsonfilter -e '@.release.version' | cut -d. -f1
}
EOF
. /usr/share/wrtnova/functions.sh

# === Probe ===
[ "$WG_ENABLE" = 1 ] && [ "$AP_MODE" != 1 ] && {
	[ -x /usr/bin/wg ] || WG_ENABLE=
}

[ -x /usr/sbin/mwan3 ] || no_mwan3=1

has_pkg modemmanager || CELLULAR_MODEM=

has_pkg wpad-mbed wpad-open wpad-wolf && full_wpad=1
has_pkg wpad-mesh && wpad_mesh=1

[ -z "$full_wpad" ] && {
	DOT11KV=
	[ -z "$wpad_mesh" ] && {
		WIRELESS_MESH=
		BATMAN_ADV=
	}
}

iw phy | grep -Fq "* mesh point" || WIRELESS_MESH=

iw phy | grep -q "AP/VLAN" || PSK_VLAN=

has_pkg luci-proto-batman || BATMAN_ADV=

uci -q get wireless || {
	no_wifi=1
	WIRELESS_MESH=
	BATMAN_ADV=
}

has_pkg dnsproxy && dnsproxy=1
has_pkg https-dns-proxy && https_dns=1
has_pkg adblock-fast && adblock_fast=1

has_pkg adguardhome && {
	# Skip setup Adguard Home if less than 230MB RAM
	read -r _ TOTAL_RAM_KB _ < /proc/meminfo
	if [ "$TOTAL_RAM_KB" -ge 235520 ]; then
		adguardhome=1
	else
		/etc/init.d/adguardhome disable
	fi
}

# === System ===
cat > /bin/run-cmd <<'EOF'
#!/bin/sh
ALLOW="
	ifup ifdown ifstatus wifi iwinfo
	ip iw nft bridge netstat
	cat ls df du ps grep
	dmesg service
	ip6host
	uci
"

[ -z "$1" ] && {
	printf "Allowed:$ALLOW"
	exit 0
}

for cmd in $ALLOW; do
	[ "$1" = "$cmd" ] && {
		cd /
		exec "$@"
	}
done

printf "Allowed:$ALLOW"
exit 1
EOF
chmod +x /bin/run-cmd

[ -n "$ROOT_PASSWD" ] && passwd root << EOF
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
cat > /etc/profile.d/custom_alias.sh << EOF
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
	[ "$SSH_PASSWD_AUTH" = off ] && _uci dropbear "" @dropbear[0] PasswordAuth=off RootPasswordAuth=off
}

os_version="$(get_os_version)"
[ "${os_version:=25}" -ge 25 ] && ZONE_NAME="${ZONE_NAME// /_}"
[ "${os_version}" -le 24 ] && TIME_FORMAT=
host_name="${HOST_NAME:-WrtNova${AP_MODE:+-${AP_INDEX:=2}}}"

_uci system "" "@system[0]" hostname="$host_name" \
	"${ZONE_NAME:+zonename=$ZONE_NAME}" "${TIME_ZONE:+timezone=$TIME_ZONE}" "${TIME_FORMAT:+clock_hourcycle=$TIME_FORMAT}"

_uci system timeserver ntp enable_server=1

[ -n "$LUCI_HTTPS" ] && uci set uhttpd.main.redirect_https=1

[ "$QUARTERLY_REBOOT" = 1 ] && \
	echo "30 3 1 1,4,7,10 * sleep 70 && { touch /etc/banner; reboot; }" >> /etc/crontabs/root

[ -x /etc/init.d/zram ] && echo vm.swappiness=70 > /etc/sysctl.d/13-zram.conf

[ -n "$IRQBALANCE" ] && _uci irqbalance "" irqbalance enabled=1

hplug_ifup_wan=/etc/hotplug.d/iface/96-ifup-wan
cat > "$hplug_ifup_wan" <<'EOF'
[ ifup = "$ACTION" ] || exit 0
. /lib/functions/network.sh
sleep 5
network_find_wan WAN_IF
network_find_wan6 WAN6_IF

[ "$WAN_IF" = "$INTERFACE" ] ||
[ "$WAN6_IF" = "$INTERFACE" ] || exit 0

ntpd -q -p pool.ntp.org &
EOF

wg_iface=${WG_IFACE:-vpn}
[ "$WG_ENABLE" = 1 ] && [ "$AP_MODE" != 1 ] && {
	echo "*/2 * * * * wireguard_watchdog" >> /etc/crontabs/root
	echo "*/10 * * * * wg-check $wg_iface" >> /etc/crontabs/root
	_uci system "" "@system[0]" cronloglevel=9

	cat > /etc/hotplug.d/iface/98-wg-"$wg_iface" <<-EOF
	[ ifup = "\$ACTION" ] || exit 0
	[ $wg_iface = "\$INTERFACE" ] || exit 0

	[ -x /usr/sbin/mwan3 ] && {
		ip -6 ru | grep '^999:' ||
		ip -6 ru add iif lo lookup 2 prio 999
	}

	sleep 2
	wg-check $wg_iface
	EOF
}

cat > /sbin/wg-check <<'EOF'
#!/bin/sh
IFACE=$1
PING_IP=${2:-9.9.9.9}
PING_IP6=${3:-2620:fe::9}
[ -z "$IFACE" ] && exit 0
[ -d /sys/class/net/"$IFACE" ] || exit 0

L=/tmp/${IFACE}_lock
mkdir "$L" || exit 0
trap 'rmdir "$L"' EXIT

ping -c2 -W2 -I "$IFACE" "$PING_IP" ||
ping6 -c2 -W2 -I "$IFACE" "$PING_IP6" || {
	ifdown "$IFACE"
	sleep 2
	ifup "$IFACE"
}
EOF
chmod +x /sbin/wg-check

# === Network ===
detect_hw() {
	grep -sq DEVTYPE=dsa /sys/class/net/*/uevent && { echo dsa; return; }
	swconfig list 2>/dev/null | grep -q '^Found:' && { echo swconfig; return; }
	echo generic
}

add_bridge_vlan() {
	local vlan_id="$1" ports="$2" iface="$3"

	_uci network bridge-vlan "vlan_${vlan_id}" \
		device=br-vlan vlan="$vlan_id" local=0 "${iface:+-local}"

	for p in $ports; do
		[ "$p" = "mesh0:u*" ] && p=mesh0:t
		uci add_list "network.vlan_${vlan_id}.ports=$p"
	done

	[ -n "$iface" ] && uci set "network.${iface}.device=br-vlan.${vlan_id}"
}

add_bridges() {
	local iface

	for iface in $1; do
		_uci network device "br_${iface}" type=bridge name="br-${iface:0:12}"
		uci set "network.${iface}.device=br-${iface:0:12}"
	done
}

add_switch_vlan() {
	local vlan_id="$1" ports="$2" iface="$3"

	vlan_idx=$((vlan_idx + 1))

	_uci network switch_vlan "" \
		device="$switch_dev" vlan="$vlan_idx" ports="$ports" ${sw_has_vid:+vid=$vlan_id}

	[ -z "$iface" ] && return
	uci add_list "network.br_${iface}.ports=${lan_eth}.${vlan_id}"

	[ "$WIRELESS_MESH" = 1 ] && [ "$BATMAN_ADV" != 1 ] && \
		uci add_list "network.br_${iface}.ports=mesh0.${vlan_id}"
}

expand_vlan() {
	local entry

	for entry in $1; do
		case "$entry" in
			*-*) seq "${entry%-*}" "${entry#*-}" ;;
			*) printf '%s\n' "$entry" ;;
		esac
	done
}

lan_vid=${LAN_VLAN_ID:-1}
guest_vid=${GUEST_VLAN_ID:-5}
iot_vid=${IOT_VLAN_ID:-10}
wg_vid=${LAN_WG_VLAN_ID:-15}
wan_vid=${WAN_VLAN_ID:-20}
wanb_vid=${WAN_B_VLAN_ID:-21}

hw_type=$(detect_hw)
[ "$hw_type" = swconfig ] && {
	sw_has_vid=1
	switch_dev="$(uci -q get network.@switch_vlan[0].device)"

	# swconfig uses vlan= as a VLAN table index. On chips with vid attribute
	# support (e.g. mt7620, mt7628, etc.), vid= sets the actual 802.1Q tag.
	# Without vid support, netifd falls back to vlan= as the tag, so VLAN IDs
	# must be sequential to match the VLAN table index (see add_switch_vlan()).
	swconfig dev "$switch_dev" help | grep -q 'Attribute .*: vid' || {
		sw_has_vid=

		lan_vid=1
		guest_vid=2
		iot_vid=3
		wg_vid=4
		wan_vid=5
		wanb_vid=6

		LAN_SUBNET=/24
		GUEST_SUBNET=/24
		IOT_SUBNET=/24
		LAN_WG_SUBNET=/24
	}
}

base_pfx=${BASE_NET_PREFIX:-192.168}
def_subnet=${DEFAULT_SUBNET:-/24}

lan_net_pfx=${LAN_BASE_PREFIX:-$base_pfx}.${lan_vid}
guest_net_pfx=${GUEST_BASE_PREFIX:-$base_pfx}.${guest_vid}
iot_net_pfx=${IOT_BASE_PREFIX:-$base_pfx}.${iot_vid}
wg_net_pfx=${LAN_WG_BASE_PREFIX:-$base_pfx}.${wg_vid}

lan_subnet=${LAN_SUBNET:-$def_subnet}
guest_subnet=${GUEST_SUBNET:-$def_subnet}
iot_subnet=${IOT_SUBNET:-$def_subnet}
wg_subnet=${LAN_WG_SUBNET:-$def_subnet}

lan_if=${LAN_IFACE:-lan}
guest_if=${GUEST_IFACE:-guest}
iot_if=${IOT_IFACE:-iot}
lan_wg_if=${LAN_WG_IFACE:-lan_vpn}

[ "$GUEST_ENABLE" = 1 ] && \
	_uci network interface "$guest_if" proto=static +ipaddr="${guest_net_pfx}.1${guest_subnet}"

[ "$IOT_ENABLE" = 1 ] && {
	_uci network interface "$iot_if" proto=static +ipaddr="${iot_net_pfx}.1${iot_subnet}"
	[ "$IOT_ROUTE_VIA_WG" = 1 ] && iot_via_wg=1
}

_uci network interface lan -netmask -ipaddr +ipaddr="${lan_net_pfx}.1${lan_subnet}" "~$lan_if"

uci -q get network.wan || {
	_uci network interface wan proto=dhcp
	_uci network interface wan6 proto=dhcpv6
}

_uci network interface wan6 device=@wan ~wan_6

[ -n "$PPPOE_USERNAME" ] && \
	_uci network interface wan proto=pppoe ipv6=0 username="$PPPOE_USERNAME" password="$PPPOE_PASSWD"

[ "$WAN_B_ENABLE" = 1 ] && {
	_uci network interface wanb proto=dhcp ${no_mwan3:+metric=2}
	_uci network interface wanb_6 proto=dhcpv6 device=@wanb ${no_mwan3:+metric=2}
}

[ "$CELLULAR_MODEM" = 1 ] && \
	_uci network interface cellular proto=modemmanager \
		iptype=ipv4v6 device="$MODEM_PATH" apn="${MODEM_APN:-internet}" ${no_mwan3:+metric=3}

[ "$USB_TETHERING" = 1 ] && \
	_uci network interface usb0 proto=dhcp device=usb0 ${no_mwan3:+metric=4}

[ "$WG_ENABLE" = 1 ] && {
	_uci network interface "$lan_wg_if" proto=static \
		+ipaddr="${wg_net_pfx}.1${wg_subnet}" ip6assign=60 +ip6class=local ip6hint=10

	[ "$AP_MODE" != 1 ] && {
		_uci network interface "$wg_iface" proto=wireguard \
			disabled=1 ${PEER_PUBLIC_KEY:+-disabled} \
			private_key="${WG_PRIVATE_KEY:-$(wg genkey)}" \
			+addresses="${WG_IPV4:-172.16.0.2/32}" \
			+addresses="${WG_IPV6:-fd88::/128}" \
			ip4table=20 ip6table=20

		if [ "$no_mwan3" = 1 ]; then
			for f in '' 6; do
				_uci network rule$f "" in="$lan_wg_if" lookup=20 priority=990
				_uci network rule$f "" in="$lan_wg_if" action=prohibit priority=991
			done

			[ "$iot_via_wg" = 1 ] && {
				for f in '' 6; do
					_uci network rule$f "" in=iot lookup=20 priority=990
				done
			}
		else
			# mwan3 already handles PBR and kill switch
			_uci network interface "$wg_iface" -ip4table -ip6table

			# WG IPv6 anchor for mwan3
			_uci network interface "${wg_iface}_6" proto=none device="@$wg_iface"

			# Fix router IPv6 internet access
			_uci network rule6 "" in=loopback lookup=2 priority=999
		fi

		[ -n "$PEER_PUBLIC_KEY" ] && {
			_uci network "wireguard_${wg_iface}" "" \
				public_key="$PEER_PUBLIC_KEY" \
				preshared_key="$PRESHARED_KEY" \
				endpoint_host="${ENDPOINT:-1.2.3.4}" \
				endpoint_port="${ENDPOINT_PORT:-51820}" \
				allowed_ips="${ALLOWED_IPS:-0.0.0.0/0 ::/0}" \
				persistent_keepalive=25 route_allowed_ips=1
		}
	}
}

lan_ports="$(uci -q get network.@device[0].ports)"
wan_port="$(uci -q get network.wan.device)"

# DSA/x86/SBC: always use bridge VLAN filtering
use_bridge_vlan=1
bridge_wan_port=1

# Single NIC: reuse lan port as tagged WAN
[ -z "$wan_port" ] && WAN_IS_TAGGED=1

[ "$hw_type" = "swconfig" ] && {
	use_bridge_vlan=
	lan_eth="${lan_ports%%.*}"
	wan_eth="$wan_port"
}

[ "$AP_MODE" != 1 ] && [ "$use_bridge_vlan" = 1 ] && [ -n "$wan_port" ] && {
	[ "$BRIDGE_WAN_PORT" != 1 ] && bridge_wan_port=
	# Cannot enslave a bridge to another bridge
	[ "$wan_port" = br-wan ] && bridge_wan_port=
}

ifaces_lan="$lan_if ${GUEST_ENABLE:+$guest_if} ${IOT_ENABLE:+$iot_if} ${WG_ENABLE:+$lan_wg_if}"
ifaces_wan="wan wan_6 ${WAN_B_ENABLE:+wanb wanb_6} ${CELLULAR_MODEM:+cellular} ${USB_TETHERING:+usb0}"

# LAN ports are untagged members of the LAN VLAN.
# WAN port are untagged members of the WAN VLAN unless WAN_IS_TAGGED=1.
# All ports carry tagged guest/iot/lan_wg/wanb VLANs as trunk ports.
# AP mode: all ports are untagged on the LAN VLAN and tagged on all other VLANs.
if [ "$use_bridge_vlan" = 1 ]; then
	[ "$AP_MODE" = 1 ] && [ "$wan_port" = br-wan ] && {
		wan_port="$(uci -q get network.@device[1].ports)"
		uci del network.@device[1]
	}

	[ "$WIRELESS_MESH" = 1 ] && [ "$BATMAN_ADV" != 1 ] && lan_ports="$lan_ports mesh0"

	src_ports="$lan_ports"
	[ "$AP_MODE" = 1 ] && src_ports="$lan_ports $wan_port"

	for port in $src_ports; do
		trunk_ports="${trunk_ports:+$trunk_ports }$port:t"
		lan_vlan_ports="${lan_vlan_ports:+$lan_vlan_ports }$port:u*"
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

	[ "$TAGGED_LAN_VLAN" = 1 ] && lan_vlan_ports="$trunk_ports"

	_uci network device @device[0] name=br-vlan -ports ${BRIDGE_STP:+stp=1}
	for p in $lan_ports ${bridge_wan_port:+$wan_port}; do
		_uci network device @device[0] +ports="$p"
	done

	[ "$WAN_IS_TAGGED" = 1 ] && [ "$bridge_wan_port" != 1 ] && \
		uci set network.wan.device="${wan_port}.${wan_vid}"

	add_vlan() { add_bridge_vlan "$@"; }

else
	add_bridges "$ifaces_lan"

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
				*) sw_wan_port="$port" ;;
			esac
		done

		tagged_wan_port="${sw_wan_port}t"
		wan_eth="${wan_port%%.*}"
	}

	cpu_ports="${lan_cpu_port}${wan_cpu_port:+ $wan_cpu_port}"
	trunk_ports="${tagged_lan_ports}${tagged_wan_port:+ $tagged_wan_port} $cpu_ports"
	lan_vlan_ports="${sw_lan_ports}${tagged_wan_port:+ $tagged_wan_port} $cpu_ports"
	wan_vlan_ports="${tagged_lan_ports}${sw_wan_port:+ $sw_wan_port} $cpu_ports"

	[ "$AP_MODE" = 1 ] && {
		lan_vlan_ports="${sw_lan_ports}${sw_wan_port:+ $sw_wan_port} $cpu_ports"
		wan_vlan_ports="$trunk_ports"
#		[ -z "$sw_wan_port" ] # Not worth handling, connect LAN to LAN port instead
	}

	[ "$TAGGED_LAN_VLAN" = 1 ] && lan_vlan_ports="$trunk_ports"

	[ -n "$sw_wan_port" ] && [ "$WAN_IS_TAGGED" = 1 ] && wan_vlan_ports="$trunk_ports"

	if [ "$WAN_IS_TAGGED" = 1 ] || [ -n "$sw_wan_port" ]; then
		uci set network.wan.device="${wan_eth}.${wan_vid}"
	fi

	[ "$WAN_B_ENABLE" = 1 ] && uci set network.wanb.device="${lan_eth}.${wanb_vid}"

	uci del network.@device[0]
	while uci -q del network.@switch_vlan[0]; do :; done

	add_vlan() { add_switch_vlan "$@"; }
fi

add_vlan "$lan_vid" "$lan_vlan_ports" "$lan_if"
[ "$GUEST_ENABLE" = 1 ] && add_vlan "$guest_vid" "$trunk_ports" "$guest_if"
[ "$IOT_ENABLE" = 1 ] && add_vlan "$iot_vid" "$trunk_ports" "$iot_if"
[ "$WG_ENABLE" = 1 ] && add_vlan "$wg_vid" "$trunk_ports" "$lan_wg_if"
[ "$bridge_wan_port" = 1 ] && add_vlan "$wan_vid" "$wan_vlan_ports" ${src_ports:+wan}
[ "$WAN_B_ENABLE" = 1 ] && add_vlan "$wanb_vid" "$trunk_ports" ${src_ports:+wanb}

set +x
for vid in $(expand_vlan "$ADDITIONAL_VLAN_LIST"); do
	add_vlan "$vid" "$trunk_ports"
done >/dev/null
[ "$LOG" = 1 ] && set -x

[ "$AP_MODE" != 1 ] && echo "$WAN_MAC_ADDR" | grep -Eq '^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$' && {
	if [ "$wan_port" = br-wan ]; then
		uci set network.@device[1].macaddr="$WAN_MAC_ADDR"
	else
		_uci network device "" \
			macaddr="$WAN_MAC_ADDR" ${src_ports:+name=$wan_port} ${wan_eth:+name=$wan_eth}
	fi
}

[ "$AP_MODE" = 1 ] && {
	/etc/init.d/dnsmasq disable
	/etc/init.d/odhcpd disable

	for i in $ifaces_wan; do
		uci set network."${i}".disabled=1
	done

	_uci network interface "$lan_if" -ipaddr -ip6assign \
		+ipaddr="${lan_net_pfx}.${AP_INDEX}${lan_subnet}" \
		gateway="${lan_net_pfx}.1" dns="${lan_net_pfx}.1" metric=5

	for i in $ifaces_lan; do
		[ "$i" = "$lan_if" ] && continue
		_uci network interface "$i" proto=none -ipaddr -ip6assign
	done

	[ -z "$BRIDGE_WAN_PORT" ] && uci del network.vlan_"$wan_vid"
}

_uci network globals globals \
	"${P_STEERING:+packet_steering=$P_STEERING}" "${ULA_PREFIX:+ula_prefix=$ULA_PREFIX}"

# === WiFi ===
setup_radio() {
	local radio="$1" channel="$2"

	_uci wireless wifi-device "$radio" -disabled \
		${channel:+channel=$channel} \
		${WIFI_LOG_LVL:+log_level=${WIFI_LOG_LVL:-4}} \
		${COUNTRY_CODE:+country=$COUNTRY_CODE}
}

add_wifi_iface() {
	local dev="$1" mode="$2" ssid="$3" key="$4" net="$5" vid="$6" enc="$7" band="$8" iot_plain

	[ "$net" = "$iot_if" ] && [ -n "$IOT_NO_DOT11R" ] && iot_plain=1

	set -- device="$dev" mode="$mode" ssid="${ssid}${BAND_SUFFIX:+ ${band%g}G}" key="$key" network="$net" encryption="$enc"

	[ "$net" = "$guest_if" ] && [ -n "$GUEST_ISOLATE" ] && set -- "$@" isolate=1 bridge_isolate=1

	[ "$mode" = mesh ] && set -- "$@" -ssid mesh_id="$ssid" ifname="$net" ${BATMAN_ADV:+mesh_fwding=0}

	[ "$DOT11KV" = 1 ] && [ "$mode" = ap ] && set -- "$@" ieee80211k=1 bss_transition=1

	[ "$DOT11R" = 1 ] && [ "$mode" = ap ] && [ -z "$iot_plain" ] && \
		set -- "$@" ieee80211r=1 mobility_domain="$(printf '%s' "$ssid" | md5sum | cut -c1-4)"

	[ "$PSK_VLAN" = 1 ] && [ "$mode" = ap ] && {
		if [ "$band" = 6g ] && [ -z "$BAND_SUFFIX" ]; then
			set -- "$@" ssid="${ssid} 6G"
		elif [ -z "$iot_plain" ]; then
			add_wifi_vlan "$vid" "$key" "$net" "${dev}_${lan_if}"
			[ "$net" != "$lan_if" ] && return
			set -- "$@" encryption=psk2 -key -network
			[ "$os_version" -le 23 ] && set -- "$@" key=_unused_
			[ "$os_version" -ge 25 ] && set -- "$@" +hostapd_bss_options='vlan_no_bridge=1'
		fi
	}

	_uci wireless wifi-iface "${dev}_${net}" "$@"
}

add_wifi_vlan() {
	local vid="$1" key="$2" net="$3" if="$4"

	_uci wireless wifi-station "" iface="$if" vid="$vid" key="$key"
	_uci wireless wifi-vlan "" iface="$if" network="$net" vid="$vid" name="$vid"
}

get_band() {
	uci -q get wireless."$1".band
}

get_channel() {
	uci -q get wireless."$1".channel
}

def_pass="${DEFAULT_WIFI_PASSWD:-12345678}"
lan_ssid="${LAN_WIFI_SSID:-WrtNova}"
lan_pass="${LAN_WIFI_PASSWD:-$def_pass}"
guest_ssid="${GUEST_WIFI_SSID:-WrtNova_Guest}"
guest_pass="${GUEST_WIFI_PASSWD:-$def_pass}"
iot_ssid="${IOT_WIFI_SSID:-WrtNova_IoT}"
iot_pass="${IOT_WIFI_PASSWD:-$def_pass}"
lan_wg_ssid="${LAN_WG_WIFI_SSID:-WrtNova_VPN}"
lan_wg_pass="${LAN_WG_WIFI_PASSWD:-$def_pass}"
mesh_id="${MESH_ID:-mesh0_5ghz}"
mesh_pass="${MESH_PASSWD:-$def_pass}"
mesh_iface=${BATMAN_ADV:+bat0_}mesh0

[ "$WIRELESS_MESH" = 1 ] && {
	hplug_mesh=/etc/hotplug.d/net/94-ifup-$mesh_iface
	set_mesh_param="iw dev $mesh_iface set mesh_param"
	cat > "$hplug_mesh" <<-EOF
	[ add = "\$ACTION" ] || exit 0
	[ $mesh_iface = "\$DEVICENAME" ] || exit 0
	sleep 4
	/etc/init.d/network reload
	$set_mesh_param mesh_rssi_threshold -78
	$set_mesh_param mesh_max_peer_links 6
	EOF

	[ "$AP_MODE" != 1 ] && {
		echo "$set_mesh_param mesh_hwmp_rootmode 2" >> "$hplug_mesh"
		echo "$set_mesh_param mesh_gate_announcements 1" >> "$hplug_mesh"
	}
}

# Fields: mode|ssid|key|network|bands|enabled|vlan|enc_override (empty = band default)
wifi_networks="
ap|$lan_ssid|$lan_pass|$lan_if|2g 5g 6g|1|$lan_vid|
ap|$guest_ssid|$guest_pass|$guest_if|2g 5g 6g|$GUEST_ENABLE|$guest_vid|
ap|$iot_ssid|$iot_pass|$iot_if|2g 5g|$IOT_ENABLE|$iot_vid|
ap|$lan_wg_ssid|$lan_wg_pass|$lan_wg_if|2g 5g 6g|$WG_ENABLE|$wg_vid|
mesh|$mesh_id|$mesh_pass|$mesh_iface|5g|$WIRELESS_MESH||sae
"

while uci -q del wireless.@wifi-iface[0]; do :; done

radios="radio0 radio1 radio2 radio3"

for r in $radios; do
	[ "$(get_band "$r")" = 6g ] && has_6g=1
done

for radio in $radios; do
	band=$(get_band "$radio")
	[ -z "$band" ] && continue
	chan=$(get_channel "$radio")

	case "$band" in
		2g) ch=$CHANNEL_2G; enc=psk2 ;;
		5g) ch=$CHANNEL_5G; enc=sae-mixed ;;
		6g) ch=$CHANNEL_6G; enc=sae ;;
	esac

	role=solo; min=$chan
	for r in $radios; do
		[ "$r" = "$radio" ] && continue
		[ "$(get_band "$r")" = "$band" ] && {
			role=tbd
			other=$(get_channel "$r")
			[ "$other" -lt "$min" ] && min=$other
		}
	done

	[ "$WIRELESS_MESH" = 1 ] && {
		[ "$role" = tbd ] && {
			[ "$chan" = "$min" ] && role=mesh || role=ap
		}

		[ "$role" = solo ] && [ "$band" = 5g ] && [ -n "$has_6g" ] && role=mesh
	}

	setup_radio "$radio" "$([ "$chan" = "$min" ] && echo "$ch")"

	while IFS='|' read -r mode ssid key network bands enabled vid enc_over; do
		[ -n "$mode" ] && [ "$enabled" = 1 ] || continue
		case " $bands " in *" $band "*) ;; *) continue ;; esac

		case "$role" in
			mesh) [ "$mode" = mesh ] || continue ;;
			ap) [ "$mode" = ap ] || continue ;;
		esac

		add_wifi_iface "$radio" "$mode" "$ssid" "$key" "$network" "$vid" "${enc_over:-$enc}" "$band"
	done <<-EOF
	$wifi_networks
	EOF
done

# https://openwrt.org/docs/guide-user/network/wifi/usteer
[ -x /sbin/usteerd ] && {
	_uci usteer "" @usteer[0] \
		network="$lan_if" \
		roam_scan_snr='-68' \
		signal_diff_threshold='8' \
		roam_trigger_snr='-72'

	[ "$DENSE_ENV" = 1 ] && {
		_uci usteer "" @usteer[0] \
			roam_scan_snr='-60' \
			signal_diff_threshold='6' \
			band_steering_interval='30000' \
			band_steering_min_snr='-50' \
			roam_trigger_snr='-65' \
			roam_kick_delay='3000' \
			min_snr='-80'
	}

	if [ "$DOT11KV" != 1 ] || [ "$no_wifi" = 1 ]; then
		/etc/init.d/usteer disable
	fi
}

# === batman-adv ===
[ "$WIRELESS_MESH" = 1 ] && [ "$BATMAN_ADV" = 1 ] && {
	_uci network interface bat0 proto=batadv aggregated_ogms=1 bridge_loop_avoidance=1
	_uci network interface bat0_mesh0 proto=batadv_hardif mtu=2304 master=bat0

	set --	"$lan_if" "$lan_vid" \
		${GUEST_ENABLE:+$guest_if $guest_vid} \
		${IOT_ENABLE:+$iot_if $iot_vid} \
		${WG_ENABLE:+$lan_wg_if $wg_vid}

	while [ $# -ge 2 ]; do
		if [ "$use_bridge_vlan" = 1 ]; then
			uci add_list "network.@device[0].ports=bat0.$2"
			uci add_list "network.vlan_${2}.ports=bat0.${2}:u*"
		else
			uci add_list "network.br_${1}.ports=bat0.$2"
		fi
		shift 2
	done
}

# === WED ===
[ -n "$WED_ENABLE" ] && {
	if [ "${os_version}" -ge 24 ]; then
		echo "options mt7915e wed_enable=Y" >> /etc/modules.conf
	else
		echo "mt7915e wed_enable=Y" >> /etc/modules.d/mt7915e
	fi
}

# === banIP ===
[ -x /etc/init.d/banip ] && {
	_uci banip "" global \
		ban_enabled=1 ban_trigger=wan ban_autodetect=0 \
		ban_protov4=1 ban_protov6=1 ${PPPOE_USERNAME:++ban_dev=pppoe-wan}

	for i in $ifaces_wan; do
		dev=$(uci -q get network."${i}".device)
		case $i in
			*_6) _uci banip "" global +ban_ifv6="$i" ${dev:++ban_dev="$dev"} ;;
			*)   _uci banip "" global +ban_ifv4="$i" ${dev:++ban_dev="$dev"} ;;
		esac
	done

	for f in $BANIP_FEEDS ${BLOCK_DOH:+doh}; do
		_uci banip "" global +ban_feed="$f"
	done

	for c in $BANIP_COUNTRY_LIST; do
		_uci banip "" global +ban_country="$c"
	done
}

# === mwan3 ===
cat > /sbin/mwan3-iface-add <<'EOF'
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
[ "$FAMILY" = ipv6 ] && TRACK_IP=${6:-2620:fe::9}

[ -z "$IFACE" ] && {
	cat <<-USAGE

Usage: mwan3-iface-add <interface> [family] [metric] [weight] [balanced] [track_ip]

  interface	Logical interface name (required)
  family	ipv4 or ipv6, default ipv4
  metric	Lower metric used first, same metric load-balanced, default 1
  weight	Load-balanced interfaces: higher weights distribute more traffic, default 1
  balanced	1 = add to the default balanced policy, '0' = only_policy only, default 1
  track_ip	IP to track, default 1.1.1.1 (ipv4) or 2620:fe::9 (ipv6)
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

uci -q get "network.${IFACE}.metric" || uci set "network.${IFACE}.metric=$(calc_metric)"

_uci mwan3 interface "$IFACE" enabled=1 family="$FAMILY" -track_ip +track_ip="$TRACK_IP"

_uci mwan3 member "$NAME" interface="$IFACE" metric="$METRIC" weight="$WEIGHT"

_uci mwan3 policy "${BASE_IFACE:0:10}_only" ^use_member="$NAME" +use_member="$NAME"

[ "$LOAD_BALANCED" = 1 ] && _uci mwan3 policy balanced ^use_member="$NAME" +use_member="$NAME"

/etc/init.d/log status | grep -q running && uci commit mwan3
EOF
chmod +x /sbin/mwan3-iface-add

[ -z "$no_mwan3" ] && cat > /etc/config/mwan3 << EOF

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

ula_prefix="$(uci -q get network.globals.ula_prefix)"

[ -z "$no_mwan3" ] && {
	mwan3-iface-add wan
	mwan3-iface-add wan_6 ipv6

	[ "$WAN_B_ENABLE" = 1 ] && {
		mwan3-iface-add wanb
		mwan3-iface-add wanb_6 ipv6
	}

	[ "$CELLULAR_MODEM" = 1 ] && mwan3-iface-add cellular "" 2 2
	[ "$USB_TETHERING" = 1 ] && mwan3-iface-add usb0 "" 2 2

	[ "$WG_ENABLE" = 1 ] && [ "$AP_MODE" != 1 ] && {
		mwan3-iface-add "$wg_iface" "" 1 1 0
		mwan3-iface-add "${wg_iface}_6" ipv6 1 1 0

		_uci mwan3 rule "${lan_wg_if:0:9}_ipv4" \
			src_ip="${wg_net_pfx}.0${wg_subnet}" use_policy="${wg_iface}_only" @2

		_uci mwan3 rule "${lan_wg_if:0:9}_ipv6" \
			src_ip="${ula_prefix%::*}:10::/60" use_policy="${wg_iface}_only" @3

		[ "$iot_via_wg" = 1 ] && {
			_uci mwan3 rule "${iot_if}_ipv4" \
				src_ip="${iot_net_pfx}.0${iot_subnet}" use_policy="${wg_iface}_only" @4
		}
	}
}

[ "$AP_MODE" = 1 ] && [ -z "$no_mwan3" ] && /etc/init.d/mwan3 disable

# === DHCP/DNS ===
cat > /sbin/dhcp-instance-add <<'EOF'
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

  iface		Logical interface name (required)
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

_uci dhcp dnsmasq "${IFACE}_dns" \
	domainneeded=1 localise_queries=1 \
	rebind_protection=1 rebind_localhost=1 \
	local="/${LOCAL}/" domain="$DOMAIN" \
	expandhosts=1 cachesize=1000 authoritative=1 \
	readethers=1 leasefile="/tmp/dhcp.leases.${IFACE}" \
	localservice=1 dnsforwardmax=500 \
	dhcpleasemax=$(( LIMIT + 50 )) \
	-interface +interface="$IFACE" \
	-notinterface +notinterface=loopback

_uci dhcp "" "$IFACE" dhcpv4=server \
	instance="${IFACE}_dns" interface="$IFACE" \
	start="$START" limit="$LIMIT" leasetime="$TIME"

[ "$IPV6" = 1 ] && \
	_uci dhcp "" "$IFACE" \
		ra=server dhcpv6=server \
		+ra_flags=managed-config +ra_flags=other-config

/etc/init.d/log status | grep -q running && uci commit dhcp
EOF
chmod +x /sbin/dhcp-instance-add

setup_dnsmasq_upstream() {
	for iface in $ifaces_lan; do
		_uci dhcp dnsmasq "${iface}_dns" \
			noresolv=1 cachesize=0 +server=127.0.0.1#5354 +server=::1#5354 ${adguard_main:+port=54}
	done
}

while uci -q del dhcp.@dnsmasq[0]; do :; done
while uci -q del dhcp.@dhcp[0]; do :; done

[ "$GUEST_ENABLE" = 1 ] && {
	dhcp-instance-add "$guest_if" 1h guest.lan "" 0 "$GUEST_DHCP_START"
	_uci dhcp "" "$guest_if" +dhcp_option=6,"${guest_net_pfx}.1"
}

[ "$IOT_ENABLE" = 1 ] && {
	dhcp-instance-add "$iot_if" "" iot.lan "" 0
	_uci dhcp "" "$iot_if" +dhcp_option=6,"${iot_net_pfx}.1"
}

[ "$WG_ENABLE" = 1 ] && {
	dhcp-instance-add "$lan_wg_if" 24h "vpn.lan"
	_uci dhcp "" "$lan_wg_if" ra_default=1 +dhcp_option=6,"${WG_DNS_V4:-${wg_net_pfx}.1}" ${WG_DNS_V6:+dns=$WG_DNS_V6}
	_uci dhcp dnsmasq "${lan_wg_if}_dns" +rebind_domain=lan +server=/lan/127.0.0.1
}

dhcp-instance-add "$lan_if" 24h lan lan 1 "$LAN_DHCP_START"
_uci dhcp "" "$lan_if" +dhcp_option=6,"${lan_net_pfx}.1"
uci del dhcp."$lan_if"_dns.notinterface

[ "$WG_ENABLE" = 1 ] && \
	_uci dhcp dnsmasq "$lan_if"_dns +rebind_domain=lan +server="/vpn.lan/${wg_net_pfx}.1"

[ "$DNSMASQ_SINGLE_INSTANCE" = 1 ] && {
	for i in $ifaces_lan; do
		[ "$i" = "$lan_if" ] && continue
		uci del dhcp."$i"_dns
		uci del "dhcp.${i}.instance"
	done

	ifaces_lan=$lan_if
	uci del dhcp."$lan_if"_dns.interface
	uci del dhcp."$lan_if".instance
	_uci dhcp "" "$lan_if" @1
	_uci dhcp dnsmasq "$lan_if"_dns @1 \
		leasefile=/tmp/dhcp.leases -dhcpleasemax \
		^server="/vpn.lan/${wg_net_pfx}.1"
}

cat >> /etc/hosts << EOF

${ula_prefix%%/*}1	$host_name
EOF

doh_upstreams="${DOH_UPSTREAMS:-
https://dns10.quad9.net/dns-query
https://dns.cloudflare.com/dns-query
https://dns.google/dns-query
}"

bootstrap_dns="${BOOTSTRAP_DNS:-
1.0.0.1
9.9.9.9
2620:fe::9
}"

[ "$adguardhome" = 1 ] && {
	[ -n "$ADGUARD_MAIN_DNS" ] && {
		adguard_main=true
		adguard_bind_host=0.0.0.0
		adguard_dns_port=53
		dnsmasq_dns_port=54
		adguard_upstream="'[/lan/]127.0.0.1:54'"
		[ "$WG_ENABLE" = 1 ] && adguard_upstream="$adguard_upstream '[/vpn.lan/]${wg_net_pfx}.1:54'"
	}

	setup_dnsmasq_upstream
	echo "0 3 1 * * /etc/init.d/adguardhome restart" >> /etc/crontabs/root
	echo "sleep 20; /etc/init.d/adguardhome restart &" >> "$hplug_ifup_wan"
}

adguard_upstream="$(for u in $doh_upstreams $adguard_upstream; do printf "    - %s\n" "$u"; done)"
adguard_bootstrap="$(for u in $bootstrap_dns; do printf "    - %s\n" "$u"; done)"

ADGUARD_PASSWD=${ADGUARD_PASSWD:-\$2y\$10\$aRfh9IbImR8PIf/FWlLvkeW6wiyp47BjY0KqW/FD/F14QloYuV00a}
[ "$os_version" -ge "25" ] && { mkdir -p /etc/adguardhome; adguard_dir=/etc/adguardhome; }
cat > "${adguard_dir:-/etc}"/adguardhome.yaml << EOF
http:
  address: 0.0.0.0:3000
users:
  - name: admin
    password: $ADGUARD_PASSWD
dns:
  bind_hosts:
    - 127.0.0.1
    - ${adguard_bind_host:-::1}
  port: ${adguard_dns_port:-5354}
  ratelimit: 500
  upstream_dns:
$adguard_upstream
  bootstrap_dns:
$adguard_bootstrap
  fallback_dns:
$adguard_bootstrap
  cache_size: 4194304
  cache_optimistic: true
  use_private_ptr_resolvers: ${adguard_main:-false}
  local_ptr_upstreams:
    - 127.0.0.1:${dnsmasq_dns_port:-53}
  use_http3_upstreams: true
querylog:
  interval: 24h
  size_memory: 500
  ignored_enabled: true
  ignored:
    - '*.arpa'
statistics:
  ignored_enabled: true
  ignored:
    - '*.arpa'
clients:
  runtime_sources:
    rdns: ${adguard_main:-false}
log:
  enabled: false
schema_version: 28
EOF

doh_upstreams="${DOH_UPSTREAMS:-https://dns.adguard-dns.com/dns-query}"

[ "$dnsproxy" = 1 ] && {
	setup_dnsmasq_upstream
	_uci dnsproxy global global -listen_port \
		+listen_port=5354 enabled=1 log_file=/dev/null rate_limit=500

	_uci dnsproxy cache cache \
		enabled=1 cache_optimistic=1 size=4194304

	_uci dnsproxy edns edns enabled=1

	_uci dnsproxy servers servers -upstream -bootstrap -fallback

	for u in $doh_upstreams; do
		_uci dnsproxy servers servers +upstream="$u"
	done

	for u in $bootstrap_dns; do
		_uci dnsproxy servers servers +bootstrap="$u" +fallback="$u"
	done

	echo "sleep 5; /etc/init.d/dnsproxy restart &" >> "$hplug_ifup_wan"
}

[ "$https_dns" = 1 ] && {
	while uci -q del https-dns-proxy.@https-dns-proxy[0]; do :; done
	uci set https-dns-proxy.config.force_dns=0
	bootstrap_csv="$(echo "$bootstrap_dns" | tr -s ' \t\n' ',')"

	for u in $doh_upstreams; do
		_uci https-dns-proxy "" "" resolver_url="$u" bootstrap_dns="$bootstrap_csv"
	done

	echo "sleep 5; /etc/init.d/https-dns-proxy restart &" >> "$hplug_ifup_wan"
}

[ "$adblock_fast" = 1 ] && _uci adblock-fast "" config enabled=1 force_dns=0 verbosity=1

# === Firewall ===
fw_add_zone() {
	_uci firewall zone "$1" \
		name="$1" +network="${2:-$1}" ${3:+masq=$3} ${4:+masq6=$4} ${5:+mtu_fix=$5} \
		input="${6:-REJECT}" output="${7:-ACCEPT}" forward="${8:-REJECT}"
}

fw_add_forwarding() {
	_uci firewall forwarding "${1}_to_${2}" src="$1" dest="$2"
}

fw_add_base_rules() {
	_uci firewall rule "" \
		name="$1 Allow-DNS-DHCP-NTP" src="$1" \
		target=ACCEPT proto="tcp udp" dest_port="53 67 123"

	_uci firewall rule "" \
		name="$1 Allow-Ping" src="$1" \
		target=ACCEPT proto=icmp family=ipv4 +icmp_type=echo-request

	_uci firewall rule "" \
		name="$1 Allow-DHCPv6" src="$1" \
		target=ACCEPT proto=udp family=ipv6 dest_port=546

	_uci firewall rule "" \
		name="$1 Allow-MLD" src="$1" \
		target=ACCEPT proto=icmp family=ipv6 src_ip=fe80::/10 \
		+icmp_type=130/0 +icmp_type=131/0 \
		+icmp_type=132/0 +icmp_type=143/0

	_uci firewall rule "" \
		name="$1 Allow-ICMPv6-Input" src="$1" \
		target=ACCEPT proto=icmp family=ipv6 limit=1000/sec \
		+icmp_type=bad-header +icmp_type=destination-unreachable \
		+icmp_type=echo-reply +icmp_type=echo-request \
		+icmp_type=neighbour-advertisement +icmp_type=neighbour-solicitation \
		+icmp_type=packet-too-big +icmp_type=router-advertisement \
		+icmp_type=router-solicitation +icmp_type=time-exceeded \
		+icmp_type=unknown-header-type
}

fw_accept_to_lan() {
	_uci firewall rule "" \
		name="$1" +dest_ip="$2" proto="${3:-all}" "${4:+dest_port=$4}" \
		src="${5:-wan}" dest="${6:-lan}" family="${7:-ipv6}" target=ACCEPT
}

fw_port_forwarding() {
	_uci firewall redirect "" \
		name="$1" dest_ip="$2" src_dport="$3" dest_port="$3" src=wan dest=lan
}

fw_redirect_dns() {
	_uci firewall redirect "" \
		name="$1 Intercept-DNS" src="$1" src_dport=53 family=any
}

fw_redirect_ntp() {
	_uci firewall redirect "" \
		name="$1 Redirect-NTP" src="$1" src_dport=123 family=any proto=udp
}

_uci firewall zone @zone[0] -network +network="$lan_if" ~lan
[ "$FORCE_DNS" ] && fw_redirect_dns lan

[ "$GUEST_ENABLE" = 1 ] && {
	fw_add_zone guest "$guest_if"
	fw_add_base_rules guest
	[ "$FORCE_DNS" ] && fw_redirect_dns guest
	fw_add_forwarding guest wan

	[ "$DENY_GUEST_NIGHT" = 1 ] && \
		_uci firewall rule "" \
			name="Block guest at night" src=guest dest=wan \
			proto=all target=DROP start_time=21:00:00 stop_time=07:00:00
}

[ "$IOT_ENABLE" = 1 ] && {
	fw_add_zone iot "$iot_if"
	fw_add_base_rules iot
	[ "$FORCE_DNS" ] && fw_redirect_dns iot
	fw_redirect_ntp iot
	fw_add_forwarding lan iot

	[ "$IOT_INTERNET" = 1 ] && fw_add_forwarding iot wan
	[ "$iot_via_wg" = 1 ] && fw_add_forwarding iot wan_nat6
}

[ "$WG_ENABLE" = 1 ] && {
	_uci firewall zone "" \
		name=lan_vpn +network="$lan_wg_if" \
		input=ACCEPT output=ACCEPT forward=REJECT

	[ "$AP_MODE" != 1 ] && {
		fw_add_forwarding lan_vpn lan
		fw_add_forwarding lan lan_vpn
		fw_add_zone wan_nat6 "$wg_iface" 1 1 1
		fw_add_forwarding lan_vpn wan_nat6
	}
}

_uci firewall zone @zone[1] -network ~wan
for i in $ifaces_wan; do
	_uci firewall zone wan +network="$i"
done

[ "$HARDWARE_OFFLOAD" = 1 ] && SOFTWARE_OFFLOAD=1
_uci firewall defaults @defaults[0] \
	${SOFTWARE_OFFLOAD:+flow_offloading=1} ${HARDWARE_OFFLOAD:+flow_offloading_hw=1}

[ "$BLOCK_DOT_DOQ" = 1 ] && \
	_uci firewall rule "" name=Block-DoT-DoQ src="*" dest="*" dest_port=853 target=REJECT

# === Cloudflare DDNS ===
add_cf_ddns() {
	local interface="$1" use_ipv6="$2" ip_source="$3"
	local network_or_hostname="$4" lookup_host="$5"
	local domain="${lookup_host%%.*}@${lookup_host#*.}"
	local name="${interface}_ipv4" ip_key=ip_network

	[ "$ip_source" = script ] && {
		ip_key=ip_script
		name="${network_or_hostname//-/_}_ipv6"
		network_or_hostname="ip6host $network_or_hostname $lan_if"
	}

	_uci ddns service "$name" \
		service_name=cloudflare.com-v4 \
		lookup_host="$lookup_host" domain="$domain" \
		username=Bearer password="${CLOUDFLARE_API_KEY:-cf_api_key}" \
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
cat > /sbin/ip6host <<'EOF'
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

# Get HOST IPv6 lease, match against the PREFIX, %???? is enough for /56 -> /64 PD
ubus call dhcp ipv6leases | jsonfilter \
	-e "@.device['${LAN_DEV}'].leases[@.hostname='${HOST}']['ipv6-addr'][*].address" \
	| grep "${PREFIX%????}" | head -1
EOF
chmod +x /sbin/ip6host

# === Static Leases & Port Forwarding ===
process_host_list() {
	local hostname octet ports duid name idx v4 v6

	while IFS='|' read -r hostname octet ports duid; do
		hostname=$(echo "$hostname" | tr -d ' \t')
		octet=$(echo "$octet" | tr -d ' \t')
		duid=$(echo "$duid" | tr -d ' \t')
		ports="${ports# }"
		[ -z "$hostname" ] && continue

		[ "$1" = ipv4 ] && {
			for port in $ports; do
				[ -z "$port" ] && continue
				fw_port_forwarding "$hostname | $port" "${lan_net_pfx}.${octet}" "$port"
			done
			v4=1
		}

		[ "$1" = ipv6 ] && {
			[ -x /usr/bin/ddns ] && {
				add_cf_ddns wan_6 1 script "$hostname" "${idx:+${hostname}.}${LOOKUP_HOST}"
				idx=1
			}

			if [ -n "$ports" ]; then
				fw_accept_to_lan "$hostname | Forward $ports" "::${octet}/-64" "tcp udp" "$ports"
			else
				fw_accept_to_lan "$hostname | Forward any protocol" "::${octet}/-64"
			fi
			v6=1
		}

		[ "$octet" = 1 ] && continue
		[ "$1" = ipv6 ] && while [ ${#octet} -lt 4 ]; do octet=0$octet; done

		name="${hostname//-/_}"
		_uci dhcp host "$name" \
			name="$hostname" ${v4:+ip=${lan_net_pfx}.${octet}} \
			${v6:+hostid=$octet duid=${duid:-$(duid_gen)}} dns=1
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

# === Custom script ===
[ -s "$u_script" ] && sh "$u_script"
:
