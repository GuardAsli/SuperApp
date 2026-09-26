/** GuardAsli — مستندات API و اتصال ربات روی خود سایت (فقط endpointهای واقعی). */
import { useState } from "react";
import { motion } from "framer-motion";
import { GUARDASLI } from "../core/identity";

const fade = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.45, ease: "easeOut" as const },
  }),
};

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* بی‌خیال — دکمه فقط راحتی است */
    }
  };
  return (
    <div className="relative" dir="ltr">
      {label && (
        <div className="rounded-t-xl border border-b-0 border-core-border bg-core-surface/60 px-4 py-1.5 text-[11px] font-bold text-core-muted">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto rounded-xl border border-core-border bg-black/40 p-4 text-left text-[12.5px] leading-relaxed text-emerald-100">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute left-3 top-3 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-200 transition hover:bg-emerald-400/20"
      >
        {copied ? "کپی شد ✓" : "کپی"}
      </button>
    </div>
  );
}

const PUBLIC_ENDPOINTS: Array<{ method: string; path: string; desc: string; auth: string }> = [
  { method: "GET", path: "/api/v1/health", desc: "سلامت سرویس + پروب واقعی دیتابیس", auth: "ندارد" },
  { method: "GET", path: "/api/v1/ping", desc: "بررسی زنده بودن", auth: "ندارد" },
  { method: "GET", path: "/api/v1/version", desc: "نسخه همه اجزا با قالب isMAJOR.MINOR.PATCH", auth: "ندارد" },
  { method: "GET", path: "/api/v1/openapi.json", desc: "مشخصات کامل OpenAPI 3.1", auth: "ندارد" },
  { method: "POST", path: "/api/v1/auth/register", desc: "ثبت‌نام (username، password، parentUsername اختیاری)", auth: "ندارد" },
  { method: "POST", path: "/api/v1/auth/login", desc: "ورود — accessToken و refreshToken برمی‌گرداند", auth: "ندارد" },
  { method: "POST", path: "/api/v1/auth/refresh", desc: "چرخش نشست با refreshToken", auth: "refreshToken" },
  { method: "GET", path: "/api/v1/panel/overview", desc: "نمای کلی tenant (کاربران/اشتراک‌ها)", auth: "کلید API · panel:read" },
  { method: "GET", path: "/api/v1/panel/users", desc: "فهرست کاربران tenant", auth: "کلید API · panel:read" },
  { method: "GET", path: "/api/v1/panel/subscriptions", desc: "آخرین ۱۰۰ اشتراک tenant", auth: "کلید API · panel:read" },
];

const WEBHOOKS: Array<{ method: string; path: string; desc: string }> = [
  { method: "POST", path: "/api/v1/telegram/webhook/{botConfigId}", desc: "وب‌هوک ربات تلگرام هر مشتری — با امضای اختصاصی" },
  { method: "POST", path: "/api/v1/payments/tetraminator/webhook?order_id=", desc: "صف تأیید پرداخت درگاه Tetraminator" },
  { method: "POST", path: "/api/v1/payments/cubepay/callback?order_id=", desc: "صف تأیید پرداخت درگاه CubePay" },
];

const ERROR_CODES: Array<[string, string, string]> = [
  ["VALIDATION_ERROR", "400", "ورودی نامعتبر"],
  ["UNAUTHENTICATED", "401", "توکن یا امضا نامعتبر"],
  ["QUOTA_EXCEEDED", "402", "سهمیه پلن پر شده"],
  ["FORBIDDEN", "403", "نقش اجازه ندارد"],
  ["NOT_FOUND", "404", "مسیر یا منبع نیست"],
  ["CONFLICT", "409", "تضاد وضعیت"],
  ["RATE_LIMITED", "429", "عبور از سقف نرخ"],
  ["INTERNAL_ERROR", "500", "خطای سرور — بدون جزئیات داخلی"],
];

const CURL_VERSION = `curl https://your-domain.com/api/v1/version`;

const JSON_VERSION = `{
  "product": "GuardAsli",
  "developer": "AsliCode",
  "version": "is0.1.0",
  "format": "isMAJOR.MINOR.PATCH",
  "components": { "core": "is0.1.0", "api": "is0.1.0", "bot": "is0.1.0", "...": "..." },
  "requestId": "ga_..."
}`;

const CURL_LOGIN = `curl -X POST https://your-domain.com/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"my_user","password":"my_password"}'`;

const JSON_LOGIN = `{
  "accessToken": "...",       // ۷ روز اعتبار — در هدر Authorization بفرستید
  "refreshToken": "...",      // برای چرخش نشست
  "role": "user",
  "tenantId": "..."
}`;

const CURL_REFRESH = `curl -X POST https://your-domain.com/api/v1/auth/refresh \\
  -H "Content-Type: application/json" \\
  -d '{"refreshToken":"..."}'`;

const CURL_REGISTER = `curl -X POST https://your-domain.com/api/v1/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"username":"new_user","password":"S3cure!pass","parentUsername":"my_user"}'`;

const STEPS = [
  {
    icon: "🤖",
    title: "۱ — ربات را در تلگرام بسازید",
    desc: "در @BotFather دستور newbot/ را بزنید، نام و نام کاربری بدهید و توکن ربات را دریافت کنید.",
  },
  {
    icon: "⚙️",
    title: "۲ — توکن را در پنل وارد کنید",
    desc: "بعد از ورود، در بخش «ربات تلگرام» پنل، توکن BotFather را ذخیره کنید. توکن شما فقط رمزنگاری‌شده روی سرور ذخیره می‌شود.",
  },
  {
    icon: "🔗",
    title: "۳ — وب‌هوک خودکار ثبت می‌شود",
    desc: "پلتفرم بلافاصله آدرس وب‌هوک اختصاصی شما را روی تلگرام ثبت می‌کند و هر روز سلامت آن را ترمیم می‌کند. دستور /start را در ربات خودتان بزنید — تمام!",
  },
];

export default function ApiDocsPage() {
  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="aurora" aria-hidden="true" />
      <div className="grid-mesh" aria-hidden="true" />

      <div className="mx-auto max-w-5xl px-6 py-10">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between"
        >
          <a href="#/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-300 to-teal-400 text-xl font-black text-slate-950 shadow-lg shadow-emerald-500/30">
              گ
            </div>
            <div>
              <div className="font-extrabold leading-tight">{GUARDASLI.product}</div>
              <div className="text-[11px] text-core-muted" dir="ltr">
                Coded by {GUARDASLI.developer}
              </div>
            </div>
          </a>
          <a href="#/dashboard" className="btn-ghost px-4 py-2 text-sm font-bold">
            ورود به پنل
          </a>
        </motion.header>

        {/* ── هیرو ─────────────────────────────────────────────────────────── */}
        <section className="pt-14 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-400/10 px-3.5 py-1.5 text-xs font-bold text-teal-200"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-300" />
            REST · JSON · OpenAPI 3.1
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="text-gradient mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight"
          >
            ربات و سرویس خود را وصل کنید
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="mx-auto mt-4 max-w-2xl text-base text-core-muted"
          >
            اگر توسعه‌دهنده هستید، همه‌چیز از اینجا شروع می‌شود: یک API ساده و قابل پیش‌بینی،
            وب‌هوک امن برای ربات و پرداخت، و پاسخ خطای استاندارد.
          </motion.p>
        </section>

        {/* ── شروع سریع ────────────────────────────────────────────────────── */}
        <motion.section
          variants={fade}
          initial="hidden"
          animate="show"
          custom={0}
          className="card mt-12 p-6"
        >
          <h2 className="text-xl font-black">شروع سریع</h2>
          <p className="mt-1 text-sm text-core-muted">
            همه مسیرها زیر مسیر پایه <code className="rounded bg-black/40 px-1.5 py-0.5 text-emerald-200" dir="ltr">/api/v1</code> هستند.
            دامنه خود را جای <code dir="ltr">your-domain.com</code> بگذارید.
          </p>
          <div className="mt-4 grid gap-3">
            <CodeBlock label="GET /api/v1/version" code={CURL_VERSION} />
            <CodeBlock code={JSON_VERSION} />
          </div>
        </motion.section>

        {/* ── اتصال ربات خودتان ────────────────────────────────────────────── */}
        <motion.section
          variants={fade}
          initial="hidden"
          animate="show"
          custom={1}
          className="card mt-8 p-6"
        >
          <h2 className="text-xl font-black">اتصال ربات تلگرام خودتان</h2>
          <p className="mt-1 text-sm text-core-muted">
            هر مشتری ربات مستقل خودش را دارد؛ توکن شما نزد خود شما و رمزنگاری‌شده می‌ماند.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.title} className="rounded-xl border border-core-border bg-black/20 p-4">
                <div className="text-2xl">{s.icon}</div>
                <h3 className="mt-2 font-extrabold">{s.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-core-muted">{s.desc}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ── احراز هویت ───────────────────────────────────────────────────── */}
        <motion.section
          variants={fade}
          initial="hidden"
          animate="show"
          custom={2}
          className="card mt-8 p-6"
        >
          <h2 className="text-xl font-black">احراز هویت</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-core-border bg-black/20 p-4">
              <h3 className="font-extrabold text-emerald-200">نشست کاربری</h3>
              <p className="mt-1 text-xs leading-relaxed text-core-muted">
                با <code dir="ltr">/auth/login</code> وارد شوید؛ <code dir="ltr">accessToken</code> ۷ روز اعتبار دارد
                و <code dir="ltr">refreshToken</code> برای چرخش نشست است.
              </p>
            </div>
            <div className="rounded-xl border border-core-border bg-black/20 p-4">
              <h3 className="font-extrabold text-emerald-200">کلید API</h3>
              <p className="mt-1 text-xs leading-relaxed text-core-muted">
                برای سرویس‌های سرور به سرور، از پنل مدیریت کلید API با قالب <code dir="ltr">ga_…</code> بسازید؛
                فقط هش آن ذخیره می‌شود و مقدار خام یک‌بار نمایش داده می‌شود. مسیرهای
                <code dir="ltr"> /api/v1/panel/*</code> با هدر زیر احراز می‌شوند:
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-2.5 text-left text-[11px] text-emerald-100" dir="ltr"><code>{`Authorization: Bearer ga_xxxxxxxx…`}</code></pre>
              <p className="mt-2 text-xs text-core-muted">
                کلید نامعتبر/غایب ۴۰۱ می‌گیرد؛ ابطال‌شده/منقضی/بدون سکوپ ۴۰۳. سکوپ لازم:
                <code dir="ltr"> panel:read</code>. داده‌ها همیشه محدود به tenant همان کلید است.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            <CodeBlock label="POST /api/v1/auth/login" code={CURL_LOGIN} />
            <CodeBlock code={JSON_LOGIN} />
            <CodeBlock label="POST /api/v1/auth/refresh" code={CURL_REFRESH} />
          </div>
        </motion.section>

        {/* ── endpointها ───────────────────────────────────────────────────── */}
        <motion.section
          variants={fade}
          initial="hidden"
          animate="show"
          custom={3}
          className="card mt-8 p-6"
        >
          <h2 className="text-xl font-black">مسیرهای عمومی</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-core-border text-xs text-core-muted">
                  <th className="px-2 py-2">متد</th>
                  <th className="px-2 py-2">مسیر</th>
                  <th className="px-2 py-2">توضیح</th>
                  <th className="px-2 py-2">احراز</th>
                </tr>
              </thead>
              <tbody>
                {PUBLIC_ENDPOINTS.map((e) => (
                  <tr key={e.method + e.path} className="border-b border-core-border/50 last:border-0">
                    <td className="px-2 py-2.5">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-black ${
                          e.method === "GET"
                            ? "bg-teal-400/15 text-teal-200"
                            : "bg-gold/15 text-gold"
                        }`}
                        dir="ltr"
                      >
                        {e.method}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[12px] text-emerald-100" dir="ltr">
                      {e.path}
                    </td>
                    <td className="px-2 py-2.5 text-core-muted">{e.desc}</td>
                    <td className="px-2 py-2.5 text-xs text-core-muted">{e.auth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <CodeBlock label="POST /api/v1/auth/register" code={CURL_REGISTER} />
          </div>
        </motion.section>

        {/* ── وب‌هوک‌ها ─────────────────────────────────────────────────────── */}
        <motion.section
          variants={fade}
          initial="hidden"
          animate="show"
          custom={4}
          className="card mt-8 p-6"
        >
          <h2 className="text-xl font-black">وب‌هوک‌ها و امنیت آن‌ها</h2>
          <div className="mt-4 grid gap-2">
            {WEBHOOKS.map((w) => (
              <div key={w.path} className="flex flex-col gap-1 rounded-xl border border-core-border bg-black/20 p-3 sm:flex-row sm:items-center sm:gap-3">
                <span className="rounded-md bg-gold/15 px-2 py-0.5 text-[11px] font-black text-gold" dir="ltr">
                  POST
                </span>
                <code className="font-mono text-[12px] text-emerald-100" dir="ltr">{w.path}</code>
                <span className="text-xs text-core-muted sm:mr-auto">{w.desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 text-sm leading-relaxed text-core-muted">
            <p>
              <strong className="text-emerald-200">ربات تلگرام:</strong> هر مشتری امضای وب‌هوک اختصاصی دارد؛
              تلگرام آن را در هدر <code dir="ltr">X-Telegram-Bot-Api-Secret-Token</code> می‌فرستد و
              امضای نامعتبر بلافاصله ۴۰۱ می‌گیرد.
            </p>
            <p>
              <strong className="text-emerald-200">پرداخت:</strong> وب‌هوک هرگز مستقیم کیف پول را شارژ نمی‌کند؛
              هر رویداد به صف تأیید می‌رود و فقط بعد از تطبیق وضعیت، شناسه و مبلغ اعمال می‌شود.
              ارسال مجدد همان رویداد اثر تکراری ندارد.
            </p>
          </div>
        </motion.section>

        {/* ── خطاها ────────────────────────────────────────────────────────── */}
        <motion.section
          variants={fade}
          initial="hidden"
          animate="show"
          custom={5}
          className="card mt-8 p-6"
        >
          <h2 className="text-xl font-black">فرمت خطای استاندارد</h2>
          <p className="mt-1 text-sm text-core-muted">
            هر خطا دقیقاً همین ساختار را دارد؛ <code dir="ltr">requestId</code> در لاگ ممیزی قابل جستجو است
            و trace سرور هرگز افشا نمی‌شود.
          </p>
          <div className="mt-3">
            <CodeBlock code={`{
  "code": "VALIDATION_ERROR",
  "message": "توضیح کوتاه و قابل اقدام",
  "details": {},
  "requestId": "ga_..."
}`} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-core-border text-xs text-core-muted">
                  <th className="px-2 py-2">کد</th>
                  <th className="px-2 py-2">HTTP</th>
                  <th className="px-2 py-2">معنا</th>
                </tr>
              </thead>
              <tbody>
                {ERROR_CODES.map(([code, http, meaning]) => (
                  <tr key={code} className="border-b border-core-border/50 last:border-0">
                    <td className="px-2 py-2 font-mono text-[12px] text-emerald-100" dir="ltr">{code}</td>
                    <td className="px-2 py-2 font-mono text-[12px] text-core-muted" dir="ltr">{http}</td>
                    <td className="px-2 py-2 text-core-muted">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>

        {/* ── فراخوان پایانی ───────────────────────────────────────────────── */}
        <motion.section
          variants={fade}
          initial="hidden"
          animate="show"
          custom={6}
          className="card mt-8 p-8 text-center"
        >
          <h2 className="text-2xl font-black">همین حالا حساب بسازید و وصل شوید</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-core-muted">
            حساب خود را بسازید، از پنل ربات خودتان را فعال کنید و در چند دقیقه اولین دستور را از تلگرام بگیرید.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href="#/auth" className="btn-primary px-6 py-3 font-bold">
              ساخت حساب کاربری
            </a>
            <a href="#/" className="btn-ghost px-6 py-3 font-bold">
              بازگشت به صفحه اصلی
            </a>
          </div>
        </motion.section>

        <footer className="mt-14 border-t border-core-border pt-6 text-center text-xs text-core-muted">
          Coded by {GUARDASLI.developer} · {GUARDASLI.product} {GUARDASLI.initialVersion}
        </footer>
      </div>
    </div>
  );
}
