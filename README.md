<p align="center">
  <img src="public/logo.svg" alt="GuardAsli — AsliCode" width="520" />
</p>

<h1 align="center">GuardAsli</h1>

<p align="center">
  <b>نسخه:</b> <code>is0.0.1</code> ·
  <b>توسعه‌دهنده:</b> AsliCode ·
  <b>قالب نسخه:</b> <code>isMAJOR.MINOR.PATCH</code>
</p>

---

<div dir="rtl">

## فارسی

**GuardAsli** یک پنل مدیریت برای فروش سرویس پروکسی/VPN است، ساخته‌ی **AsliCode**.
یک بک‌اند، چهار رابط را تغذیه می‌کند: داشبورد وب، ربات تلگرام، مینی‌اپ و اپ‌های برند مشتری.

### چه کارهایی می‌کند؟

| بخش | توضیح |
|---|---|
| نقش‌ها | ۵ نقش — دسترسی‌ها سمت سرور کنترل می‌شود |
| کیف پول | هر تغییر موجودی ثبت می‌شود؛ شارژ تکراری ممکن نیست |
| پرداخت | شارژ دستی، کارت به کارت، CubePay، Tetraminator |
| سرورها | اتصال به ۴ نوع پنل با تشخیص خودکار قابلیت‌ها |
| ربات | ربات تلگرام + مینی‌اپ با احراز هویت امن |
| برند | هر مشتری اسم و رنگ و دامنه‌ی خودش را دارد |
| API | مسیر `/api/v1` با مشخصات OpenAPI |

### نصب روی سرور (دو دستور ساده)

پیش‌نیاز: یک سرور Ubuntu/Debian تازه و دسترسی root. همین!

```bash
# ۱ — کد را بگیرید
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli

# ۲ — نصب‌کننده را اجرا کنید؛ از شما می‌پرسد و همه‌چیز را خودش انجام می‌دهد
sudo bash install.sh
```

همین! نصب‌کننده خودش:

- bun و بسته‌های لازم را نصب می‌کند
- رمزها و تنظیمات را می‌سازد
- برنامه را build و راه می‌اندازد
- Nginx و SSL را تنظیم می‌کند
- دستور `guardasli` را نصب می‌کند و **پنل مدیریت را باز می‌کند**

اگر دامنه دارید، مستقیم بدهید تا SSL هم خودکار فعال شود:

```bash
sudo bash install.sh --domain panel.example.com --email you@example.com
```

در پایان، آدرس پنل و رمز ادمین را نشان می‌دهد.

### مدیریت سرور بعد از نصب

```bash
sudo guardasli panel     # پنل مدیریت — همه‌چیز از همین‌جا
sudo guardasli status    # وضعیت نصب
sudo guardasli doctor    # بررسی سلامت سرور
sudo guardasli backup    # پشتیبان‌گیری
```

پنل ۱۸ گزینه دارد: نصب کامل، دامنه، SSL، ربات تلگرام، ساخت ادمین،
روشن/خاموش کردن سرویس، آپدیت، تعمیر، پشتیبان و بازیابی، لاگ‌ها،
deploy بک‌اند، نمایش رمز ادمین و…

### اجرا برای تست (روی سیستم خودتان)

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli
bun install          # اگر bun ندارید: curl -fsSL https://bun.sh/install | bash
bun run dev          # http://localhost:5173
```

برای اتصال به دیتابیس یک‌بار:

```bash
bun convex dev --once
```

### ادمین اول

نصب‌کننده خودش ادمین می‌سازد و رمز را نشان می‌دهد. اگر خواستید دستی بسازید:

```bash
bunx convex run authActions:bootstrapAdminAction '{"username":"admin","password":"<رمز-قوی>"}'
```

### مستندات بیشتر

| سند | محتوا |
|---|---|
| [معماری](docs/ARCHITECTURE.md) | ساختار لایه‌ها و مدل امنیتی |
| [API](docs/API.md) | مسیرها و کدهای خطا |
| [پرداخت‌ها](docs/PAYMENTS.md) | روش‌های پرداخت و امنیت وب‌هوک |
| [امنیت](docs/SECURITY.md) | رمزنگاری و نشست‌ها |
| [اجرا](docs/RUNBOOK.md) | بهره‌برداری روزانه |

### مجوز

نرم‌افزار مالکیتی **AsliCode**. تمام حقوق محفوظ است.

</div>

---

## English

**GuardAsli** is a control-plane for selling and operating proxy/VPN services, built by
**AsliCode**. One backend powers four interfaces: web dashboard, Telegram bot,
Telegram Mini App and tenant-branded apps.

### What it does

| Area | Detail |
|---|---|
| Roles | 5 roles, enforced server-side |
| Wallet | Every balance change is recorded; no double credit |
| Payments | Manual credit, card-to-card, CubePay, Tetraminator |
| Servers | Connects to 4 panel types with capability detection |
| Bot | Telegram bot + Mini App with secure auth |
| Branding | Each tenant gets its own name, colors and domain |
| API | `/api/v1` with an OpenAPI spec |

### Install on a server (two simple commands)

Requirement: a fresh Ubuntu/Debian server with root access. That's it.

```bash
# 1 — get the code
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli

# 2 — run the installer; it asks a few questions and does everything else
sudo bash install.sh
```

Done! The installer handles everything itself:

- installs bun and required packages
- creates secrets and configuration
- builds and starts the app
- sets up Nginx and SSL
- installs the `guardasli` command and **opens the management panel**

Have a domain? Pass it directly and SSL is issued automatically:

```bash
sudo bash install.sh --domain panel.example.com --email you@example.com
```

At the end it prints the panel URL and the admin password.

### Managing the server afterwards

```bash
sudo guardasli panel     # management panel — everything from here
sudo guardasli status    # install status
sudo guardasli doctor    # server health checks
sudo guardasli backup    # backup
```

The panel has 18 options: full install, domain, SSL, Telegram bot, admin creation,
start/stop service, update, repair, backup & restore, logs, backend deploy,
admin credentials and more.

### Run locally for testing

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli
bun install          # no bun? curl -fsSL https://bun.sh/install | bash
bun run dev          # http://localhost:5173
```

To connect the database once:

```bash
bun convex dev --once
```

### Health check

```bash
bun test        # 82 tests
bun typecheck   # zero errors
bun run build   # production bundle in dist/
```

### First admin

The installer creates the admin and prints the password. To create it manually:

```bash
bunx convex run authActions:bootstrapAdminAction '{"username":"admin","password":"<strong-password>"}'
```

### More docs

| Document | Contents |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Layers and security model |
| [API](docs/API.md) | Endpoints and error codes |
| [Payments](docs/PAYMENTS.md) | Payment methods and webhook security |
| [Security](docs/SECURITY.md) | Crypto and sessions |
| [Runbook](docs/RUNBOOK.md) | Day-to-day operations |

### License

Proprietary software of **AsliCode**. All rights reserved.
