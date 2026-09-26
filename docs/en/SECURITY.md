# GuardAsli — Security (zero open holes for is0.1.0)

**Product:** GuardAsli · **Developer:** AsliCode

## Closed surface checklist

| Control | Status |
|---|---|
| AES-256-GCM + HKDF + AAD | Done |
| scrypt passwords + strong policy all users | Done |
| Session SHA-256 only, fail-closed | Done |
| Telegram HMAC timing-safe | Done |
| Login/register/refresh rate limits | Done |
| Account lockout 5 fails / 15m | Done |
| CORS allowlist (env) | Done |
| Webhook rate limits | Done |
| Upload type + size gate | Done |
| Card PAN encrypted; API masked only | Done |
| pendingPayments redacted | Done |
| Session expiry purge cron | Done |
| systemSettings Super Admin + audit | Done |
| Backup must be encrypted | Done |
| Domain verify not self-asserted | Done |
| Frontend CSP meta | Done |
| SSRF outbound checks | Done |
| Idempotent wallet credit | Done |

## Env (required in production)

```bash
GUARDASLI_MASTER_SECRET=$(openssl rand -hex 32)
GUARDASLI_TOKEN_PEPPER=$(openssl rand -hex 32)
GUARDASLI_CORS_ORIGINS=https://app.example.com
GUARDASLI_PUBLIC_URL=https://app.example.com
```

Never put secrets in `VITE_*`.

## Residual operational (not code holes)

- Rotate master key requires re-encrypt of envelopes (ops procedure).
- Prefer HttpOnly cookies for sessions in a future major if browser-only clients dominate.
- Keep Convex dashboard access MFA + least privilege.
