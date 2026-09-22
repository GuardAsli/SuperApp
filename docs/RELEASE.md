# GuardAsli is0.0.1 — Release confirmed

**Product:** GuardAsli  
**Developer:** AsliCode  
**Format:** `isMAJOR.MINOR.PATCH`  
**Gate date:** 2026-09-22

## Status: COMPLETE for is0.0.1

| Area | Status |
|---|---|
| Core identity / versions | Done |
| Schema multi-tenant | Done |
| Auth scrypt + sessions SHA-256 | Done |
| Crypto HKDF+AAD / timing-safe TG | Done |
| RBAC + tenant scope | Done |
| Wallet + ledger | Done |
| 4 payment methods + verify worker | Done |
| CubePay / Tetraminator adapters | Done |
| Providers + servers API | Done |
| Billing + provision queue | Done |
| Telegram bot + Mini App | Done |
| Web FA/EN dashboard | Done |
| Card-to-card receipt upload UI | Done |
| App builder queue | Done |
| Referrals | Done |
| Jobs cron | Done |
| OpenAPI 3.1 | Done |
| CLI + CI + RUNBOOK | Done |
| Docs EN/FA | Done |

## Run

```bash
bun install && bun run ci && bun run release-check
bunx convex deploy
bunx convex run authActions:bootstrapAdminAction '{"username":"admin","password":"Abcd1234!xyz"}'
```

Set `GUARDASLI_MASTER_SECRET` and optional `GUARDASLI_TOKEN_PEPPER` before payment/bot secrets.
