# GuardAsli — برندینگ و شخصی‌سازی / Branding

**نسخه:** `is0.0.1` · **توسعه‌دهنده:** AsliCode · **قالب نسخه:** `isMAJOR.MINOR.PATCH`

<div dir="rtl">

## قاعده

لایه مشتری، ریسلر و زیرریسلر **کاملاً** قابل شخصی‌سازی است. هویت Core
(`GuardAsli` / `AsliCode` / قالب `isMAJOR.MINOR.PATCH`) ثابت می‌ماند و از هیچ
نقشی قابل تغییر نیست.

## فیلدهای قابل شخصی‌سازی

| فیلد | ذخیره‌سازی | اعمال |
|---|---|---|
| نام نمایشی | `branding.displayName` | عنوان صفحه، هدر داشبورد |
| لوگو، favicon، آیکون، splash | `assets` با `tenantId` | دارایی‌های برند مشتری |
| رنگ‌ها: اصلی، دوم، تأکید، پس‌زمینه | `branding.*Color` | CSS variables |
| تم: روشن / تاریک / سیستم | `branding.theme` | کلاس `dark` روی root |
| فونت | `branding.font` | استایل رابط |
| متن‌های رابط کاربری | `uiTexts` (per locale) | همه برچسب‌ها و پیام‌ها |
| دامنه و ساب‌دامین سفارشی | `customDomains` | مسیردهی و SSL |
| بات تلگرام: نام، username، avatar، توضیح | `botConfigs` | رفتار بات مشتری |
| اپ اختصاصی: نام، package name، bundle id، نسخه | `appCustomizations` | خروجی اپ‌ساز |
| لینک‌های پشتیبانی، وب‌سایت، Privacy، Terms | `branding.*Url` | فوتر و صفحات |

## API برندینگ

برندینگ مشتری در جدول `branding` نگهداری می‌شود و `src/web/branding.ts` آن را به
CSS variables اعمال می‌کند:

```
--ga-primary  --ga-secondary  --ga-accent  --ga-bg
```

مقدار پیش‌فرض همان هویت Core است؛ هر مشتری می‌تواند آن را override کند بدون آنکه
هویت Core دست بخورد. هر تغییر برندینگ در Audit Log با action مربوطه ثبت می‌شود.

## حفاظت دارایی‌ها

دارایی‌های هر مشتری در جدول `assets` با `tenantId` scope می‌شوند؛ خواندن یا نوشتن
cross-tenant با `requireTenantScope` مسدود می‌شود.

## مرز Core

- هیچ نقشی نمی‌تواند `GuardAsli`، `AsliCode` یا قالب نسخه را حذف یا تغییر دهد
- دامنه اصلی پلتفرم (تنظیم Super Admin) مال Core است — `domainAdd` ثبت آن برای مشتری را رد می‌کند
- نمایش هویت Core در نقاط مرکزی با سیاست Super Admin کنترل می‌شود

---

## English

### The rule

The tenant, reseller and sub-reseller layers are **fully** brandable. The core
identity (`GuardAsli` / `AsliCode` / the `isMAJOR.MINOR.PATCH` format) stays fixed
and cannot be altered by any role.

### Customizable fields

| Field | Storage | Applied to |
|---|---|---|
| Display name | `branding.displayName` | Page title, dashboard header |
| Logo, favicon, icon, splash | `assets` scoped by `tenantId` | Tenant brand assets |
| Colors: primary, secondary, accent, background | `branding.*Color` | CSS variables |
| Theme: light / dark / system | `branding.theme` | `dark` class on root |
| Font | `branding.font` | UI styling |
| UI texts | `uiTexts` (per locale) | All labels and messages |
| Custom domain / subdomain | `customDomains` | Routing and SSL |
| Telegram bot: name, username, avatar, description | `botConfigs` | Tenant bot behavior |
| Dedicated app: name, package name, bundle id, version | `appCustomizations` | App builder output |
| Support, website, privacy, terms links | `branding.*Url` | Footer and pages |

### Branding API

Tenant branding lives in the `branding` table; `src/web/branding.ts` applies it as
CSS variables (`--ga-primary`, `--ga-secondary`, `--ga-accent`, `--ga-bg`). The
default equals the core identity; any tenant can override it without touching the
core. Every branding change is recorded in the audit log with its action.

### Asset protection

Tenant assets live in the `assets` table scoped by `tenantId`; cross-tenant reads
and writes are blocked by `requireTenantScope`.

### The core boundary

- No role can remove or rename `GuardAsli`, `AsliCode` or the version format
- The platform's main domain (set by Super Admin) belongs to the core — `domainAdd`
  rejects registering it for a tenant
- Core-identity visibility at central points is governed by the Super Admin policy

</div>
