# GuardAsli

**Product:** GuardAsli · **Developer:** AsliCode · **Release:** **is0.0.1 FINAL**

Control-plane for sales, wallet, payments, resellers, Telegram, and provisioning.

[FINAL_AUDIT.md](FINAL_AUDIT.md)

## Fully automatic path

```bash
git clone https://github.com/GuardAsli/SuperApp.git && cd SuperApp
bun run wizard    # deps + secrets + tests + try Convex + bootstrap
bun run up        # sync env + bootstrap + start UI (+ convex backend)
```

Open **http://127.0.0.1:5173** — login with credentials printed by wizard (also in `.env.local`).

### First time only (Convex account)

Convex requires a one-time browser login if you have never used it on this machine:

```bash
bunx convex login
bunx convex dev     # creates deployment; Ctrl+C after URL appears
bun run up
```

If you already have `CONVEX_DEPLOY_KEY`, set it before wizard — deploy stays non-interactive.

```bash
export CONVEX_DEPLOY_KEY=...
bun run wizard && bun run up
```

## Commands

| Command | Role |
|---|---|
| `bun run wizard` | Full install, no prompts |
| `bun run up` | Bring stack up automatically |
| `bun run bootstrap` | Super Admin only |
| `bun run sync-env` | Push secrets to Convex env |
| `bun run prod-start` | Production gate + CI |

## Production

```bash
export GUARDASLI_ENV=production NODE_ENV=production
export GUARDASLI_MASTER_SECRET="$(openssl rand -hex 32)"
export GUARDASLI_TOKEN_PEPPER="$(openssl rand -hex 32)"
export GUARDASLI_AEAD_SALT="$(openssl rand -hex 32)"
export GUARDASLI_CORS_ORIGINS=https://your-domain.com
export GUARDASLI_PUBLIC_URL=https://your-domain.com
export CONVEX_DEPLOY_KEY=...
bun run prod-start && bunx convex deploy
```

## Docs

- [FINAL_AUDIT.md](FINAL_AUDIT.md)
- [Docs.md](Docs.md) / [Docs.fa.md](Docs.fa.md)
- [docs/SECURITY.md](docs/SECURITY.md) · [docs/PRODUCTION.md](docs/PRODUCTION.md)

**GuardAsli** by **AsliCode** · `isMAJOR.MINOR.PATCH`
