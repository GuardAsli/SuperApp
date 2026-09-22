# GuardAsli

**Product:** GuardAsli · **Developer:** AsliCode · **Release:** **is0.0.1 FINAL**

Control-plane for sales, wallet, payments, resellers, Telegram, and provisioning.

Completion record: **[FINAL_AUDIT.md](FINAL_AUDIT.md)**

## One-line install

```bash
git clone https://github.com/GuardAsli/SuperApp.git && cd SuperApp && bun run wizard
```

## After wizard

```bash
bunx convex dev
# Copy VITE_CONVEX_URL into .env.local
# Mirror secrets into Convex Dashboard → Environment Variables

bunx convex run authActions:bootstrapAdminAction \
  '{"username":"admin","password":"Abcd1234!xyz"}'

bun run dev
```

Open `http://127.0.0.1:5173` — default UI language: Persian.

## Production

```bash
export GUARDASLI_ENV=production NODE_ENV=production
export GUARDASLI_MASTER_SECRET="$(openssl rand -hex 32)"
export GUARDASLI_TOKEN_PEPPER="$(openssl rand -hex 32)"
export GUARDASLI_AEAD_SALT="$(openssl rand -hex 32)"
export GUARDASLI_CORS_ORIGINS=https://your-domain.com
export GUARDASLI_PUBLIC_URL=https://your-domain.com
bun run prod-start
bunx convex deploy
```

## Docs

| Doc | |
|---|---|
| [FINAL_AUDIT.md](FINAL_AUDIT.md) | Completion & security sign-off |
| [Docs.md](Docs.md) / [Docs.fa.md](Docs.fa.md) | Reference |
| [Learn.md](Learn.md) / [Learn.fa.md](Learn.fa.md) | Guides |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model |
| [docs/PRODUCTION.md](docs/PRODUCTION.md) | Production env |
| [docs/KMS_AND_SIDECHANNEL.md](docs/KMS_AND_SIDECHANNEL.md) | KMS + timing |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | Payments |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Operations |

## Identity

Core names are fixed: **GuardAsli** by **AsliCode**. Versions: `isMAJOR.MINOR.PATCH`.
