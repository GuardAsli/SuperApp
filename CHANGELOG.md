# Changelog — GuardAsli

## is0.0.1 — 2026-09-22

### Security
- AES-256-GCM with HKDF-SHA256 key derivation and AAD binding
- scrypt N=32768 password hashing; strong Super Admin policy
- Session tokens: SHA-256 only (no weak fallback); fail-closed without Web Crypto
- Timing-safe Telegram Mini App HMAC verification
- Unbiased secure credential generation

### Platform
- Multi-tenant Convex schema, RBAC, wallet ledger, four payment methods
- CubePay + Tetraminator adapters with verify-before-credit
- Provider adapters: 3X-UI, Sanaei, PasarGuard, Rebecca
- Telegram bot webhook + Mini App auth
- App builder queue (android/web)
- Background job worker + cron
- CLI installer, CI, bilingual docs

### Product
- GuardAsli by AsliCode — component versions is0.0.1
