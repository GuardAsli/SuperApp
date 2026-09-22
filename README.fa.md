<p align="center">
  <img src="public/logo.svg" alt="GuardAsli — AsliCode" width="520" />
</p>

<h1 align="center">GuardAsli</h1>

<p align="center">
  <b>نسخه:</b> <code>is0.0.1</code> ·
  <b>توسعه‌دهنده:</b> AsliCode ·
  <b>قالب:</b> <code>isMAJOR.MINOR.PATCH</code>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="Docs.fa.md">مستندات</a> ·
  <a href="Learn.fa.md">آموزش</a> ·
  <a href="docs/ARCHITECTURE.md">معماری</a> ·
  <a href="docs/API.md">API</a> ·
  <a href="docs/BRANDING.md">برندینگ</a>
</p>

---

<div dir="rtl">

**GuardAsli** کنترل‌پلن فروش و بهره‌برداری از سرویس‌های پروکسی/VPN است — ساخته‌ی **AsliCode**.

یک بک‌اند واحد داشبورد وب، بات تلگرام، مینی‌اپ تلگرام و اپ‌های برند هر مشتری را تغذیه می‌کند؛ همراه با سلسله‌مراتب ریسلر، دفتر کل تغییرناپذیر کیف پول، چهار کانال پرداخت و چهار سرور بالادستی.

| فیلد | مقدار |
|---|---|
| محصول | **GuardAsli** |
| توسعه‌دهنده | **AsliCode** |
| قالب نسخه | `isMAJOR.MINOR.PATCH` |
| انتشار فعلی | `is0.0.1` |

هویت مرکزی ثابت است. هیچ نقش یا مشتری نمی‌تواند آن را تغییر نام دهد یا پنهان کند.

## نصب ویزارد — یک دستور

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli && sh ./scripts/cli.mjs install
```

این دستور **ویزارد guardasli** را اجرا می‌کند: بررسی سیستم → نصب وابستگی‌ها → ساخت محیط.

بعد از نصب:

```bash
sh ./scripts/cli.mjs doctor       # بررسی سلامت
sh ./scripts/cli.mjs reconfigure  # دامنه اصلی + ادمین
sh ./scripts/cli.mjs status       # نسخه و مسیر
bun convex dev --once && bun dev # اتصال Convex + اجرا
```

## شروع سریع دستی

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli
bun install
bun convex dev --once
bun dev
```

ساخت اولین super admin:

```bash
bunx convex run authActions:bootstrapAdminAction '{"username":"admin","password":"<رمز-قوی>"}'
```

## قابلیت‌ها

| حوزه | توضیح |
|---|---|
| نقش‌ها | `super_admin`، `admin`، `reseller`، `sub_reseller`، `user` — فقط سمت سرور |
| قابلیت‌ها | ۱۸ کلید با زنجیره ۶مرحله‌ای: سراسری → پلن → نقش → مشتری → مالکیت → سهمیه |
| کیف پول | دفتر کل فقط‌الحاقی شماره‌دار و تکرارناپذیر |
| پرداخت | شارژ دستی · کارت‌به‌کارت · CubePay · Tetraminator (ضد-replay) |
| سرورها | 3X-UI، Sanaei، PasarGuard، Rebecca |
| کانال‌ها | بات تلگرام (توکن مخفی) + مینی‌اپ (HMAC روی `initData`) |
| API | `/api/v1` · OpenAPI 3.1 · خطای یکسان |
| بهره‌برداری | ویزارد CLI، کارهای پس‌زمینه، لاگ حسابرسی، پشتیبان |

## محیط production

```bash
bun run build
bun convex deploy
```

`GUARDASLI_MASTER_SECRET` و اطلاعات پرداخت را از پنل ادمین تنظیم کنید.

## مستندات

| سند | کاربرد |
|---|---|
| [README.md](README.md) | نمای کلی انگلیسی |
| [Docs.fa.md](Docs.fa.md) | مرجع فنی فارسی |
| [Docs.md](Docs.md) | مرجع فنی انگلیسی |
| [Learn.fa.md](Learn.fa.md) | آموزش گام‌به‌گام فارسی |
| [Learn.md](Learn.md) | آموزش گام‌به‌گام انگلیسی |
| [معماری](docs/ARCHITECTURE.md) | لایه Core، جریان خرید، امنیت |
| [API](docs/API.md) | مسیرها، خطاها، وب‌هوک |
| [برندینگ](docs/BRANDING.md) | فیلدهای مشتری و مرز Core |
| [حسابرسی](docs/AUDIT.md) | تاریخچه بررسی مخزن |

## مجوز

نرم‌افزار مالکیتی **AsliCode**. تمام حقوق محفوظ است.

</div>
