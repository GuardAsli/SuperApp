<p align="center">
  <img src="public/logo.svg" alt="GuardAsli — AsliCode" width="480" />
</p>

<h1 align="center">GuardAsli</h1>

<p align="center">
  <b>محصول:</b> GuardAsli ·
  <b>توسعه‌دهنده:</b> AsliCode ·
  <b>انتشار:</b> <code>is0.0.1</code> <b>نهایی</b> ·
  <b>قالب:</b> <code>isMAJOR.MINOR.PATCH</code>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="FINAL_AUDIT.md">ممیزی نهایی</a> ·
  <a href="Docs.fa.md">مستندات</a> ·
  <a href="docs/SECURITY.md">امنیت</a> ·
  <a href="docs/RUNBOOK.md">اجرا</a>
</p>

---

**GuardAsli** کنترل‌پلن **AsliCode** برای فروش و مدیریت سرویس پروکسی/VPN: چندمستأجری، RBAC سمت سرور، کیف‌پول و Ledger، چهار روش پرداخت، آداپتور Provider، ربات و مینی‌اپ تلگرام، داشبورد وب.

هویت Core ثابت است: **GuardAsli** / **AsliCode**.

وضعیت کد: ممیزی کامل — [FINAL_AUDIT.md](FINAL_AUDIT.md). آمادگی production به deploy Convex، DNS دامنه و کلید درگاه‌ها وابسته است.

---

## نصب یک‌خطی (VPS + دامنه)

```bash
curl -fsSL https://raw.githubusercontent.com/GuardAsli/SuperApp/main/install.sh | sudo bash -s -- --domain panel.example.com --email admin@example.com
```

با deploy key:

```bash
export CONVEX_DEPLOY_KEY=... ; curl -fsSL https://raw.githubusercontent.com/GuardAsli/SuperApp/main/install.sh | sudo bash -s -- --domain panel.example.com --email admin@example.com
```

نصب در `/opt/guardasli`، تولید secrets، build، deploy Convex، bootstrap ادمین، **Nginx + SSL**، سرویس **systemd**.

---

## سیستم‌عامل و منابع

| OS | نسخه |
|---|---|
| Ubuntu | ۲۲.۰۴ / ۲۴.۰۴ LTS (پیشنهادی) |
| Debian | ۱۱، ۱۲ |
| Rocky / Alma / RHEL | ۹.x |
| Fedora | ۳۹+ |

| منبع | حداقل | پیشنهادی |
|---|---|---|
| CPU | ۱ vCPU | ۲ vCPU |
| RAM | ۱ GB | ۲–۴ GB |
| Disk | ۱۰ GB SSD | ۲۰ GB+ |

---

## آزمایشگاهی

```bash
git clone https://github.com/GuardAsli/SuperApp.git && cd SuperApp && bun run wizard && bun run up
```

---

## تب‌های داشبورد

| تب | نقش | محتوا |
|---|---|---|
| نمای کلی | همه | موجودی، تعداد پلن، نقش |
| کیف پول | همه | موجودی + تاریخچه ledger |
| شارژ | همه | Tetra / CubePay / کارت‌به‌کارت |
| پرداخت‌ها | همه | تاریخچه |
| پلن‌ها | همه | خرید |
| برندینگ | ادمین+ | نام و رنگ |
| ادمین | ادمین+ | بررسی رسید، شارژ دستی، روش‌ها |
| مانیتور | ادمین+ | سلامت و صف jobs |

زبان پیش‌فرض UI: **فارسی**.

---

## مستندات

[Docs.fa.md](Docs.fa.md) · [Learn.fa.md](Learn.fa.md) · [docs/SECURITY.md](docs/SECURITY.md) · [docs/PRODUCTION.md](docs/PRODUCTION.md)

---

© AsliCode — GuardAsli `is0.0.1`
