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

# === WiFi ===
DEFAULT_WIFI_PASSWD=""	# Default: 12345678
COUNTRY_CODE=
DENSE_ENV=		# 1 = optimize roaming and steering for high-interference areas

LAN_WIFI_SSID=""	# Default: HOST_NAME
LAN_WIFI_PASSWD=""

GUEST_WIFI_SSID=""	# Default: HOST_NAME_Guest
GUEST_WIFI_PASSWD=""

IOT_WIFI_SSID=""	# Default: HOST_NAME_IoT
IOT_WIFI_PASSWD=""

LAN_WG_WIFI_SSID=""	# Default: HOST_NAME_VPN
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

# === Network ===
BASE_NET_PREFIX="192.168"
DEFAULT_SUBNET="/24"	# /24 to /22

# 1 = enable guest network
GUEST_ENABLE=1

# 1 = enable IoT network
IOT_ENABLE=
IOT_INTERNET=		# 1 = let's IoT subnet access the internet
IOT_ROUTE_VIA_WG=	# 1 = let's IoT subnet access the internet over WireGuard Client

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

LAN_VLAN_ID=		# Default: 1
GUEST_VLAN_ID=		# Default: 5
IOT_VLAN_ID=		# Default: 10
LAN_WG_VLAN_ID=		# Default: 15
WAN_VLAN_ID=		# Default: 20
WAN_B_VLAN_ID=		# Default: 21

# Additional VLANs to trunk through this device (e.g. "25 30 40" or "30-50"), ranges must be low-high
ADDITIONAL_VLAN_LIST=""

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
BRIDGE_WAN_PORT=	# 1 = force non-DSA wan port into br-vlan bridge

WAN_B_ENABLE=

# WireGuard Client
WG_ENABLE=		# 1 = enable WireGuard Client
WG_IFACE=		# e.g. vpn, wg0, ...
WG_PRIVATE_KEY=
WG_IPV4=
WG_IPV6=
PEER_PUBLIC_KEY=
PRESHARED_KEY=
ENDPOINT=
ENDPOINT_PORT=		# Default: 51820
ALLOWED_IPS=""		# Default: "0.0.0.0/0 ::/0"

# 1 = enable MBIM modem failover (prefill path is MT7621-specific), this can change later in LuCI)
CELLULAR_MODEM=
MODEM_PATH="/sys/devices/platform/1e1c0000.xhci/usb2/2-1"
MODEM_APN="internet"

# 1 = enable USB tethering failover (Android/iPhone)
USB_TETHERING=

# === DHCP ===
# Default range: START=100, LIMIT=auto (192.168.1.100 - 192.168.1.199)
LAN_DHCP_START=
GUEST_DHCP_START=

# === Misc ===
# NOTE: AP nodes flash the same config as the main router, only changing:
AP_MODE=		# 1 = enable AP mode (disable DHCP, device acts as access point + managed switch)
AP_INDEX=		# AP management IP last octet (2-19)

# 1 = enable Routing/NAT Offloading
HARDWARE_OFFLOAD=	# NOTE: Do not set if using QoS/SQM
SOFTWARE_OFFLOAD=

# 1 = block DNS over TLS/QUIC
BLOCK_DOT_DOQ=

# AdGuardHome admin passwd in bcrypt hash (default 12345678)
ADGUARD_PASSWD=''

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
	local name="${3//-/_}" arg
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
EOF
. /usr/share/wrtnova/functions.sh

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

OS_VERSION=$(. /etc/os-release; echo "${VERSION%%.*}")
[ "$OS_VERSION" = 25 ] && ZONE_NAME="${ZONE_NAME// /_}"

HOST_NAME="${HOST_NAME:-WrtNova}"

_uci system "" "@system[0]" \
	hostname="${HOST_NAME}${AP_MODE:+-${AP_INDEX:=2}}" \
	"${ZONE_NAME:+zonename=$ZONE_NAME}" "${TIME_ZONE:+timezone=$TIME_ZONE}"

uci set uhttpd.main.redirect_https=1

[ "$QUARTERLY_REBOOT" = 1 ] && \
	echo "30 3 1 1,4,7,10 * sleep 70 && { touch /etc/banner; reboot; }" >> /etc/crontabs/root

[ -x /etc/init.d/zram ] && echo vm.swappiness=70 > /etc/sysctl.d/13-zram.conf

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

[ "$WG_ENABLE" = 1 ] && [ "$AP_MODE" != 1 ] && {
	[ -x /usr/bin/wg ] || WG_ENABLE=
}

wg_iface=${WG_IFACE:-vpn}
[ "$WG_ENABLE" = 1 ] && [ "$AP_MODE" != 1 ] && {
	echo "*/2 * * * * wireguard_watchdog" >> /etc/crontabs/root
	echo "*/10 * * * * wg-check $wg_iface" >> /etc/crontabs/root
	_uci system "" "@system[0]" cronloglevel=9

	cat > /etc/hotplug.d/iface/98-wg-"${wg_iface}" <<-EOF
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

# === WiFi ===
setup_radio() {
	local radio="$1" channel="$2"

	_uci wireless wifi-device "$radio" -disabled \
		${channel:+channel=$channel} \
		${WIFI_LOG_LVL:+log_level=$WIFI_LOG_LVL} \
		${COUNTRY_CODE:+country=$COUNTRY_CODE}
}

add_wifi_iface() {
	local dev="$1" mode="$2" ssid="$3" key="$4" net="$5" enc="$6"

	set -- device="$dev" mode="$mode" ssid="$ssid" key="$key" network="$net" encryption="$enc"

	[ "$mode" = mesh ] && set -- "$@" -ssid mesh_id="$ssid" ifname="$net" ${BATMAN_ADV:+mesh_fwding=0}

	[ "$mode" = ap ] && [ "$net" != iot ] && has_pkg wpad-mbed wpad-open wpad-wolf && {
		[ "$enc" = psk2 ] && set -- "$@" ft_psk_generate_local=1
		set -- "$@" ieee80211r=1 ft_over_ds=0 ieee80211k=1 bss_transition=1
	}

	_uci wireless wifi-iface "${dev}_${net}" "$@"
}

get_band() {
	uci -q get wireless."$1".band
}

get_channel() {
	uci -q get wireless."$1".channel
}

uci -q get wireless || {
	no_wifi=1
	WIRELESS_MESH=
	BATMAN_ADV=
}

has_pkg wpad-mbed wpad-open wpad-wolf wpad-mesh || WIRELESS_MESH=
has_pkg luci-proto-batman || BATMAN_ADV=

def_pass="${DEFAULT_WIFI_PASSWD:-12345678}"
lan_ssid="${LAN_WIFI_SSID:-$HOST_NAME}"
lan_pass="${LAN_WIFI_PASSWD:-$def_pass}"
guest_ssid="${GUEST_WIFI_SSID:-${HOST_NAME}_Guest}"
guest_pass="${GUEST_WIFI_PASSWD:-$def_pass}"
iot_ssid="${IOT_WIFI_SSID:-${HOST_NAME}_IoT}"
iot_pass="${IOT_WIFI_PASSWD:-$def_pass}"
lan_wg_ssid="${LAN_WG_WIFI_SSID:-${HOST_NAME}_VPN}"
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
	$set_mesh_param mesh_rssi_threshold -78
	$set_mesh_param mesh_max_peer_links 6
	EOF

	[ "$AP_MODE" != 1 ] && {
		echo "$set_mesh_param mesh_hwmp_rootmode 2" >> "$hplug_mesh"
		echo "$set_mesh_param mesh_gate_announcements 1" >> "$hplug_mesh"
	}
}

# Fields: mode|ssid|key|network|bands|enabled|enc_override (empty = band default)
wifi_networks="
ap|$lan_ssid|$lan_pass|lan|2g 5g 6g|1|
ap|$guest_ssid|$guest_pass|guest|2g 5g 6g|${GUEST_ENABLE:-0}|
ap|$iot_ssid|$iot_pass|iot|2g|${IOT_ENABLE:-0}|
ap|$lan_wg_ssid|$lan_wg_pass|lan_${wg_iface}|2g 5g 6g|${WG_ENABLE:-0}|
mesh|$mesh_id|$mesh_pass|$mesh_iface|5g|${WIRELESS_MESH:-0}|sae
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

	[ "$role" = tbd ] && {
		[ "$chan" = "$min" ] && role=mesh || role=ap
	}

	[ "$band" = 5g ] && [ "$role" = solo ] && [ -n "$has_6g" ] && role=mesh

	setup_radio "$radio" "$([ "$role" != ap ] && echo "$ch")"

	while IFS='|' read -r mode ssid key network bands enabled enc_over; do
		[ -n "$mode" ] && [ "$enabled" = 1 ] || continue
		case " $bands " in *" $band "*) ;; *) continue ;; esac

		case "$role" in
			mesh) [ "$mode" = mesh ] || continue ;;
			ap) [ "$mode" = ap ] || continue ;;
		esac

		add_wifi_iface "$radio" "$mode" "$ssid" "$key" "$network" "${enc_over:-$enc}"
	done <<-EOF
	$wifi_networks
	EOF
done

# https://openwrt.org/docs/guide-user/network/wifi/usteer
# Dense mode tightens all thresholds for high-interference environments
[ -x /sbin/usteerd ] && {
	_uci usteer "" @usteer[0] \
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

	[ "$no_wifi" = 1 ] && /etc/init.d/usteer disable
}

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
		uci add_list "network.vlan_${vlan_id}.ports=$p"
	done

	[ -n "$iface" ] && uci set "network.${iface}.device=br-vlan.${vlan_id}"
}

add_bridges() {
	local iface

	for iface; do
		_uci network device "br_${iface}" type=bridge name="br-${iface}"
		uci set "network.${iface}.device=br-${iface}"
	done
}

add_switch_vlan() {
	local vlan_id="$1" ports="$2" iface="$3" sfx

	vlan_idx=$((vlan_idx + 1))

	_uci network switch_vlan "" \
		device="$switch_dev" vlan="$vlan_idx" ports="$ports" ${sw_has_vid:+vid=$vlan_id}

	[ -z "$iface" ] && return
	uci add_list "network.br_${iface}.ports=${lan_eth}.${vlan_id}"

	[ "$WIRELESS_MESH" = 1 ] && [ "$BATMAN_ADV" != 1 ] && {
		[ "$vlan_id" = "$lan_vid" ] || sfx=".${vlan_id}"
		uci add_list "network.br_${iface}.ports=mesh0${sfx}"
	}
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

lan_vid=$LAN_VLAN_ID
guest_vid=$GUEST_VLAN_ID
iot_vid=$IOT_VLAN_ID
wg_vid=$LAN_WG_VLAN_ID
wan_vid=$WAN_VLAN_ID
wanb_vid=$WAN_B_VLAN_ID

resolve_vlans "lan_vid:1:255 \
		guest_vid:5:255 \
		iot_vid:10:255 \
		wg_vid:15:255 \
		wan_vid:20:4094 \
		wanb_vid:21:4094"

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

[ "$GUEST_ENABLE" = 1 ] && \
	_uci network interface guest proto=static +ipaddr="${guest_net_pfx}.1${guest_subnet}"

[ "$IOT_ENABLE" = 1 ] && {
	_uci network interface iot proto=static +ipaddr="${iot_net_pfx}.1${iot_subnet}"
	[ "$IOT_ROUTE_VIA_WG" = 1 ] && iot_via_wg=1
}

_uci network interface lan -netmask -ipaddr +ipaddr="${lan_net_pfx}.1${lan_subnet}"

uci -q get network.wan || {
	_uci network interface wan proto=dhcp
	_uci network interface wan6 proto=dhcpv6
}

_uci network interface wan6 device=@wan ~wan_6

[ -n "$PPPOE_USERNAME" ] && \
	_uci network interface wan proto=pppoe ipv6=0 username="$PPPOE_USERNAME" password="$PPPOE_PASSWD"

[ -x /usr/sbin/mwan3 ] || no_mwan3=1

[ "$WAN_B_ENABLE" = 1 ] && {
	_uci network interface wanb proto=dhcp ${no_mwan3:+metric=2}
	_uci network interface wanb_6 proto=dhcpv6 device=@wanb ${no_mwan3:+metric=2}
}

has_pkg modemmanager || CELLULAR_MODEM=
[ "$CELLULAR_MODEM" = 1 ] && \
	_uci network interface cellular proto=modemmanager \
		iptype=ipv4v6 device="$MODEM_PATH" apn="${MODEM_APN:-internet}" ${no_mwan3:+metric=3}

[ "$USB_TETHERING" = 1 ] && \
	_uci network interface usb0 proto=dhcp device=usb0 ${no_mwan3:+metric=4}

[ "$WG_ENABLE" = 1 ] && {
	_uci network interface "lan_${wg_iface}" proto=static \
		+ipaddr="${wg_net_pfx}.1${wg_subnet}" ip6assign=60 +ip6class=local ip6hint=10

	_uci firewall zone @zone[0] +network="lan_${wg_iface}" ~lan

	[ "$AP_MODE" != 1 ] && {
		_uci network interface "${wg_iface}" proto=wireguard \
			disabled=1 ${PEER_PUBLIC_KEY:+-disabled} \
			private_key="${WG_PRIVATE_KEY:-$(wg genkey)}" \
			+addresses="${WG_IPV4:-172.16.0.2/32}" \
			+addresses="${WG_IPV6:-fd88::/128}" \
			ip4table=20 ip6table=20

		if [ "$no_mwan3" = 1 ]; then
			for f in '' 6; do
				_uci network rule$f "" in="lan_${wg_iface}" lookup=20 priority=990
				_uci network rule$f "" in="lan_${wg_iface}" action=prohibit priority=991
			done

			[ "$iot_via_wg" = 1 ] && {
				for f in '' 6; do
					_uci network rule$f "" in=iot lookup=20 priority=990
					_uci network rule$f "" in=iot action=prohibit priority=991
				done
			}
		else
			# mwan3 already handles PBR and kill switch
			_uci network interface "${wg_iface}" -ip4table -ip6table

			# WG IPv6 anchor for mwan3
			_uci network interface "${wg_iface}_6" proto=none device="@${wg_iface}"

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

# Cannot enslave a bridge to another bridge
[ "$wan_port" = br-wan ] && BRIDGE_WAN_PORT=

if [ "$hw_type" = "dsa" ] && [ "$AP_MODE" != 1 ] && [ "$BRIDGE_WAN_PORT" != 1 ]; then
	# Avoid adding non-DSA WAN port to br-vlan due to performance penalty.
	grep -sq DEVTYPE=dsa /sys/class/net/"${wan_port}"/uevent || bridge_wan_port=

elif [ "$hw_type" = "swconfig" ]; then
	use_bridge_vlan=
	lan_eth="${lan_ports%%.*}"
	wan_eth="$wan_port"
fi

# LAN ports are untagged members of the LAN VLAN.
# WAN port are untagged members of the WAN VLAN unless WAN_IS_TAGGED=1.
# All ports carry tagged guest/iot/wanb/lan_wg VLANs as trunk ports.
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

	_uci network device @device[0] name=br-vlan -ports
	for p in $lan_ports ${bridge_wan_port:+$wan_port}; do
		_uci network device @device[0] +ports="$p"
	done

	[ "$WAN_IS_TAGGED" = 1 ] && [ "$bridge_wan_port" != 1 ] && \
		uci set network.wan.device="${wan_port}.${wan_vid}"

	add_vlan() { add_bridge_vlan "$@"; }

else
	add_bridges lan ${GUEST_ENABLE:+guest} ${IOT_ENABLE:+iot} ${WG_ENABLE:+lan_${wg_iface}}

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

	[ -n "$sw_wan_port" ] && [ "$WAN_IS_TAGGED" = 1 ] && wan_vlan_ports="$trunk_ports"

	if [ "$WAN_IS_TAGGED" = 1 ] || [ -n "$sw_wan_port" ]; then
		uci set network.wan.device="${wan_eth}.${wan_vid}"
	fi

	[ "$WAN_B_ENABLE" = 1 ] && uci set network.wanb.device="${lan_eth}.${wanb_vid}"

	uci del network.@device[0]
	while uci -q del network.@switch_vlan[0]; do :; done

	add_vlan() { add_switch_vlan "$@"; }
fi

add_vlan "$lan_vid" "$lan_vlan_ports" lan
[ "$GUEST_ENABLE" = 1 ] && add_vlan "$guest_vid" "$trunk_ports" guest
[ "$IOT_ENABLE" = 1 ] && add_vlan "$iot_vid" "$trunk_ports" iot
[ "$WG_ENABLE" = 1 ] && add_vlan "$wg_vid" "$trunk_ports" lan_"${wg_iface}"
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

	for i in wan ${WAN_B_ENABLE:+wanb} ${CELLULAR_MODEM:+cellular} ${USB_TETHERING:+usb0}; do
		uci set network."${i}".disabled=1
	done

	_uci network interface lan -ipaddr \
		+ipaddr="${lan_net_pfx}.${AP_INDEX}${lan_subnet}" \
		gateway="${lan_net_pfx}.1" dns="${lan_net_pfx}.1" metric=5

	for i in ${GUEST_ENABLE:+guest} ${IOT_ENABLE:+iot} ${WG_ENABLE:+lan_${wg_iface}}; do
		_uci network interface "$i" proto=none -ipaddr -ip6assign
	done
}

# === batman-adv ===
[ "$WIRELESS_MESH" = 1 ] && [ "$BATMAN_ADV" = 1 ] && {
	_uci network interface bat0 proto=batadv aggregated_ogms=1 bridge_loop_avoidance=1
	_uci network interface bat0_mesh0 proto=batadv_hardif mtu=2304 master=bat0

	set --	lan $lan_vid \
		${GUEST_ENABLE:+guest $guest_vid} \
		${IOT_ENABLE:+iot $iot_vid} \
		${WG_ENABLE:+lan_${wg_iface} $wg_vid}

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

uci set "network.${IFACE}.metric=$(calc_metric)"

_uci mwan3 interface "$IFACE" enabled=1 family="$FAMILY" -track_ip +track_ip="$TRACK_IP"

_uci mwan3 member "$NAME" interface="$IFACE" metric="$METRIC" weight="$WEIGHT"

_uci mwan3 policy "${BASE_IFACE:0:10}_only" ^use_member="$NAME" +use_member="$NAME"

[ "$LOAD_BALANCED" = 1 ] && _uci mwan3 policy balanced ^use_member="$NAME" +use_member="$NAME"
EOF
chmod +x /sbin/mwan3-iface-add

cat > /etc/config/mwan3 << EOF

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

[ "$CELLULAR_MODEM" = 1 ] && mwan3-iface-add cellular "" 2 2
[ "$USB_TETHERING" = 1 ] && mwan3-iface-add usb0 "" 2 2

ula_prefix="$(uci -q get network.globals.ula_prefix)"

[ "$WG_ENABLE" = 1 ] && [ -z "$no_mwan3" ] && [ "$AP_MODE" != 1 ] && {
	mwan3-iface-add "${wg_iface}" "" 1 1 0
	mwan3-iface-add "${wg_iface}_6" ipv6 1 1 0

	_uci mwan3 rule "lan_${wg_iface:0:5}_ipv4" \
		src_ip="${wg_net_pfx}.0${wg_subnet}" use_policy="${wg_iface}_only" @2

	_uci mwan3 rule "lan_${wg_iface:0:5}_ipv6" \
		src_ip="${ula_prefix%::*}:10::/60" use_policy="${wg_iface}_only" @3

	[ "$iot_via_wg" = 1 ] && {
		_uci mwan3 rule "iot_ipv4" \
			src_ip="${iot_net_pfx}.0${iot_subnet}" use_policy="${wg_iface}_only" @4
	}
}

[ "$AP_MODE" = 1 ] && [ -x /usr/sbin/mwan3 ] && /etc/init.d/mwan3 disable

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
DEV=$(ifstatus "$IFACE" | jsonfilter -e '@.device' 2>/dev/null)

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
	-dns "${DEV:++dns=$(ip -6 a s dev "$DEV" | grep -o 'fe80[^/]*')}"
EOF
chmod +x /sbin/dhcp-instance-add

setup_dnsmasq_upstream() {
	for iface in lan ${WG_ENABLE:+lan_${wg_iface}} ${GUEST_ENABLE:+guest} ${IOT_ENABLE:+iot}; do
		[ -z "$iface" ] && continue
		_uci dhcp dnsmasq "${iface}_dns" \
			noresolv=1 cachesize=0 +server=127.0.0.1#5354 +server=::1#5354
	done
}

while uci -q del dhcp.@dnsmasq[0]; do :; done
while uci -q del dhcp.@dhcp[0]; do :; done

[ "$GUEST_ENABLE" = 1 ] && dhcp-instance-add guest 1h "" "" 0 "$GUEST_DHCP_START"

[ "$IOT_ENABLE" = 1 ] && dhcp-instance-add iot "" "" "" 0

[ "$WG_ENABLE" = 1 ] && {
	dhcp-instance-add "lan_${wg_iface}" 24h "${wg_iface}.lan"
	_uci dhcp dnsmasq "lan_${wg_iface}_dns" +rebind_domain=lan +server=/lan/127.0.0.1
}

dhcp-instance-add lan 24h lan lan 1 "$LAN_DHCP_START"
_uci dhcp "" lan -ra_default
uci del dhcp.lan_dns.notinterface

[ "$WG_ENABLE" = 1 ] && \
	_uci dhcp dnsmasq lan_dns +rebind_domain=lan +server="/${wg_iface}.lan/${wg_net_pfx}.1"

_uci system timeserver ntp -server \
	enable_server=1 +server=time1.google.com +server=time2.google.com +server=time.cloudflare.com

cat >> /etc/hosts << EOF

${ula_prefix%%/*}1	${HOST_NAME}${AP_MODE:+-$AP_INDEX}

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
		echo "sleep 30; /etc/init.d/adguardhome restart &" >> "$hplug_ifup_wan"

		[ -x "/usr/bin/dnsproxy" ] && /etc/init.d/dnsproxy disable
	else
		/etc/init.d/adguardhome disable
	fi
}

ADGUARD_PASSWD=${ADGUARD_PASSWD:-\$2y\$10\$aRfh9IbImR8PIf/FWlLvkeW6wiyp47BjY0KqW/FD/F14QloYuV00a}
[ "$OS_VERSION" = "25" ] && { mkdir -p /etc/adguardhome; adguard_dir=/etc/adguardhome; }
cat > "${adguard_dir:-/etc}"/adguardhome.yaml << EOF
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
    - 2620:fe::9
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
	_uci dnsproxy global global -listen_port \
		+listen_port=5354 enabled=1 log_file=/dev/null rate_limit=500

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

fw_redirect_dns lan

[ "$GUEST_ENABLE" = 1 ] && {
	fw_add_zone guest
	fw_add_base_rules guest
	fw_redirect_dns guest
	fw_add_forwarding guest wan
}

[ "$IOT_ENABLE" = 1 ] && {
	fw_add_zone iot
	fw_add_base_rules iot
	fw_redirect_dns iot
	fw_redirect_ntp iot
	fw_add_forwarding lan iot

	[ "$IOT_INTERNET" = 1 ] && fw_add_forwarding iot wan
	[ "$iot_via_wg" = 1 ] && fw_add_forwarding iot wan_nat6
}

[ "$AP_MODE" != 1 ] && [ "$WG_ENABLE" = 1 ] && {
	fw_add_zone wan_nat6 "$wg_iface" 1 1 1
	fw_add_forwarding lan wan_nat6
}

_uci firewall zone @zone[1] ~wan ^network=wan6
for i in wan_6 ${WAN_B_ENABLE:+wanb wanb_6} ${CELLULAR_MODEM:+cellular} ${USB_TETHERING:+usb0}; do
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
		network_or_hostname="ip6host $network_or_hostname"
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
	local hostname octet ports duid name idx

	while IFS='|' read -r hostname octet ports duid; do
		hostname=$(echo "$hostname" | tr -d ' \t')
		octet=$(echo "$octet" | tr -d ' \t')
		duid=$(echo "$duid" | tr -d ' \t')
		ports="${ports# }"
		[ -z "$hostname" ] && continue

		name="${hostname//-/_}"
		uci -q get "dhcp.${name}" || {
			_uci dhcp host "$name" \
				name="$hostname" ip="${lan_net_pfx}.${octet}" \
				hostid="$octet" duid="${duid:-$(duid_gen)}" dns=1
		}

		[ "$1" = ipv4 ] && {
			for port in $ports; do
				[ -z "$port" ] && continue
				fw_port_forwarding "$hostname | $port" "${lan_net_pfx}.${octet}" "$port"
			done
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
