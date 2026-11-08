# Expense Splitter IPv4 gateway

The existing CX23 Caddy terminates HTTPS for `expense-splitter.trettstadt.de` and
forwards requests over WireGuard to the NixOS home server on TCP port 8082. TLS and public ports
80/443 stay on the existing Caddy; do not add another listener on those ports.

## Configuration in this repository

- `../docker/Caddyfile` adds the Expense Splitter virtual host and overwrites
  `X-Forwarded-For` with the client address seen by the public Caddy.
- `src/main/java/com/trettstadt/HetznerWebStack.java` opens UDP 51820 in the
  Hetzner Cloud Firewall.
- `setup-expense-splitter-wireguard.sh` installs WireGuard on the Debian CX23,
  creates and protects its private key, then configures the NixOS peer.

Apply the firewall rule with `pulumi up --stack prod-web` from `infrastructure/`.
The Caddyfile change is not part of the Astro auto-deploy path. Copy
`docker/Caddyfile` to `/opt/portfolio-web/Caddyfile` on the CX23; validate and
reload the existing Caddy container during the DNS cutover below.

## One-time WireGuard setup

1. From the `nix-config` repository, deploy the NixOS config (using its
   `./deploy.sh` workflow). It brings up `wg0` at `10.100.0.2` and generates its
   private key locally at `/var/lib/wireguard/expense-splitter.key`; the key is not
   stored in Git or the Nix store. The existing direct HTTPS virtual host remains
   enabled during setup, so this first deploy does not interrupt the app. Get the
   **public** key on NixOS:

   ```sh
   sudo wg show wg0 public-key
   ```

2. Apply the Hetzner firewall change. From this repository, copy the setup script
   to the CX23 and run it as root with the NixOS public key:

   ```sh
   CX23_IPV4='replace-with-the-CX23-public-IPv4'
   NIXOS_PUBLIC_KEY='paste-the-public-key-from-step-1'
   scp infrastructure/setup-expense-splitter-wireguard.sh root@"$CX23_IPV4":/root/
   ssh root@"$CX23_IPV4" \
     "bash /root/setup-expense-splitter-wireguard.sh '$NIXOS_PUBLIC_KEY'"
   ```

   The script prints the CX23 public key. Put that one-line **public** key in
   `nix-config/expense-splitter-gateway.pub`, commit/deploy it, then activate the
   NixOS config again. The NixOS module deliberately starts with no peer until
   that file exists. Private keys remain only on their respective servers. Deploy
   the second NixOS activation with `./deploy.sh` as well.

3. Verify the tunnel from NixOS with `sudo wg show wg0`; `latest handshake` should
   be recent. On the CX23, `sudo wg show wg0` should show the same handshake and
   received traffic. Test the home endpoint directly from the CX23:

   ```sh
   curl -H 'Host: expense-splitter.trettstadt.de' \
     http://10.100.0.2:8082/api/health
   ```

The NixOS peer uses the CX23's static public IPv4 `49.12.234.229:51820` as its
endpoint. If the CX23 is replaced and receives a different primary IPv4, update
`gatewayEndpoint` in `nix-config/expense-splitter.nix`. The home server initiates
the tunnel and sends a keepalive, so no inbound WireGuard port is needed at home
and a changing home IPv6 prefix is fine.

Both tunnel ends use MTU `1280`. The home uplink drops larger packets (the
default WireGuard MTU of 1420 blackholes large responses such as the 305 KB
JavaScript bundle while small API responses still work). Keep the MTU on both
ends in sync; a larger value will make the frontend hang after the first few
kilobytes.

## Caddy and DNS cutover

Once the tunnel is up and the private HTTP health check succeeds, validate the
copied Caddyfile and test the upstream from inside the Caddy container:

```sh
CX23_IPV4='replace-with-the-CX23-public-IPv4'
ssh root@"$CX23_IPV4" 'cd /opt/portfolio-web && docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile'
ssh root@"$CX23_IPV4" 'cd /opt/portfolio-web && docker compose exec -T caddy wget -qO- --header="Host: expense-splitter.trettstadt.de" http://10.100.0.2:8082/api/health'
```

Set the A record for `expense-splitter.trettstadt.de` to `49.12.234.229` and the
AAAA record to the CX23's actual IPv6 `2a01:4f8:1c1c:e236::1`. Keep the home
NixOS public ingress enabled during propagation. Once both records resolve to
the CX23, reload its existing Caddy container so it can obtain the certificate:

```sh
ssh root@"$CX23_IPV4" 'cd /opt/portfolio-web && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile'
curl --resolve "expense-splitter.trettstadt.de:443:$CX23_IPV4" \
  https://expense-splitter.trettstadt.de/api/health
```

After the app works through the CX23 and its certificate is issued, set
`publicIngress = false` in `nix-config/expense-splitter.nix` and deploy once more.
That removes the temporary direct HTTPS virtual host on the home server; the
WireGuard-only listener at `10.100.0.2:8082` remains.

The home Caddy trusts forwarded client addresses only from the tunnel peer
`10.100.0.1/32`, then overwrites `X-Forwarded-For` on its loopback proxy to
Express. Keep the backend's `TRUST_PROXY=loopback`: rate limits continue to see
individual client IPs. Port 8082 is bound to the WireGuard address and allowed
only on interface `wg0`.

## Rollback

Set `publicIngress = true` on NixOS, remove the A record, and restore the AAAA
record to the home server. Remove the Expense Splitter site block from the CX23
Caddyfile and reload Caddy. The WireGuard tunnel can stay running without
affecting the other sites.
