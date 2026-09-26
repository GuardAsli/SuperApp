# GuardAsli — Side-channel و KMS ابری

**Product:** GuardAsli · **Developer:** AsliCode

## Side-channel (زمانی)

| مسیر | دفاع |
|---|---|
| مقایسه رمز | `scrypt` + `timingSafeEqual` |
| hash نشست | SHA-256 lookup (نه مقایسه raw) |
| Telegram hash | `constantTimeEqualHex` |
| webhook secret | timing-safe string/hex |
| login کاربر ناموجود | scrypt ساختگی + `authFailureDelay` |
| پیام خطا | یکسان برای user/pass غلط |

محدودیت JS: زمان کاملاً ثابت در سطح CPU/cache ممکن نیست؛ هدف کاهش سیگنال عملی در شبکه است.

## Envelope + KMS

```text
plaintext
   │  AES-256-GCM(DEK تصادفی)
   ▼
ciphertext + tag
   │
DEK ──wrap──► KEK (local MASTER | GUARDASLI_KMS_KEK | HTTP→Cloud KMS)
```

### حالت‌ها (`GUARDASLI_KMS_MODE`)

| مقدار | رفتار |
|---|---|
| `local` (پیش‌فرض) | KEK از `MASTER_SECRET` |
| `env_kek` | KEK جدا `GUARDASLI_KMS_KEK` (≥32) |
| `http` | `POST GUARDASLI_KMS_WRAP_URL` با `{op,dek_b64,aad}` |

### اتصال KMS ابری (هر فروشنده)

Convex مستقیماً SDK ابری ندارد؛ الگوی توصیه‌شده:

1. یک **Function/Proxy کوچک** با دسترسی محدود به عملیات wrap/unwrap کلید سرویس KMS
2. `GUARDASLI_KMS_MODE=http`
3. `GUARDASLI_KMS_WRAP_URL=https://kms-proxy.example.com/wrap`
4. `GUARDASLI_KMS_WRAP_TOKEN` برای احراز هویت proxy

پاسخ wrap: `{ "wrapped": "..." }` — unwrap: `{ "dek_b64": "..." }`

API: `envelopeEncrypt` / `envelopeDecrypt` در `src/core/kms.ts`.
مسیر پیش‌فرض اسرار پرداخت همچنان `aead.ts` (HKDF+purpose) است؛ envelope برای اسرار فوق‌حساس یا وقتی KMS ابری الزامی است.

### مزیت KMS ابری

- کلید اصلی خارج از Convex env
- audit در لاگ‌های سرویس KMS
- rotation متمرکز و policy دسترسی
- جداسازی blast radius از dump DB alone (بدون دسترسی KMS، DEK باز نمی‌شود)
