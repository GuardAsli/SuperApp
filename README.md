# GuardAsli

پلتفرم کنترل چندمستأجری (Multi-tenant Control-Plane) توسط **AsliCode**

نسخه اولیه: **is0.0.1** — فرمت نسخه‌گذاری: `isMAJOR.MINOR.PATCH`

---

## معرفی

GuardAsli یک پلتفرم مدیریتی ماژولار است که کل زنجیره فروش، پرووایژنینگ و مدیریت را پوشش می‌دهد:

- **Core** — احراز هویت مرکزی، RBAC، tenant resolution، wallet/ledger، قراردادها و versioning
- **API** — `/api/v1` با فرمت خطای استاندارد و OpenAPI 3.1
- **Web App** — داشبورد نقش‌محور با برندینگ قابل شخصی‌سازی هر tenant
- **Telegram Bot / Mini App** — فروش و مدیریت با webhook امن و احراز هویت initData
- **App Builder** — ساخت اپ اختصاصی با صف build، وضعیت‌ها و artifacts
- **Payments** — شارژ ادمین، کارت به کارت، CubePay و Tetraminator
- **Providers** — آداپتورهای 3X-UI، Sanaei، PasarGuard و Rebecca

## معماری دو لایه

| لایه | قابلیت شخصی‌سازی |
|---|---|
| **Core** | غیرقابل تغییر — نام GuardAsli، توسعه‌دهنده AsliCode، فرمت isMAJOR.MINOR.PATCH |
| **Tenant** | کاملاً قابل شخصی‌سازی — برندینگ، رنگ‌ها، دامنه، بات، اپ، متن‌ها |

## شروع سریع

```bash
bun install
bun dev          # اجرای توسعه
bun test         # تست‌ها
bun typecheck    # بررسی تایپ
bun convex dev --once  # کدogen و push اسکیما
```

### ساخت ادمین اولیه (bootstrap)

پس از راه‌اندازی Convex، اکشن `authActions.bootstrapAdminAction` را با
نام کاربری و رمز دلخواه اجرا کنید — فقط یک‌بار و idempotent.

## CLI سرور

```bash
guardasli            # منوی کامل
guardasli status
guardasli doctor
guardasli backup
```

جزئیات: `scripts/cli.mjs`

## مستندات

- [گزارش حسابرسی مخزن](docs/AUDIT.md)
- [معماری](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [راهنمای برندینگ و شخصی‌سازی](docs/BRANDING.md)

## امنیت

- رمز عبور: scrypt با salt تصادفی
- نشست: rotation با refresh token
- Secrets: رمزنگاری AES-256-GCM
- مجوزها: اعمال کامل سمت سرور (بند ۵)
- SSRF/XSS/CSRF protections و rate limiting
