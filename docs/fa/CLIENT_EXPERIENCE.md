# GuardAsli — تجربه کلاینت (استاندارد حرفه‌ای اپ‌های VPN)

**Product:** GuardAsli · **Developer:** AsliCode

## مرز صادقانه

| لایه | مسئولیت |
|---|---|
| **GuardAsli control-plane** | اشتراک، سرور، دستگاه، پروفایل اتصال، پرداخت، برند |
| **Provider بالادستی** | پروتکل واقعی، ترافیک، inbound |
| **اپ روی گوشی/دسکتاپ** | UI Connect/Disconnect، kill switch، تونل سیستم‌عامل |

کنترل‌پلن **جایگزین هسته TUN سیستم‌عامل نیست**؛ مثل بک‌اند هر اپ VPN حرفه‌ای، وضعیت و config را می‌دهد و کلاینت تونل را برقرار می‌کند.

## UX هدف (فلگ‌های اپ)

از `src/core/clientExperience.ts`:

- Quick Connect / Server list / Manual server
- Disconnect + status
- Kill switch & Auto-connect (روی کلاینت)
- Multi-device با سقف اشتراک
- وضعیت ترافیک و انقضا
- Import کانفیگ / QR

## API کلاینت

| تابع | نقش |
|---|---|
| `clientApi.clientHome` | خانه: اشتراک، سرورها، دستگاه‌ها |
| `clientApi.connectProfile` | پروفایل اتصال برای سرور |
| `clientApi.deviceRegister` | ثبت دستگاه |
| `clientApi.deviceRevoke` | حذف دستگاه |

## بکاپ خودکار

- Cron روزانه `03:00 UTC` → `backupAuto.enqueueNightlyBackup`
- Worker: snapshot متادیتا → AES-256-GCM با MASTER → Convex storage
- جدول `backups` با `kind: auto`, `encrypted: true`
- **بدون** نوشتن password یا token خام در فایل بکاپ

دستی: Super Admin می‌تواند از پنل/CLI بکاپ بگیرد؛ auto همیشه encrypted است.
