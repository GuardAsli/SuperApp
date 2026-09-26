# GuardAsli — API `/api/v1`

**نسخه:** `is0.0.2` · **توسعه‌دهنده:** AsliCode · **قالب نسخه:** `isMAJOR.MINOR.PATCH`

<div dir="rtl">

## فرمت خطای استاندارد

هر پاسخ خطا دقیقاً این چهار فیلد را دارد:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "توضیح کوتاه و قابل اقدام",
  "details": {},
  "requestId": "ga_..."
}
```

| کد | HTTP | معنا |
|---|---|---|
| `VALIDATION_ERROR` | 400 | ورودی نامعتبر |
| `UNAUTHENTICATED` | 401 | توکن یا امضا نامعتبر |
| `QUOTA_EXCEEDED` | 402 | سهمیه پلن پر شده |
| `FORBIDDEN` | 403 | نقش اجازه ندارد |
| `NOT_FOUND` | 404 | مسیر یا منبع نیست |
| `CONFLICT` | 409 | تضاد وضعیت |
| `RATE_LIMITED` | 429 | عبور از سقف نرخ |
| `INTERNAL_ERROR` | 500 | خطای سرور — بدون جزئیات داخلی |

`requestId` در هر پاسخ برگردانده می‌شود و در Audit Log قابل جستجو است.
Stack trace هرگز در پاسخ نمی‌آید.

## مسیرها

| مسیر | متد | توضیح |
|---|---|---|
| `/api/v1/ping` | GET | بررسی زنده بودن |
| `/api/v1/version` | GET | نسخه همه اجزا |
| `/api/v1/openapi.json` | GET | مشخصات OpenAPI 3.1 |
| `/api/v1/panel/overview` | GET | نمای کلی tenant — 🔑 کلید API (`panel:read`) |
| `/api/v1/panel/users` | GET | کاربران tenant — 🔑 کلید API (`panel:read`) |
| `/api/v1/panel/subscriptions` | GET | آخرین ۱۰۰ اشتراک tenant — 🔑 کلید API (`panel:read`) |
| `/api/v1/telegram/webhook/{botConfigId}` | POST | وب‌هوک بات هر مشتری |
| `/api/v1/payments/tetraminator/webhook?order_id=` | POST | صف تأیید پرداخت |
| `/api/v1/payments/cubepay/callback?order_id=` | POST | صف تأیید پرداخت |

### احراز کلید API

مسیرهای `panel/*` با کلید API ساخته‌شده در پنل احراز می‌شوند — نه با نشست کاربری:

```bash
curl -H "Authorization: Bearer ga_xxxxxxxxxxxxxxxxxxxx" \
  https://panel.example.com/api/v1/panel/overview
```

- کلید فقط یک‌بار در زمان ساخت نمایش داده می‌شود؛ فقط hash ذخیره می‌شود.
- خطاها: بدون/کلید نادرست → `401 UNAUTHENTICATED`؛ ابطال‌شده/منقضی/بدون سکوپ → `403 FORBIDDEN`.
- `lastUsedAt` هر کلید با هر استفاده به‌روز می‌شود.
- داده‌ها همیشه محدود به tenant همان کلید است — کلید هیچ‌گاه از مرز tenant عبور نمی‌کند.

### نمونه: `GET /api/v1/version`

```bash
curl https://panel.example.com/api/v1/version
```

```json
{
  "product": "GuardAsli",
  "developer": "AsliCode",
  "version": "is0.0.2",
  "format": "isMAJOR.MINOR.PATCH",
  "components": {
    "core": "is0.0.2", "api": "is0.0.2", "web": "is0.0.2", "bot": "is0.0.2",
    "miniapp": "is0.0.2", "mainapp": "is0.0.2", "dedicated": "is0.0.2",
    "installer": "is0.0.2", "payment": "is0.0.2", "providers": "is0.0.2",
    "build": "is0.0.2", "releases": "is0.0.2"
  },
  "requestId": "ga_..."
}
```

## امنیت وب‌هوک‌ها

**بات تلگرام:** هر مشتری `webhookSecret` اختصاصی دارد. تلگرام آن را در هدر
`X-Telegram-Bot-Api-Secret-Token` می‌فرستد؛ امضای نامعتبر بلافاصله ۴۰۱ می‌گیرد.

**پرداخت:** وب‌هوک هرگز مستقیماً کیف پول را شارژ نمی‌کند. هر رویداد به صف
`payment_verify` می‌رود؛ شارژ فقط بعد از تأیید آداپتور (تطابق وضعیت، شناسه پرداخت و
مبلغ) و از مسیر `acceptProviderPayment` با کلید idempotency انجام می‌شود. ارسال
مجدد همان رویداد اثر تکراری ندارد (ضد-replay).

---

## English

### Standard error shape

Every error response carries exactly these fields — `code`, `message`, `details`,
`requestId` — with the HTTP status mapping in the table above. The `requestId`
appears in every response and is searchable in the audit log. Stack traces are
never exposed.

### Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/v1/ping` | GET | Liveness check |
| `/api/v1/version` | GET | Component versions |
| `/api/v1/openapi.json` | GET | OpenAPI 3.1 specification |
| `/api/v1/panel/overview` | GET | Tenant overview — 🔑 API key (`panel:read`) |
| `/api/v1/panel/users` | GET | Tenant users — 🔑 API key (`panel:read`) |
| `/api/v1/panel/subscriptions` | GET | Latest 100 subscriptions — 🔑 API key (`panel:read`) |
| `/api/v1/telegram/webhook/{botConfigId}` | POST | Per-tenant bot webhook |
| `/api/v1/payments/tetraminator/webhook?order_id=` | POST | Payment verification queue |
| `/api/v1/payments/cubepay/callback?order_id=` | POST | Payment verification queue |

#### API key authentication

`panel/*` routes authenticate with an API key created in the panel — not a user session:

```bash
curl -H "Authorization: Bearer ga_xxxxxxxxxxxxxxxxxxxx" \
  https://panel.example.com/api/v1/panel/overview
```

- The raw key is shown once at creation; only a hash is stored.
- Errors: missing/unknown key → `401 UNAUTHENTICATED`; revoked/expired/out-of-scope → `403 FORBIDDEN`.
- `lastUsedAt` is stamped on every use.
- Data is always scoped to the key's tenant — a key never crosses tenant boundaries.

### Webhook security

**Telegram bot:** each tenant has its own `webhookSecret`, sent by Telegram in the
`X-Telegram-Bot-Api-Secret-Token` header. An invalid signature is rejected with 401.

**Payments:** a webhook never credits a wallet directly. Every event is enqueued as a
`payment_verify` job; credit happens only after the adapter verifies status, payment
id and amount, via `acceptProviderPayment` with an idempotency key. Replayed events
have no effect (anti-replay).

</div>
