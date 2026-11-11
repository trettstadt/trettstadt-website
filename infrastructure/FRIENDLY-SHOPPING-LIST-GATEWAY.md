# Friendly Shopping List IPv4 gateway

Friendly Shopping List (`einkauf.trettstadt.de`) uses the same CX23 gateway and the same WireGuard
tunnel as the Expense Splitter and Secret Santa. The one-time tunnel setup, the MTU note and the
key handling in [`EXPENSE-SPLITTER-WIREGUARD.md`](EXPENSE-SPLITTER-WIREGUARD.md) apply unchanged
and are not repeated here. TLS and the public ports 80/443 stay on the existing Caddy; do not add
another listener on those ports.

Unlike the other two apps, Friendly Shopping List has no login of its own: it sits behind Authelia.
IPv4-only clients can only use it if they can also reach the Authelia login, so
`auth.trettstadt.de` goes through the gateway as well.

| | Friendly Shopping List | Authelia login |
|---|---|---|
| Host | `einkauf.trettstadt.de` | `auth.trettstadt.de` |
| Home listener (only on `wg0`) | `10.100.0.2:8084` | `10.100.0.2:8085` |
| Served by | the app, behind Authelia `forward_auth` on the home Caddy | Authelia on `localhost:9091` |

## Configuration

- `../docker/Caddyfile` adds the two site blocks and overwrites `X-Forwarded-For` with the client
  address seen by the public Caddy.
- `nix-config/friendly-shopping-list.nix` serves the app on `http://einkauf.trettstadt.de:8084` and
  `nix-config/authelia.nix` serves Authelia on `http://auth.trettstadt.de:8085`, both allowed only
  on interface `wg0`. The `wg0` interface and Caddy's `trusted_proxies` setting for the tunnel peer
  `10.100.0.1/32` come from `nix-config/expense-splitter.nix`; keep that module enabled.
- The app believes the identity headers `Remote-User` and `Remote-Name`. The home Caddy removes
  whatever the client sent and sets them from Authelia's answer. The public Caddy does not touch
  them, so a client cannot supply them through the gateway either.
- Authelia's `access_control` already covers `*.trettstadt.de`; nothing changes there.
- The public Caddy sees the real IPv4 and IPv6 address of every visitor (it runs in host network
  mode, see [Real client address](EXPENSE-SPLITTER-WIREGUARD.md#real-client-address-ipv4-and-ipv6)),
  so `remote_ip` in Authelia's log is the visitor's own address for both IP versions and a lockout
  by address can rely on it. The probe that shows it is described there.

The Hetzner Cloud Firewall needs no change (80/443 and UDP 51820 are already open), so no
`pulumi up` is required. The Caddyfile change is not part of the Astro auto-deploy path; copy it
by hand as described below.

## What the gateway means for the Authelia login

- The CX23 ends TLS for `auth.trettstadt.de`, so it sees passwords, 2FA codes and the Authelia
  session cookie (domain `trettstadt.de`) in clear text.
- Logins to every app behind Authelia (accounting, rTorrent, Friendly Shopping List, and Open WebUI
  over OIDC) now depend on the CX23 and the tunnel. A session that already exists keeps working
  while the tunnel is down, because the home Caddy asks Authelia on `localhost`.

## Rollout (in this order)

1. Deploy `nix-config` with `publicIngress = true` in `friendly-shopping-list.nix` and
   `authelia.nix`. The direct HTTPS virtual hosts on the home server keep serving both names over
   IPv6 while the gateway is prepared. Check the home listeners from the CX23. They trust the tunnel
   peer and do not add `X-Forwarded-Proto` and `X-Forwarded-Host` themselves, so send them as the
   public Caddy does; without them Authelia answers `400`:

   ```sh
   curl -i -H 'Host: einkauf.trettstadt.de' -H 'X-Forwarded-Proto: https' \
     -H 'X-Forwarded-Host: einkauf.trettstadt.de' http://10.100.0.2:8084/api/me     # 302 to auth.trettstadt.de
   curl -H 'Host: auth.trettstadt.de' -H 'X-Forwarded-Proto: https' \
     -H 'X-Forwarded-Host: auth.trettstadt.de' http://10.100.0.2:8085/api/health    # {"status":"OK"}
   ```

2. Copy the Caddyfile and validate it. Do not reload yet: while the DNS records still point to the
   home server, Caddy could not obtain certificates for the new sites.

   ```sh
   CX23_IPV4='replace-with-the-CX23-public-IPv4'
   scp docker/Caddyfile root@"$CX23_IPV4":/opt/portfolio-web/Caddyfile
   ssh root@"$CX23_IPV4" 'cd /opt/portfolio-web && docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile'
   ssh root@"$CX23_IPV4" 'cd /opt/portfolio-web && docker compose exec -T caddy wget -qO- --header="Host: auth.trettstadt.de" --header="X-Forwarded-Proto: https" --header="X-Forwarded-Host: auth.trettstadt.de" http://10.100.0.2:8085/api/health'
   ```

3. At the DNS provider, set the A record of `einkauf.trettstadt.de` and `auth.trettstadt.de` to the
   CX23's public IPv4 (`<CX23_IPV4>`) and the AAAA record to its public IPv6 (`<CX23_IPV6>`). Before
   the cutover the AAAA records point to the home server. Keep the home public ingress enabled
   during propagation. Reload the existing Caddy container as soon as the records are switched:
   until it has loaded the site blocks and fetched the certificates, a client that already has the
   new records gets a TLS error (`internal error`), and for `auth` that stops every new login.
   Change `auth.trettstadt.de` last, and have the reload command ready:

   ```sh
   ssh root@"$CX23_IPV4" 'cd /opt/portfolio-web && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile'
   curl --resolve "auth.trettstadt.de:443:$CX23_IPV4" https://auth.trettstadt.de/api/health
   curl -i --resolve "einkauf.trettstadt.de:443:$CX23_IPV4" \
     -H 'Remote-User: mallory' -H 'Remote-Name: Mallory' https://einkauf.trettstadt.de/api/me
   ```

   The first command prints `{"status":"OK"}`. The second must answer `302` to
   `auth.trettstadt.de`, never the app's JSON: the forged identity headers must not get through.

4. After both names work through the CX23 and their certificates are issued, and once the DNS TTL
   has passed, set `publicIngress = false` in `nix-config/friendly-shopping-list.nix` and
   `nix-config/authelia.nix` and deploy once more. That removes the temporary direct HTTPS virtual
   hosts on the home server; the WireGuard-only listeners at `10.100.0.2:8084` and `:8085` remain.

## Rollback

Set `publicIngress = true` in both nix-config modules, remove the A records and restore the AAAA
records of both names to the home server. Remove the two site blocks from the CX23 Caddyfile and
reload Caddy. The WireGuard tunnel can stay running without affecting the other sites.
