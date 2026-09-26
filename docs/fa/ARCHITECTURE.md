# GuardAsli — معماری / Architecture

**نسخه:** `is0.1.0` · **توسعه‌دهنده:** AsliCode · **قالب نسخه:** `isMAJOR.MINOR.PATCH`

<div dir="rtl">

## دو لایه صریح

### لایه Core — ثابت و غیرقابل تغییر

- هویت و نسخه‌گذاری: `src/core/identity.ts` و `src/core/version.ts`
- موتورها: RBAC، ledger، pricing، امنیت (`src/core/`)
- احراز هویت مرکزی: `src/convex/auth.ts` و `src/convex/authActions.ts`
- موتور کیف پول و دفتر کل تغییرناپذیر: `src/convex/wallet.ts`
- قراردادهای provider و payment: `src/core/providers/` و `src/core/payments/`
- حسابرسی مرکزی: `src/convex/audit.ts`
- HTTP API: `src/convex/http.ts` و `src/convex/httpApi.ts`

### لایه سفارشی‌سازی — کاملاً قابل شخصی‌سازی

- برندینگ هر مشتری: جدول `branding` + `src/web/branding.ts` (API پایدار)
- تم، فونت، لوگو، آیکون: جداول `assets` و `uiTexts`
- بات تلگرام هر مشتری: جدول `botConfigs` — نام، username، avatar، پیام‌ها
- اپ‌ساز هر مشتری: جدول `appCustomizations`
- دامنه سفارشی: جدول `customDomains`
- متن‌های رابط کاربری: جدول `uiTexts`

**قاعده:** هیچ کد وابسته به مشتری در Core نیست و Core هیچ برند مشتری را hardcode
نمی‌کند. همه شخصی‌سازی از جداول و APIهای برندینگ می‌گذرد و در Audit Log ثبت می‌شود.
نام `GuardAsli`، نام `AsliCode` و قالب `isMAJOR.MINOR.PATCH` در هیچ جدول
شخصی‌سازی ظاهر نمی‌شوند و از هیچ نقشی قابل تغییر نیستند.

## اجزا و نسخه‌ها

هر جزء نسخه مستقل با قالب `isMAJOR.MINOR.PATCH` دارد:
`core`, `api`, `web`, `bot`, `miniapp`, `mainapp`, `dedicated`, `installer`,
`payment`, `providers`, `build`, `releases` — همگی منتشر شده با `is0.1.0`.

به‌روزرسانی هر جزء بقیه را نمی‌شکند؛ سازگاری با تطابق major بررسی می‌شود
(`isCompatible` در `src/core/version.ts`).

## جریان خرید

```
انتخاب محصول
→ محاسبه قیمت سمت سرور
→ بررسی مجوز (زنجیره شش‌مرحله‌ای قابلیت‌ها)
→ بررسی سقف‌ها
→ بررسی موجودی کیف پول
→ بدهستن اتمی Ledger با idempotency
→ ایجاد Purchase/Subscription با وضعیت created
→ پرووایژنینگ روی سرور بالادستی (صف با تلاش مجدد)
→ فعال‌سازی فقط پس از پرووایژنینگ موفق
```

شکست پرووایژنینگ هرگز موفقیت کاذب گزارش نمی‌کند؛ job با backoff نمایی تکرار می‌شود
تا سقف تلاش، بعد وضعیت `dead` می‌گیرد و در داشبورد ادمین دیده می‌شود.

## مدل امنیتی

| تهدید | دفاع |
|---|---|
| رمز عبور | scrypt + salt اختصاصی؛ هیچ plaintext ذخیره نمی‌شود |
| افشای توکن بات و کلید پرداخت | AES-256-GCM envelope |
| SSRF | اعتبارسنجی URL خروجی؛ رد میزبان‌های داخلی و رنج‌های خصوصی |
| عبور از مرز مشتری | `requireTenantScope` با پیمایش درخت مالکیت؛ رد cross-tenant |
| تکرار پرداخت | idempotency key + وضعیت‌های صریح + ضد-replay |
| خطا | قالب `code/message/details/requestId` بدون stack trace |
| لاگ | secret redaction — هیچ رمزی در لاگ نمی‌افتد |

## ساختار مخزن

```
src/
  core/          ← موتورهای مستقل از زبان اجرا (identity, ledger, rbac, …)
  convex/        ← بک‌اند: schema, auth, wallet, billing, payments, jobs, http
  web/           ← رابط‌ها: Landing, Auth, Dashboard, Mini App, branding
tests/           ← تست‌های واحد و یکپارچه (bun test)
scripts/         ← CLI نصب‌کننده guardasli
docs/            ← همین مستندات
```

---

## English

### Two explicit layers

**Core layer — fixed.** Identity and versioning, the RBAC/ledger/pricing/security
engines, central auth, the immutable wallet ledger, provider and payment contracts,
central audit, and the HTTP API. Source of truth: `src/core/` and `src/convex/`.

**Customization layer — fully brandable.** Per-tenant branding (table `branding` +
`src/web/branding.ts`), themes/fonts/logos (`assets`, `uiTexts`), the per-tenant
Telegram bot (`botConfigs`), the app builder (`appCustomizations`), custom domains
(`customDomains`) and UI texts. No tenant-specific code lives in Core and Core
hardcodes no tenant brand. `GuardAsli`, `AsliCode` and `isMAJOR.MINOR.PATCH` never
appear in any customization table and cannot be altered by any role.

### Components and versions

Every component carries an independent version in the `isMAJOR.MINOR.PATCH` format:
`core`, `api`, `web`, `bot`, `miniapp`, `mainapp`, `dedicated`, `installer`,
`payment`, `providers`, `build`, `releases` — all currently `is0.1.0`. Updates are
independent; compatibility requires a matching major version (`isCompatible` in
`src/core/version.ts`).

### Purchase flow

```
product selection → server-side quote → feature-chain authorization →
quota check → wallet balance check → atomic, idempotent ledger entry →
purchase created → upstream provisioning (queued with retries) →
activation only after successful provisioning
```

A provisioning failure is never reported as success; the job retries with
exponential backoff up to the attempt cap, then goes `dead` and surfaces in the
admin dashboard.

### Security model

| Threat | Defense |
|---|---|
| Passwords | scrypt with per-user salt; no plaintext anywhere |
| Bot tokens / payment keys | AES-256-GCM envelope encryption |
| SSRF | Outbound URL validation; internal hosts and private ranges rejected |
| Cross-tenant access | `requireTenantScope` with ownership-tree traversal |
| Payment replay | Idempotency keys + explicit status machine + anti-replay |
| Errors | Uniform `code/message/details/requestId` shape, no stack traces |
| Logs | Secret redaction — credentials never reach logs |

</div>
