# GuardAsli — آموزش

**نسخه:** `is0.0.1` · **توسعه‌دهنده:** AsliCode · **قالب:** `isMAJOR.MINOR.PATCH`

راهنمای گام‌به‌گام نصب، پیکربندی و بهره‌برداری از **GuardAsli** ساخته‌ی **AsliCode**.

نسخه انگلیسی: [Learn.md](Learn.md) · مرجع فنی: [Docs.fa.md](Docs.fa.md).

<div dir="rtl">

---

## ۱. نصب روی سرور (دو دستور)

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli
sudo bash install.sh
```

نصب‌کننده دامنه و ایمیل را می‌پرسد و بقیه‌اش خودش انجام می‌دهد:
نصب bun و بسته‌ها، ساخت رمزها، build برنامه، تنظیم Nginx و SSL،
راه‌اندازی سرویس، نصب دستور `guardasli` و باز شدن پنل مدیریت.

با دامنه (SSL خودکار):

```bash
sudo bash install.sh --domain panel.example.com --email you@example.com
```

در پایان آدرس پنل و رمز ادمین را نشان می‌دهد. ذخیره‌شان کنید.

راستی‌آزمایی:

```bash
sudo guardasli status
sudo guardasli doctor
```

---

## ۲. اتصال Convex و اجرای توسعه

```bash
cd guardasli   # اگر هنوز آنجا نیستید
bun install
bun convex dev --once   # یک‌بار ورود؛ ساخت پروژه و اسکیما
bun dev                 # فرانت روی 0.0.0.0:$PORT (پیش‌فرض ۵۱۷۳)
```

آدرس نشان‌داده‌شده در ترمینال را باز کنید. باید صفحه فرود GuardAsli را ببینید.

---

## ۳. ساخت اولین super admin

از ریشه پروژه:

```bash
bunx convex run authActions:bootstrapAdminAction '{"username":"admin","password":"یک-رمز-قوی"}'
```

سپس اپ را باز کنید → **ورود / ثبت‌نام** (یا `#auth`) → با همان نام کاربری و رمز وارد شوید.

---

## ۴. پیکربندی پلتفرم (ویزارد)

```bash
bash scripts/guardasli.sh reconfigure
```

دامنه اصلی پلتفرم (دامنه هویت Core) را تنظیم کنید. دامنه‌های سفارشی مشتریان بعداً از پنل ادمین مدیریت می‌شوند و نمی‌توانند دامنه Core را تصاحب کنند.

---

## ۵. چک‌لیست عملیاتی اول

| گام | محل |
|---|---|
| ساخت مشتری (tenant) | داشبورد ادمین |
| اتصال برندینگ (لوگو، رنگ) | پنل برندینگ مشتری |
| ساخت پلن و پرچم قابلیت | بخش پلن / قابلیت |
| افزودن سرور بالادستی (3X-UI، Sanaei، …) | بخش Providers |
| فعال‌سازی روش پرداخت | بخش پرداخت |
| ساخت ریسلر زیر مشتری | درخت ریسلر |
| راه‌اندازی بات تلگرام برای مشتری | پیکربندی بات (توکن رمزنگاری‌شده) |

هر عمل حساس در لاگ حسابرسی ثبت می‌شود.

---

## ۶. جریان کیف پول و پرداخت (مدل ذهنی)

1. کاربر یا ریسلر درخواست شارژ یا خرید می‌دهد  
2. سرور قیمت را محاسبه می‌کند (قیمت کلاینت نادیده گرفته می‌شود)  
3. زنجیره قابلیت + سهمیه + موجودی بررسی می‌شود  
4. برای پرداخت آنلاین: وب‌هوک فقط job با نام `payment_verify` می‌سازد  
5. آداپتور مبلغ و وضعیت را تأیید می‌کند  
6. دفتر کل یک ردیف شماره‌دار و تکرارناپذیر می‌نویسد  
7. job پرووایژنینگ روی سرور بالادستی اجرا می‌شود  
8. اشتراک فقط بعد از پرووایژنینگ موفق فعال می‌شود  

اگر پرووایژنینگ شکست بخورد، job با backoff تکرار می‌شود و هرگز موفقیت کاذب گزارش نمی‌کند.

---

## ۷. عملیات روزانه با CLI

```bash
bash scripts/guardasli.sh          # منوی تعاملی
bash scripts/guardasli.sh doctor   # سلامت
bash scripts/guardasli.sh backup   # پشتیبان رمزنگاری‌شده
bash scripts/guardasli.sh status   # نسخه is0.0.1 و مسیر
bash scripts/guardasli.sh logs     # لاگ‌های اخیر
bash scripts/guardasli.sh update   # به‌روزرسانی اجزا، حفظ داده
```

---

## ۸. استقرار production

```bash
bun run build
bun convex deploy
```

پوشه `dist/` را پشت هاست استاتیک یا ریورس‌پروکسی سرو کنید. مسیرهای `/api/v1/*` از توابع Convex منتشرشده می‌آیند.

رمز لازم: `GUARDASLI_MASTER_SECRET` (ماده کلید AES-256-GCM). کلیدهای پرداخت از پنل ادمین تنظیم و رمزنگاری می‌شوند.

---

## ۹. بررسی کیفیت

```bash
bun test
bun typecheck
bun run build
```

انتظار: ۸۲ تست پاس و بیلد تایپ‌اسکریپت تمیز.

---

## ۱۰. ادامه مسیر

| هدف | سند |
|---|---|
| معماری عمیق | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| قرارداد API | [docs/API.md](docs/API.md) |
| قواعد برندینگ | [docs/BRANDING.md](docs/BRANDING.md) |
| فهرست فنی کامل | [Docs.fa.md](Docs.fa.md) |
| آموزش انگلیسی | [Learn.md](Learn.md) |

---

© AsliCode — GuardAsli `is0.0.1`

</div>
