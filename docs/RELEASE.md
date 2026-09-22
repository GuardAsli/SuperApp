# GuardAsli is0.0.1 — Release gate

**Product:** GuardAsli  
**Developer:** AsliCode  
**Format:** `isMAJOR.MINOR.PATCH`  
**Components:** see `src/core/identity.ts` → `COMPONENT_VERSIONS`

## Implemented in this release

| Area | Status |
|---|---|
| Core identity / versioning | Done |
| Convex schema multi-tenant | Done |
| Auth + sessions + scrypt | Done |
| RBAC + tenant scope | Done |
| Wallet + immutable ledger | Done |
| 4 payment methods + adapters | Done |
| Payment verify worker + cron | Done |
| Billing purchase + provision queue | Done |
| Provider adapters (xui/sanaei/pasarguard/rebecca) | Done (capability-aware) |
| Provider/server CRUD API | Done |
| Telegram bot webhook + Mini App auth | Done |
| Web dashboard FA/EN | Done |
| App builder + build queue | Done (android/web; no fake iOS on Linux) |
| Domains pending DNS verify | Done |
| CLI installer menu | Done |
| CI (typecheck/test/build) | Done |
| Docs EN/FA + payments/security | Done |

## Operator checklist (production)

1. `bun install && bun convex dev --once && bun convex deploy`
2. Set `GUARDASLI_MASTER_SECRET`, `GUARDASLI_PUBLIC_URL`
3. `bootstrapAdminAction` once
4. Super Admin: enable payment methods
5. Configure providers + plans
6. `bun test && bun typecheck && bun run build`

## Honest limits

- Full E2E against live CubePay/Tetraminator requires real credentials.
- iOS dedicated builds require macOS/Xcode (explicitly not claimed on Linux).
- Nginx/ACME SSL issuance is documented in CLI; live cert issuance needs DNS credentials on the host.
