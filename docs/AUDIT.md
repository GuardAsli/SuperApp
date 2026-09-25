# GuardAsli — Audit Report (scope vs. implementation)

**Release:** `is0.0.1` · **Developer:** AsliCode · **Audit date:** 2026-09-25
**Scope reference:** `Docs.md` (§1–13) + definite rules (identity, brand, ports, third-party identity, server-side enforcement).
**Method:** every claim below was checked against actual code, not docs. Verification commands + results at the end.

راهنمای وضعیت: ✅ کامل · 🟡 نیمه‌کاره (پایه هست، تکمیل لازم) · ❌ غایب/نیازمند کار اساسی

---

## ۱) ماتریس وضعیت اجزا

| # | جزء (Docs.md) | وضعیت | شواهد | شکاف اصلی |
|---|---|---|---|---|
| 1 | هویت و نسخه‌گذاری (§1) | ✅ | `src/core/identity.ts` ثابت، ۱۲ کامپوننت، `release-check` سبز | — |
| 2 | معماری Core/Customization (§2) | ✅ | چیدمان `src/core` + `src/convex` + `src/web` مطابق سند؛ branding از جدول `branding` | — |
| 3 | نقش‌ها و RBAC (§3) | ✅ | ۵ نقش، مجوزها فقط سرور (`src/core/rbac.ts`)، تست‌های RBAC و role-entry | — |
| 4 | مولتی‌تننسی / ایزولاسیون | ✅* | `requireTenantScope` + پیمایش درخت مالکیت؛ `isolation/tenantIsolation*` (۱۰ تست) | *sweep عمیق‌تر با ران‌تایم واقعی Convex توصیه می‌شود (P2) |
| 5 | قابلیت‌ها و سهمیه‌ها (§4) | 🟡 | `evaluateFeatureAccess` شش‌مرحله‌ای + `featureFlagsSet` | در `purchasePlan` سه چک از شش (`tenantActive/ownershipOk/quotaOk`) سخت‌کد `true` است (P1) |
| 6 | کیف پول و Ledger (§5) | ✅ | `wallet.ledgerApply` فقط‌الحاقی، idempotent، `-1000` ضد اوردرافت؛ تست negative | — |
| 7 | پرداخت (§6) | ✅ | ۴ کانال، `MAX_CARDS=10`، صف `payment_verify`، ضد-replay، نوتیف خودکار لینک ورود بعد از فعال‌سازی (scheduler) | — |
| 8 | Providers (§7) | 🟡 | آداپتور واقعی ۴ خانواده API + تشخیص capability + SSRF (`src/core/providers/index.ts`) | **هیچ مسیر ران‌تایمی آداپتور را صدا نمی‌زند** (بند ۹ زیر) |
| 9 | خط Provisioning (اشتراک → سرور) | ❌ | مدل داده کامل: `provisionJobs`, `billing.provisionRun/Finish`, retry/backoff | `provisionRun/Finish` **فقط در تست صدا زده می‌شوند**؛ نه cron، نه worker، نه صدا از `purchasePlan`. نتیجه: اشتراکِ دارای `serverId` برای همیشه `queued` می‌ماند |
| 10 | تلگرام (§8) | ✅ | webhook per-tenant با امضا، cron ترمیم روزانه، claim ادمین، `/login` نقش‌محور، توکن رمزنگاری‌شده | — |
| 11 | پاریتی ادمین ربات (§8) | ✅ | ۱۱ فرمان ربات + تب «ربات و مینی‌اپ» پنل + ثبت خودکار webhook (تست ۳۵کاسی botWebhook) | — |
| 12 | HTTP API (§9) | 🟡 | `/api/v1` واقعی: health/ping/version/openapi/auth.register|login|refresh + ۳ webhook؛ صفحه مستندات روی سایت (`#/api`) | کلیدهای API: ساخت/فهرست/ابطال هست، اما **هیچ مسیر REST با کلید `ga_…` احراز نمی‌شود** — کلید عملاً غیرقابل استفاده (P0/P1) |
| 13 | نصب‌کننده و CLI (§10) | ✅ | `install.sh` + `guardasli panel` (۱۸ گزینه)؛ `bash -n` روی همه اسکریپت‌ها سبز | — |
| 14 | محیط و اسرار (§11) | ✅ | HKDF + purpose keys + prod gate (`prod-env-check`)؛ hash-only توکن‌ها | — |
| 15 | مانیتور (Docs.fa §12) | ✅ | `infra.monitor` + `jobStats` + تب «مانیتور» ادمین + `bun run monitor*` | — |
| 16 | بکاپ/بازیابی | ✅ | cron بکاپ شبانه رمزنگاری‌شده + `guardasli backup/restore` | بازیابی خارج از دیسک اپ فقط در چک‌لیست عملیاتی است (P2) |
| 17 | داشبورد وب | 🟡 | جریان‌های کاربر کامل: کیف/تاریخچه/خرید/شارژ/کارت‌به‌کارت/ربات/برندینگ/مانیتور | **صفحات CRUD ادمین وایر نشده‌اند**: `planCreate`, `serverUpsert`, `providerUpsert`, `userSetStatus`, `referralAttach/ruleSet`, `domainAdd`, `backupList/Record`, `apiKeyList` — همه فقط API هستند و هیچ UI ندارند (P0) |
| 18 | Mini App | ✅ | `MiniAppPage` + `verifyTelegramInitData` (HMAC واقعی) + wallet/subs | — |
| 19 | Main App (اندروید) | ❌ | فقط کامپوننت هویتی؛ `apps.buildEnqueue` صف build می‌سازد ولی `workerActions` بی‌درنگ `success` ضبط می‌کند (stub) | خط build واقعی (Gradle/PWA-wrapper) وجود ندارد |
| 20 | Dedicated App | ❌ | فقط literal در `apps.appKind` | هیچ پیاده‌سازی |
| 21 | i18n FA/EN | 🟡 | `src/web/i18n.ts` + سوییچ داشبورد | پوشش کلیدها در همه صفحات یکسان نیست (P2) |
| 22 | مرجع‌ها/Referral | 🟡 | قوانین + اتصال معرف API کامل | UI ندارند؛ اتصال خودکار پس از ثبت‌نام با `parentUsername` در `persistUser` بسته به زنجیره ثبت (P1) |
| 23 | Rate limit | 🟡 | `infra.rateLimitCheck` + هدرهای امنیتی | اعمال روی مسیرهای `/api/v1` صریح نیست (P1) |

---

## ۲) قواعد قطعی — انطباق

| قانون | وضعیت | شواهد |
|---|---|---|
| هویت ثابت GuardAsli / AsliCode / isMAJOR.MINOR.PATCH | ✅ | `release-check` سبز؛ جدول سفارشی‌سازی اجازه override ندارد |
| ممنوعیت هویت ثالث (openai/chatgpt/anthropic/claude/gemini/copilot/nordvpn/expressvpn/marzban) | ✅ | اسکن `release-check` + `git grep` — فقط یک assertion منفی در تست |
| برند دقیقاً «Coded by AsliCode» (بدون Powered By) | ✅ | grep برند پاک (فقط assertion منفی تست) |
| پورت‌های ورود (۶۱۶/۱۰۵) خصوصی — هیچ افشایی در UI عمومی | ✅ | فقط در `botCommands.ts`, `entryPorts.ts` (env-overridable), اسکریپت‌های ops و RUNBOOK اپراتوری |
| اعمال دسترسی فقط سمت سرور | ✅ | `requireActor`/`requirePermission`/`requireTenantScope` در همه mutation/query حساس |
| قیمت هرگز از کلاینت | ✅ | `purchasePlan` قیمت را فقط از ردیف `plans` می‌خواند |
| webhook هرگز مستقیم شارژ نمی‌کند | ✅ | صف `payment_verify` + آداپتور + `acceptProviderPayment` با idempotency |
| اسرار: hash-only، نمایش یک‌بار کلید API، AES/HKDF envelope | ✅ | `tokenHash`, `stableTokenHash`, `kms/aead` + purpose keys |
| cross-tenant | ✅* | تست‌های isolation پاس؛ مورد نقضی در بازرسی پیدا نشد |

---

## ۳) نقشه راه اولویت‌بندی‌شده

### P0 — مسدودکننده‌های «production-ready»
1. **اجراکننده Provisioning**: در `workerActions.processDueJobs` (یا cron جدا) برای اشتراک‌های `provisioningState=queued`: صدا زدن `billing.provisionRun` → اجرای عملیات provider (ساخت remote user با آداپتور) → `billing.provisionFinish(success, remoteUserId)`. نوتیف لینک ورود از قبل scheduler-محور و تست‌شده است. + تست E2E با provider جعلی.
2. **UI CRUD ادمین** در داشبورد: پلن‌ها (`planCreate/planList`)، سرورها/پروایدرها (`serverUpsert/providerUpsert`)، کاربران (`userSetStatus`)، معرف‌ها، دامنه‌ها، بکاپ‌ها، کلیدهای API — بدون این‌ها پلتفرم فقط با فراخوانی دستی API قابل مدیریت است.
3. **احراز کلید API روی REST**: یک مسیر عمومی `/api/v1` که با `Authorization: Bearer ga_…` (lookup `by_prefix` + `stableTokenHash` + status/expiry) پاس شود تا کلیدهای ساخته‌شده واقعاً قابل استفاده باشند.

### P1 — بالا
4. تکمیل زنجیره شش‌مرحله‌ای در `purchasePlan` (چک واقعی tenant/quota/ownership به‌جای `true` سخت‌کد).
5. Sync مصرف ترافیک از providerها به `subscriptions.trafficUsedGb` (cron).
6. اعمال `rateLimitCheck` روی `/api/v1/auth/*` و webhookها.
7. تصمیم scope: یا خط build واقعی برای mainapp/dedicated، یا صادقانه به is0.1.x موکول و از Docs حذف/پانویس شود. ← **نیاز به تصمیم کاربر**

### P2 — متوسط
8. Sweep ایزولاسیون multi-tenant با ران‌تایم واقعی Convex (فراتر از هارنس).
9. بکاپ به مقصد خارج از دیسک اپ + UX بازیابی.
10. تکمیل پوشش i18n در همه تب‌ها.
11. E2E زنده با یک پنل بالادستی واقعی (یکی از ۴ خانواده).

### P3 — کم
12. **دریفت مستندات**: `Docs.md` §12 می‌گوید «۸۲ تست» — واقعی ۲۰۰ است؛ §9 فهرست مسیرها `/health` و `/auth/*` را ندارد. اصلاح متن.
13. شماره‌گذاری بخش‌های `Docs.fa.md` با سند انگلیسی هماهنگ شود.

---

## ۴) لاگ تأیید (این حسابرسی)

```
bash -n scripts/*.sh install.sh            → ALL OK
bun scripts/release-check.mjs              → All release checks passed — is0.0.1 FINAL
git grep "powered" (بدون negative-assert)  → پاک
git grep ":105\|:616" در *.tsx/*.html/*.css → پاک
bun tsc -b --noEmit                        → پاک
bun test                                   → 200 pass / 0 fail / 695 expects
bun run build                              → موفق
```

شواهد کلیدی کد:
- `provisionRun/Finish` فقط در `tests/botWebhook.test.ts` صدا زده می‌شوند (grep روی `src/` خالی).
- `workerActions.processDueJobs` فقط `payment_verify | build(stub) | auto_backup | bot_command` را می‌شناسد — `provision` ندارد.
- داشبورد: `planCreate/serverUpsert/providerUpsert/userSetStatus/...` → صفر ارجاع در `DashboardPage.tsx`.
- `apiKeyList/Create/Revoke` وجود دارند؛ هیچ مصرف‌کننده‌ای برای `keyHash` غیر از ساخت وجود ندارد.

## ۵) تصمیم‌های باز (فقط کاربر)
- A: mainapp/dedicated در همین is0.0.1 می‌ماند یا به نسخه بعد موکول می‌شود؟
- B: اولین خانواده provider برای E2E زنده کدام باشد؟
- C: آیا احراز کلید API همین نسخه لازم است یا is0.1؟
