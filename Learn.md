# GuardAsli — Learn

**Version:** `is0.0.1` · **Developer:** AsliCode · **Format:** `isMAJOR.MINOR.PATCH`

Step-by-step guides to install, configure, and operate **GuardAsli** by **AsliCode**.

Persian version: [Learn.fa.md](Learn.fa.md) · Technical reference: [Docs.md](Docs.md).

---

## 1. Install with the wizard (one command)

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli && bash scripts/guardasli.sh install
```

What the wizard does:

1. Checks OS, RAM, disk, ports, network (`doctor`)
2. Installs Bun if missing
3. Creates install root (default `/opt/guardasli`) and a starter `.env`
4. Prints next steps

Verify:

```bash
bash scripts/guardasli.sh status
bash scripts/guardasli.sh doctor
```

---

## 2. Link Convex and start development

```bash
cd guardasli   # if not already there
bun install
bun convex dev --once   # log in once; creates project + schema
bun dev                 # frontend on 0.0.0.0:$PORT (default 5173)
```

Open the URL shown in the terminal. You should see the GuardAsli landing page.

---

## 3. Create the first super admin

From the project root:

```bash
bunx convex run authActions:bootstrapAdminAction '{"username":"admin","password":"ChooseAStrongPassword"}'
```

Then open the app → **ورود / ثبت‌نام** (or `#auth`) → sign in with that username and password.

---

## 4. Configure the platform (wizard)

```bash
bash scripts/guardasli.sh reconfigure
```

Set the main platform domain (core identity domain). Tenant custom domains are managed later from the admin UI and cannot claim the core domain.

---

## 5. First operational checklist

| Step | Where |
|---|---|
| Create a tenant | Admin dashboard |
| Attach branding (logo, colors) | Tenant branding panel |
| Create plans & feature flags | Plans / features UI |
| Add an upstream provider (3X-UI, Sanaei, …) | Providers section |
| Enable a payment method | Payments section |
| Create a reseller under the tenant | Reseller tree |
| Bootstrap a Telegram bot for the tenant | Bot config (token stored encrypted) |

Every sensitive action is written to the audit log.

---

## 6. Wallet & payment flow (mental model)

1. User or reseller requests a top-up or purchase  
2. Server computes price (client price is ignored)  
3. Feature chain + quota + balance checks  
4. For online payments: webhook only **enqueues** `payment_verify`  
5. Adapter verifies amount and status  
6. Ledger writes one numbered, idempotent entry  
7. Provisioning job runs on the upstream provider  
8. Subscription activates only after successful provisioning  

If provisioning fails, the job retries with backoff; it never reports false success.

---

## 7. Daily ops with the CLI

```bash
bash scripts/guardasli.sh          # interactive menu
bash scripts/guardasli.sh doctor   # health
bash scripts/guardasli.sh backup   # encrypted backup
bash scripts/guardasli.sh status   # version is0.0.1 + path
bash scripts/guardasli.sh logs     # recent logs
bash scripts/guardasli.sh update   # update components, keep data
```

---

## 8. Production deploy

```bash
bun run build
bun convex deploy
```

Serve the `dist/` folder behind any static host or reverse proxy. API routes `/api/v1/*` are served by the deployed Convex functions.

Required secret: `GUARDASLI_MASTER_SECRET` (AES-256-GCM material). Payment provider keys are configured in the admin panel and stored encrypted.

---

## 9. Verify quality

```bash
bun test
bun typecheck
bun run build
```

Expect 36 tests passing and a clean TypeScript build.

---

## 10. Where to go next

| Goal | Document |
|---|---|
| Deep architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| API contracts | [docs/API.md](docs/API.md) |
| Branding rules | [docs/BRANDING.md](docs/BRANDING.md) |
| Full technical index | [Docs.md](Docs.md) |
| Persian tutorial | [Learn.fa.md](Learn.fa.md) |

---

© AsliCode — GuardAsli `is0.0.1`
