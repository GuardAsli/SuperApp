# GuardAsli

**Product:** GuardAsli · **Developer:** AsliCode · **Release:** is0.0.1

Control-plane for sales, wallet, payments, resellers, Telegram, and provisioning.

## One-line wizard (recommended)

```bash
git clone https://github.com/GuardAsli/SuperApp.git && cd SuperApp && bun run wizard
```

The wizard installs dependencies, generates secrets into `.env.local`, runs typecheck/tests/build, and prints bootstrap steps.

## Manual quick start

```bash
bun install
cp .env.example .env.local   # fill secrets or use wizard
bunx convex dev             # set VITE_CONVEX_URL from output
bunx convex run authActions:bootstrapAdminAction '{"username":"admin","password":"Abcd1234!xyz"}'
bun run dev
```

## Production env

```bash
export GUARDASLI_ENV=production
export GUARDASLI_MASTER_SECRET="$(openssl rand -hex 32)"
export GUARDASLI_TOKEN_PEPPER="$(openssl rand -hex 32)"
export GUARDASLI_AEAD_SALT="$(openssl rand -hex 32)"
export GUARDASLI_CORS_ORIGINS=https://your-domain.com
export GUARDASLI_PUBLIC_URL=https://your-domain.com
```

## Docs

- [Docs.md](Docs.md) / [Docs.fa.md](Docs.fa.md)
- [Learn.md](Learn.md) / [Learn.fa.md](Learn.fa.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/PAYMENTS.md](docs/PAYMENTS.md)

## Identity

Core product name and developer are fixed: **GuardAsli** by **AsliCode**. Component versions use `isMAJOR.MINOR.PATCH`.
