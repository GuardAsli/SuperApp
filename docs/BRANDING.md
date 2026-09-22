# برندینگ و شخصی‌سازی — راهنمای tenant

## اصل

لایه tenant **کاملاً** قابل شخصی‌سازی است. هویت Core (GuardAsli / AsliCode / isMAJOR.MINOR.PATCH)
ثابت و غیرقابل تغییر باقی می‌ماند.

## فیلدهای قابل شخصی‌سازی

- نام نمایشی، لوگو، favicon، آیکون، splash
- رنگ‌ها: Primary، Secondary، Accent، Background
- تم: Light / Dark / System
- فونت‌ها و متن‌های UI
- دامنه و ساب‌دامین سفارشی
- Telegram Bot: نام، username، avatar، توضیحات
- Main App / Dedicated App: نام، package name، bundle id، نسخه، دارایی‌ها
- لینک‌های پشتیبانی، وب‌سایت، Privacy Policy، Terms

## API برندینگ

داده برندینگ در جدول `branding` نگهداری می‌شود و از طریق `src/web/branding.ts`
به CSS variables اعمال می‌گردد:

```
--ga-primary  --ga-secondary  --ga-accent  --ga-bg
```

هر تغییر برندینگ در Audit Log با action مربوطه ثبت می‌شود.

## حفاظت دارایی‌ها

Assets هر tenant در جدول `assets` با `tenantId` scope می‌شوند؛ دسترسی cross-tenant
با `requireTenantScope` مسدود است.

## مرز Core

- tenant نمی‌تواند نام GuardAsli، AsliCode یا فرمت نسخه را حذف/تغییر دهد
- دامنه اصلی پلتفرم (تنظیم Super Admin) برای tenant محفوظ است — `domainAdd` آن را رد می‌کند
- نمایش هویت Core در نقاط مرکزی با policy Super Admin کنترل می‌شود
