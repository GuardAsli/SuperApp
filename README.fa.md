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
  <a href="docs/RUNBOOK.md">راهنمای اجرا</a> ·
  <a href="docs/PAYMENTS.md">پرداخت</a> ·
  <a href="docs/SECURITY.md">امنیت</a>
</p>

---

**GuardAsli** پلتفرم کنترل‌پلن **AsliCode** برای فروش و مدیریت سرویس پروکسی/VPN است: چندمستأجری، RBAC سمت سرور، کیف‌پول با Ledger، چهار درگاه پرداخت، آداپتور Provider، ربات و مینی‌اپ تلگرام، داشبورد وب، نسخه‌گذاری مستقل اجزا.

هویت Core ثابت است: **GuardAsli** / **AsliCode**.

## نصب یک‌خطی

```bash
git clone https://github.com/GuardAsli/SuperApp.git guardasli && cd guardasli && sh ./scripts/cli.mjs install
```

## مسیر اجرای مطمئن (Production)

```bash
cp .env.example .env.local
# GUARDASLI_MASTER_SECRET=$(openssl rand -hex 32)

bun install
bun run ci
bun run release-check
bunx convex login && bunx convex deploy
bunx convex run authActions:bootstrapAdminAction \
  '{"username":"admin","password":"رمز_قوی_حداقل_۱۲_کاراکتر"}'
bun run preview
```

چک‌لیست کامل: **[docs/RUNBOOK.md](docs/RUNBOOK.md)**

## قوانین مهم پرداخت

- Webhook **هرگز** کیف را شارژ نمی‌کند.
- Credit فقط بعد از verify/inquiry سمت سرور و یک‌بار (idempotent).
- روش غیرفعال سراسری در backend رد می‌شود.

## لایسنس

اختصاصی **AsliCode**. تمام حقوق محفوظ است.
