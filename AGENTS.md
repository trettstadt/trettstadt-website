# AGENTS.md

Compact guidance for OpenCode sessions working in this repo. Read together with `README.md` for architecture and deployment flow.

## Repository layout

This is a monorepo with three independent components. There is **no root package.json** — every command below targets a subdirectory.

- `astro-site/` — Astro 5 static site (AstroNano theme), the actual application. All frontend work happens here.
- `docker/` — production `docker-compose.yml` + `Caddyfile`. This is what runs on the Hetzner server at `/opt/portfolio-web`.
- `infrastructure/` — Pulumi IaC in Java (Gradle, Java 26) that provisions the Hetzner server. Stack name: `prod-web`.

## Commands

All frontend commands run from `astro-site/`:

```bash
cd astro-site
npm install
npm run dev          # local dev server
npm run build        # astro build — also serves as typecheck (Astro 5 type-checks on build)
npm run lint         # eslint .
npm run lint:fix     # eslint . --fix
```

There is **no test suite** and no separate `typecheck` script. Verification flow is `lint -> build`. The `@astrojs/check` dependency is present but not wired to a script — prefer `npm run build` for type verification to match CI.

Infrastructure commands run from `infrastructure/`:

```bash
cd infrastructure
./gradlew run            # equivalent to `pulumi up` via the application plugin
pulumi up --stack prod-web
```

## Conventions an agent would otherwise miss

- **Path alias `@*` → `./src/*`** (see `tsconfig.json`). Imports look like `@consts`, `@components/Container.astro`, `@layouts/PageLayout.astro`, `@lib/utils`, `@assets/deployment.svg`. Note `@consts` resolves to `src/consts.ts`, not a directory.
- **ESLint enforces double quotes and semicolons** (`.eslintrc.cjs`). Run `npm run lint:fix` before committing rather than reformatting by hand.
- **Site content is German**; code identifiers and most commit messages are English. Recent commits mix German prose with `fix:`/`docs:`/`feat:` prefixes — match the surrounding style.
- **`SITE.EMAIL` in `src/consts.ts` is intentionally obfuscated** as `tobias(AT)rettstadt.de` to deter scraping. Do not "fix" it to a real `mailto:` address.
- **AstroNano base theme**: structural components (`Container`, `Header`, `Footer`, `PageLayout`, `ArrowCard`, `Link`) come from the theme. Prefer extending over replacing.

## Content collections

Schemas are defined in `src/content/config.ts` (Zod). Three collections:

- `blog` — `src/content/blog/<slug>/index.md` (nested directory per post). Fields: `title`, `description`, `date`, optional `draft`.
- `projects` — `src/content/projects/<slug>.md`. Fields: `title`, `description`, `date`, optional `draft`, `demoURL`, `repoURL`.
- `work` — `src/content/work/<slug>.md`. Fields: `company`, `role`, `dateStart`, `dateEnd`. **`dateEnd` may be a `Date` or a string** (e.g. a year, or `"present"`); do not tighten the schema.

Entries with `draft: true` are filtered out at build time in `src/pages/index.astro` and `src/pages/blog/[...slug].astro`. Drafts are still type-checked but not routed.

Mermaid diagrams are rendered via the `astro-mermaid` integration (see `astro.config.mjs`) — fenced ` ```mermaid ` blocks in MDX/MD just work.

## Deployment

Triggered automatically on push to `main` **only when files under `astro-site/**` change** (see `.github/workflows/deploy.yml`). Flow:

1. Build Docker image from `astro-site/Dockerfile` (multi-stage: `node:20-alpine` build → `nginx:alpine` serving `dist/`).
2. Push to `ghcr.io/trettstadt/portfolio-astro:latest`.
3. SSH to prod server (`PROD_SERVER_IP` secret), `cd /opt/portfolio-web && docker compose pull && docker compose up -d`.

Changes to `docker/`, `infrastructure/`, or `README.md` do **not** trigger deploy. To roll out a `docker/` or Caddyfile change, run `docker compose up -d` on the server manually.

## Infrastructure

Pulumi project in `infrastructure/` (Java 26, Gradle). Entry point `com.trettstadt.App`, stack `prod-web`.

- `hcloud:token` and `portfolio-web:webSshPublicKey` are required config values. The token is stored as a Pulumi-encrypted secret in `Pulumi.prod-web.yaml` — **never commit plaintext secrets**; use `pulumi config set hcloud:token --secret` to rotate.
- Outputs: `serverIp`, `serverId`, `serverName`, `sshKeyName`.

## Security

- The production SSH user is `root`. Do not commit any private keys, server IPs, or tokens to the repo.
- `Pulumi.prod-web.yaml` is committed but uses Pulumi's built-in secret encryption — only modify via `pulumi config` commands.
