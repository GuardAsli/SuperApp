# GuardAsli — مستندات فنی

**نسخه:** `is0.0.1` FINAL · **توسعه‌دهنده:** AsliCode · **قالب:** `isMAJOR.MINOR.PATCH`

> محصول **GuardAsli** · توسعه‌دهنده **AsliCode**

انگلیسی: [Docs.md](Docs.md) · آموزش: [Learn.fa.md](Learn.fa.md) · ممیزی: [FINAL_AUDIT.md](FINAL_AUDIT.md)

<div dir="rtl">

## نصب روی سرور — دو دستور ساده

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli
sudo bash install.sh
```

نصب‌کننده چند سؤال می‌پرسد (دامنه، ایمیل) و بقیه‌اش خودش انجام می‌دهد:
bun، بسته‌ها، رمزها، build، deploy بک‌اند (با کلید)، Nginx، SSL،
سرویس systemd، دستور `guardasli` و باز شدن پنل مدیریت.

با دامنه:

```bash
sudo bash install.sh --domain panel.example.com --email you@example.com
```

پنل مدیریت — ۱۸ گزینه (آخر نصب خودش باز می‌شود):

```bash
sudo guardasli panel
```

جزئیات بیشتر: [README.fa.md](README.fa.md)

---

## فهرست

1. هویت و نسخه‌گذاری
2. معماری
3. نقش‌ها و مجوز
4. قابلیت‌ها
5. کیف پول و Ledger
6. پرداخت
7. Providerها
8. تلگرام
9. HTTP API
10. نصب و CLI
11. محیط و اسرار
12. مانیتور
13. تست

---

## ۱. هویت

| ثابت | مقدار |
|---|---|
| محصول | GuardAsli |
| توسعه‌دهنده | AsliCode |
| انتشار | is0.0.1 |

منبع: `src/core/identity.ts`

## ۲. معماری

Core ثابت + سفارشی‌سازی برند. `src/core/` · `src/convex/` · `src/web/`

## ۳. نقش‌ها

super_admin → admin → reseller → sub_reseller → user — فقط سمت سرور.

## ۴–۶. قابلیت، کیف، پرداخت

Ledger فقط‌الحاقی و idempotent. چهار روش: admin_manual، card_to_card، CubePay، Tetraminator. Webhook مستقیم شارژ نمی‌کند.

## ۱۰. نصب و پنل

| مسیر | دستور |
|---|---|
| VPS | `sudo bash install.sh` (بعد از clone) |
| پنل | `sudo guardasli panel` — ۱۸ گزینه |
| Lab | `bun run wizard && bun run up` |
| تکمیل | `bash scripts/finish-vps.sh` |

## ۱۲. مانیتور

```bash
bun run monitor
bun run monitor:follow
bun run monitor:jobs
```

داشبورد تب **مانیتور** برای ادمین: سلامت + صف jobs.

## ۱۳. تست

```bash
bun run ci
```

© AsliCode — GuardAsli is0.0.1

</div>
