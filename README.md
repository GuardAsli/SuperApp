<p align="center">
  <img src="public/logo.svg" alt="GuardAsli — AsliCode" width="520" />
</p>

<h1 align="center">GuardAsli</h1>

<p align="center">
  <b>نسخه:</b> <code>is0.0.1</code> ·
  <b>توسعه‌دهنده:</b> AsliCode ·
  <b>قالب نسخه:</b> <code>isMAJOR.MINOR.PATCH</code>
</p>

<p align="center">
  <a href="#english">English</a> ·
  <a href="#فارسی">فارسی</a> ·
  <a href="docs/ARCHITECTURE.md">معماری / Architecture</a> ·
  <a href="docs/API.md">API</a> ·
  <a href="docs/BRANDING.md">برندینگ / Branding</a> ·
  <a href="docs/AUDIT.md">حسابرسی / Audit</a>
</p>

---

## English

**GuardAsli** is a control-plane for selling and operating proxy/VPN services, built by
**AsliCode**. A single backend (Convex) powers a web dashboard, a Telegram bot, a Telegram
Mini App and tenant-branded apps — with reseller hierarchies, an append-only wallet
ledger, four payment channels and four upstream server providers.

### What GuardAsli does

| Area | Detail |
|---|---|
| Identity | Fixed core identity: product **GuardAsli**, developer **AsliCode**, version format `isMAJOR.MINOR.PATCH` |
| Roles | 5 roles — `super_admin`, `admin`, `reseller`, `sub_reseller`, `user` — enforced server-side only |
| Features | 18 feature keys, each gated by a 6-check chain: global → plan → role → tenant → ownership → quota |
| Pricing | All quotes computed server-side; client-sent prices are never trusted |
| Wallet | Append-only ledger: every balance change is a numbered, idempotent entry |
| Payments | Admin manual credit · card-to-card (max 10 cards, approve / reject / fraud) · CubePay · Tetraminator (verify + anti-replay) |
| Webhooks | Payment callbacks never credit a wallet directly — they enqueue a verification job |
| Providers | 3X-UI, Sanaei, PasarGuard and Rebecca adapters with real capability detection |
| Channels | Telegram bot webhook (secret-token protected) and Mini App with HMAC-verified `initData` |
| API | `/api/v1` with an OpenAPI 3.1 spec and one error shape: `code` / `message` / `details` / `requestId` |
| Ops | Installer and CLI named `guardasli`, background jobs with backoff, audit log, health checks, backups, full management panel |

Every tenant, reseller and sub-reseller gets full white-label branding — logo, colors,
domain, Telegram bot, apps and UI texts. The core identity (`GuardAsli` / `AsliCode`)
is architecturally separate and cannot be renamed or hidden by any tenant role.

### Requirements

- [Bun](https://bun.sh) ≥ 1.2
- A Convex account (free tier is enough to start)

### Quick install

```bash
# 1 — clone and install dependencies
git clone <repository-url> guardasli && cd guardasli
bun install

# 2 — link Convex and push the database schema (one-time)
bun convex dev --once

# 3 — run the dev server (binds 0.0.0.0:$PORT)
bun dev

# 4 — verify the installation
bun test        # 36 unit + integration tests
bun typecheck   # TypeScript, zero errors
bun run build   # production bundle in dist/
```

The first run of `bun convex dev --once` asks you to log in to Convex and creates the
project. All database tables, indexes and background jobs are created from
`src/convex/schema.ts` automatically.

### First admin

Create the first `super_admin` once, from the project root:

```bash
bunx convex run authActions:bootstrapAdminAction '{"username":"admin","password":"<strong-password>"}'
```

Then open the dashboard, sign in, and create tenants, resellers, plans and payment
methods from the admin UI.

### Production

```bash
bun run build     # static frontend in dist/
bun convex deploy # backend + HTTP API
```

Serve `dist/` behind any static host or reverse proxy; the backend endpoints
(`/api/v1/*`) come from the deployed Convex functions. Required environment
variables: `GUARDASLI_MASTER_SECRET` (AES-256-GCM key material), plus each
payment provider's credentials, set through the admin panel.

### The `guardasli` CLI

```bash
bash scripts/guardasli.sh install   # full install: doctor + deps + source + build + service
bash scripts/guardasli.sh panel     # interactive management panel
bash scripts/guardasli.sh status    # version is0.0.1 + install path
bash scripts/guardasli.sh doctor    # OS, RAM, disk, ports, network checks
bash scripts/guardasli.sh ssl       # TLS certificate (ACME or self-signed bootstrap)
bash scripts/guardasli.sh backup    # env + ssl + database export
```

All CLI output is English-only and safe to run over SSH.
### Documentation

| Document | Contents |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Core vs. customization layers, purchase flow, security model |
| [API](docs/API.md) | Endpoints, error codes, webhook security, OpenAPI spec |
| [Branding](docs/BRANDING.md) | Every customizable tenant field — and the fixed core boundary |
| [Audit](docs/AUDIT.md) | Repository audit history |

### License

Proprietary software of **AsliCode**. All rights reserved.

---

## فارسی

<div dir="rtl">

**GuardAsli** یک کنترل‌پلن برای فروش و بهره‌برداری از سرویس‌های پروکسی/VPN است،
ساخته‌ی **AsliCode**. یک بک‌اند واحد (Convex) چهار رابط را تغذیه می‌کند: داشبورد وب،
بات تلگرام، مینی‌اپ تلگرام و اپ‌های برند هر مشتری — به‌همراه سلسله‌مراتب ریسلرها،
دفتر کل تغییرناپذیر کیف پول، چهار کانال پرداخت و چهار نوع سرور بالادستی.

### قابلیت‌ها

| حوزه | توضیح |
|---|---|
| هویت | هویت مرکزی ثابت: محصول **GuardAsli**، توسعه‌دهنده **AsliCode**، قالب نسخه `isMAJOR.MINOR.PATCH` |
| نقش‌ها | ۵ نقش — `super_admin`، `admin`، `reseller`، `sub_reseller`، `user` — اعمال فقط سمت سرور |
| قابلیت‌ها | ۱۸ کلید قابلیت با زنجیره‌ی ۶مرحله‌ای: سراسری → پلن → نقش → مشتری → مالکیت → سهمیه |
| قیمت‌گذاری | محاسبه قیمت فقط سمت سرور؛ قیمتی که کلاینت می‌فرستد هرگز پذیرفته نمی‌شود |
| کیف پول | دفتر کل فقط‌الحاقی: هر تغییر موجودی یک ردیف شماره‌دار و تکرارناپذیر |
| پرداخت | شارژ دستی ادمین · کارت‌به‌کارت (حداکثر ۱۰ کارت، تأیید/رد/تشخیص تقلب) · CubePay · Tetraminator با تأیید و ضد-replay |
| وب‌هوک‌ها | پیام پرداخت هرگز مستقیم کیف را شارژ نمی‌کند — فقط در صف تأیید قرار می‌گیرد |
| سرورها | آداپتور 3X-UI، Sanaei، PasarGuard و Rebecca با تشخیص واقعی قابلیت‌ها |
| کانال‌ها | بات تلگرام با توکن محافظت‌شده + مینی‌اپ با تأیید HMAC روی `initData` |
| API | مسیر `/api/v1` با مشخصات OpenAPI 3.1 و قالب خطای یکسان `code` / `message` / `details` / `requestId` |
| بهره‌برداری | نصب‌کننده و CLI با نام `guardasli`، کارهای پس‌زمینه با تلاش مجدد، لاگ حسابرسی، بررسی سلامت، پشتیبان‌گیری و پنل مدیریت کامل |

هر مشتری، ریسلر و زیرریسلر برند کامل خودش را دارد — لوگو، رنگ‌ها، دامنه، بات تلگرام،
اپ‌ها و متن‌های رابط. هویت مرکزی (`GuardAsli` / `AsliCode`) به‌صورت معماری جداست و
هیچ نقشی نمی‌تواند آن را تغییر نام دهد یا پنهان کند.

### پیش‌نیازها

- [Bun](https://bun.sh) نسخه ۱.۲ یا بالاتر
- یک حساب Convex (پلن رایگان برای شروع کافی است)

### نصب سریع

```bash
# ۱ — کلون و نصب وابستگی‌ها
git clone <repository-url> guardasli && cd guardasli
bun install

# ۲ — اتصال Convex و اعمال اسکیمای پایگاه داده (یک‌بار)
bun convex dev --once

# ۳ — اجرای سرور توسعه (روی 0.0.0.0:$PORT)
bun dev

# ۴ — راستی‌آزمایی نصب
bun test        # ۳۶ تست واحد و یکپارچه
bun typecheck   # تایپ‌اسکریپت، بدون خطا
bun run build   # خروجی production در dist/
```

اولین اجرای `bun convex dev --once` وارد حساب Convex می‌شود و پروژه را می‌سازد.
همه جداول، ایندکس‌ها و کارهای پس‌زمینه از `src/convex/schema.ts` به‌طور خودکار
ایجاد می‌شوند.

### ادمین اول

اولین `super_admin` را یک‌بار از ریشه پروژه بسازید:

```bash
bunx convex run authActions:bootstrapAdminAction '{"username":"admin","password":"<رمز-قوی>"}'
```

سپس داشبورد را باز کنید، وارد شوید و از پنل ادمین مشتریان، ریسلرها، پلن‌ها و
روش‌های پرداخت را بسازید.

### محیط production

```bash
bun run build     # فرانت‌اند استاتیک در dist/
bun convex deploy # بک‌اند + HTTP API
```

پوشه `dist/` را پشت هر هاست استاتیک یا ریورس‌پروکسی سرو کنید؛ مسیرهای
`/api/v1/*` از توابع Convex منتشرشده می‌آیند. متغیرهای محیطی لازم:
`GUARDASLI_MASTER_SECRET` (ماده کلید AES-256-GCM) به‌همراه اطلاعات پرداخت
هر سرویس — همه از پنل ادمین تنظیم می‌شوند.

### خط فرمان `guardasli`

```bash
bash scripts/guardasli.sh install   # نصب کامل: بررسی سیستم + وابستگی‌ها + سورس + بیلد + سرویس
bash scripts/guardasli.sh panel     # پنل مدیریت تعاملی
bash scripts/guardasli.sh status    # نسخه is0.0.1 و مسیر نصب
bash scripts/guardasli.sh doctor    # بررسی OS، رم، دیسک، پورت‌ها، شبکه
bash scripts/guardasli.sh ssl       # گواهی TLS (ACME یا self-signed)
bash scripts/guardasli.sh backup    # env + ssl + خروجی پایگاه داده
```

خروجی CLI فقط انگلیسی است و برای اجرا از طریق SSH مناسب است.
### مستندات

| سند | محتوا |
|---|---|
| [معماری](docs/ARCHITECTURE.md) | لایه Core در برابر لایه سفارشی‌سازی، جریان خرید، مدل امنیتی |
| [API](docs/API.md) | مسیرها، کدهای خطا، امنیت وب‌هوک، مشخصات OpenAPI |
| [برندینگ](docs/BRANDING.md) | هر فیلد قابل شخصی‌سازی مشتری — و مرز ثابت Core |
| [حسابرسی](docs/AUDIT.md) | تاریخچه بررسی مخزن |

### مجوز

نرم‌افزار مالکیتی **AsliCode**. تمام حقوق محفوظ است.

</div>
