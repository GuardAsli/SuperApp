# GuardAsli is0.0.1 — Production Runbook

**Product:** GuardAsli · **Developer:** AsliCode

## 1. Prerequisites

- Linux x86_64 or arm64
- Bun 1.1+
- Outbound HTTPS
- Domain pointing to host (for SSL / webhooks)
- Convex account (backend)

## 2. Install

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli
cd guardasli
cp .env.example .env.local
# fill GUARDASLI_MASTER_SECRET (openssl rand -hex 32)
# fill VITE_CONVEX_URL after convex login

bun install
bunx convex login
bunx convex dev --once    # links project + pushes schema
# or production:
bunx convex deploy
```

## 3. Bootstrap Super Admin (once)

```bash
bunx convex run authActions:bootstrapAdminAction \
  '{"username":"admin","password":"CHANGE_ME_12chars_min"}'
```

Creates root tenant, feature flags (all off), four payment methods (all off).

## 4. First login

```bash
bun run build && bun run preview
# or: bun dev
```

Open web → Auth → login as bootstrap user.

## 5. Super Admin checklist

1. **Payment methods** → enable only what you use (`admin_manual`, `card_to_card`, `cubepay`, `tetraminator`)
2. **Feature flags** → enable WebApp / TelegramBot / etc. as needed
3. **Plans** → create volume or user plans
4. **Providers** → add 3X-UI / Sanaei / … with encrypted credentials
5. **Cards** (if card-to-card) → up to 10 destination cards
6. **Telegram** → set bot token in panel; set webhook to
   `{CONVEX_SITE_URL}/api/v1/telegram/webhook/{botConfigId}`
7. **Public URL** → `GUARDASLI_PUBLIC_URL` must match payment callbacks

## 6. Verify payments

- Webhook only enqueues `payment_verify`
- Cron every 1 min runs `workerActions.processDueJobs`
- Manual: Super Admin can call `paymentActions` verify via worker once

## 7. Health & CI

```bash
bun run ci          # typecheck + test + build
sh ./scripts/cli.mjs doctor
sh ./scripts/release-check.mjs
```

## 8. Backup

```bash
sh ./scripts/cli.mjs backup
```

Backups must remain encrypted; never put plaintext secrets in archives.

## 9. Incident

- Revoke sessions: `auth.revokeSession`
- Revoke API keys: `infra.apiKeyRevoke`
- Disable payment method globally if provider is compromised
- Check `audit.list` and job status (`dead` jobs)

## 10. Release tag

`RELEASE.json` + `COMPONENT_VERSIONS` must stay `is0.0.1` for this gate.
