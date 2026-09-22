<p align="center">
  <img src="public/logo.svg" alt="GuardAsli — AsliCode" width="520" />
</p>

<h1 align="center">GuardAsli</h1>

<p align="center">
  <b>Version:</b> <code>is0.0.1</code> ·
  <b>Developer:</b> AsliCode ·
  <b>Format:</b> <code>isMAJOR.MINOR.PATCH</code>
</p>

<p align="center">
  <a href="README.fa.md">فارسی</a> ·
  <a href="Docs.md">Docs</a> ·
  <a href="Learn.md">Learn</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/API.md">API</a> ·
  <a href="docs/BRANDING.md">Branding</a>
</p>

---

**GuardAsli** is the control-plane for selling and operating proxy/VPN services — built by **AsliCode**.

One backend powers a web dashboard, Telegram bot, Telegram Mini App, and tenant-branded apps, with reseller hierarchies, an append-only wallet ledger, four payment channels, and four upstream providers.

| Field | Value |
|---|---|
| Product | **GuardAsli** |
| Developer | **AsliCode** |
| Version format | `isMAJOR.MINOR.PATCH` |
| Current release | `is0.0.1` |

Core identity is fixed. No tenant or role can rename or hide it.

## One-line wizard install

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli && sh ./scripts/cli.mjs install
```

This runs the interactive **guardasli** wizard: system check → dependencies → environment bootstrap.

After install:

```bash
sh ./scripts/cli.mjs doctor       # health checks
sh ./scripts/cli.mjs reconfigure  # main domain + admin
sh ./scripts/cli.mjs status       # version & path
bun convex dev --once && bun dev # link Convex + start
```

## Manual quick start

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli
bun install
bun convex dev --once
bun dev
```

Create the first super admin:

```bash
bunx convex run authActions:bootstrapAdminAction '{"username":"admin","password":"<strong-password>"}'
```

## Capabilities

| Area | Detail |
|---|---|
| Roles | `super_admin`, `admin`, `reseller`, `sub_reseller`, `user` — server-side only |
| Features | 18 keys, 6-check chain: global → plan → role → tenant → ownership → quota |
| Wallet | Append-only numbered ledger, idempotent entries |
| Payments | Manual credit · card-to-card · CubePay · Tetraminator (anti-replay) |
| Providers | 3X-UI, Sanaei, PasarGuard, Rebecca |
| Channels | Telegram bot (secret token) + Mini App (HMAC `initData`) |
| API | `/api/v1` · OpenAPI 3.1 · uniform errors |
| Ops | Wizard CLI, jobs with backoff, audit log, backups |

## Production

```bash
bun run build
bun convex deploy
```

Set `GUARDASLI_MASTER_SECRET` and payment credentials via the admin panel.

## Documentation

| Document | Purpose |
|---|---|
| [README.fa.md](README.fa.md) | Persian overview |
| [Docs.md](Docs.md) | Technical reference (EN) |
| [Docs.fa.md](Docs.fa.md) | Technical reference (FA) |
| [Learn.md](Learn.md) | Tutorials & walkthrough (EN) |
| [Learn.fa.md](Learn.fa.md) | Tutorials & walkthrough (FA) |
| [Architecture](docs/ARCHITECTURE.md) | Core vs customization, purchase flow, security |
| [API](docs/API.md) | Endpoints, errors, webhooks |
| [Branding](docs/BRANDING.md) | Tenant fields and core boundary |
| [Audit](docs/AUDIT.md) | Repository audit history |

## License

Proprietary software of **AsliCode**. All rights reserved.
