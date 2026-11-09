# Secret Santa IPv4 gateway

Secret Santa (`secret-santa.trettstadt.de`) uses the same CX23 gateway and the same WireGuard
tunnel as the Expense Splitter. The one-time tunnel setup, the MTU note and the key handling in
[`EXPENSE-SPLITTER-WIREGUARD.md`](EXPENSE-SPLITTER-WIREGUARD.md) apply unchanged and are not
repeated here. Only the Caddy site block, the home listener on TCP port 8083 and the DNS records
are new. TLS and the public ports 80/443 stay on the existing Caddy; do not add another listener
on those ports.

| | Expense Splitter | Secret Santa |
|---|---|---|
| Host | `expense-splitter.trettstadt.de` | `secret-santa.trettstadt.de` |
| Home listener (only on `wg0`) | `10.100.0.2:8082` | `10.100.0.2:8083` |
| Backend `TRUST_PROXY` | `loopback` | `1` (the app accepts only whole numbers) |

## Configuration

- `../docker/Caddyfile` adds the Secret Santa site block and overwrites `X-Forwarded-For` with the
  client address seen by the public Caddy.
- `nix-config/secret-santa.nix` serves the app on `http://secret-santa.trettstadt.de:8083`,
  allowed only on interface `wg0`. The home Caddy resolves the client address from the trusted
  tunnel peer `10.100.0.1/32` and passes only that address to the backend, so the backend's rate
  limits (`TRUST_PROXY=1`) count individual clients. The `wg0` interface and Caddy's
  `trusted_proxies` setting come from `nix-config/expense-splitter.nix`; keep that module enabled.

The Hetzner Cloud Firewall needs no change (80/443 and UDP 51820 are already open), so no
`pulumi up` is required. The Caddyfile change is not part of the Astro auto-deploy path; copy it
by hand as described below.

## Rollout (in this order)

1. Deploy `nix-config` with `publicIngress = true` in `secret-santa.nix`. The direct HTTPS virtual
   host on the home server keeps serving the app over IPv6 while the gateway is prepared. Check
   the home listener from the CX23:

   ```sh
   curl -H 'Host: secret-santa.trettstadt.de' http://10.100.0.2:8083/api/health
   ```

2. Copy the Caddyfile and validate it. Do not reload yet: while the DNS records still point to the
   home server, Caddy could not obtain a certificate for the new site.

   ```sh
   CX23_IPV4='replace-with-the-CX23-public-IPv4'
   scp docker/Caddyfile root@"$CX23_IPV4":/opt/portfolio-web/Caddyfile
   ssh root@"$CX23_IPV4" 'cd /opt/portfolio-web && docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile'
   ssh root@"$CX23_IPV4" 'cd /opt/portfolio-web && docker compose exec -T caddy wget -qO- --header="Host: secret-santa.trettstadt.de" http://10.100.0.2:8083/api/health'
   ```

3. At the DNS provider, set the A record for `secret-santa.trettstadt.de` to the CX23's public
   IPv4 (`<CX23_IPV4>`) and the AAAA record to its public IPv6 (`<CX23_IPV6>`). Before the cutover
   the AAAA record points to the home server and there is no A record. Keep the home public
   ingress enabled during propagation. Once both records resolve to the CX23, reload its existing
   Caddy container so it can obtain the certificate:

   ```sh
   ssh root@"$CX23_IPV4" 'cd /opt/portfolio-web && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile'
   curl --resolve "secret-santa.trettstadt.de:443:$CX23_IPV4" \
     https://secret-santa.trettstadt.de/api/health
   ```

4. After the app works through the CX23 and its certificate is issued, set `publicIngress = false`
   in `nix-config/secret-santa.nix` and deploy once more. That removes the temporary direct HTTPS
   virtual host on the home server; the WireGuard-only listener at `10.100.0.2:8083` remains.

## Rollback

Set `publicIngress = true` on NixOS, remove the A record and restore the AAAA record to the home
server. Remove the Secret Santa site block from the CX23 Caddyfile and reload Caddy. The WireGuard
tunnel can stay running without affecting the other sites.
