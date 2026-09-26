# GuardAsli — API `/api/v1`

**Version:** `is0.0.2` · **Developer:** AsliCode · **Format:** `isMAJOR.MINOR.PATCH`

## Standard error format

Every error response has exactly these four fields:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Short, actionable explanation",
  "details": {},
  "requestId": "ga_..."
}
```

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid input |
| `UNAUTHENTICATED` | 401 | Invalid token or signature |
| `QUOTA_EXCEEDED` | 402 | Plan quota exhausted |
| `FORBIDDEN` | 403 | Role not allowed |
| `NOT_FOUND` | 404 | Not a route or resource |
| `CONFLICT` | 409 | State conflict |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Server error — no internal details |

`requestId` is returned in every response and is searchable in the audit log.
Stack traces are never exposed.

## Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/v1/health` | GET | Service health with a real DB probe |
| `/api/v1/ping` | GET | Liveness check |
| `/api/v1/version` | GET | Live component versions |
| `/api/v1/openapi.json` | GET | OpenAPI 3.1 specification |
| `/api/v1/panel/overview` | GET | Tenant overview — 🔑 API key (`panel:read`) |
| `/api/v1/panel/users` | GET | Tenant users — 🔑 API key (`panel:read`) |
| `/api/v1/panel/subscriptions` | GET | Latest 100 tenant subscriptions — 🔑 API key (`panel:read`) |
| `/api/v1/auth/register` | POST | Register (rate-limited + scrypt) |
| `/api/v1/auth/login` | POST | Login — returns accessToken + refreshToken |
| `/api/v1/auth/refresh` | POST | Rotate the session with a refresh token |
| `/api/v1/telegram/webhook/{botConfigId}` | POST | Per-tenant bot webhook |
| `/api/v1/payments/tetraminator/webhook?order_id=` | POST | Payment verification queue |
| `/api/v1/payments/cubepay/callback?order_id=` | POST | Payment verification queue |

### API key authentication

The `panel/*` routes authenticate with an API key created in the dashboard
(API keys tab) — not with a user session:

```bash
curl -H "Authorization: Bearer ga_xxxxxxxxxxxxxxxxxxxx" \
  https://panel.example.com/api/v1/panel/overview
```

- The raw key is shown exactly once at creation; only a hash is stored.
- Missing/unknown key → `401 UNAUTHENTICATED`.
- Revoked, expired or out-of-scope key → `403 FORBIDDEN`.
- Required scope: `panel:read`.
- `lastUsedAt` is stamped on every use.
- Data is always scoped to the key's tenant — a key never crosses tenant boundaries.

### Example: `GET /api/v1/version`

```bash
curl https://panel.example.com/api/v1/version
```

```json
{
  "product": "GuardAsli",
  "developer": "AsliCode",
  "version": "is0.0.2",
  "format": "isMAJOR.MINOR.PATCH",
  "components": {
    "core": "is0.0.2", "api": "is0.0.2", "web": "is0.0.2", "bot": "is0.0.2",
    "miniapp": "is0.0.2", "mainapp": "is0.0.2", "dedicated": "is0.0.2",
    "installer": "is0.0.2", "payment": "is0.0.2", "providers": "is0.0.2",
    "build": "is0.0.2", "releases": "is0.0.2"
  },
  "requestId": "ga_..."
}
```

## Webhook security

**Telegram bot:** each tenant has its own `webhookSecret`. Telegram sends it in the
`X-Telegram-Bot-Api-Secret-Token` header; an invalid signature is rejected with 401.

**Payments:** a webhook never credits a wallet directly. Every event is enqueued as a
`payment_verify` job; credit happens only after adapter verification (status, payment
id and amount) via `acceptProviderPayment` with an idempotency key (anti-replay).

---

© AsliCode — GuardAsli `is0.0.2`
