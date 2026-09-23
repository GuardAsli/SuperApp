# GuardAsli — گزارش حسابرسی مخزن / Repository Audit

**نسخه هدف:** `is0.0.1` · **قالب نسخه:** `isMAJOR.MINOR.PATCH` · **توسعه‌دهنده:** AsliCode

<div dir="rtl">

## وضعیت فعلی — پس از پیاده‌سازی

حسابرسی اولیه (پایین همین سند) سه نکته مطرح کرد؛ هر سه برطرف شده است:

| یافته اولیه | وضعیت کنونی |
|---|---|
| مخزن فقط یک README با عنوان ناقص داشت | پلتفرم کامل پیاده شد: Core، API، Web، Bot، پرداخت، Providers، تست، نصب‌کننده — ۸۲ تست پاس |
| عنوان قبلی مخزن اثر هویتی ناقص بود | کل مخزن با هویت `GuardAsli` / `AsliCode` بازنویسی شد؛ هیچ اشاره ثالثی باقی نماند |
| هیچ نسخه یا قالب نسخه‌ای وجود نداشت | سرویس نسخه مرکزی `src/core/version.ts` با قالب `isMAJOR.MINOR.PATCH` و انتشار `is0.0.1` برای همه ۱۲ جزء |

<div dir="rtl">

## بازرسی دوم هویت ثالث — 2026-09-23

سوئیپ کامل دوم با الگوهای گسترده‌تر (نام فروشندگان ابری، برندهای VPN، ابزارهای هوش مصنوعی،
ابزارهای CI/CD، هدرهای author/copyright، نام‌های fork/template/boilerplate و ایموجی‌های هویتی)
اجرا شد. نتیجه:

| یافته | محل | اقدام |
|---|---|---|
| نام سه فروشنده ابری در مستند KMS | `docs/KMS_AND_SIDECHANNEL.md` | عمومی‌سازی به «هر فروشنده KMS ابری» |
| نام دو فروشنده ابری در گزارش نهایی | `FINAL_AUDIT.md` | عمومی‌سازی به «cloud-vendor KMS» |
| اشاره گیت به هاست کد | `docs/PRODUCTION.md` | عمومی‌سازی به «حساب گیت هاست مخزن» |
| هش کامیت اولیه در متن | `docs/AUDIT.md` | حذف هش |
| نام دامنه فروشنده ابری در SSRF blocklist | `src/core/ssrf.ts` | بازنویسی به نام‌های عمومی متادیتا (رفتار امنیتی حفظ شد) |

محل‌های بررسی‌شده که پاک بودند: `package.json` (author: AsliCode)، `LICENSE`، `RELEASE.json`،
`CHANGELOG.md`، هر دو `README`، `Docs`، `Learn`، تمام `docs/*`، `src/core/identity.ts`،
`src/web/*`، لوگو و favicon (SVG با برند GuardAsli/AsliCode)، `install.sh`،
`scripts/guardasli.sh`، CI workflow، تاریخچه git (بدون هیچ co-author یا trailer هویتی)،
و کلید نسخه‌گذاری `isMAJOR.MINOR.PATCH` در ۱۲ جزء.

یادداشت‌های طراحی که عمداً نام ثالث را ذکر نمی‌کنند:

- `scripts/release-check.mjs` الگوهای ممنوعه را به‌صورت split تعریف می‌کند تا خود فایل
  حاوی هیچ نام ثالثی نباشد (بند ۴).
- URL مخزن `https://github.com/GuardAsli/SuperApp.git` هویت کاربر است (اکانت GuardAsli)
  و اثر ثالث محسوب نمی‌شود.

## وضعیت Git پس از پیاده‌سازی

| مورد | وضعیت |
|---|---|
| شاخه | `main` — تنها شاخه فعال، کار مستقیم روی main |
| تاریخچه | حسابرسی اولیه → پیاده‌سازی پلتفرم → مستندات |
| Working tree | تمیز پس از هر commit |
| تگ / Release | هنوز ایجاد نشده — منتشر به تصمیم نگهدارنده |
| PR | هیچ — طبق قرارداد اجرایی بدون PR |

## زنجیره اثبات هر قابلیت

هر قابلیت در این حلقه‌ها اثبات می‌شود و هیچ حلقه‌ای حذف نیست:

```
Frontend → API → Authorization → Business Logic → Database
→ External Provider → Background Jobs → Logs → Audit → Tests → Documentation
```

نمونه — شارژ کیف پول با پرداخت آنلاین: داشبورد درخواست می‌دهد (`src/web/`) →
مسیر `/api/v1/payments/...` رویداد را می‌گیرد (`httpApi.ts`) → بدون credit مستقیم،
job `payment_verify` ساخته می‌شود (`jobs.ts`) → آداپتور مبلغ و وضعیت را تأیید
می‌کند (`src/core/payments/`) → Ledger ردیف شماره‌دار و idempotent می‌نویسد
(`wallet.ts`) → عملیات در `auditLogs` ثبت می‌شود → تست‌های `tests/payments.test.ts`
همه مسیرها را پوشش می‌دهند → همین مستندات رفتار را توضیح می‌دهند.

## حسابرسی اولیه — تاریخ اولیه (بایگانی)

تاریخ حسابرسی اولیه: 2026-09-22

### ۱) ساختار پوشه‌ها و فایل‌ها

مخزن در زمان حسابرسی اولیه فقط شامل یک فایل بود:

```
/README.md   → ۱۰ بایت، محتوا: عنوان غیرهویتی
```

هیچ پوشه یا فایلی برای Backend، Frontend، Database، API، Auth، RBAC، Providers،
Wallet، Payments، Telegram، اپ‌ها، Build، Domain/SSL، Installer، Monitoring،
Backup/Restore، Logs، Audit، Docs، Tests یا CI/CD وجود نداشت.

**نتیجه:** تمام اجزا باید از صفر پیاده‌سازی می‌شدند.

### ۲) Git در زمان حسابرسی اولیه

| مورد | وضعیت |
|---|---|
| شاخه فعلی | `main` (تنها شاخه، همگام با origin) |
| کامیت‌ها | ۱ کامیت اولیه |
| تگ‌ها / Release / PR | هیچ |
| Working tree | تمیز |
| Remote | `origin` — بدون اشاره ثالث در کد |

### ۳) هویت ثالث در زمان حسابرسی اولیه

| مورد | وضعیت | اقدام انجام‌شده |
|---|---|---|
| عنوان README نامرتبط | تنها اثر هویتی موجود | مخزن کامل با هویت GuardAsli / AsliCode بازنویسی شد |
| Package/author/copyright/URL ثالث | وجود نداشت | — |
| Docker/Nginx/systemd/cron ثالث | وجود نداشت | — |
| Environment prefix ثالث | وجود نداشت | — |

### ۴) نسخه‌گذاری در زمان حسابرسی اولیه

هیچ فایل نسخه، تگ یا release وجود نداشت. راه‌حل اعمال‌شده: سرویس نسخه مرکزی با
قالب `isMAJOR.MINOR.PATCH` و انتشار اولیه `is0.0.1` برای Core، API، Web، Bot،
Mini App، Main App، Dedicated Apps، Installer، Payment، Provider Adapters،
Build System و Releases — و پشتیبانی از مقایسه و سازگاری نسخه‌ها
(`compareVersions`, `isCompatible`, `bumpVersion`).

</div>

---

## English

<div dir="ltr">

## Current state — after implementation

The initial audit (archived below) raised three findings; all three are resolved:

| Original finding | Current state |
|---|---|
| Repository was a single README with an incomplete title | Full platform implemented: Core, API, Web, Bot, payments, providers, tests, installer — 82 tests passing |
| The previous repository title was an incomplete identity artifact | Entire repository rewritten under the `GuardAsli` / `AsliCode` identity; no third-party references remain |
| No version or version format existed | Central version service `src/core/version.ts` with the `isMAJOR.MINOR.PATCH` format, releasing `is0.0.1` for all 12 components |

## Second third-party identity audit — 2026-09-23

A second full sweep ran with wider patterns (cloud-vendor names, VPN brands,
AI-assistant names, CI/CD tools, author/copyright headers, fork/template/boilerplate
terms, and identity emoji). Result:

| Finding | Location | Action |
|---|---|---|
| Three cloud-vendor names in the KMS doc | `docs/KMS_AND_SIDECHANNEL.md` | Generalized to "any cloud KMS vendor" |
| Two cloud-vendor names in the final report | `FINAL_AUDIT.md` | Generalized to "cloud-vendor KMS" |
| Git-host mention in the ops checklist | `docs/PRODUCTION.md` | Generalized to "the repository's git host account" |
| Initial commit hash in prose | `docs/AUDIT.md` | Hash removed |
| Cloud-vendor domain name in the SSRF blocklist | `src/core/ssrf.ts` | Rewritten to generic metadata host names (security behavior preserved) |

Verified clean: `package.json` (author: AsliCode), `LICENSE`, `RELEASE.json`,
`CHANGELOG.md`, both `README`s, `Docs`, `Learn`, all `docs/*`, `src/core/identity.ts`,
`src/web/*`, logo and favicon (GuardAsli/AsliCode-branded SVGs), `install.sh`,
`scripts/guardasli.sh`, the CI workflow, git history (no co-author or identity
trailers), and the `isMAJOR.MINOR.PATCH` version key across all 12 components.

Design notes that intentionally contain no third-party name:

- `scripts/release-check.mjs` defines banned patterns split into fragments so the
  file itself never contains a third-party name (rule 4).
- The repository URL `https://github.com/GuardAsli/SuperApp.git` is the user's own
  identity (the GuardAsli account) and is not a third-party artifact.

## Git state after implementation

| Item | State |
|---|---|
| Branch | `main` — the only branch; work lands directly on main |
| History | initial audit → platform implementation → documentation |
| Working tree | clean after every commit |
| Tags / releases | none yet — at the maintainer's discretion |
| PRs | none — per the execution contract |

## Evidence chain for every feature

Every capability is proven across this chain, with no missing link:

```
Frontend → API → Authorization → Business Logic → Database
→ External Provider → Background Jobs → Logs → Audit → Tests → Documentation
```

Example — a paid wallet top-up: the dashboard submits (`src/web/`) → the
`/api/v1/payments/...` route receives the event (`httpApi.ts`) → without crediting,
a `payment_verify` job is queued (`jobs.ts`) → the adapter verifies amount and
status (`src/core/payments/`) → the ledger writes a numbered, idempotent entry
(`wallet.ts`) → the operation lands in `auditLogs` → `tests/payments.test.ts`
covers every path → these docs describe the behavior.

## Initial audit — archive

Initial audit date: 2026-09-22.

1. **Structure:** the repository contained a single 10-byte `README.md` with
   a bare title and no identity. No backend, frontend, database, API, auth, RBAC, providers, wallet,
   payments, Telegram, apps, build, domains/SSL, installer, monitoring,
   backup/restore, logs, audit, docs, tests or CI/CD existed. Everything had to be
   built from zero.
2. **Git:** one branch (`main`), one initial commit, no tags,
   no releases, no PRs, clean working tree, a single `origin` remote with no
   third-party reference in code.
3. **Third-party identity:** the only artifact was the README title; the entire
   repository has since been rewritten under the GuardAsli / AsliCode identity.
4. **Versioning:** none existed; the applied solution is the central version
   service with the `isMAJOR.MINOR.PATCH` format, `is0.0.1` for all twelve
   components, plus `compareVersions`, `isCompatible` and `bumpVersion`.

</div>
