# Changelog — GuardAsli

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
- Provider adapters (3X-UI family and related)
- Telegram bot webhook + Mini App auth
- App builder queue, jobs, crons (jobs + session purge)
- Domains, API keys, backups (encrypted flag enforced), monitoring hooks
- Wizard installer (`bun run wizard`), CLI, production gates

### Product
- **GuardAsli** by **AsliCode**
- Component versions `is0.0.1`
- Bilingual documentation (EN/FA)
- See `FINAL_AUDIT.md` for the completion record
