# معماری GuardAsli

## دو لایه صریح

### لایه Core (غیرقابل شخصی‌سازی)

- موتور اصلی: `src/core/` — هویت، نسخه‌گذاری، RBAC، ledger، pricing، امنیت
- Authentication مرکزی: `src/convex/auth.ts` و `authActions.ts`
- Wallet engine و Ledger تغییرناپذیر: `src/convex/wallet.ts`
- قراردادهای provider و payment: `src/core/providers/` و `src/core/payments/`
- Build orchestration و versioning
- Audit core: `src/convex/audit.ts`
- هویت بصری در نقاط مرکزی: `GUARDASLI` در `src/core/identity.ts`

### لایه سفارشی‌سازی (کاملاً قابل شخصی‌سازی)

- برندینگ هر tenant: جدول `branding` + `src/web/branding.ts` (API پایدار)
- تم، فونت، لوگو، آیکون: `assets` و `uiTexts`
- Telegram Bot هر tenant: `botConfigs` — نام، username، avatar، پیام‌ها
- App Builder هر tenant: `appCustomizations`
- دامنه سفارشی: `customDomains`
- متن‌های UI: `uiTexts`

**قاعده:** هیچ کد tenant-specific در Core نیست؛ Core هیچ برند tenant را hardcode نمی‌کند.
تمام شخصی‌سازی از طریق جداول/API های برندینگ انجام می‌شود و در Audit ثبت می‌گردد.

## اجزا و نسخه‌ها

هر جزء نسخه مستقل با فرمت `isMAJOR.MINOR.PATCH` دارد:
Core، API، Web، Bot، Mini App، Main App، Dedicated، Installer، Payment، Providers، Build، Releases.

به‌روزرسانی هر جزء نباید سایر اجزا را بازنویسی کند؛ سازگاری با تطابق major بررسی می‌شود
(`isCompatible` در `src/core/version.ts`).

## جریان خرید (بند ۲۳)

```
انتخاب محصول
→ محاسبه قیمت سمت سرور
→ بررسی مجوزها (زنجیره شش‌حلقه‌ای Feature)
→ بررسی سقف‌ها
→ بررسی Wallet
→ دبیت اتمی Ledger (idempotent)
→ ایجاد Purchase/Subscription (created)
→ پرووایژنینگ provider (صف با backoff)
→ فعال‌سازی فقط پس از پرووایژنینگ موفق
```

شکست پرووایژنینگ هرگز موفقیت کاذب گزارش نمی‌کند؛ job با exponential backoff تکرار
می‌شود تا سقف تلاش، سپس `dead`.

## امنیت

- scrypt + salt برای رمزها؛ هیچ plaintext ذخیره نمی‌شود
- AES-256-GCM برای bot tokens و credentials پرداخت
- SSRF guard روی همه فراخوانی‌های خروجی
- مرز tenant: `requireTenantScope` با پیمایش درخت مالکیت
- فرمت خطای استاندارد `code/message/details/requestId` بدون stack trace
- secret redaction در لاگ‌ها
