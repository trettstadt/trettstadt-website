#!/usr/bin/env bash
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this script as root: sudo $0 <home-server-public-key>" >&2
  exit 1
fi

home_public_key="${1:-}"
if [[ ! "$home_public_key" =~ ^[A-Za-z0-9+/]{43}=$ ]]; then
  echo "Usage: $0 <home-server-WireGuard-public-key>" >&2
  exit 2
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard

install -d -o root -g root -m 0700 /etc/wireguard
if [[ ! -s /etc/wireguard/expense-splitter-private.key ]]; then
  (umask 077; wg genkey > /etc/wireguard/expense-splitter-private.key)
fi
chmod 0600 /etc/wireguard/expense-splitter-private.key

config_tmp="$(mktemp /etc/wireguard/wg0.conf.XXXXXX)"
trap 'rm -f "$config_tmp"' EXIT
{
  printf '%s\n' \
    '[Interface]' \
    'Address = 10.100.0.1/24' \
    'ListenPort = 51820'
  printf 'PrivateKey = %s\n' "$(cat /etc/wireguard/expense-splitter-private.key)"
  printf '\n%s\n' '[Peer]' \
    "PublicKey = $home_public_key" \
    'AllowedIPs = 10.100.0.2/32'
} > "$config_tmp"
chown root:root "$config_tmp"
chmod 0600 "$config_tmp"
mv "$config_tmp" /etc/wireguard/wg0.conf
trap - EXIT

cat > /etc/sysctl.d/90-expense-splitter-wireguard.conf <<'EOF'
net.ipv4.ip_forward = 1
EOF
sysctl --system >/dev/null

systemctl enable wg-quick@wg0
if systemctl is-active --quiet wg-quick@wg0; then
  systemctl restart wg-quick@wg0
else
  systemctl start wg-quick@wg0
fi

printf 'CX23 WireGuard public key: '
wg pubkey < /etc/wireguard/expense-splitter-private.key
printf 'Tunnel ready on UDP 51820; home peer address: 10.100.0.2\n'
