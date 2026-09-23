# GuardAsli — Technical Documentation

**Version:** `is0.0.1` · **Developer:** AsliCode · **Format:** `isMAJOR.MINOR.PATCH`

> Product **GuardAsli** · Developer **AsliCode** — core identity is fixed and non-negotiable.

This document is the English technical reference. Persian: [Docs.fa.md](Docs.fa.md). Tutorials: [Learn.md](Learn.md).

---

## Table of contents

1. [Identity & versioning](#1-identity--versioning)
2. [Architecture overview](#2-architecture-overview)
3. [Roles & authorization](#3-roles--authorization)
4. [Features & quotas](#4-features--quotas)
5. [Wallet & ledger](#5-wallet--ledger)
6. [Payments](#6-payments)
7. [Providers](#7-providers)
8. [Telegram channels](#8-telegram-channels)
9. [HTTP API](#9-http-api)
10. [Wizard installer & CLI](#10-wizard-installer--cli)
11. [Environment & secrets](#11-environment--secrets)
12. [Testing & quality](#12-testing--quality)
13. [Related docs](#13-related-docs)

---

## 1. Identity & versioning

Source of truth: `src/core/identity.ts` and `src/core/version.ts`.

| Constant | Value |
|---|---|
| Product | `GuardAsli` |
| Developer | `AsliCode` |
| Version format | `isMAJOR.MINOR.PATCH` |
| Initial release | `is0.0.1` for all 12 components |

Components: `core`, `api`, `web`, `bot`, `miniapp`, `mainapp`, `dedicated`, `installer`, `payment`, `providers`, `build`, `releases`.

Helpers: `parseVersion`, `compareVersions`, `isCompatible` (same major required), `bumpVersion`.

No customization table may store or override these names.

---

## 2. Architecture overview

Two explicit layers:

**Core (fixed)**  
Identity, RBAC, ledger, pricing, security engines, central auth, wallet, provider/payment contracts, audit, HTTP API. Code under `src/core/` and `src/convex/`.

**Customization (fully brandable)**  
Per-tenant branding, assets, UI texts, bot configs, app customizations, custom domains. Driven by tables + `src/web/branding.ts`.

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Repository layout:

```
src/
  core/       engines (identity, ledger, rbac, payments, providers, …)
  convex/     backend schema, auth, wallet, billing, jobs, http
  web/        Landing, Auth, Dashboard, Mini App, branding
tests/        unit + integration (bun test)
scripts/      guardasli CLI / wizard installer
docs/         architecture, API, branding, audit
```

---

## 3. Roles & authorization

Five roles, enforced **only** on the server:

| Role | Scope |
|---|---|
| `super_admin` | Platform-wide |
| `admin` | Tenant administration |
| `reseller` | Own tree + sub-resellers |
| `sub_reseller` | Own subtree |
| `user` | Own purchases & wallet |

Cross-tenant access is blocked by `requireTenantScope` with ownership-tree traversal.

---

## 4. Features & quotas

Eighteen feature keys. Each request passes a six-check chain:

1. Global switch  
2. Plan allowance  
3. Role permission  
4. Tenant enablement  
5. Ownership  
6. Quota remaining  

Client-sent prices are never trusted; quotes are computed server-side only.

---

## 5. Wallet & ledger

Append-only ledger: every balance change is a numbered, idempotent entry.

- No silent mutations  
- Replay of the same idempotency key has no double effect  
- Audit trail for every credit/debit  

Implementation: `src/convex/wallet.ts` + `src/core/ledger.ts`.

---

## 6. Payments

| Channel | Behavior |
|---|---|
| Admin manual credit | Direct ledger write with audit |
| Card-to-card | Max 10 cards; approve / reject / fraud |
| CubePay | Callback → verification job → credit |
| Tetraminator | Webhook → verification job → credit |

**Rule:** payment webhooks never credit the wallet directly. They enqueue a `payment_verify` job. Credit happens only after adapter verification (status, payment id, amount) via `acceptProviderPayment` with an idempotency key (anti-replay).

Adapters: `src/core/payments/cubepay.ts`, `src/core/payments/tetraminator.ts`.

---

## 7. Providers

Upstream server adapters with real capability detection:

- 3X-UI  
- Sanaei  
- PasarGuard  
- Rebecca  

Contracts and detection live under `src/core/providers/`.

---

## 8. Telegram channels

| Surface | Security |
|---|---|
| Bot webhook | Per-tenant `webhookSecret` in header `X-Telegram-Bot-Api-Secret-Token` |
| Mini App | HMAC verification of Telegram `initData` |

Bot tokens and payment keys are stored under AES-256-GCM envelope encryption.

---

## 9. HTTP API

Base path: `/api/v1`.

Uniform error shape:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Actionable short message",
  "details": {},
  "requestId": "ga_..."
}
```

Key routes: `ping`, `version`, `openapi.json`, Telegram webhooks, payment callbacks.

Full reference: [docs/API.md](docs/API.md).

---

## 10. Installer & management panel

**Server install — two commands:**

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli
sudo bash install.sh
```

The installer asks a few questions (domain, email) and does the rest:
bun, packages, secrets, build, Convex deploy (if a deploy key is present),
Nginx, SSL, systemd service, the `guardasli` command, and opens the panel.

With a domain:

```bash
sudo bash install.sh --domain panel.example.com --email you@example.com
```

Management panel — 18 options (opens automatically at the end of install):

```bash
sudo guardasli panel
```

| Option | Action |
|---|---|
| 1 | Full install |
| 2 | Reconfigure (domain, repo, port) |
| 3 | SSL certificate |
| 4 | Telegram bot setup |
| 5 | Create super admin |
| 6 / 7 | Start / stop service |
| 8 | Service status |
| 9 | Update |
| 10 | Repair |
| 11 / 12 | Backup / restore |
| 13 | Logs |
| 14 | Doctor (system checks) |
| 15 | Status |
| 16 | Convex backend deploy |
| 17 | Admin credentials |
| 18 | Install the `guardasli` command |

Direct commands: `guardasli status | doctor | ssl | telegram | backup | restore <file> | logs | update | repair | reconfigure | version`.

Script: `install.sh` (installer) and `scripts/guardasli.sh` (manager).
Default install root: `/opt/guardasli`.

---

## 11. Environment & secrets

| Variable | Purpose |
|---|---|
| `GUARDASLI_MASTER_SECRET` | AES-256-GCM key material |
| `GUARDASLI_MAIN_DOMAIN` | Platform core domain |
| Payment credentials | Set via admin panel, encrypted at rest |

SSRF protection validates outbound URLs; private ranges and internal hosts are rejected.

---

## 12. Testing & quality

```bash
bun test        # 82 unit + integration tests
bun typecheck   # TypeScript, zero errors
bun run build   # production bundle → dist/
```

Evidence chain for every feature:

```
Frontend → API → Authorization → Business Logic → Database
→ External Provider → Background Jobs → Logs → Audit → Tests → Documentation
```

---

## 13. Related docs

| File | Content |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, purchase flow, security model |
| [docs/API.md](docs/API.md) | Routes, error codes, webhook security |
| [docs/BRANDING.md](docs/BRANDING.md) | Customizable fields + core boundary |
| [docs/AUDIT.md](docs/AUDIT.md) | Repository audit history |
| [Learn.md](Learn.md) | Step-by-step tutorials |
| [README.md](README.md) | Product overview |

---

© AsliCode — GuardAsli `is0.0.1`
