<p align="center">
  <img src="public/logo.svg" alt="GuardAsli — AsliCode" width="480" />
</p>

<h1 align="center">GuardAsli</h1>

<p align="center">
  <b>نسخه:</b> <code>is0.0.1</code> ·
  <b>توسعه‌دهنده:</b> AsliCode
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="docs/ARCHITECTURE.md">معماری</a> ·
  <a href="docs/API.md">API</a> ·
  <a href="docs/SECURITY.md">امنیت</a> ·
  <a href="docs/RUNBOOK.md">اجرا</a>
</p>

---

<div dir="rtl">

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
| [راهنمای نصب](docs/DEPLOYMENT.md) | نصب مرحله‌به‌مرحله روی سرور |
| [معماری](docs/ARCHITECTURE.md) | ساختار لایه‌ها و مدل امنیتی |
| [API](docs/API.md) | مسیرها و کدهای خطا |
| [پرداخت‌ها](docs/PAYMENTS.md) | روش‌های پرداخت و امنیت وب‌هوک |
| [امنیت](docs/SECURITY.md) | رمزنگاری و نشست‌ها |
| [اجرا](docs/RUNBOOK.md) | بهره‌برداری روزانه |

---

© AsliCode — GuardAsli `is0.0.1`

</div>
