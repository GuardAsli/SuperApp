# GuardAsli — Security (is0.0.1 hardened)

**Product:** GuardAsli · **Developer:** AsliCode

## Cryptography

| Asset | Algorithm | Notes |
|---|---|---|
| Secrets at rest | AES-256-GCM | Key via **HKDF-SHA256**; envelope `v2`; optional **AAD** |
| Legacy secrets | AES-256-GCM v1 | Read-only decrypt with SHA-256(master) |
| Passwords | scrypt N=32768,r=8,p=1,keylen=64 | salt 16B; `timingSafeEqual` |
| Session / API key lookup | SHA-256(pepper:token) | **No weak fallback**; fail-closed |
| Telegram Mini App | Official HMAC-SHA256 | Hash compare **timing-safe** |
| Payment cards | AES-GCM + last4 only in clear | `cardAddAction`; API never returns full PAN |
| RNG credentials | rejection sampling | No modulo bias |

## Environment

- `GUARDASLI_MASTER_SECRET` — required ≥16 chars (prefer 32+ random bytes)
- `GUARDASLI_TOKEN_PEPPER` — recommended ≥16 chars
- Never expose either via `VITE_*`

## Auth policy

- Public register forced to role `user`
- Bootstrap Super Admin: min 12 chars + lower + upper + digit
- Lockout after 5 failed logins (15 minutes)
- Session TTL 7 days; refresh rotates hashes

## Payments

- Webhook never credits wallet
- Server inquiry/verify before ledger credit
- Idempotent ledger keys
- Provider secrets encrypted with AAD bound to user+provider
- Card PAN: encrypted via `cardAddAction`; queries return only masked last4

## Database security model

### Isolation

- Almost every business table carries `tenantId`
- Mutations/queries call `requireActor` + `requirePermission` + `requireTenantScope`
- Cross-tenant access denied unless actor is core tenant (`config.core`)
- Wallet ledger is append-only with sequential `seq` and optional `idempotencyKey`

### Sensitive columns (never plain to clients)

| Table | Sensitive field | Storage |
|---|---|---|
| users | passwordHash | scrypt envelope |
| sessions | tokenHash / refreshTokenHash | SHA-256 only |
| apiKeys | keyHash | hash only + prefix |
| userPaymentConfigs | credentialsEncrypted | AES-GCM envelope |
| providers | credentialsEncrypted | AES-GCM envelope |
| botConfigs | tokenEncrypted, webhookSecret | AES-GCM / random secret |
| paymentCards | numberEncrypted | AES-GCM; `number` holds masked only |
| paymentProviders | configEncrypted | AES-GCM |

### What is intentionally cleartext

- Usernames, roles, plan names, amounts, payment status (needed for ops)
- Card **last4** and owner display name (payment UX)
- Audit metadata (amounts, IDs) — no secrets

### Indexes used for security lookups

- `sessions.by_token`, `sessions.by_refresh`
- `ledgerEntries.by_idempotency`
- `payments.by_idempotency`, `payments.by_provider_payment`
- `users.by_username`, `apiKeys.by_prefix`

### Convex-specific notes

- `schemaValidation: true` rejects malformed writes
- No client-direct DB access; all paths go through Convex functions
- Internal queries that return envelopes (`getUserProviderEnvelope`, `getBotTokenEnvelope`) are **internal only**
- Public queries must map/redact (e.g. `cardList` → `publicCard`)

### Residual risks / ops

1. Backup blobs marked `encrypted: boolean` — ensure true + strong master before production backups
2. Purge expired sessions periodically (`by_status_expires`)
3. Rotate `GUARDASLI_MASTER_SECRET` requires re-encrypt of all envelopes
4. `systemSettings` is global — only Super Admin should write

## Outbound

- SSRF checks on provider/payment URLs (`src/core/ssrf.ts`)
