# Changelog — GuardAsli

## is0.1.0 — 2026-09-25 — FINAL

### Ops fixes: SSL state, welcome page, service port
- `guardasli status` now detects a Let's Encrypt certificate (previously only
  the self-signed path was checked, so an issued cert showed "not configured")
- `ssl_issue` records the real cert path (`/etc/letsencrypt/live/<domain>`)
- nginx config is now `default_server` on port 80, removes the stock welcome
  site (conf.d/default.conf) and installs itself into conf.d on distros whose
  nginx.conf has no sites-enabled include — "Welcome to nginx" is over
- sudo is resolved once at the top of guardasli (`${SUDO:-}` was always empty
  when run as non-root)
- systemd unit and nohup fallback export PORT; the app now binds the port
  nginx actually proxies to
- 3 new nginx render tests (default_server, welcome removal, conf.d fallback)

### Provisioning runtime (was the biggest gap)
- Real executor: `provisionWorker.processDueProvisions` runs every minute via cron
- Stale-running requeue (worker crash recovery) + exponential backoff to `dead`
- Full tenant→server→provider validation; cross-tenant providers refused
- Provider credentials decrypted only in action memory; real upstream `createUser`
- Subscription activates (`provisioned`) + buyer's role-scoped login link sent
- 7 E2E tests driving real handlers with only the network edge mocked

### API keys on REST
- `/api/v1/panel/{overview,users,subscriptions}` authenticate with `Authorization: Bearer ga_…`
- Prefix lookup → hash → status → expiry → scope (`panel:read`); `lastUsedAt` stamped
- Missing/unknown → 401; revoked/expired/out-of-scope → 403, standard error contract
- API keys tab in the dashboard: create (raw value shown once), list, revoke
- 13 tests including cross-tenant isolation through the real HTTP handler

### Installer & ops fixes (field-reported)
- SSL: HTTP-only pre-render so the ACME challenge passes; real certbot errors + checklist;
  `PUBLIC_URL` switched to https after success (Telegram rejects http webhooks)
- `guardasli telegram` is a real flow now: token + admin numeric ID → encrypted save → webhook
  (`scripts/bot-bootstrap.mjs` replaces the dead env-token stub)
- `sync-convex-env` reads BOTH `.env` (VPS installer) and `.env.local` (wizard) — secrets
  actually reach the deployment; `GUARDASLI_MAIN_DOMAIN` added to the synced keys
- `convex deploy` failures print the real error with targeted hints

### Housekeeping
- Docs split by language: `docs/en/*` and `docs/fa/*`, all links updated
- `/api/v1/version` serves the live version snapshot (no drift)
- Test-count claims in docs corrected; release-check covers the new layout

## is0.0.1 — 2026-09-22 — FINAL
- Bot admin identified by numeric Telegram ID; if unset, the first `/admin` sender claims it
- Web commands: `/admin`, `/id`, `/me`, `/botinfo`, `/bot on|off`, `/setadmin`, `/token`, `/miniapp`, `/webhook`, `/stats`, `/broadcast`
- Full bot management from the bot itself AND from the web admin panel (Bot & Mini App tab)
- Mini App URL + menu button settable from web panel or `/miniapp` command
- Webhook auto-setup from web panel or `/webhook` command (secret validated)
- Bot token rotation from the bot (`/token`), stored AES-256-GCM encrypted
- Broadcast to linked users with per-send failure isolation

## is0.0.1 — 2026-09-22 — FINAL

### Security
- AES-256-GCM + HKDF-SHA256 (Node `hkdfSync`), purpose-derived keys, AAD, envelope `v3` + `kid`
- Production: MASTER ≥32, AEAD_SALT required, TOKEN_PEPPER required
- scrypt N=32768 versioned envelopes; strong password policy
- Session SHA-256 + pepper; fail-closed in production
- Side-channel: constant-time compares, login failure delay, dummy scrypt on unknown user
- KMS envelope: local / env_kek / http proxy to cloud KMS
- CORS allowlist, webhook rate limits, upload MIME/size, CSP, redacted APIs
- Card PAN encrypted at rest; only last4 in responses
- Ledger idempotency — wallet never double-credited

### Platform
- Multi-tenant Convex control-plane, hierarchical RBAC
- Wallet + immutable ledger
- Payments: Admin manual, Card-to-card, CubePay, Tetraminator
- Billing, plans, features, custom purchase, referrals
- Provider adapters (four upstream API families)
- Telegram bot webhook + Mini App auth
- App builder queue, jobs, crons (jobs + session purge)
- Domains, API keys, backups (encrypted flag enforced), monitoring hooks
- Wizard installer (`bun run wizard`), CLI, production gates

### Product
- **GuardAsli** by **AsliCode**
- Component versions `is0.1.0`
- Bilingual documentation (EN/FA)
