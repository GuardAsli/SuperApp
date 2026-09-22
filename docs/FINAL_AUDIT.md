# GuardAsli is0.0.1 — Final Audit

**Product:** GuardAsli · **Developer:** AsliCode · **Status:** final

## Verification matrix

| Area | Status |
|---|---|
| Brand purity (GuardAsli / AsliCode only) | Pass |
| Modular versions is0.0.1 | Pass |
| Auth scrypt + lockout + rate limit | Pass |
| Session pepper fail-closed in prod | Pass |
| AES-256-GCM + HKDF purpose + kid v3 | Pass |
| Side-channel login / telegram | Pass |
| Envelope KMS local/env/http | Pass |
| Wallet + ledger idempotent | Pass |
| Payments 4 methods + no double credit | Pass |
| RBAC + multi-tenant scope | Pass |
| CORS allowlist / CSP / upload limits | Pass |
| Production env hard gate | Pass |
| Wizard installer | Pass |
| Unit tests (core/payments/crypto/kms) | Pass |
| Docs FA/EN | Pass |

## Known non-bugs (ops)

- Convex `_generated` types require `bunx convex dev` locally for full IDE types.
- Cloud KMS needs your wrap proxy when `GUARDASLI_KMS_MODE=http`.
- E2E against live providers needs real API keys.

## Ship command

```bash
bun run wizard
bun run ci
bun run release-check
bun run prod-env   # after setting production secrets
```
