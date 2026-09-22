# GuardAsli — Security

**Product:** GuardAsli · **Developer:** AsliCode · **Release:** is0.0.1

## Auth

- scrypt password envelopes
- Session tokens hashed (SHA-256 + pepper); raw tokens never stored
- Refresh rotation; revoke one / all
- Login lockout after 5 failures (15 minutes)
- Public register forced to role `user`

## Authorization

- Server-side RBAC only
- `requireTenantScope` for cross-tenant prevention
- Feature access: global ∧ plan ∧ role ∧ tenant ∧ ownership ∧ quota

## Secrets

- `GUARDASLI_MASTER_SECRET` for AES-256-GCM
- Bot tokens, payment keys encrypted at rest
- Logs: secret field redaction
- API errors: no stack traces in production messages

## Network

- SSRF validation on outbound URLs
- Telegram webhook secret token (timing-safe compare)
- Payment webhooks enqueue only; verify server-side

## Payments

- No double credit (idempotent ledger keys)
- Amount and provider ID match required
- Disabled methods blocked server-side
