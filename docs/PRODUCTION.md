# GuardAsli — امنیت محیط Production

**Product:** GuardAsli · **Developer:** AsliCode · **Release:** is0.0.1

## متغیرهای اجباری

| متغیر | حداقل | نقش |
|---|---|---|
| `GUARDASLI_ENV=production` | — | فعال‌سازی gateها |
| `NODE_ENV=production` | — | همسو با بالا |
| `GUARDASLI_MASTER_SECRET` | ۳۲ کاراکتر | IKM برای HKDF/AES |
| `GUARDASLI_TOKEN_PEPPER` | ۱۶ | hash نشست |
| `GUARDASLI_AEAD_SALT` | ۱۶ | salt HKDF |
| `GUARDASLI_CORS_ORIGINS` | بدون `*` | allowlist |
| `GUARDASLI_PUBLIC_URL` | `https://…` | callback پرداخت |

اختیاری: `GUARDASLI_AEAD_KID=k1` برای برچسب rotation.

### تولید امن

```bash
export GUARDASLI_ENV=production
export NODE_ENV=production
export GUARDASLI_MASTER_SECRET="$(openssl rand -hex 32)"
export GUARDASLI_TOKEN_PEPPER="$(openssl rand -hex 32)"
export GUARDASLI_AEAD_SALT="$(openssl rand -hex 32)"
export GUARDASLI_CORS_ORIGINS="https://app.example.com"
export GUARDASLI_PUBLIC_URL="https://app.example.com"
```

همین مقادیر را در **Convex Dashboard → Settings → Environment Variables** هم بگذارید (actions فقط آنجا `process.env` می‌بینند).

## ممنوع

- هر `VITE_*` حاوی MASTER / PEPPER / SALT
- `CORS=*`
- `PUBLIC_URL` با `http://` (غیر localhost)
- commit کردن `.env.local`

## چک قبل از deploy

```bash
bun run prod-start          # gate کامل + ci
# یا فقط env:
bun scripts/prod-env-check.mjs
```

## HKDF در production

- IKM: اگر MASTER فقط hex (≥۳۲) باشد به‌صورت باینری خوانده می‌شود.
- Salt: از `GUARDASLI_AEAD_SALT` اجباری است (دیگر fallback ثابت محصول در prod).
- Purpose keys جدا: payment / telegram / card / generic.

## چک‌لیست عملیاتی

1. [ ] Secrets فقط در سرور / Convex env
2. [ ] MFA روی حساب Convex و GitHub
3. [ ] دامنه + HTTPS واقعی
4. [ ] CORS فقط originهای خودتان
5. [ ] Bootstrap admin با رمز قوی، سپس تغییر رمز
6. [ ] روش‌های پرداخت به‌صورت پیش‌فرض خاموش تا پیکربندی
7. [ ] بکاپ encrypted و خارج از دیسک اپ
8. [ ] مانیتور webhook rate و health
