# GuardAsli — مستندات فنی

**نسخه:** `is0.0.1` FINAL · **توسعه‌دهنده:** AsliCode · **قالب:** `isMAJOR.MINOR.PATCH`

> محصول **GuardAsli** · توسعه‌دهنده **AsliCode**

انگلیسی: [Docs.md](Docs.md) · آموزش: [Learn.fa.md](Learn.fa.md) · ممیزی: [FINAL_AUDIT.md](FINAL_AUDIT.md)

<div dir="rtl">

## نصب یک‌خطی VPS + دامنه

```bash
curl -fsSL https://raw.githubusercontent.com/GuardAsli/SuperApp/main/install.sh | sudo bash -s -- --domain panel.example.com --email admin@example.com
```

با کلید Convex:

```bash
export CONVEX_DEPLOY_KEY=... ; curl -fsSL https://raw.githubusercontent.com/GuardAsli/SuperApp/main/install.sh | sudo bash -s -- --domain panel.example.com --email admin@example.com
```

جزئیات OS/منابع: [README.fa.md](README.fa.md)

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

## ۱۰. نصب

| مسیر | دستور |
|---|---|
| VPS | `install.sh` یک‌خطی بالا |
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
