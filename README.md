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
  <a href="docs/RUNBOOK.md">Runbook</a> ·
  <a href="docs/PAYMENTS.md">Payments</a> ·
  <a href="docs/SECURITY.md">Security</a> ·
  <a href="docs/RELEASE.md">Release</a>
</p>

---

**GuardAsli** is a production control-plane by **AsliCode** for selling and operating proxy/VPN services: multi-tenant RBAC, wallet ledger, four payment channels, provider adapters, Telegram bot/Mini App, web dashboard, and independent component versions (`isMAJOR.MINOR.PATCH`).

Core identity is fixed: **GuardAsli** / **AsliCode**.

## One-line install

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli && sh ./scripts/cli.mjs install
```

## Confident production path

```bash
cp .env.example .env.local
# set GUARDASLI_MASTER_SECRET=$(openssl rand -hex 32)
# set VITE_CONVEX_URL after convex login

bun install
bun run ci                          # typecheck + tests + build
bun scripts/release-check.mjs       # release gate files
bunx convex login && bunx convex deploy
bunx convex run authActions:bootstrapAdminAction \
  '{"username":"admin","password":"YOUR_STRONG_PASSWORD_12+"}'
bun run preview                     # or serve dist/
```

Full checklist: **[docs/RUNBOOK.md](docs/RUNBOOK.md)**.

## Stack

| Layer | Tech |
|---|---|
| Backend | Convex (schema, queries, mutations, actions, cron) |
| Frontend | React + Vite + Tailwind |
| Runtime tests | Bun |
| CLI | `scripts/cli.mjs` |

## Capabilities (implemented)

| Area | Detail |
|---|---|
| Roles | super_admin · admin · reseller · sub_reseller · user — **server-side only** |
| Features | 18 keys · 6-check access chain |
| Wallet | Append-only ledger · idempotent credits/debits |
| Payments | admin_manual · card_to_card · CubePay · Tetraminator |
| Rule | Webhook **never** credits wallet; inquiry/verify required |
| Providers | 3X-UI · Sanaei · PasarGuard · Rebecca |
| Telegram | Webhook secret + Mini App HMAC initData |
| Jobs | payment_verify · build · bot_command · domain_dns_verify |
| API | `/api/v1` · OpenAPI · CORS · safe errors |

## License

Proprietary — **AsliCode**. All rights reserved.
