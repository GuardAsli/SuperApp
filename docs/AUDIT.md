# GuardAsli — Full Component Audit (36 components)

**Release:** `is0.0.1` · **Developer:** AsliCode · **Branch:** `main` (synced) · **Audit date:** 2026-09-25
**Production-ready bar (as defined):** works, passes tests, successful production build, E2E verified, no third-party identity, on main, version is0.0.1 verified.

Global verification at audit time:

```
bun test                → 214 pass / 0 fail / 770 expects / 13 files
bun tsc -b --noEmit     → clean
bun run build           → success (dist/)
bash -n scripts/*.sh install.sh → ALL OK
bun scripts/release-check.mjs   → is0.0.1 FINAL (identity + banned-term scan)
git history             → 80 commits, all author+committer = isAsli, zero third-party trailers
```

Legend: ✅ Production-ready · 🟡 Partial (gaps listed) · ❌ Missing / stub

---

## Core & Platform

| # | Component | Status | Evidence & remaining work |
|---|---|---|---|
| 1 | **Core** (identity, engines) | ✅ | `src/core/*` complete: identity frozen, AEAD/HKDF, scrypt, sidechannel, ssrf, rbac, features, pricing, ledger, tenantScope, providers, payments, telegram, version, prodEnv. Tested via `core.test.ts` (29), `crypto.test.ts` (12), `kms_sidechannel.test.ts` (3). Nothing blocking. |
| 2 | **Versioning** | 🟡 | `is0.0.1` for all 12 components, `parse/compare/isCompatible/bump` implemented + tested; `VERSION_FORMAT_PATTERN` enforced. Gap: `/api/v1/version` serves `INITIAL_VERSIONS` const instead of the existing `getVersionSnapshot()` helper — silent drift risk once components bump independently (P3 fix). |
| 3 | **Independent Updates** | 🟡 | `bumpVersion` + `isCompatible` (same major) exist and are unit-tested; `guardasli update` (rsync + rebuild) works. Gap: no runtime gate consumes `isCompatible` (e.g. backend rejecting old web bundle); updater doesn't run per-component version comparison. Plan: wire `isCompatible` into a version handshake endpoint (P2). |
| 4 | **Documentation** | 🟡 | Docs complete in EN+FA (Docs, Learn, ARCHITECTURE, API, SECURITY, DEPLOYMENT, RUNBOOK, PAYMENTS, BRANDING, KMS, CLIENT_EXPERIENCE, AUDIT) + on-site `#/api` docs page. Gap: stale test counts in three docs (Learn says 163, Docs says 82, README says 198 — real: 214) and Docs §7 provider list wording. One-line fixes (P3). |

## API & Data

| # | Component | Status | Evidence & remaining work |
|---|---|---|---|
| 5 | **Database** (Convex schema) | ✅ | 38 tables, indexes correct (by_tenant/by_user/by_prefix/by_status_next…). Isolation suite drives real handlers through a faithful Convex db shim incl. the filter-builder trap. |
| 6 | **API** (`/api/v1`) | 🟡 | Real REST: health (real DB probe), ping, version, openapi.json, auth register/login/refresh, 3 webhooks; uniform error contract + requestId; CORS allowlist from systemSettings; on-site docs page `#/api`. **Gap (P0):** API keys (`apiKeyCreate/List/Revoke`, `ga_…` hash-only) exist but **no REST route authenticates with them** — keys are unusable. Plan: key-auth middleware on a new `/api/v1/panel/*` route family. |
| 7 | **Jobs** (queue) | ✅ | `jobs` table + worker: payment_verify, provision (own executor), auto_backup, bot_command; retry/backoff; stale-running requeue for provisioning; 1-min cron. Covered by botWebhook + provisionExecutor tests. |
| 8 | **Monitoring** | ✅ | `infra.monitor` health records + `jobStats` + admin dashboard "monitor" tab + `bun run monitor*` scripts. Nothing blocking. |
| 9 | **Reports** | 🟡 | `reportGenerate` query (users / wallet+revenue / subscriptions) with scope enforcement. **Gap:** no dashboard UI calls it; only 3 kinds. Plan: admin "Reports" tab rendering the three kinds (P2). |

## Access

| # | Component | Status | Evidence & remaining work |
|---|---|---|---|
| 10 | **Auth** | ✅ | scrypt password envelopes, session+refresh tokens (hash-only), 7-day sessions, rotate/revoke, lockout (`blockedUntil`), rate-limited register/login (5/min). E2E-proven (`e2e-admin-login`, harness). |
| 11 | **RBAC** | ✅ | 5 roles, 16 permissions, server-only enforcement via `requirePermission`; role-scoped entry ports enforced in `loginAction` (`expectRole`) + `roleFitsEntry`. Tested (`roleEntry.test.ts`). |
| 12 | **Multi-tenancy** | ✅ | `requireTenantScope` + ownership-tree traversal on every sensitive mutation/query; real-handler isolation suites (75 tests incl. 55 E2E) covering cross-tenant refusal for users, referrals, providers, subscriptions, audit. |
| 13 | **Resellers** | 🟡 | Roles exist with correct permission sets; parentUsername at register links child → parent tenant+user (verified); reseller sees own tree. **Gaps:** no dashboard UI to create/invite resellers/sub-resellers (register via `parentUsername` only); `canResell`/`SubReseller` flags stored but not consulted at purchase/resell time (P1/P2). |
| 14 | **Users management** | 🟡 | `userList`/`userSetStatus` with `canManageActor` hierarchy. **Gap:** zero UI wiring (P0 item shared with admin CRUD below). |

## Commerce

| # | Component | Status | Evidence & remaining work |
|---|---|---|---|
| 15 | **Plans** | 🟡 | `planCreate/planList` server-validated; purchase reads price only from server row. **Gap:** no UI to create plans (P0). |
| 16 | **Features** (18 keys) | ✅ | 18 keys defined; `featureFlagsSet` super-admin-only + audited; six-check `evaluateFeatureAccess`. |
| 17 | **Pricing / Custom Purchase** | 🟡 | `quoteCustomPurchase` + `effectivePlanPrice` (reseller markup) implemented, min/max enforced, client price never trusted. **Gaps:** feature-chain in `purchasePlan` hardcodes 3 of 6 checks `true` (tenant/quota/ownership) — P1; `customPurchaseQuote` has no UI (P2). |
| 18 | **Wallet** | ✅ | Append-only ledger, idempotency keys, seq-numbered entries, −1000 overdraft guard, history scoped, admin manual credit gated behind `admin_manual` method flag + `ManageWallet`. Tested incl. negative cases. |
| 19 | **Ledger** | ✅ | Same engine as wallet — numbered, idempotent, audited; replay has no double effect (tested). |
| 20 | **Billing** | ✅ | `purchasePlan` (atomic debit → subscription → provision job) with idempotent replay; `subscriptionCancel` with scope + state checks. Provisioning now has a real runtime executor (see #21). |
| 21 | **Subscriptions / Provisioning** | ✅ (this pass) | **Was the biggest gap; now closed.** `provisionWorker.processDueProvisions` (node action) runs every minute: requeues stale running jobs → picks due jobs with tenant→server→provider validation (cross-tenant refused) → decrypts provider creds only in action memory → calls the real adapter `createUser` with the subscription's traffic/duration → `provisionFinish` activates + schedules the buyer's role-scoped Telegram login link. Failures retry with exponential backoff → dead. **E2E proof:** `tests/provisionExecutor.test.ts` — server plan purchase → real adapter call (recorded fetch) → `active/provisioned` + remoteUserId + login link scheduled/drained; plus failure→retry→heal, crash→requeue, cross-tenant refusal, server-less activation. Remaining (P2): traffic-sync cron from provider + cancel should disable the remote user. |
| 22 | **Payments** | ✅ | 4 channels (admin_manual, card_to_card w/ max-10 + approve/reject/fraud, CubePay, Tetraminator); webhooks never credit directly — `payment_verify` queue → adapter verify (status/id/amount) → idempotent credit; anti-replay tested; methods default-off until configured. |

## Clients

| # | Component | Status | Evidence & remaining work |
|---|---|---|---|
| 23 | **Telegram Bot** | ✅ | Per-tenant webhook + secret header, self-healing daily cron, jobs-queue command execution, numeric-ID admin claim, full command set, `/login` role-scoped links (env-overridable ports), auto login-link after provisioning (scheduler-driven), `guardasli telegram` CLI now does a REAL bootstrap (token + numeric admin ID → encrypted save → webhook). Live E2E proof file exists (`logs/e2e-bot-proof.jsonl`) + 35 web tests + 7 provision tests. |
| 24 | **Telegram Mini App** | ✅ | `MiniAppPage` (wallet, subscriptions, servers, devices), HMAC `verifyTelegramInitData` of real initData, internal-only registration path. |
| 25 | **Web App** | ✅ | Landing (themed, `#/api` docs), Auth, Dashboard (wallet/history/charge/cards/payments/bot/branding/monitor/admin-review), i18n FA/EN, `#/api` route. Build passes. |
| 26 | **Main App** (Android) | ❌ | Only the identity component + `apps.buildEnqueue` queue exists; worker stubs builds as instant `success`. Plan: real build line (Capacitor/PWA wrapper producing signed APK) or honest removal from the is0.0.1 scope (needs owner decision). |
| 27 | **Dedicated App** | ❌ | Literal in `appKind` only. Same decision needed as #26. |
| 28 | **App Builder** | 🟡 | `appGet/appSave/buildEnqueue/buildList/buildMark` + `appCustomizations`/`builds` tables complete. **Gaps:** no UI; build worker is a stub (ties to #26). |
| 29 | **Domains** (custom) | 🟡 | `domainAdd/domainVerify/domainList` with scope + audit. **Gap:** "verify" marks verified without a real DNS check (no resolve action exists); no SSL issuance per tenant domain. Plan: real DNS resolve in a node action + ACME note (P2). |

## Operations

| # | Component | Status | Evidence & remaining work |
|---|---|---|---|
| 30 | **Providers** | ✅ (runtime) | Real adapters for 4 API families w/ capability detection, SSRF-guarded outbound, form-login session support. **Now wired to runtime** via the provisioning executor + tested end-to-end with a recorded upstream. Remaining (P2): live E2E against one real upstream panel (needs owner to supply one). |
| 31 | **SSL** | ✅ (installer path) | `nginx-render.sh` single source of truth; ACME webroot challenge preserved pre-redirect; certbot non-interactive with actionable failure checklist; TLS on all role ports; PUBLIC_URL flipped to https (Telegram requirement). Covered by `nginxPorts.test.ts` (12) incl. rollback. Gap (P2): no auto-renew timer on the VPS (certbot.timer normally exists; add a doctor check). |
| 32 | **Installer** | ✅ | `install.sh` one-liner: 3 questions, non-interactive flags, time-boxed steps, resumable, swap guard, firewall, health verification; deploy failures now print real errors + targeted hints. `bash -n` clean. |
| 33 | **CLI** (`guardasli`) | ✅ | 19-option panel + direct commands (status/doctor/ssl/telegram/backup/restore/logs/update/repair/reconfigure/env/ports); telegram flow is now real; env check shows deployment key coverage. |
| 34 | **Backup/Restore** | ✅ | Nightly encrypted auto-backup cron → job → AES blob to storage; `guardasli backup/restore` incl. `convex export`; backup settings query/mutation. Gap (P3): off-app destination documented but not automated. |
| 35 | **Audit** | ✅ | Every sensitive action logged (create/update/revoke/verify/purchase/cancel/config…), strict tenant-tree read scope (even super_admin can't see other trees), requestId searchable. Heavily tested in isolation suites. |
| 36 | **Security** | ✅ | AES-256-GCM + HKDF purpose keys, prod env gates (`assertProductionEnv`), SSRF outbound validation, hash-only tokens/keys, CORS allowlist, rate limits on auth paths, lockout, no client-trusted prices. **Residual gaps (P1):** `rateLimitCheck` not applied to `/api/v1/auth/*` REST routes; KMS module (local/env_kek/http) built+tested but not wired into secret loading (AEAD direct path is used instead). |

## Verdict against the production-ready bar

| Criterion | Verdict |
|---|---|
| Works | ✅ for 30/36 components; ❌ Main App, Dedicated App; 🟡 API-keys-on-REST |
| Passes tests | ✅ 214/214 |
| Production build | ✅ |
| E2E verified | ✅ bot chain (live proof files), provisioning chain (this pass), isolation (55 E2E tests); 🟡 no live upstream provider E2E (needs a real panel from the owner) |
| No third-party identity | ✅ zero in tracked files/history (release-check enforces) |
| On main | ✅ synced, head `8df9cfb`, all commits authored by isAsli |
| Version is0.0.1 verified | ✅ RELEASE.json + /api/v1/version + release-check |

## Prioritized remaining work

**P0 (blocks the "works" bar)**
1. API-key authentication on REST (`/api/v1` panel routes) — keys exist, unusable without it.
2. Admin CRUD UI: plans, servers/providers, users, API keys, reports (all APIs are live; zero wiring).

**P1**
3. Complete the 6-check feature chain in `purchasePlan` (3 checks hardcoded true).
4. `rateLimitCheck` on REST auth/webhook routes; wire KMS module or mark as future.
5. Reseller creation UI + `canResell`/`SubReseller` enforcement at purchase/resell.

**P2**
6. Traffic-sync cron from providers; disable remote user on cancel.
7. Real DNS verify for custom domains; SSL auto-renew doctor check.
8. Reports tab; live provider E2E (needs a real upstream panel from the owner).
9. Decide scope for Main/Dedicated app + App builder build line (owner decision).

**P3**
10. Doc test-count refresh (163/82/198 → 214); `/api/v1/version` → `getVersionSnapshot()`.
