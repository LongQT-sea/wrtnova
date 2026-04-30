#!/bin/sh
# shellcheck shell=ash disable=SC3060,SC1091,SC2015
# SPDX-License-Identifier: MIT OR Apache-2.0
# Copyright (C) 2024 - 2026 Tieu Long <https://github.com/LongQT-sea>

# WrtNova - Opinionated first-boot UCI configuration for OpenWrt

# Router LAN IP is derived from ${NET_PREFIX}.${VLAN}.1, e.g. 192.168.10.1 or 192.168.10.2 if AP mode

# REQUIRES THESE ADDITIONAL PACKAGES:
# Essential:	 luci-app-ddns ddns-scripts-cloudflare luci-app-mwan3 curl ip-full adguardhome -dnsproxy 
# Full WiFi:	 -wpad-basic-mbedtls wpad-mbedtls luci-app-usteer 
# WireGuard:	 luci-proto-wireguard 
# MBIM modem:	 luci-proto-modemmanager kmod-usb-net-cdc-mbim 
# Tethering:	 kmod-usb-net-rndis kmod-usb-net-cdc-ncm kmod-usb-net-ipheth 
# Optional:	 zram-swap luci-ssl luci-app-commands kmod-nft-bridge vxlan ip-bridge

# === System ===
ROUTER_HOSTNAME=""
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

IOT_WIFI_SSID=""	# Default to IoT
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
DEFAULT_SUBNET="/24"

# Set to 1 to enable
GUEST_NET_ENABLE=1

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
LAN_WG_SUBNET=
GUEST_SUBNET=
IOT_SUBNET=

LAN_VLAN_ID=		# Default 10
LAN_WG_VLAN_ID=		# Default 15
GUEST_VLAN_ID=		# Default 20
IOT_VLAN_ID=		# Default 25
WAN_VLAN_ID=		# Default 30
WAN_B_VLAN_ID=		# Default 31

# Additional VLANs to trunk through this device (individual or range, e.g. "66 77 88" or "66-99" or "60-90 100 900")
ADDITIONAL_VLAN_LIST=""

# === IPv4 Port Forwarding ===
# Format: hostname | last_octet | ports
# Creates a static DHCPv4 lease and NAT port forward from WAN for each port.
# Note: ports must be unique across all entries.
PORT_FORWARD_LIST="
	docker-host | 20 | 80 443
	rdp-server  | 21 | 3389
"

# === IPv6 Server Exposure ===
# Format: hostname | last_octet | ports (empty = expose all)
# Creates a static DHCP lease, IPv6 firewall forward rule, and Cloudflare DDNS entry per host.
IPV6_SERVER_LIST="
	docker-host | 20 | 80 443
	rdp-server  | 21 | 3389
	api-server  | 22 | 80 443
	vps-host    | 23 |
"

# Default DHCP range: START=100, LIMIT=auto (192.168.0.100 - 192.168.X.199)
LAN_DHCP_START=
LAN_DHCP_LIMIT=
GUEST_DHCP_START=
GUEST_DHCP_LIMIT=

# === WAN / Multi-WAN ===
PPPOE_USERNAME=""	# Set this to use PPPoE instead of DHCP on the wan interface
PPPOE_PASSWD=""

WAN_IS_TAGGED=		# Set 1 to tag VLAN on wan interface
WAN_B_ENABLE=

# WireGuard Client
WG_ENABLE=		# Set 1 to enable WireGuard Client
WG_IFACE=
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

# === Misc ===
AP_MODE=		# Set 1 to enable AP mode (disable DHCP, device acts as access point + managed switch)
AP_INDEX=2		# AP management IP last octet (2-99)

HARDWARE_OFFLOAD=
SOFTWARE_OFFLOAD=

DDNS_ENABLE=		# Set 1 to enable Cloudflare DDNS
LOOKUP_HOST=		# e.g. ddns.example.com
CLOUDFLARE_API_KEY=

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

_uci() {
	local config="$1" type="$2" name="$3"; shift 3
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
			^*) uci -q del_list "${config}.${ref}.${arg#^}" ;;
			~*) uci rename "${config}.${arg#\~}" ;;
			-*) uci -q del "${config}.${ref}.${arg#-}" ;;
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
duid_gen() { printf '0004'; tr -d '-' < /proc/sys/kernel/random/uuid; }

# add_luci_command <cmd> [param] - add a command to luci-app-commands
add_luci_command() { _uci luci command "" command="$1" param="${2:-1}"; }
EOF
. /usr/share/wrtnova/functions.sh

# === System ===
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

[ -z "$1" ] && { echo -n "Allowed:$ALLOW"; exit 0; }

for cmd in $ALLOW; do
	[ "$1" = "$cmd" ] && { cd /; exec "$@"; }
done

echo -n "Not allowed: $1" >&2
exit 1
EOF
chmod +x /bin/run-cmd

if has_pkg luci-app-commands; then
	add_luci_command '/bin/run-cmd'
	add_luci_command 'mwan3-iface-add'
	add_luci_command 'dhcp-instance-add'
fi

[ -n "$ROOT_PASSWD" ] && passwd root <<-EOF
$ROOT_PASSWD
$ROOT_PASSWD
EOF

[ "$LOG" = 1 ] && { set -x; exec > /root/99-asu-defaults.log 2>&1; }

OS_VERSION=$(. /etc/os-release; echo "${VERSION%%.*}")

[ -n "$SSH_PUBLIC_KEY" ] && printf "%s\n" "$SSH_PUBLIC_KEY" >> /etc/dropbear/authorized_keys

[ "$QUARTERLY_REBOOT" = 1 ] && echo "30 3 1 1,4,7,10 * sleep 70 && { touch /etc/banner; reboot; }" >> /etc/crontabs/root

cat > /etc/hotplug.d/iface/96-custom-ntp << 'EOF'
. /lib/functions/network.sh
network_find_wan WAN_IF
[ ifup = "$ACTION" ] && [ "$WAN_IF" = "$INTERFACE" ] && \
	{ sleep 3; ntpd -q -p pool.ntp.org & }
EOF

[ -x /etc/init.d/zram ] && echo vm.swappiness=70 > /etc/sysctl.d/13-zram.conf

if [ -x /usr/bin/wg ] && [ -x /usr/sbin/mwan3 ] && [ "$WG_ENABLE" = 1 ] && [ "$AP_MODE" != 1 ]; then
	WG_IFACE=${WG_IFACE:-wg0}
	echo "*/10 * * * * [ -d /sys/class/net/${WG_IFACE} ] && { ping -c2 -W2 -I ${WG_IFACE} 9.9.9.9 || \
	{ ifdown ${WG_IFACE}; sleep 3; ifup ${WG_IFACE}; }; }" >> /etc/crontabs/root

	echo "*/2 * * * * wireguard_watchdog" >> /etc/crontabs/root && uci set system.@system[0].cronloglevel=9

	cat > /etc/hotplug.d/iface/98-"${WG_IFACE}" <<-EOF
	[ ifup = "\$ACTION" ] || exit 0; [ ${WG_IFACE} = "\$INTERFACE" ] || exit 0
	L=/tmp/${WG_IFACE}_lock; mkdir "\$L" || exit 0; sleep 5
	ping -c2 -W2 -I $WG_IFACE 9.9.9.9 || { ifdown $WG_IFACE; sleep 2; ifup ${WG_IFACE}; }
	rmdir "\$L"
	EOF
elif [ "$WG_ENABLE" = 1 ] && [ "$AP_MODE" = 1 ]; then
	WG_IFACE=${WG_IFACE:-wg0}
else
	WG_ENABLE=
fi

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

[ -n "$SSH_PUBLIC_KEY" ] && [ "$SSH_PASSWD_AUTH" = off ] && {
	uci set dropbear.@dropbear[0].PasswordAuth="$SSH_PASSWD_AUTH"
	uci set dropbear.@dropbear[0].RootPasswordAuth="$SSH_PASSWD_AUTH"
}

[ "$OS_VERSION" = 25 ] && ZONE_NAME="${ZONE_NAME// /_}"
HOSTNAME="${ROUTER_HOSTNAME:-$(uci get system.@system[0].hostname)}"
[ "$AP_MODE" = 1 ] && HOSTNAME="${HOSTNAME}-${AP_INDEX:-2}"

uci batch <<-EOF
set system.@system[0].hostname=$HOSTNAME
set system.@system[0].zonename="$ZONE_NAME"
set system.@system[0].timezone="$TIME_ZONE"
set uhttpd.main.redirect_https=1
set system.ntp.enable_server=1
EOF

# === WiFi ===
band_default_enc() {
	case "$1" in
		2g) echo psk2 ;;
		5g) echo sae-mixed ;;
		6g) echo sae ;;
	esac
}

band_channel() {
	case "$1" in
		2g) echo "$WIFI_2G_CHANNEL" ;;
		5g) echo "$WIFI_5G_CHANNEL" ;;
		6g) echo "$WIFI_6G_CHANNEL" ;;
	esac
}

setup_radio() {
	local radio="$1" channel="$2"
	uci -q del wireless."${radio}".disabled
	[ -n "$channel" ] && uci set wireless."${radio}".channel="$channel"
	[ -n "$WIFI_LOG_LEVEL" ] && uci set wireless."${radio}".log_level="$WIFI_LOG_LEVEL"
	[ -n "$WIFI_COUNTRY_CODE" ] && uci set wireless."${radio}".country="$WIFI_COUNTRY_CODE"
}

add_wifi_iface() {
	local name="$1" device="$2" ssid="$3" key="$4" network="$5" enc="${6:-psk2}"

	_uci wireless wifi-iface "$name" \
		device="$device" mode=ap ssid="$ssid" \
		encryption="$enc" key="$key" network="$network"

	if ! has_pkg wpad-basic; then
		_uci wireless wifi-iface "$name" \
			ieee80211r=1 ft_over_ds=0 \
			ieee80211k=1 bss_transition=1
		[ "$enc" = psk2 ] && uci set wireless."${name}".ft_psk_generate_local=1
	fi
}

# Fields: name | ssid | key | network | bands | enabled | enc_override
# - bands        : space-separated subset of "2g 5g 6g"
# - enabled      : 1 = create, anything else = skip
# - enc_override : empty = use band default; set to override (e.g. psk2)

wifi_networks() {
	cat <<-EOF
	lan|$LAN_WIFI_SSID|$LAN_WIFI_PASSWD|lan|2g 5g 6g|1|
	lan_wg|$LAN_WG_WIFI_SSID|$LAN_WG_WIFI_PASSWD|lan_${WG_IFACE}|2g 5g 6g|${WG_ENABLE:-0}|
	guest|$GUEST_WIFI_SSID|$GUEST_WIFI_PASSWD|guest|2g 5g 6g|${GUEST_NET_ENABLE:-0}|
	iot|$IOT_WIFI_SSID|$IOT_WIFI_PASSWD|iot|2g|${IOT_ENABLE:-0}|
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
	uci -q get wireless."${radio}" >/dev/null 2>&1 || continue
	band=$(uci -q get wireless."${radio}".band)
	[ -z "$band" ] && continue

	setup_radio "$radio" "$(band_channel "$band")"
	default_enc="$(band_default_enc "$band")"

	wifi_networks | while IFS='|' read -r name ssid key network bands enabled enc_over; do
		[ -z "$name" ] && continue
		[ "$enabled" = 1 ] || continue
		case " $bands " in *" $band "*) ;; *) continue ;; esac
		add_wifi_iface "${name}_${radio}" "$radio" \
			"$ssid" "$key" "$network" \
			"${enc_over:-$default_enc}"
	done
done

# https://openwrt.org/docs/guide-user/network/wifi/usteer
# Negative values = absolute dBm, positive values = SNR relative to noise floor (-95dBm)
[ -x /sbin/usteerd ] && {
	if [ "$WIFI_DENSE" = 1 ]; then
		# Optimized for high-interference areas
		uci set usteer.@usteer[0].roam_scan_snr='-60'			# Start scanning early
		uci set usteer.@usteer[0].signal_diff_threshold='6'		# Small diff enough to steer
		uci set usteer.@usteer[0].band_steering_interval='30000'	# Ask client to move to 5GHz/6GHz every 30s
		uci set usteer.@usteer[0].band_steering_min_snr='-50'	# Only steer nearby clients to 5GHz/6Ghz
		uci set usteer.@usteer[0].roam_trigger_snr='-65'		# Force roam before signal gets bad
		uci set usteer.@usteer[0].roam_kick_delay='3000'		# Kick after 3s (default 10000ms)
		uci set usteer.@usteer[0].min_snr='-80'					# Hard floor, clients below this will be kicked
	else
		# Optimized for low-interference areas
		uci set usteer.@usteer[0].roam_scan_snr='-68'			# Start scanning later, less congestion
		uci set usteer.@usteer[0].signal_diff_threshold='8'		# Require clear improvement before steering
		uci set usteer.@usteer[0].roam_trigger_snr='-72'		# Trigger roam below -72dBm, kick after 10s if client ignores
	fi
}

# === Network ===
add_network() {
	local type="$1" name="$2"; shift 2
	_uci network "$type" "$name" "$@"
}

add_bridge_vlan() {
	local vlan_id="$1" ports="$2" iface="$3"
	
	add_network bridge-vlan "" \
		device=br-vlan vlan="$vlan_id" ports="$ports" local=0

	[ -n "$iface" ] && {
		uci set "network.${iface}.device=br-vlan.${vlan_id}"
		uci set network.@bridge-vlan[-1].local=1
	}
}

add_bridge() {
	local iface="$1"

	add_network device "br_${iface}" type=bridge name="br-${iface}"
	uci set "network.${iface}.device=br-${iface}"
}

add_swconfig_vlan() {
	local vlan_id="$1" ports="$2" iface="$3" eth="${4:-$lan_eth}"

	add_network switch_vlan "" device="$switch_dev" \
		vlan="$vlan_id" vid="$vlan_id" ports="$ports"

	[ -n "$iface" ] && uci set "network.br_${iface}.ports=${eth}.${vlan_id}"
}

expand_vlan_list() {
	for entry in $1; do
		case "$entry" in
			*-*) seq "${entry%-*}" "${entry#*-}" ;;
			*) printf '%s\n' "$entry" ;;
		esac
	done
}

resolve_vlans() {
	local d v r def mn mx val i conflict p pv pval
	for d in $1; do
		v=${d%%:*}; r=${d#*:}; def=${r%%:*}; r=${r#*:}; mn=${r%%:*}; mx=${r#*:}
		val=$(eval echo \$"$v")
		case "$val" in ''|*[!0-9]*) val=$def ;; esac
		{ [ "$val" -lt "$mn" ] || [ "$val" -gt "$mx" ]; } && val=$def
		eval "$v=$val"
	done
	for d in $1; do
		v=${d%%:*}; r=${d#*:}; def=${r%%:*}; r=${r#*:}; mn=${r%%:*}; mx=${r#*:}
		val=$(eval echo \$"$v"); i=0
		conflict=1
		while [ "$conflict" -eq 1 ] && [ "$i" -lt $((mx-mn+2)) ]; do
			i=$((i+1)); conflict=0
			for p in $1; do
				pv=${p%%:*}; [ "$pv" = "$v" ] && break
				pval=$(eval echo \$"$pv")
				if [ "$val" -eq "$pval" ]; then
					val=$((val+1))
					{ [ "$val" -gt "$mx" ] || [ "$val" -lt "$mn" ]; } && val=$def
					conflict=1; break
				fi
			done
		done
		eval "$v=$val"
	done
}

# First entry = highest priority
resolve_vlans "LAN_VLAN_ID:10:1:254 \
		LAN_WG_VLAN_ID:15:1:254 \
		GUEST_VLAN_ID:20:1:254 \
		IOT_VLAN_ID:25:1:254 \
		WAN_VLAN_ID:30:1:4093 \
		WAN_B_VLAN_ID:31:1:4093"

DEFAULT_NET_PREFIX=${DEFAULT_NET_PREFIX:-192.168}
DEFAULT_SUBNET=${DEFAULT_SUBNET:-/24}
LAN_IP_PREFIX=${LAN_NET_PREFIX:-$DEFAULT_NET_PREFIX}.${LAN_VLAN_ID}
GUEST_IP_PREFIX=${GUEST_NET_PREFIX:-$DEFAULT_NET_PREFIX}.${GUEST_VLAN_ID}
LAN_WG_IP_PREFIX=${LAN_WG_NET_PREFIX:-$DEFAULT_NET_PREFIX}.${LAN_WG_VLAN_ID}
IOT_IP_PREFIX=${IOT_NET_PREFIX:-$DEFAULT_NET_PREFIX}.${IOT_VLAN_ID}
LAN_SUBNET=${LAN_SUBNET:-$DEFAULT_SUBNET}
GUEST_SUBNET=${GUEST_SUBNET:-$DEFAULT_SUBNET}
LAN_WG_SUBNET=${LAN_WG_SUBNET:-$DEFAULT_SUBNET}
IOT_SUBNET=${IOT_SUBNET:-$DEFAULT_SUBNET}

[ "$GUEST_NET_ENABLE" = 1 ] && add_network interface guest proto=static ipaddr="${GUEST_IP_PREFIX}.1${GUEST_SUBNET}"
[ "$IOT_ENABLE" = 1 ] && add_network interface iot proto=static ipaddr="${IOT_IP_PREFIX}.1${IOT_SUBNET}"

if ! uci -q get network.wan; then
	add_network interface wan proto=dhcp
	add_network interface wan6 proto=dhcpv6
fi

uci -q batch <<-EOF
del network.lan.netmask
set network.lan.ipaddr=${LAN_IP_PREFIX}.1${LAN_SUBNET}
set network.lan.ip6assign=64

rename network.wan6=wan_6
set network.wan_6.device=@wan
EOF

[ -n "$PPPOE_USERNAME" ] && {
	add_network interface wan proto=pppoe ipv6=0 username="$PPPOE_USERNAME" password="${PPPOE_PASSWD:-passwd}"
	uci add_list network.lan.ip6class=wan_6
}

[ "$WAN_B_ENABLE" = 1 ] && {
	add_network interface wanb proto=dhcp
	add_network interface wanb_6 proto=dhcpv6 device=@wanb
}

[ -n "$WWAN_PATH" ] && {
	add_network interface wwan0 proto=modemmanager device="$WWAN_PATH" iptype=ipv4v6 apn="${WWAN_APN:-internet}"
	uci add_list network.lan.ip6class=wwan0_6
}

[ -n "$USB_TETHER_DEV" ] && add_network interface "$USB_TETHER_DEV" proto=dhcp device="$USB_TETHER_DEV"

[ "$WG_ENABLE" = 1 ] && {
	WG_VLAN_HEX=$(printf '%x' "$LAN_WG_VLAN_ID")

	add_network interface "lan_${WG_IFACE}" proto=static \
		ipaddr="${LAN_WG_IP_PREFIX}.1${LAN_WG_SUBNET}" \
		ip6assign=64 ip6class=local ip6hint="$WG_VLAN_HEX"

	uci rename firewall.@zone[0]=lan
	uci add_list firewall.lan.network="lan_${WG_IFACE}"

	[ "$AP_MODE" != 1 ] && {
		add_network interface "${WG_IFACE}" proto=wireguard \
			private_key="${WG_PRIVATE_KEY:-$(wg genkey)}" \
			"+addresses=${WG_IPV4:-172.16.0.2/32}" \
			"+addresses=${WG_IPV6:-fd88::/128}"

		[ -n "$PEER_PUBLIC_KEY" ] && {
			add_network "wireguard_${WG_IFACE}" "" \
				public_key="$PEER_PUBLIC_KEY" \
				preshared_key="$PRESHARED_KEY" \
				endpoint_host="${ENDPOINT:-1.2.3.4}" \
				endpoint_port="${ENDPOINT_PORT:-51820}" \
				allowed_ips="${ALLOWED_IPS:-0.0.0.0/0 ::/0}" \
				persistent_keepalive=25 \
				route_allowed_ips=1
		}

		# WG IPv6 anchor for mwan3
		add_network interface "${WG_IFACE}_6" proto=none device="@${WG_IFACE}"

		# Fix router IPv6 internet access
		_uci network rule6 "" in=loopback lookup=main priority=999
	}
}

lan_ports="$(uci -q get network.@device[0].ports)"
wan_port="$(uci -q get network.wan.device)"
all_ports="$lan_ports${wan_port:+ $wan_port}"

USE_BRIDGE_VLAN=1
BRIDGE_WAN_PORT=1
if grep -sq DEVTYPE=dsa /sys/class/net/*/uevent; then
	# Ideally, both WAN and LAN ports should attach to the same bridge with bridge VLAN filtering enabled,
	# but adding a non-DSA WAN port to the bridge causes performance penalty, so it is skipped.
	if ! grep -sq DEVTYPE=dsa /sys/class/net/"${wan_port}"/uevent && [ "$AP_MODE" != 1 ]; then
		all_ports="$lan_ports"
		BRIDGE_WAN_PORT=
	fi
elif swconfig list 2>/dev/null | grep -q '^Found:'; then
	USE_BRIDGE_VLAN=
else
	# x86/SBC: always use bridge VLAN filtering
	# Single NIC: reuse lan port as tagged WAN since no dedicated WAN port exists
	[ -z "$wan_port" ] && WAN_IS_TAGGED=1
fi

# LAN ports untagged on LAN VLAN, WAN ports untagged on WAN VLAN (unless WAN_IS_TAGGED),
# all ports tagged (trunk) on guest/iot/wanb/wireguard VLANs.
# AP mode: all ports untagged on LAN VLAN, tagged on all other VLANs.
if [ "$USE_BRIDGE_VLAN" = 1 ]; then
	[ "$AP_MODE" = 1 ] && [ "$wan_port" = br-wan ] && {
		all_ports="$lan_ports $(uci -q get network.@device[1].ports)"
		uci del network.@device[1]
	}

	src_ports="$lan_ports"
	[ "$AP_MODE" = 1 ] && src_ports="$all_ports"

	for port in $src_ports; do
		lan_vlan_ports="${lan_vlan_ports:+$lan_vlan_ports }$port:u*"
		tagged_vlan_ports="${tagged_vlan_ports:+$tagged_vlan_ports }$port:t"
		wan_vlan_ports="${wan_vlan_ports:+$wan_vlan_ports }$port:t"
	done

	[ "$AP_MODE" != 1 ] && [ "$BRIDGE_WAN_PORT" = 1 ] && [ -n "$wan_port" ] && {
		lan_vlan_ports="$lan_vlan_ports $wan_port:t"
		tagged_vlan_ports="$tagged_vlan_ports $wan_port:t"
		if [ "$WAN_IS_TAGGED" = 1 ]; then
			wan_vlan_ports="$wan_vlan_ports $wan_port:t"
		else
			wan_vlan_ports="$wan_vlan_ports $wan_port:u*"
		fi
	}

	uci set network.@device[0].name=br-vlan
	uci set network.@device[0].ports="$all_ports"

	vlan_add() { add_bridge_vlan "$@"; }
	trunk_ports="$tagged_vlan_ports"

	add_bridge_vlan "$LAN_VLAN_ID" "$lan_vlan_ports" lan

	[ "$WAN_IS_TAGGED" = 1 ] && [ "$BRIDGE_WAN_PORT" != 1 ] && {
		uci set network.wan.device="${wan_port}.${WAN_VLAN_ID}"
	}

else
	add_bridge lan
	[ "$GUEST_NET_ENABLE" = 1 ] && add_bridge guest
	[ "$IOT_ENABLE" = 1 ] && add_bridge iot
	[ "$WG_ENABLE" = 1 ] && add_bridge lan_"${WG_IFACE}"
	[ "$WAN_B_ENABLE" = 1 ] && add_bridge wanb

	# switch_vlan[0] is LAN, and switch_vlan[1] is WAN (see config_generate and uci-defaults.sh)
	switch_dev="$(uci -q get network.@switch_vlan[0].device)"
	lan_eth="${lan_ports%%.*}"
	wan_eth="$wan_port"

	for port in $(uci -q get network.@switch_vlan[0].ports); do
		case "$port" in
			*t) lan_cpu_port="$port" ;;
			*) untagged_lan="${untagged_lan:+$untagged_lan }$port" ;;
		esac
	done

	if uci -q get network.@switch_vlan[1] > /dev/null; then
		for port in $(uci -q get network.@switch_vlan[1].ports); do
			case "$port" in
				*t) [ "$port" != "$lan_cpu_port" ] && wan_cpu_port="$port" ;;
				*) untagged_wan="${untagged_wan:+$untagged_wan }$port" ;;
			esac
		done
		wan_eth="${wan_port%%.*}"
	fi

	for port in $untagged_lan; do tagged_lan="${tagged_lan:+$tagged_lan }${port}t"; done
	for port in $untagged_wan; do tagged_wan="${tagged_wan:+$tagged_wan }${port}t"; done
	cpu_ports="${lan_cpu_port}${wan_cpu_port:+ $wan_cpu_port}"
	all_tagged="${tagged_lan}${tagged_wan:+ $tagged_wan} $cpu_ports"

	uci del network.@device[0]
	while uci -q del network.@switch_vlan[0]; do :; done

	if [ "$AP_MODE" = 1 ]; then
		add_swconfig_vlan "$LAN_VLAN_ID" "${untagged_lan}${untagged_wan:+ $untagged_wan} $cpu_ports" lan
		add_swconfig_vlan "$WAN_VLAN_ID" "$all_tagged"
	else
		add_swconfig_vlan "$LAN_VLAN_ID" "${untagged_lan}${tagged_wan:+ $tagged_wan} $cpu_ports" lan
		[ -n "$untagged_wan" ] && {
			if [ "$WAN_IS_TAGGED" = 1 ]; then
				add_swconfig_vlan "$WAN_VLAN_ID" "$tagged_lan $tagged_wan $cpu_ports"
			else
				add_swconfig_vlan "$WAN_VLAN_ID" "$tagged_lan $untagged_wan $cpu_ports"
			fi
		}
	fi

	vlan_add() { add_swconfig_vlan "$@"; }
	trunk_ports="$all_tagged"

	if [ "$WAN_IS_TAGGED" = 1 ] || [ -n "$untagged_wan" ]; then
		uci set network.wan.device="${wan_eth}.${WAN_VLAN_ID}"
	fi
fi

[ "$WG_ENABLE" = 1 ] && vlan_add "$LAN_WG_VLAN_ID" "$trunk_ports" lan_"${WG_IFACE}"
[ "$GUEST_NET_ENABLE" = 1 ] && vlan_add "$GUEST_VLAN_ID" "$trunk_ports" guest
[ "$IOT_ENABLE" = 1 ] && vlan_add "$IOT_VLAN_ID" "$trunk_ports" iot
[ "$BRIDGE_WAN_PORT" = 1 ] && [ -n "$wan_vlan_ports" ] && vlan_add "$WAN_VLAN_ID" "$wan_vlan_ports" wan
[ "$WAN_B_ENABLE" = 1 ] && vlan_add "$WAN_B_VLAN_ID" "$trunk_ports" wanb

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
	add_network interface lan \
		ipaddr="${LAN_IP_PREFIX}.${AP_INDEX:-2}${LAN_SUBNET}" \
		gateway="${LAN_IP_PREFIX}.1" \
		dns="${LAN_IP_PREFIX}.1" \
		metric=88
	[ "$WG_ENABLE" = 1 ] && uci set "network.lan_${WG_IFACE}.ipaddr=${LAN_WG_IP_PREFIX}.${AP_INDEX:-2}${LAN_WG_SUBNET}"
	[ "$GUEST_NET_ENABLE" = 1 ] && uci set network.guest.ipaddr="${GUEST_IP_PREFIX}.${AP_INDEX:-2}${GUEST_SUBNET}"
	[ "$IOT_ENABLE" = 1 ] && uci set network.iot.ipaddr="${IOT_IP_PREFIX}.${AP_INDEX:-2}${IOT_SUBNET}"
}

# === mwan3 ===
cat > /sbin/mwan3-iface-add << 'EOF'
#!/bin/sh
. /usr/share/wrtnova/functions.sh

IFACE="${1//-/_}"
BASE_IFACE="${IFACE%%_6}"
METRIC=${2:-1}
WEIGHT=${3:-1}
FAMILY=${4:-ipv4}
LOAD_BALANCED=${5:-1}
[ "$FAMILY" = ipv6 ] && TRACK_IP=${6:-2620:fe::fe} || TRACK_IP=${6:-1.1.1.1}

if [ -z "$IFACE" ]; then
	cat <<-USAGE

Usage: mwan3-iface-add <interface> [metric] [weight] [family] [balanced] [track_ip]

  interface	Logical interface name (required)
  metric	Lower metric used first, same metric load-balanced, default 1
  weight	Load-balanced interfaces: higher weights distribute more traffic, default 1
  family	ipv4 or ipv6, default ipv4
  balanced	1 = add to the default balanced policy, '0' = only_policy only, default 1
  track_ip	IP to track, default 1.1.1.1 (ipv4) or 2620:fe::fe (ipv6)
	USAGE
	exit 1
fi

uci -q get network.${IFACE} > /dev/null || {
	echo "'$IFACE' interface not found in network config" >&2
	exit 1
}

calc_next_metric() {
	local max=0 metric iface
	for iface in $(uci show network | awk -F'[.=]' '/=interface$/{print $2}'); do
		metric=$(uci -q get network.${iface}.metric)
		[ -n "$metric" ] && [ "$metric" -gt "$max" ] && max=$metric
	done
	[ "$max" -eq 0 ] && echo 5 || echo $((max + 5))
}

uci set "network.${IFACE}.metric=$(calc_next_metric)"

_uci mwan3 interface "$IFACE" \
	enabled=1 family=$FAMILY \
	"-track_ip" "+track_ip=$TRACK_IP"

_uci mwan3 member "${IFACE}_m${METRIC}_w${WEIGHT}" \
	interface=$IFACE metric=$METRIC weight=$WEIGHT

_uci mwan3 policy "${BASE_IFACE}_only" \
	"^use_member" "+use_member=${IFACE}_m${METRIC}_w${WEIGHT}"

[ "$LOAD_BALANCED" = 1 ] && _uci mwan3 policy balanced \
	"^use_member" "+use_member=${IFACE}_m${METRIC}_w${WEIGHT}"
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

	mwan3-iface-add wan 1 1 ipv4
	mwan3-iface-add wan_6 1 1 ipv6
	[ "$WAN_B_ENABLE" = 1 ] && {
		mwan3-iface-add wanb 1 1 ipv4
		mwan3-iface-add wanb_6 1 1 ipv6
	}

	[ -n "$WWAN_PATH" ] && mwan3-iface-add wwan0 2 2
	[ -n "$USB_TETHER_DEV" ] && mwan3-iface-add "$USB_TETHER_DEV" 2 2

	[ "$WG_ENABLE" = 1 ] && [ "$AP_MODE" != 1 ] && {
		mwan3-iface-add "${WG_IFACE}" 1 1 ipv4 0
		mwan3-iface-add "${WG_IFACE}_6" 1 1 ipv6 0

		ULA="$(uci -q get network.globals.ula_prefix)"
		uci batch <<-EOF
		set mwan3.lan_${WG_IFACE}_ipv4=rule
		set mwan3.lan_${WG_IFACE}_ipv4.src_ip="${LAN_WG_IP_PREFIX}.0${LAN_WG_SUBNET}"
		set mwan3.lan_${WG_IFACE}_ipv4.use_policy="${WG_IFACE}_only"
		reorder mwan3.lan_${WG_IFACE}_ipv4=2

		set mwan3.lan_${WG_IFACE}_ipv6=rule
		set mwan3.lan_${WG_IFACE}_ipv6.src_ip="${ULA%::*}:${WG_VLAN_HEX}::/64"
		set mwan3.lan_${WG_IFACE}_ipv6.use_policy="${WG_IFACE}_only"
		reorder mwan3.lan_${WG_IFACE}_ipv6=3
		EOF
	}
}

# === DHCP/DNS ===
cat > /sbin/dhcp-instance-add << 'EOF'
#!/bin/sh
. /usr/share/wrtnova/functions.sh
IFACE=$1 TIME=${2:-12h} DOMAIN=${3:-${IFACE}.lan} LOCAL=${4:-$DOMAIN} IPV6=${5:-1} START=${6:-100}
if [ -z "$IFACE" ]; then
	cat <<-USAGE

Usage: dhcp-instance-add <iface> [time] [domain] [local] [ipv6] [start] [limit]

  iface		Interface name (required)
  time		Lease time, default 12h
  domain	DNS domain, default <iface>.lan
  local		Domain to resolve locally, default /lan/
  ipv6		Enable IPv6 RA/DHCPv6, default 1
  start		DHCP pool start, default 100
  limit		DHCP pool limit, default auto from subnet size
	USAGE
	exit 1
fi

uci -q get network.${IFACE} > /dev/null || {
	echo "'$IFACE' interface not found in network config" >&2
	exit 1
}

BITS=$(uci -q get network.${IFACE}.ipaddr | grep -o '/[0-9]*$' | tr -d '/')
LIMIT=${7:-$(( (1 << (32 - ${BITS:-24})) - 156 ))}

_uci dhcp dnsmasq "${IFACE}_dns" domainneeded=1 localise_queries=1 \
	rebind_protection=1 rebind_localhost=1 "local=/${LOCAL}/" domain=$DOMAIN \
	expandhosts=1 authoritative=1 readethers=1 leasefile=/tmp/dhcp.leases.${IFACE} \
	localservice=1 dnsforwardmax=500 dhcpleasemax=$(( LIMIT + 50 )) \
	"-interface" "-notinterface" "+interface=$IFACE" "+notinterface=loopback"

_uci dhcp dhcp "$IFACE" instance=${IFACE}_dns interface=$IFACE \
	start=$START limit=$LIMIT leasetime=$TIME

[ "$IPV6" = 1 ] && _uci dhcp dhcp "$IFACE" ra=server dhcpv6=server \
	ra_default=1 "ra_flags=managed-config other-config" \
	"-dns" "+dns=$(ip -6 a s dev eth0 | grep -o 'fe80[^/]*')"
EOF
chmod +x /sbin/dhcp-instance-add

setup_dnsmasq_upstream() {
	for iface in lan "${GUEST_NET_ENABLE:+guest}" "${IOT_ENABLE:+iot}" "${WG_IFACE:+lan_${WG_IFACE}}"; do
		[ -z "$iface" ] && continue
		_uci dhcp dnsmasq "${iface}_dns" noresolv=1 cachesize=0 \
			"+server=127.0.0.1#5354" "+server=::1#5354"
	done
}

while uci -q del dhcp.@dnsmasq[0]; do :; done
while uci -q del dhcp.@dhcp[0]; do :; done
IPV6_LINK_LOCAL=$(ip l s eth0 up && ip -6 a s dev eth0 | grep -o 'fe80[^/]*')

dhcp-instance-add lan 24h lan lan 1 "$LAN_DHCP_START" "$LAN_DHCP_LIMIT" && uci del dhcp.lan_dns.notinterface

[ "$WG_ENABLE" = 1 ] && {
	_uci dhcp dnsmasq lan_dns \
		"+rebind_domain=lan" \
		"+server=/${WG_IFACE}.lan/${LAN_WG_IP_PREFIX}.1"

	dhcp-instance-add lan_"${WG_IFACE}" 24h "${WG_IFACE}.lan"
	_uci dhcp dnsmasq lan_"${WG_IFACE}"_dns \
		"+rebind_domain=lan" \
		"+server=/lan/127.0.0.1"
}

[ "$GUEST_NET_ENABLE" = 1 ] && dhcp-instance-add guest 1h "" "" 0 "$GUEST_DHCP_START" "$GUEST_DHCP_LIMIT"

[ "$IOT_ENABLE" = 1 ] && dhcp-instance-add iot "" "" "" 0

uci del system.ntp.server
_uci system timeserver ntp \
	"+server=time1.google.com" \
	"+server=time2.google.com" \
	"+server=time.cloudflare.com"

cat >> /etc/hosts <<-EOF

$IPV6_LINK_LOCAL	$HOSTNAME

216.239.35.0		time1.google.com
216.239.35.4		time2.google.com
162.159.200.1		time.cloudflare.com
162.159.200.123		time.cloudflare.com

2001:4860:4806::	time1.google.com
2001:4860:4806:4::	time2.google.com
2606:4700:f1::1		time.cloudflare.com
2606:4700:f1::123	time.cloudflare.com
EOF

# Skip setup Adguard Home if AP mode or less than 230MB RAM
SETUP_ADGUARDHOME=
[ -x "/usr/bin/AdGuardHome" ] && {
	read -r _ TOTAL_RAM_KB _ < /proc/meminfo
	[ "$TOTAL_RAM_KB" -ge 235520 ] && SETUP_ADGUARDHOME=1 || /etc/init.d/adguardhome disable
}

[ "$SETUP_ADGUARDHOME" = 1 ] && {
	setup_dnsmasq_upstream
	echo "0 3 */3 * * /etc/init.d/adguardhome restart" >> /etc/crontabs/root
	cat > /etc/hotplug.d/iface/99-adguardhome <<-'EOF'
	. /lib/functions/network.sh
	network_find_wan WAN_IF
	[ ifup = "$ACTION" ] && [ "$WAN_IF" = "$INTERFACE" ] && \
	{ sleep 30; /etc/init.d/adguardhome restart; }
	EOF
}

ADGUARD_PASSWD=${ADGUARD_PASSWD:-\$2y\$10\$aRfh9IbImR8PIf/FWlLvkeW6wiyp47BjY0KqW/FD/F14QloYuV00a}
[ "$OS_VERSION" = "25" ] && { mkdir -p /etc/adguardhome; ADGUARD_DIR=/etc/adguardhome; } || ADGUARD_DIR=/etc
cat > "$ADGUARD_DIR"/adguardhome.yaml <<-EOF
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
[ -x "/usr/bin/dnsproxy" ] && [ "$SETUP_ADGUARDHOME" != 1 ] && {
	setup_dnsmasq_upstream
	_uci dnsproxy global global \
		enabled=1 log_file=/dev/null rate_limit=500 \
		"-listen_port" "+listen_port=5354"

	_uci dnsproxy cache cache \
		enabled=1 cache_optimistic=1 size=4194304

	_uci dnsproxy edns edns enabled=1

	_uci dnsproxy servers servers \
		"-upstream" "-bootstrap" "-fallback" \
		"+upstream=https://dns.adguard-dns.com/dns-query" \
		"+upstream=quic://dns.adguard-dns.com" \
		"+bootstrap=9.9.9.9" "+bootstrap=2606:4700:4700::1111" \
		"+fallback=1.1.1.1" "+fallback=2620:fe::9"
}

# === Firewall ===
fw_add_zone() {
	local name="$1" network="$2" masq="$3" masq6="$4" mtu_fix="$5"
	local input="${6:-REJECT}" output="${7:-ACCEPT}" forward="${8:-REJECT}"

	_uci firewall zone "$name" \
		name="$name" input="$input" output="$output" \
		forward="$forward" network="$network" \
		"${masq:+masq=$masq}" \
		"${masq6:+masq6=$masq6}" \
		"${mtu_fix:+mtu_fix=$mtu_fix}"
}

fw_add_forwarding() {
	_uci firewall forwarding "${1}_${2}" src="$1" dest="$2"
}

fw_allow_base_services() {
	local src="$1"

	_uci firewall rule "" \
		name="${src}-Allow-DNS-DHCP-NTP" src="$src" \
		target=ACCEPT proto="tcp udp" dest_port="53 67 123"

	_uci firewall rule "" \
		name="${src}-Allow-Ping" src="$src" \
		target=ACCEPT "+proto=icmp" "+icmp_type=echo-request"

	_uci firewall rule "" \
		name="${src}-Allow-DHCPv6" src="$src" \
		target=ACCEPT proto=udp family=ipv6 dest_port=546

	_uci firewall rule "" \
		name="${src}-Allow-MLD" src="$src" \
		target=ACCEPT proto=icmp family=ipv6 src_ip=fe80::/10 \
		"+icmp_type=130/0" "+icmp_type=131/0" \
		"+icmp_type=132/0" "+icmp_type=143/0"

	_uci firewall rule "" \
		name="${src}-Allow-ICMPv6-Input" src="$src" \
		target=ACCEPT proto=icmp family=ipv6 limit="1000/sec" \
		"+icmp_type=echo-request" "+icmp_type=echo-reply" \
		"+icmp_type=destination-unreachable" "+icmp_type=packet-too-big" \
		"+icmp_type=time-exceeded" "+icmp_type=bad-header" \
		"+icmp_type=unknown-header-type" "+icmp_type=router-solicitation" \
		"+icmp_type=neighbour-solicitation" "+icmp_type=router-advertisement" \
		"+icmp_type=neighbour-advertisement"
}

fw_add_forward_rule() {
	local name="$1" dest_ip="$2" proto="${3:-all}" dest_port="$4"
	local enabled="$5" src="${6:-wan}" dest="${7:-lan}"

	_uci firewall rule "" \
		name="$name" target=ACCEPT src="$src" dest="$dest" \
		family=ipv6 dest_ip="$dest_ip" proto="$proto" \
		"${dest_port:+dest_port=$dest_port}" \
		"${enabled:+enabled=$enabled}"
}

fw_add_redirect() {
	local name="$1" src="$2" sport="$3" family="$4" proto="$5"
	local dest="$6" dest_ip="$7" dest_port="$8" enabled="$9"

	_uci firewall redirect "" \
		name="$name" src="$src" src_dport="$sport" \
		target=DNAT proto="$proto" \
		"${family:+family=$family}" \
		"${dest:+dest=$dest}" \
		"${dest_ip:+dest_ip=$dest_ip}" \
		"${dest_port:+dest_port=$dest_port}" \
		"${enabled:+enabled=$enabled}"
}

fw_prevent_dns_leaks() {
	fw_add_redirect "${1}-Prevent-DNS-leaks" "$1" 53 any "tcp udp"
}

fw_redirect_ntp() {
	fw_add_redirect "${1}-Redirect-NTP" "$1" 123 any udp
}

fw_add_port_forwarding() {
	local name="$1" sport="$2" dest_ip="$3" dport="${4:-$2}" src="${5:-wan}"
	local dest="${6:-lan}" proto="${7:-tcp udp}" enabled="$8" family="$9"

	fw_add_redirect "$name" "$src" "$sport" "$family" "$proto" "$dest" "$dest_ip" "$dport" "$enabled"
}

[ "$HARDWARE_OFFLOAD" = 1 ] && SOFTWARE_OFFLOAD=1
[ "$SOFTWARE_OFFLOAD" = 1 ] && uci set firewall.@defaults[0].flow_offloading=1
[ "$HARDWARE_OFFLOAD" = 1 ] && uci set firewall.@defaults[0].flow_offloading_hw=1

WAN_ZONE="wan wan_6"
[ "$WAN_B_ENABLE" = 1 ] && WAN_ZONE="$WAN_ZONE wanb wanb_6"
[ -n "$WWAN_PATH" ] && WAN_ZONE="$WAN_ZONE wwan0"
[ -n "$USB_TETHER_DEV" ] && WAN_ZONE="$WAN_ZONE $USB_TETHER_DEV"

uci rename firewall.@zone[1]=wan
uci set firewall.wan.network="$WAN_ZONE"

_uci firewall rule "" name=Block-DoT-DoQ src="*" dest="*" dest_port=853 target=REJECT

fw_prevent_dns_leaks lan

[ "$GUEST_NET_ENABLE" = 1 ] && {
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

[ "$AP_MODE" != 1 ] && {
	[ "$WG_ENABLE" = 1 ] && {
		fw_add_zone wan_nat6 "$WG_IFACE" 1 1 1
		fw_add_forwarding lan wan_nat6
	}
}

# === Cloudflare DDNS ===
add_cf_ddns() {
	local interface="$1" use_ipv6="$2" ip_source="$3"
	local network_or_hostname="$4" lookup_host="${5:-ddns.example.com}"
	local family; family=$([ "$use_ipv6" = 1 ] && echo ipv6 || echo ipv4)
	local domain="${lookup_host%%.*}@${lookup_host#*.}"
	local name="${interface}_${family}" ip_key=ip_network

	[ "$ip_source" = script ] && {
		ip_key=ip_script 
		name="${network_or_hostname//-/_}_${family}"
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
	while uci -q del ddns.@service[0]; do :; done
	add_cf_ddns wan 0 network wan "$LOOKUP_HOST"
}

# IPv6 DDNS helper script
cat > /sbin/ip6host << 'EOF'
#!/bin/sh
HOST=$1 LAN_IF="${2:-lan}"
[ -z "$HOST" ] && { echo "Usage: ip6host <hostname> [lan|lab|...]"; exit 1; }

eval "$(ubus call network.interface dump | jsonfilter \
	-e "LAN_DEV=@.interface[@.interface='$LAN_IF'].l3_device" \
	-e "PREFIX=@.interface[@.proto='dhcpv6']['ipv6-prefix'][@.assigned['$LAN_IF']].address")"

ubus call dhcp ipv6leases \
	| jsonfilter -e "@.device['${LAN_DEV}'].leases[@.hostname='${HOST}']['ipv6-addr'][*].address" \
	| grep "${PREFIX%????}" \
	| head -1
EOF
chmod +x /sbin/ip6host

# === Static Leases & Port Forwarding ===
process_host_list() {
	local hostname octet ports name

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
				fw_add_port_forwarding \
					"${hostname} ${port}" "$port" \
					"${LAN_IP_PREFIX}.${octet}"
			done
		}

		[ "$1" = ipv6 ] && {
			[ -x /usr/bin/ddns ] && [ "$AP_MODE" != 1 ] && \
				add_cf_ddns wan_6 1 script "$hostname" "$LOOKUP_HOST"
			if [ -z "$ports" ]; then
				fw_add_forward_rule \
					"Forward everything ${hostname}" \
					"::${octet}/-64" all
			else
				fw_add_forward_rule \
					"Forward $ports $hostname" \
					"::${octet}/-64" "tcp udp" "$ports"
			fi
		}
	done
}

process_host_list ipv4 <<-EOF
$PORT_FORWARD_LIST
EOF

process_host_list ipv6 <<-EOF
$IPV6_SERVER_LIST
EOF
:
