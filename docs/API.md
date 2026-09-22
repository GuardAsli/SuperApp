# API GuardAsli — `/api/v1`

## فرمت خطای استاندارد

همه پاسخ‌های خطا این شکل را دارند:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "توضیح خطا",
  "details": {},
  "requestId": "ga_..."
}
```

کدها: `VALIDATION_ERROR` (400)، `QUOTA_EXCEEDED` (402)، `UNAUTHENTICATED` (401)،
`FORBIDDEN` (403)، `NOT_FOUND` (404)، `CONFLICT` (409)، `RATE_LIMITED` (429)،
`INTERNAL_ERROR` (500). Stack trace هرگز افشا نمی‌شود.

## Endpoints

| مسیر | متد | توضیح |
|---|---|---|
| `/api/v1/ping` | GET | سلام |
| `/api/v1/version` | GET | نسخه اجزا — isMAJOR.MINOR.PATCH |
| `/api/v1/openapi.json` | GET | مشخصات OpenAPI 3.1 |
| `/api/v1/telegram/webhook/{botConfigId}` | POST | Webhook بات هر tenant با `X-Telegram-Bot-Api-Secret-Token` |
| `/api/v1/payments/tetraminator/webhook?order_id=` | POST | صف verify — بدون credit مستقیم |
| `/api/v1/payments/cubepay/callback?order_id=` | POST | صف verify — بدون credit مستقیم |

## نمونه: version

```bash
curl https://panel.example.com/api/v1/version
```

```json
{
  "product": "GuardAsli",
  "developer": "AsliCode",
  "version": "is0.0.1",
  "format": "isMAJOR.MINOR.PATCH",
  "components": { "core": "is0.0.1", "api": "is0.0.1", "...": "..." },
  "requestId": "ga_..."
}
```

## امنیت webhook پرداخت

Webhook هرگز مستقیماً Wallet را credit نمی‌کند. هر رویداد به صف `payment_verify`
می‌رود؛ credit فقط پس از verify موفق آداپتور (تطابق status، pay_id، مبلغ) و از
طریق `acceptProviderPayment` با idempotency انجام می‌شود — ضد-replay.
