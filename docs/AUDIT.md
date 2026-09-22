# GuardAsli — گزارش حسابرسی کامل مخزن

تاریخ حسابرسی: 2026-09-22 · نسخه هدف: `is0.0.1` · قالب نسخه: `isMAJOR.MINOR.PATCH`

---

## ۱) ساختار پوشه‌ها و فایل‌ها

مخزن در زمان حسابرسی فقط شامل **یک فایل** است:

```
/README.md   → ۱۰ بایت، محتوا: "# SuperApp"
```

هیچ پوشه یا فایلی برای Backend، Frontend، Database، API، Auth، RBAC، Multi-tenancy، Providers، Servers، Users، Resellers، Plans، Features، Pricing، Wallet، Billing، Payments، Subscriptions، Telegram Bot، Telegram Mini App، Web App، Main App، Dedicated App، App Builder، Build System، Versioning، Domains، SSL، Installer، CLI، Monitoring، Background Jobs، Backup/Restore، Logs، Audit، Docs، Tests یا CI/CD وجود ندارد.

**نتیجه:** تمام اجزای بند ۵۱ باید از صفر پیاده‌سازی شوند.

## ۲) Git

| مورد | وضعیت |
|---|---|
| شاخه فعلی | `main` (تنها شاخه، همگام با `origin/main`) |
| کامیت‌ها | ۱ کامیت: `5e06d5a Initial commit` |
| تگ‌ها | هیچ |
| Release | هیچ |
| PR باز/بسته | هیچ |
| Working tree | تمیز، بدون تغییر commit‌نشده |
| Stash | خالی |
| Submodule | ندارد |
| Remote | `origin` — یک remote، بدون URL ثالث در کد |

## ۳) هویت ثالث

| مورد | وضعیت | اقدام لازم |
|---|---|---|
| `README.md` عنوان «SuperApp» | نام ناقص/قدیمی و مطابق هویت مرکزی نیست | بازنویسی به هویت GuardAsli / AsliCode |
| Package/author/copyright/URL ثالث | وجود ندارد | — |
| Docker/Nginx/systemd/cron ثالث | وجود ندارد | — |
| Environment prefix ثالث | وجود ندارد | — |
| Badge / CODEOWNERS / templates `.github` | وجود ندارد | — |

**نتیجه:** تنها اثر هویتی برای پاک‌سازی، عنوان README است. سایر قوانین «اصل عدم اشاره به هویت ثالث» باید در تمام فایل‌های جدید رعایت شوند (نام محصول GuardAsli، توسعه‌دهنده AsliCode، پیشوند نسخه `is`.

## ۴) نسخه‌گذاری

- هیچ فایل نسخه، تگ یا release وجود ندارد؛ انحراف از قالب `isMAJOR.MINOR.PATCH` فقط به‌صورت «عدم وجود» است.
- راه‌حل: سرویس نسخه مرکزی با قالب `isMAJOR.MINOR.PATCH` و انتشار اولیه `is0.0.1` برای Core، API، Web، Bot، Mini App، Main App، Dedicated Apps، Installer، Payment، Provider Adapters، Build System و Releases.

## ۵) جمع‌بندی شکاف‌ها (نقشه راه بند ۵۱)

همه موارد زیر غایب‌اند و باید پیاده‌سازی شوند:

1. **هسته:** Core identity، schema و database، Auth (password + refresh + session)، RBAC پنج‌نقشی سلسله‌مراتبی، Multi-tenancy با جداسازی صریح.
2. **تجارت:** Plans (Volume/User)، Features با زنجیره Global→Plan→Role→Tenant→Quota، Custom Purchase با قیمت سروری، Wallet با Ledger تغییرناپذیر، Billing و Subscriptions با تمام state ها.
3. **پرداخت:** Admin Manual Credit، Card-to-Card (حداکثر ۱۰ کارت + تایید/رد/رسید جعلی)، CubePay طبق مستندات رسمی (create/verify با authority)، Tetraminator با `/payment/inquiry/{pay_id}` و ضد-replay.
4. **پرووایژنینگ:** آداپتورهای 3X-UI، Sanaei، PasarGuard، Rebecca با capability detection واقعی و گزارش صریح unsupported.
5. **کانال‌ها:** Telegram Bot با webhook و محافظت از token، Telegram Mini App با احراز هویت `initData` HMAC-SHA256، Web App نقش‌محور با تم/برندینگ tenant.
6. **اپ‌ها:** Main App، Dedicated App در موارد مجاز، App Builder با صف build، وضعیت‌ها، artifacts و checksum؛ بدون ادعای iOS بدون زیرساخت macOS.
7. **زیرساخت:** Versioning و updates مستقل، Domain/SSL wildcard، Installer/CLI با نام `guardasli`، Monitoring، Background Jobs با backoff، Backup/Restore رمزنگاری‌شده، Audit Logging، Reports.
8. **API و امنیت:** `/api/v1` با OpenAPI 3.1، فرمت خطای استاندارد `code/message/details/requestId`، API Keys، rate limiting، SSRF/XSS/CSRF protections، secret redaction.
9. **کیفیت:** تست‌های Unit/Integration/RBAC/Tenant Isolation/Payment/Wallet/Ledger/Provider/Security، مستندات واقعی، production validation.
