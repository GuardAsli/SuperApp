# GuardAsli — مستندات فنی

**نسخه:** `is0.0.1` · **توسعه‌دهنده:** AsliCode · **قالب:** `isMAJOR.MINOR.PATCH`

> محصول **GuardAsli** · توسعه‌دهنده **AsliCode** — هویت مرکزی ثابت و غیرقابل مذاکره است.

این سند مرجع فنی فارسی است. انگلیسی: [Docs.md](Docs.md). آموزش: [Learn.fa.md](Learn.fa.md).

<div dir="rtl">

---

## فهرست

1. [هویت و نسخه‌گذاری](#1-هویت-و-نسخه‌گذاری)
2. [نمای معماری](#2-نمای-معماری)
3. [نقش‌ها و مجوز](#3-نقش‌ها-و-مجوز)
4. [قابلیت‌ها و سهمیه](#4-قابلیت‌ها-و-سهمیه)
5. [کیف پول و دفتر کل](#5-کیف-پول-و-دفتر-کل)
6. [پرداخت](#6-پرداخت)
7. [سرورهای بالادستی](#7-سرورهای-بالادستی)
8. [کانال‌های تلگرام](#8-کانال‌های-تلگرام)
9. [API اچ‌تی‌تی‌پی](#9-api-اچ‌تی‌تی‌پی)
10. [ویزارد نصب و CLI](#10-ویزارد-نصب-و-cli)
11. [محیط و اسرار](#11-محیط-و-اسرار)
12. [تست و کیفیت](#12-تست-و-کیفیت)
13. [مستندات مرتبط](#13-مستندات-مرتبط)

---

## ۱. هویت و نسخه‌گذاری

منبع حقیقت: `src/core/identity.ts` و `src/core/version.ts`.

| ثابت | مقدار |
|---|---|
| محصول | `GuardAsli` |
| توسعه‌دهنده | `AsliCode` |
| قالب نسخه | `isMAJOR.MINOR.PATCH` |
| انتشار اولیه | `is0.0.1` برای هر ۱۲ جزء |

اجزا: `core`، `api`، `web`، `bot`، `miniapp`، `mainapp`، `dedicated`، `installer`، `payment`، `providers`، `build`، `releases`.

توابع کمکی: `parseVersion`، `compareVersions`، `isCompatible` (major یکسان لازم است)، `bumpVersion`.

هیچ جدول شخصی‌سازی نباید این نام‌ها را ذخیره یا override کند.

---

## ۲. نمای معماری

دو لایه صریح:

**Core (ثابت)**  
هویت، RBAC، ledger، قیمت‌گذاری، امنیت، احراز هویت مرکزی، کیف پول، قراردادهای provider/payment، حسابرسی، HTTP API. کد در `src/core/` و `src/convex/`.

**سفارشی‌سازی (کاملاً برندپذیر)**  
برندینگ هر مشتری، دارایی‌ها، متن‌های UI، پیکربندی بات، اپ اختصاصی، دامنه سفارشی. از جداول + `src/web/branding.ts`.

جزئیات کامل: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

ساختار مخزن:

```
src/
  core/       موتورها (identity، ledger، rbac، payments، providers، …)
  convex/     بک‌اند: schema، auth، wallet، billing، jobs، http
  web/        Landing، Auth، Dashboard، Mini App، branding
tests/        تست واحد و یکپارچه (bun test)
scripts/      CLI / ویزارد نصب guardasli
docs/         معماری، API، برندینگ، حسابرسی
```

---

## ۳. نقش‌ها و مجوز

پنج نقش؛ اعمال **فقط** سمت سرور:

| نقش | محدوده |
|---|---|
| `super_admin` | کل پلتفرم |
| `admin` | مدیریت مشتری |
| `reseller` | درخت خود + زیرریسلرها |
| `sub_reseller` | زیردرخت خود |
| `user` | خریدها و کیف پول خود |

دسترسی cross-tenant با `requireTenantScope` و پیمایش درخت مالکیت مسدود می‌شود.

---

## ۴. قابلیت‌ها و سهمیه

هجده کلید قابلیت. هر درخواست از زنجیره شش‌مرحله‌ای عبور می‌کند:

1. سوئیچ سراسری  
2. اجازه پلن  
3. مجوز نقش  
4. فعال‌سازی مشتری  
5. مالکیت  
6. سهمیه باقی‌مانده  

قیمت ارسالی کلاینت هرگز پذیرفته نمی‌شود؛ قیمت فقط سمت سرور محاسبه می‌شود.

---

## ۵. کیف پول و دفتر کل

دفتر کل فقط‌الحاقی: هر تغییر موجودی یک ردیف شماره‌دار و تکرارناپذیر است.

- بدون تغییر بی‌صدا  
- تکرار همان کلید idempotency اثر دوبرابر ندارد  
- ردپای حسابرسی برای هر credit/debit  

پیاده‌سازی: `src/convex/wallet.ts` + `src/core/ledger.ts`.

---

## ۶. پرداخت

| کانال | رفتار |
|---|---|
| شارژ دستی ادمین | نوشتن مستقیم در ledger با audit |
| کارت‌به‌کارت | حداکثر ۱۰ کارت؛ تأیید / رد / تقلب |
| CubePay | callback → job تأیید → شارژ |
| Tetraminator | webhook → job تأیید → شارژ |

**قاعده:** وب‌هوک پرداخت هرگز مستقیم کیف را شارژ نمی‌کند. فقط job با نام `payment_verify` ساخته می‌شود. شارژ فقط بعد از تأیید آداپتور (وضعیت، شناسه پرداخت، مبلغ) از مسیر `acceptProviderPayment` با کلید idempotency انجام می‌شود (ضد-replay).

آداپتورها: `src/core/payments/cubepay.ts`، `src/core/payments/tetraminator.ts`.

---

## ۷. سرورهای بالادستی

آداپتورهای سرور با تشخیص واقعی قابلیت:

- 3X-UI  
- Sanaei  
- PasarGuard  
- Rebecca  

قراردادها و تشخیص در `src/core/providers/`.

---

## ۸. کانال‌های تلگرام

| سطح | امنیت |
|---|---|
| وب‌هوک بات | `webhookSecret` اختصاصی هر مشتری در هدر `X-Telegram-Bot-Api-Secret-Token` |
| مینی‌اپ | تأیید HMAC روی `initData` تلگرام |

توکن بات و کلید پرداخت با AES-256-GCM رمزنگاری می‌شوند.

---

## ۹. API اچ‌تی‌تی‌پی

پایه: `/api/v1`.

قالب خطای یکسان:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "پیام کوتاه و قابل اقدام",
  "details": {},
  "requestId": "ga_..."
}
```

مسیرهای کلیدی: `ping`، `version`، `openapi.json`، وب‌هوک تلگرام، callback پرداخت.

مرجع کامل: [docs/API.md](docs/API.md).

---

## ۱۰. ویزارد نصب و CLI

**نصب با یک دستور:**

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli && sh ./scripts/cli.mjs install
```

دستورهای CLI:

| دستور | عمل |
|---|---|
| `install` | بررسی سیستم + وابستگی‌ها + ساخت env |
| `doctor` | OS، رم، دیسک، پورت‌ها، شبکه |
| `reconfigure` | دامنه اصلی + ادمین اولیه |
| `backup` | پشتیبان رمزنگاری‌شده |
| `status` | نسخه `is0.0.1` + مسیر نصب |
| `update` | به‌روزرسانی اجزا (داده و پیکربندی حفظ می‌شود) |
| `logs` | نمایش لاگ‌ها |
| *(بدون آرگومان)* | منوی تعاملی |

اسکریپت: `scripts/cli.mjs`. مسیر پیش‌فرض نصب: `/opt/guardasli`.

---

## ۱۱. محیط و اسرار

| متغیر | کاربرد |
|---|---|
| `GUARDASLI_MASTER_SECRET` | ماده کلید AES-256-GCM |
| `GUARDASLI_MAIN_DOMAIN` | دامنه اصلی پلتفرم (Core) |
| اطلاعات پرداخت | از پنل ادمین؛ رمزنگاری‌شده در ذخیره |

محافظت SSRF آدرس‌های خروجی را اعتبارسنجی می‌کند؛ رنج خصوصی و میزبان داخلی رد می‌شوند.

---

## ۱۲. تست و کیفیت

```bash
bun test        # ۳۶ تست واحد و یکپارچه
bun typecheck   # تایپ‌اسکریپت بدون خطا
bun run build   # باندل production در dist/
```

زنجیره اثبات هر قابلیت:

```
Frontend → API → Authorization → Business Logic → Database
→ External Provider → Background Jobs → Logs → Audit → Tests → Documentation
```

---

## ۱۳. مستندات مرتبط

| فایل | محتوا |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | لایه‌ها، جریان خرید، مدل امنیتی |
| [docs/API.md](docs/API.md) | مسیرها، کد خطا، امنیت وب‌هوک |
| [docs/BRANDING.md](docs/BRANDING.md) | فیلدهای قابل شخصی‌سازی + مرز Core |
| [docs/AUDIT.md](docs/AUDIT.md) | تاریخچه حسابرسی مخزن |
| [Learn.fa.md](Learn.fa.md) | آموزش گام‌به‌گام |
| [README.fa.md](README.fa.md) | نمای کلی محصول |

---

© AsliCode — GuardAsli `is0.0.1`

</div>
