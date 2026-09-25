/** GuardAsli — صفحه فرود با تم سپاهی/فیروزی و ورود جداگانه‌ی هر نقش. */
import { motion } from "framer-motion";
import { GUARDASLI } from "../core/identity";
import { RESELLER_PORT, SUPER_ADMIN_PORT } from "./entryPorts";

const FEATURES = [
  {
    title: "مدیریت مشتری و ریسلر",
    desc: "هر ریسلر و مشتری فقط داده‌ی خودش را می‌بیند؛ دسترسی‌ها سمت سرور کنترل می‌شود.",
    icon: "🛡️",
    glow: "from-cyan-400/20",
  },
  {
    title: "کیف پول امن",
    desc: "همه‌ی تغییرات موجودی ثبت می‌شوند و هیچ شارژ تکراری ممکن نیست.",
    icon: "📒",
    glow: "from-emerald-400/20",
  },
  {
    title: "پرداخت به روش‌های مختلف",
    desc: "شارژ دستی، کارت به کارت، CubePay و Tetraminator با تأیید خودکار.",
    icon: "💳",
    glow: "from-indigo-400/20",
  },
  {
    title: "برند اختصاصی",
    desc: "هر مشتری لوگو، رنگ و دامنه‌ی خودش را دارد؛ تم کاملاً قابل تغییر است.",
    icon: "🎨",
    glow: "from-fuchsia-400/20",
  },
  {
    title: "اپ اختصاصی",
    desc: "ساخت اپ با نام و آیکون شما؛ از پنل، بدون کدنویسی.",
    icon: "📱",
    glow: "from-sky-400/20",
  },
  {
    title: "ربات تلگرام خودترمیم",
    desc: "وب‌هوک ربات خودکار ست و هر روز ترمیم می‌شود؛ اگر پاک شود خودش برمی‌گردد.",
    icon: "🤖",
    glow: "from-amber-400/20",
  },
];

const fade = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function LandingPage() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="aurora" aria-hidden="true" />
      <div className="grid-mesh" aria-hidden="true" />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-indigo-400 text-xl font-black text-slate-950 shadow-lg shadow-cyan-500/30">
              گ
            </div>
            <div>
              <div className="font-extrabold leading-tight">{GUARDASLI.product}</div>
              <div className="text-[11px] text-core-muted">{GUARDASLI.developer}</div>
            </div>
          </div>
          <a href="#/auth" className="btn-ghost px-4 py-2 text-sm font-bold">
            ورود / ثبت‌نام
          </a>
        </motion.header>

        {/* ── هیرو ─────────────────────────────────────────────────────────── */}
        <section className="pt-16 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3.5 py-1.5 text-xs font-bold text-cyan-200"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300" />
            نسخه {GUARDASLI.initialVersion} · کنترل‌پنل فروش و پشتیبانی
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="text-gradient mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight sm:text-5xl"
          >
            یک بک‌اند، چهار رابط:
            <br />
            پنل وب، ربات تلگرام، مینی‌اپ و اپ برند مشتری
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mx-auto mt-5 max-w-2xl text-base text-core-muted"
          >
            ساخته‌ی {GUARDASLI.developer} — مدیریت مشتریان، ریسلرها، کیف پول، پرداخت و
            ربات تلگرام با جداسازی امن داده در هر لحظه.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <a href="#/auth" className="btn-primary px-7 py-3.5 text-base">
              شروع کنید — ساخت حساب کاربری
            </a>
            <a
              href={`${origin}:${RESELLER_PORT}`}
              className="btn-ghost px-6 py-3.5 text-base font-bold"
            >
              ورود نمایندگان
              <span className="ms-2 text-xs opacity-60" dir="ltr">
                :{RESELLER_PORT}
              </span>
            </a>
            <a
              href={`${origin}:${SUPER_ADMIN_PORT}`}
              className="btn-ghost px-6 py-3.5 text-base font-bold"
            >
              ورود سوپر ادمین
              <span className="ms-2 text-xs opacity-60" dir="ltr">
                :{SUPER_ADMIN_PORT}
              </span>
            </a>
          </motion.div>
        </section>

        {/* ── کارت ورود نقش‌ها ─────────────────────────────────────────────── */}
        <section className="mt-14 grid gap-4 sm:grid-cols-3">
          {[
            {
              role: "کاربر عادی",
              href: "#/auth",
              port: "بدون پورت",
              desc: "کیف پول، سرویس‌ها و پرداخت خودتان.",
              cls: "border-emerald-300/25 hover:shadow-[0_20px_50px_-25px_rgba(52,211,153,0.7)]",
              dot: "bg-emerald-400",
            },
            {
              role: "نماینده",
              href: `${origin}:${RESELLER_PORT}`,
              port: `پورت ${RESELLER_PORT}`,
              desc: "مدیریت زیرمجموعه و ریسلرهای زیرمجموعه‌ی خود.",
              cls: "border-sky-300/25 hover:shadow-[0_20px_50px_-25px_rgba(56,189,248,0.7)]",
              dot: "bg-sky-400",
            },
            {
              role: "سوپر ادمین",
              href: `${origin}:${SUPER_ADMIN_PORT}`,
              port: `پورت ${SUPER_ADMIN_PORT}`,
              desc: "دسترسی کامل به تمام مشتریان، ربات و تنظیمات.",
              cls: "border-amber-300/25 hover:shadow-[0_20px_50px_-25px_rgba(251,191,36,0.7)]",
              dot: "bg-amber-400",
            },
          ].map((c, i) => (
            <motion.a
              key={c.role}
              href={c.href}
              variants={fade}
              initial="hidden"
              animate="show"
              custom={i}
              className={`card p-5 transition-transform duration-200 hover:-translate-y-1 ${c.cls}`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                <span className="font-extrabold">{c.role}</span>
                <span className="ms-auto text-[11px] text-core-muted" dir="ltr">
                  {c.port}
                </span>
              </div>
              <p className="mt-2 text-sm text-core-muted">{c.desc}</p>
            </motion.a>
          ))}
        </section>

        {/* ── قابلیت‌ها ────────────────────────────────────────────────────── */}
        <section className="mt-16">
          <h2 className="text-center text-2xl font-black">هر چیزی که برای فروش و پشتیبانی لازم دارید</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                variants={fade}
                initial="hidden"
                animate="show"
                custom={i}
                className="card p-5 transition-transform duration-200 hover:-translate-y-1"
              >
                <div
                  className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${f.glow} to-transparent text-xl ring-1 ring-white/10`}
                >
                  {f.icon}
                </div>
                <h3 className="mt-3 font-extrabold">{f.title}</h3>
                <p className="mt-1 text-sm text-core-muted">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── فراخوان پایانی ───────────────────────────────────────────────── */}
        <section className="mt-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="card p-8 text-center"
          >
            <h2 className="text-2xl font-black">همین حالا شروع کنید</h2>
            <p className="mx-auto mt-2 max-w-xl text-core-muted">
              حساب کاربری خود را بسازید؛ اگر نماینده یا مدیر هستید از پورت اختصاصی خود وارد شوید.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a href="#/auth" className="btn-primary px-6 py-3 font-bold">
                ساخت حساب کاربری
              </a>
              <a href="#/dashboard" className="btn-ghost px-6 py-3 font-bold">
                ورود به پنل
              </a>
            </div>
          </motion.div>
        </section>

        <footer className="mt-14 border-t border-core-border pt-6 text-center text-xs text-core-muted">
          © {GUARDASLI.developer} — {GUARDASLI.product} {GUARDASLI.initialVersion}
        </footer>
      </div>
    </div>
  );
}
