# GuardAsli — Security (is0.0.1 hardened)

**Product:** GuardAsli · **Developer:** AsliCode

## Cryptography

| Asset | Algorithm | Notes |
|---|---|---|
| Secrets at rest | AES-256-GCM | Key via **HKDF-SHA256**; envelope `v2`; optional **AAD** (user\|provider\|purpose) |
| Legacy secrets | AES-256-GCM v1 | Read-only decrypt with SHA-256(master) |
| Passwords | scrypt N=32768,r=8,p=1,keylen=64 | salt 16B; `timingSafeEqual` |
| Session / API key lookup | SHA-256(pepper:token) | **No weak fallback**; fail-closed without `crypto.subtle` |
| Telegram Mini App | Official HMAC-SHA256 | Hash compare **timing-safe** on hex buffers |
| Webhook bot secret | timing-safe string compare | |
| RNG credentials | rejection sampling | No modulo bias |

## Environment

- `GUARDASLI_MASTER_SECRET` — required ≥16 chars for payment/bot decrypt
- `GUARDASLI_TOKEN_PEPPER` — optional but recommended ≥16 chars for session hash binding
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

## Outbound

- SSRF checks on provider/payment URLs (`src/core/ssrf.ts`)
