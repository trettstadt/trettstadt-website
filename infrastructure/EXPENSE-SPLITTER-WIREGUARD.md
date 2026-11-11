# Expense Splitter IPv4 gateway

The existing CX23 Caddy terminates HTTPS for `expense-splitter.trettstadt.de` and
forwards requests over WireGuard to the NixOS home server on TCP port 8082. TLS and public ports
80/443 stay on the existing Caddy; do not add another listener on those ports.

## Configuration in this repository

- `../docker/Caddyfile` adds the Expense Splitter virtual host and overwrites
  `X-Forwarded-For` with the client address seen by the public Caddy.
- `../docker/docker-compose.yml` runs the public Caddy with `network_mode: host` so that it sees the
  real IPv4 **and** IPv6 client address; see
  [Real client address](#real-client-address-ipv4-and-ipv6).
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

The NixOS peer uses the CX23's static public IPv4 (`<CX23_IPV4>:51820`) as its
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

Set the A record for `expense-splitter.trettstadt.de` to the CX23's public IPv4
(`<CX23_IPV4>`) and the AAAA record to its public IPv6 (`<CX23_IPV6>`). `<CX23_IPV6>` is the
server's own address (it ends in `::1`); the network address of its /64 (ending in `::`) is not
configured on the server and never answers. Keep the
home NixOS public ingress enabled during propagation. Once both records resolve
to the CX23, reload its existing Caddy container so it can obtain the certificate:

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

## Real client address (IPv4 and IPv6)

The public Caddy forwards the client address it sees to the home backends (`X-Forwarded-For`), and
the backends use it for rate limits and for Authelia's log and lockout. That only works if Caddy
sees the real address of every visitor, over IPv4 and over IPv6.

**What was wrong.** With published ports (`80:80`, `443:443`) Docker handles IPv4 with iptables
DNAT, which keeps the client address. This host has no IPv6 rules at all (there is no
`/etc/docker/daemon.json`, so `ip6tables` is off), so IPv6 connections were accepted by
`docker-proxy` (`-host-ip :: ... -container-ip <Caddy's IPv4 address>`) and opened again from the
bridge gateway. Every IPv6 visitor reached Caddy, and through it the home backends and Authelia, as
`172.18.0.1`. Authelia's `remote_ip` showed the real address for `curl -4` and `172.18.0.1` for
`curl -6`, which is why Authelia's lockout by address was left off.

**What changed.** Caddy runs with `network_mode: host`, so it listens on the host's ports 80 and 443
itself and sees both address families directly. No port is published for it any more. The
WireGuard upstreams (`10.100.0.2:8082` to `8085`) are now reached straight through `wg0` with source
address `10.100.0.1`, which is what the home Caddy's `trusted_proxies` expects; Docker NAT is no
longer involved.

What host mode means in practice:

- Caddy cannot resolve Docker service names. The apps served from the CX23 itself are published on
  the loopback interface only, and the Caddyfile points to those ports:

  | App | Loopback port | Caddy site |
  |---|---|---|
  | `astro-site` | `127.0.0.1:18080` | `trettstadt.de` |
  | `umami` | `127.0.0.1:18081` | `analytics.trettstadt.de` |
  | `calcom` | `127.0.0.1:18082` | `book.trettstadt.de` |
  | `jitsi-web` | `127.0.0.1:18083` | `meet.trettstadt.de` |

  A new app on the CX23 needs `ports: ["127.0.0.1:<port>:<container port>"]` in the compose file and
  `reverse_proxy 127.0.0.1:<port>` in the Caddyfile. Use the literal `127.0.0.1` (the published
  ports listen on IPv4 only). They are not reachable from outside.
- Caddy's admin endpoint (`localhost:2019`) now lives on the host's loopback instead of the
  container's. `docker compose exec -T caddy caddy validate|reload` works unchanged.
- Caddy still starts an HTTP/3 listener on UDP 443; the Hetzner firewall only allows TCP 443, as
  before.

### Check

From the home server. The bogus token only produces an error log line, which shows the address
Authelia saw:

```sh
curl -4 -s -X POST https://auth.trettstadt.de/api/reset-password/identity/finish \
  -H 'Content-Type: application/json' -d '{"token":"probe"}'
journalctl -u authelia-main --since -1min -o cat | grep -o '"remote_ip":"[^"]*"'
# repeat both commands with curl -6
```

`curl -4` must log the home IPv4 address and `curl -6` an address from the home IPv6 prefix, never
`172.18.0.1`. On the CX23, Caddy itself must hold the public ports and Docker must publish nothing
for it:

```sh
ss -tlnp | grep -E ':(80|443)\b'                          # users:(("caddy",...)), not docker-proxy
docker ps --filter name=caddy --format '{{.Names}} {{.Ports}}'   # no ports listed
```

Every site must also answer over both IP versions: `curl -4 -I` and `curl -6 -I` for each host in
the Caddyfile (add `--resolve "<host>:443:[<CX23_IPV6>]"` for a name that has no AAAA record).

### Rolling out and rolling back

The compose file and the Caddyfile are not part of the Astro auto-deploy, and they have to change
together: the old Caddyfile names Docker services, which a host-mode Caddy cannot resolve. On the
CX23, in `/opt/portfolio-web`, with backups next to the originals:

```sh
cp -p docker-compose.yml docker-compose.yml.pre-hostnet && cp -p Caddyfile Caddyfile.pre-hostnet
scp docker/docker-compose.yml root@"$CX23_IPV4":/opt/portfolio-web/docker-compose.yml   # from this repository
docker compose config -q
# 1. publish the four apps on loopback; the old bridged Caddy keeps serving meanwhile
docker compose up -d astro-site umami calcom jitsi-web
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/        # and :18081, :18082, :18083
# 2. copy the Caddyfile in place (scp keeps the inode of the bind mount), validate, recreate Caddy
scp docker/Caddyfile root@"$CX23_IPV4":/opt/portfolio-web/Caddyfile      # from this repository
docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile
docker compose up -d caddy
```

Step 1 restarts the four apps (Cal.com needs about a minute to become healthy). Step 2 leaves ports
80 and 443 without a listener for about two seconds and cuts open Jitsi websockets; certificates
stay in the `caddy_data` volume. To roll back, restore both files and recreate Caddy; the loopback
ports of the other containers can stay:

```sh
cp -p Caddyfile.pre-hostnet Caddyfile && cp -p docker-compose.yml.pre-hostnet docker-compose.yml
docker compose up -d caddy
```

`docker compose config` prints `$` as `$$`. A service whose `.env` values contain a dollar sign
(`calcom`) therefore shows a `config --hash` that differs from its running container. That is not
drift: `docker compose up` does not escape, so it keeps such a container as it is.

## Rollback

Set `publicIngress = true` on NixOS, remove the A record, and restore the AAAA
record to the home server. Remove the Expense Splitter site block from the CX23
Caddyfile and reload Caddy. The WireGuard tunnel can stay running without
affecting the other sites.
